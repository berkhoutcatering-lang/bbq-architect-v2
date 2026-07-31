/* /api/financien/btw-aangifte-concept — Pillar #3
   POST: Genereer BTW-aangifte concept voor het opgegeven kwartaal.
   Returnt JSON met 6 rubrieken die boekhouder direct in zijn software importeert.

   Geen AI in de loop — pure berekening uit facturen + bonnen via financeAnalytics.ts.
*/

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { currentQuarterPeriod, computeBtwAangifte } from '@/lib/financeAnalytics';

export const runtime = 'nodejs';

interface AangifteBody {
    year?: number;
    quarter?: 1 | 2 | 3 | 4;
}

function validate(body: unknown): { ok: true; data: AangifteBody } | { ok: false; error: string } {
    if (body === null || body === undefined) return { ok: true, data: {} };
    if (typeof body !== 'object') return { ok: false, error: 'Body moet object zijn' };
    const b = body as Record<string, unknown>;
    const out: AangifteBody = {};
    if (b.year !== undefined) {
        if (typeof b.year !== 'number' || b.year < 2020 || b.year > 2099) {
            return { ok: false, error: 'year moet tussen 2020 en 2099 liggen' };
        }
        out.year = b.year;
    }
    if (b.quarter !== undefined) {
        if (typeof b.quarter !== 'number' || ![1, 2, 3, 4].includes(b.quarter)) {
            return { ok: false, error: 'quarter moet 1|2|3|4 zijn' };
        }
        out.quarter = b.quarter as 1 | 2 | 3 | 4;
    }
    return { ok: true, data: out };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    /* Bepaal periode: expliciet uit body óf huidig kwartaal. */
    let period;
    if (v.data.year && v.data.quarter) {
        const startMonth = (v.data.quarter - 1) * 3;
        const start_date = new Date(Date.UTC(v.data.year, startMonth, 1)).toISOString().slice(0, 10);
        const end_date = new Date(Date.UTC(v.data.year, startMonth + 3, 0)).toISOString().slice(0, 10);
        const deadlineMonthIdx = startMonth + 4;
        const deadlineYear = deadlineMonthIdx > 12 ? v.data.year + 1 : v.data.year;
        const deadlineMonthAdj = deadlineMonthIdx > 12 ? deadlineMonthIdx - 12 : deadlineMonthIdx;
        const deadline = new Date(Date.UTC(deadlineYear, deadlineMonthAdj, 0)).toISOString().slice(0, 10);
        const today = new Date();
        period = {
            year: v.data.year,
            quarter: v.data.quarter,
            start_date,
            end_date,
            deadline,
            days_until_deadline: Math.ceil((new Date(deadline).getTime() - today.getTime()) / 86400000),
            is_open: true,
        };
    } else {
        period = currentQuarterPeriod();
    }

    /* Fetch facturen + bonnen voor de Q-periode. RLS zorgt voor org-isolation. */
    const [factResp, bonnenResp] = await Promise.all([
        supabase.from('facturen')
            .select('id,nummer,client_naam,datum,status,items')
            .gte('datum', period.start_date)
            .lte('datum', period.end_date),
        supabase.from('bonnen')
            .select('datum,totaal_bedrag,btw_laag_bedrag,btw_hoog_bedrag,rgs_code,voorbelasting_bevestigd,zakelijk_pct')
            .gte('datum', period.start_date)
            .lte('datum', period.end_date),
    ]);

    if (factResp.error || bonnenResp.error) {
        return NextResponse.json({
            error: 'Data-fetch faalde',
            detail: factResp.error?.message || bonnenResp.error?.message,
        }, { status: 500 });
    }

    const rubrieken = computeBtwAangifte(factResp.data || [], bonnenResp.data || [], period);

    return NextResponse.json({
        period,
        rubrieken,
        meta: {
            facturen_count: (factResp.data || []).length,
            bonnen_count: (bonnenResp.data || []).length,
            generated_at: new Date().toISOString(),
            disclaimer: 'Dit is een concept-aangifte. Boekhouder valideert en dient in.',
        },
    });
}
