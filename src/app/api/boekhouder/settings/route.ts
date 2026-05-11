/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET  /api/boekhouder/settings → org boekhouder-instellingen
 * PATCH /api/boekhouder/settings → wijzig boekhouder-email/naam/threshold
 *
 * Alleen Admin mag wijzigen.
 */

function isValidEmail(s: string): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { data: org } = await supabase
      .from('organizations')
      .select('boekhouder_email, boekhouder_naam, bonnen_retentie_jaar, ai_classify_threshold')
      .eq('id', orgId)
      .single();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('btw_nummer')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      settings: {
        boekhouder_email: org?.boekhouder_email || '',
        boekhouder_naam: org?.boekhouder_naam || '',
        bonnen_retentie_jaar: org?.bonnen_retentie_jaar ?? 7,
        ai_classify_threshold: org?.ai_classify_threshold ?? 0.85,
        btw_nummer: settingsRow?.btw_nummer || '',
      },
      role: memberships?.[0]?.role,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

interface PatchBody {
  boekhouder_email?: string;
  boekhouder_naam?: string;
  ai_classify_threshold?: number;
  bonnen_retentie_jaar?: number;
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as PatchBody;

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    const role = memberships?.[0]?.role;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    if (role !== 'Admin') {
      return NextResponse.json({ error: 'Alleen Admin mag boekhouder-instellingen wijzigen' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.boekhouder_email !== undefined) {
      const e = String(body.boekhouder_email).trim();
      if (e && !isValidEmail(e)) return NextResponse.json({ error: 'Ongeldig email-adres' }, { status: 400 });
      updates.boekhouder_email = e || null;
    }
    if (body.boekhouder_naam !== undefined) {
      updates.boekhouder_naam = String(body.boekhouder_naam).trim() || null;
    }
    if (body.ai_classify_threshold !== undefined) {
      const t = Number(body.ai_classify_threshold);
      if (!(t >= 0.5 && t <= 1.0)) return NextResponse.json({ error: 'threshold tussen 0.5 en 1.0' }, { status: 400 });
      updates.ai_classify_threshold = t;
    }
    if (body.bonnen_retentie_jaar !== undefined) {
      const y = Number(body.bonnen_retentie_jaar);
      if (!(Number.isInteger(y) && y >= 1 && y <= 30)) return NextResponse.json({ error: 'retentie 1-30 jaar' }, { status: 400 });
      updates.bonnen_retentie_jaar = y;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Niets om te wijzigen' }, { status: 400 });
    }

    const { error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
