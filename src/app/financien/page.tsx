import { Suspense } from 'react';
import { createServerSupabase } from '@/lib/supabase-server';
import { LoadingState } from '@/components/LoadingState';
import FinancienClient, { type FinancienInitial } from './_components/FinancienClient';

export const dynamic = 'force-dynamic';

/* P0.31 — Financien hub Server Component shell.
   ────────────────────────────────────────────
   Prefetcht parallel alle data die de tabs delen, zodat first paint geen
   waterfall-spinner toont. Client-body (`FinancienClient`) gebruikt de
   initial-data als defaultVal voor `useSupabase` hooks — die doen vervolgens
   hun eigen refetch + realtime subscriber voor live updates.

   Tenant-isolatie via RLS-policies op elke tabel (org_id = auth.uid()->>org_id).
   We hoeven geen expliciet org-filter te zetten — Supabase doet dat automatisch
   met de user-scoped client. */
export default async function FinancienPage() {
    const supabase = await createServerSupabase();

    const [
        offertesRes,
        facturenRes,
        eventsRes,
        bonnenRes,
        leveranciersRes,
        gerechtenRes,
        inventoryRes,
        timeLogsRes,
    ] = await Promise.all([
        supabase.from('offertes').select('*').order('datum', { ascending: false }).limit(500),
        supabase.from('facturen').select('*').order('datum', { ascending: false }).limit(500),
        supabase.from('events').select('*').order('date', { ascending: false }).limit(500),
        supabase.from('bonnen').select('*').order('datum', { ascending: false }).limit(500),
        supabase.from('leveranciers').select('id, naam, type').limit(200),
        supabase.from('gerechten').select('*').limit(500),
        supabase.from('inventory').select('*').limit(1000),
        supabase.from('time_logs').select('*').order('start_time', { ascending: false }).limit(1000),
    ]);

    const initial: FinancienInitial = {
        offertes: offertesRes.data ?? [],
        facturen: facturenRes.data ?? [],
        events: eventsRes.data ?? [],
        bonnen: bonnenRes.data ?? [],
        leveranciers: leveranciersRes.data ?? [],
        gerechten: gerechtenRes.data ?? [],
        inventory: inventoryRes.data ?? [],
        timeLogs: timeLogsRes.data ?? [],
    };

    return (
        <Suspense fallback={<LoadingState label="Financiën laden" />}>
            <FinancienClient initial={initial} />
        </Suspense>
    );
}
