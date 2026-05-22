/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { tariefVoorJaar, bedragAftrekbaar } from '@/lib/ritten-tarieven';

export const runtime = 'nodejs';

/**
 * GET /api/financien/transport?year=YYYY
 * ──────────────────────────────────────
 * Cross-page koppeling: /financien → /geld/rittenregistratie.
 *
 * Aggregeert zakelijke ritten voor het gevraagde jaar:
 *  - totaal_km, aftrekbaar_eur (€0.23/km)
 *  - top-events op km (transport-kosten per event = "verborgen" P&L item)
 *  - maandelijkse breakdown voor trend
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

    const yearParam = req.nextUrl.searchParams.get('year');
    const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;
    const tarief = tariefVoorJaar(year);

    const { data: ritten } = await supabase
      .from('ritten')
      .select('id, datum, kilometers, prive_omleiding_km, zakelijk, doel, event_id, voertuig_id')
      .eq('organization_id', orgId)
      .eq('zakelijk', true)
      .gte('datum', start)
      .lt('datum', end);

    let totalKm = 0;
    let totalAftrek = 0;
    const perEvent = new Map<number, { km: number; bedrag: number; ritten: number }>();
    const perMaand: number[] = new Array(12).fill(0); // bedrag per maand
    const perMaandKm: number[] = new Array(12).fill(0);

    (ritten || []).forEach(function (r: any) {
      const km = Math.max(0, Number(r.kilometers || 0) - Number(r.prive_omleiding_km || 0));
      const bedrag = bedragAftrekbaar({
        kilometers: Number(r.kilometers) || 0,
        zakelijk: !!r.zakelijk,
        priveOmleidingKm: Number(r.prive_omleiding_km) || 0,
        datum: r.datum,
      });
      totalKm += km;
      totalAftrek += bedrag;
      const monthIdx = new Date(r.datum + 'T00:00:00').getMonth();
      if (monthIdx >= 0 && monthIdx <= 11) {
        perMaand[monthIdx] += bedrag;
        perMaandKm[monthIdx] += km;
      }
      if (r.event_id) {
        const cur = perEvent.get(r.event_id) || { km: 0, bedrag: 0, ritten: 0 };
        cur.km += km;
        cur.bedrag += bedrag;
        cur.ritten += 1;
        perEvent.set(r.event_id, cur);
      }
    });

    // Event-namen voor top-events
    const eventIds = Array.from(perEvent.keys());
    const eventMap = new Map<number, { name: string; date: string }>();
    if (eventIds.length > 0) {
      const { data: events } = await supabase
        .from('events')
        .select('id, name, date')
        .in('id', eventIds);
      (events || []).forEach(e => eventMap.set(e.id, { name: e.name || `Event #${e.id}`, date: e.date || '' }));
    }
    const topEvents = Array.from(perEvent.entries())
      .map(([id, v]) => ({
        event_id: id,
        event_name: eventMap.get(id)?.name || `Event #${id}`,
        event_date: eventMap.get(id)?.date || null,
        km: v.km,
        bedrag_eur: Math.round(v.bedrag * 100) / 100,
        ritten_count: v.ritten,
      }))
      .sort((a, b) => b.bedrag_eur - a.bedrag_eur)
      .slice(0, 10);

    return NextResponse.json({
      year,
      tarief_per_km: tarief,
      totals: {
        ritten_count: (ritten || []).length,
        totaal_km: totalKm,
        aftrekbaar_eur: Math.round(totalAftrek * 100) / 100,
        events_covered: perEvent.size,
      },
      per_maand_eur: perMaand.map(v => Math.round(v * 100) / 100),
      per_maand_km: perMaandKm,
      top_events: topEvents,
    });
  } catch (err: any) {
    console.error('[financien/transport]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
