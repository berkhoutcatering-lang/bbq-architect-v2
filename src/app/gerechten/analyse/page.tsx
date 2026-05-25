/* ═══════════════════════════════════════════════════════════════
   /gerechten/analyse — Server Component shell
   Bucket C P0-2. Vervangt /gerechten/menu-analyse (BCG) en /gerechten/insights
   (Health). View-toggle via ?view=performance|health (default performance).
   Oude URL's → middleware redirect (zie src/middleware.ts).
   ═══════════════════════════════════════════════════════════════ */

import { createServerSupabase } from '@/lib/supabase-server';
import AnalyseClient from './_client';
import type { Gerecht } from '@/types';

export const dynamic = 'force-dynamic';

type View = 'performance' | 'health';

function parseView(raw: string | string[] | undefined): View {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v === 'health' ? 'health' : 'performance';
}

export default async function AnalysePage({
    searchParams,
}: {
    searchParams: Promise<{ view?: string }>;
}) {
    const params = await searchParams;
    const view = parseView(params.view);

    const supabase = await createServerSupabase();

    /* Prefetch gerechten. Component-count probeert eerst de echte tabel,
       valt graceful terug op 0 als de tabel niet bestaat (verschillende
       migratie-states tussen dev/prod). */
    const gerechtenRes = await supabase.from('gerechten').select('*').order('volgorde').limit(1000);
    const gerechten: Gerecht[] = gerechtenRes.data ?? [];

    let componentCount = 0;
    try {
        const compRes = await supabase.from('components').select('id', { count: 'exact', head: true });
        componentCount = compRes.count ?? 0;
    } catch {
        /* Tabel bestaat niet of geen rechten — KPI valt terug op 0. */
    }

    return <AnalyseClient initialView={view} gerechten={gerechten} componentCount={componentCount} />;
}
