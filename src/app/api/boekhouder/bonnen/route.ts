/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { RGS_BY_CODE } from '@/lib/rgsCategories';

export const runtime = 'nodejs';

/**
 * GET  /api/boekhouder/bonnen?month=YYYY-MM&status=alle|pending|twijfel|auto
 *      List bonnen voor de boekhouder-stapel met RGS-info join.
 *
 * PATCH /api/boekhouder/bonnen
 *      Body: { id, action: 'accept'|'mark_twijfel'|'set_category',
 *              rgs_code?, event_id? }
 *      Update categorie + status. Locked bonnen worden geweigerd.
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const monthParam = req.nextUrl.searchParams.get('month'); // YYYY-MM
    const rangeParam = req.nextUrl.searchParams.get('range'); // 'last3' | 'month'
    const statusFilter = req.nextUrl.searchParams.get('status') || 'alle';

    // Join op leverancier werkt; event-FK is mogelijk nog niet in schema-cache
    // (pre-migration). We doen events daarom in een aparte query en joinen in JS.
    let query = supabase
      .from('bonnen')
      .select(`
        id, datum, totaal_bedrag, netto_bedrag, btw_laag_bedrag, btw_hoog_bedrag,
        notities, categorie, image_url, status, processed_at,
        leverancier_id, event_id, rgs_code, rgs_category_label,
        ai_classify_status, ai_classify_confidence, ai_classify_reasoning,
        classified_at, locked_at,
        leverancier:leverancier_id (id, naam, type)
      `)
      .eq('organization_id', orgId)
      .order('datum', { ascending: false })
      .limit(500);

    if (rangeParam === 'last3') {
      /* Laatste 3 maanden inclusief huidige: bv. vandaag 8 juni → vanaf 1 april.
         Dekt scenario: bon van 10 apr wordt vandaag gescand, moet zichtbaar
         blijven in boekhouder zonder dat Sam handmatig maand moet kiezen. */
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
      query = query.gte('datum', startStr);
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yyyy, mm] = monthParam.split('-');
      const start = `${yyyy}-${mm}-01`;
      const nextMonth = Number(mm) === 12
        ? `${Number(yyyy) + 1}-01-01`
        : `${yyyy}-${String(Number(mm) + 1).padStart(2, '0')}-01`;
      query = query.gte('datum', start).lt('datum', nextMonth);
    }

    if (statusFilter === 'pending') {
      query = query.is('ai_classify_status', null).or('ai_classify_status.eq.pending');
    } else if (statusFilter === 'twijfel') {
      query = query.eq('ai_classify_status', 'twijfel');
    } else if (statusFilter === 'auto') {
      query = query.in('ai_classify_status', ['auto_accepted', 'verified']);
    }

    const { data, error } = await query;
    if (error) {
      // Detecteer "kolom bestaat niet" — gebruiker moet migratie draaien
      const msg = error.message || '';
      if (msg.includes('column') && (msg.includes('does not exist') || msg.includes('rgs_code'))) {
        return NextResponse.json({
          error: 'Migration nog niet gedraaid',
          hint: 'Run supabase/migrations/20260511130000_boekhouder_pakket.sql via Supabase Studio',
        }, { status: 503 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Events apart ophalen (FK-relatie mogelijk nog niet in schema-cache)
    const eventIds = Array.from(new Set((data || []).map((b: any) => b.event_id).filter((id: any) => typeof id === 'number')));
    const eventsById = new Map<number, any>();
    if (eventIds.length > 0) {
      const { data: evs } = await supabase
        .from('events')
        .select('id, name, date, guests')
        .in('id', eventIds);
      (evs || []).forEach((e: any) => eventsById.set(e.id, e));
    }

    // Verrijk elke rij met RGS-meta uit constants + event-info
    const enriched = (data || []).map((b: any) => {
      const cat = b.rgs_code ? RGS_BY_CODE[b.rgs_code] : null;
      const event = b.event_id ? eventsById.get(b.event_id) : null;
      return {
        ...b,
        event,
        rgs_kind: cat?.kind || null,
        rgs_btw_default: cat?.btw_default || null,
        rgs_hint: cat?.hint || null,
      };
    });

    // Tellingen voor de UI-strip
    const counts = {
      total: enriched.length,
      pending: enriched.filter((b: any) => !b.ai_classify_status || b.ai_classify_status === 'pending').length,
      auto_accepted: enriched.filter((b: any) => b.ai_classify_status === 'auto_accepted').length,
      manual: enriched.filter((b: any) => b.ai_classify_status === 'manual').length,
      twijfel: enriched.filter((b: any) => b.ai_classify_status === 'twijfel').length,
      verified: enriched.filter((b: any) => b.ai_classify_status === 'verified').length,
      locked: enriched.filter((b: any) => !!b.locked_at).length,
    };

    return NextResponse.json({ counts, rows: enriched });
  } catch (err: any) {
    console.error('[boekhouder/bonnen GET]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

interface PatchBody {
  id: number;
  action: 'accept' | 'mark_twijfel' | 'set_category';
  rgs_code?: string;
  event_id?: number | null;
  notes?: string;
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as PatchBody;
    if (!body.id || !body.action) {
      return NextResponse.json({ error: 'id + action verplicht' }, { status: 400 });
    }

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    // Eerst checken of bon niet vergrendeld is
    const { data: bonRow } = await supabase
      .from('bonnen')
      .select('id, locked_at, rgs_code, ai_classify_status')
      .eq('id', body.id)
      .eq('organization_id', orgId)
      .single();
    if (!bonRow) return NextResponse.json({ error: 'Bon niet gevonden' }, { status: 404 });
    if (bonRow.locked_at) return NextResponse.json({ error: 'Bon is vergrendeld in een maandpakket' }, { status: 409 });

    const updates: Record<string, unknown> = {
      classified_at: new Date().toISOString(),
      classified_by_user_id: user.id,
    };

    if (body.action === 'accept') {
      // Accepteer huidige AI-suggestie en mark als verified
      if (!bonRow.rgs_code) return NextResponse.json({ error: 'Geen AI-suggestie om te accepteren' }, { status: 400 });
      updates.ai_classify_status = 'verified';
    } else if (body.action === 'mark_twijfel') {
      updates.ai_classify_status = 'twijfel';
      if (body.notes) updates.ai_classify_reasoning = body.notes;
    } else if (body.action === 'set_category') {
      const code = body.rgs_code || '';
      if (!RGS_BY_CODE[code]) return NextResponse.json({ error: `Onbekende RGS-code: ${code}` }, { status: 400 });
      updates.rgs_code = code;
      updates.rgs_category_label = RGS_BY_CODE[code].label;
      updates.ai_classify_status = 'manual';
      if (body.event_id !== undefined) updates.event_id = body.event_id; // null = ontkoppel
    } else {
      return NextResponse.json({ error: 'Onbekende action' }, { status: 400 });
    }

    const { error } = await supabase
      .from('bonnen')
      .update(updates)
      .eq('id', body.id)
      .eq('organization_id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[boekhouder/bonnen PATCH]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
