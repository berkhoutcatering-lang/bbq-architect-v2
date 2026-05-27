/* /api/financien/kia-scenario — Bucket J P0.6
   POST: bereken 3 KIA-scenarios server-side via kia.ts. GEEN AI-call —
   instant response. AI op /financien roept dit aan via tool compute_kia_scenario.

   Pillar #1 (Server-truth): KIA-bedragen NOOIT AI-derived. */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { computeKia, buildKiaScenarios, KIA_DEFAULT_TAX_RATE } from '@/lib/kia';

export const runtime = 'nodejs';

interface KiaBody {
    investment_amount: number;
    tax_rate?: number;
}

function validate(body: unknown): { ok: true; data: KiaBody } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const amt = b.investment_amount;
    if (typeof amt !== 'number' || !Number.isFinite(amt) || amt < 0) {
        return { ok: false, error: 'investment_amount moet een positief getal zijn' };
    }
    if (amt > 10_000_000) {
        return { ok: false, error: 'investment_amount onrealistisch groot (max €10M)' };
    }
    const tr = b.tax_rate;
    let taxRate = KIA_DEFAULT_TAX_RATE;
    if (tr !== undefined) {
        if (typeof tr !== 'number' || tr < 0 || tr > 1) {
            return { ok: false, error: 'tax_rate moet tussen 0 en 1 liggen' };
        }
        taxRate = tr;
    }
    return { ok: true, data: { investment_amount: amt, tax_rate: taxRate } };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    /* Re-auth — middleware-only is een CVE-magnet (vlg. global rule #6). */
    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    const current = computeKia(v.data.investment_amount, v.data.tax_rate);
    const scenarios = buildKiaScenarios(v.data.investment_amount, v.data.tax_rate);

    return NextResponse.json({
        kia_aftrek: current.aftrek,
        bracket_hit: current.bracket,
        bracket_label: current.bracket_label,
        indicative_tax_saving: current.indicative_tax_saving,
        message: current.message,
        scenarios: scenarios.map(s => ({
            label: s.label,
            description: s.description,
            investment_amount: s.investment_amount,
            kia_aftrek: s.result.aftrek,
            bracket: s.result.bracket,
            indicative_tax_saving: s.result.indicative_tax_saving,
            extra_investment: s.extra_investment,
            extra_tax_saving: s.extra_tax_saving,
            message: s.result.message,
        })),
    });
}
