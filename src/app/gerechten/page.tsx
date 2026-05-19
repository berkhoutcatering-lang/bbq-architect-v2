import { createServerSupabase } from '@/lib/supabase-server';
import GerechtenClient, { type GerechtenInitial } from './_client';

export const dynamic = 'force-dynamic';

/* P0.19 — Gerechten hub Server Component shell.
   Prefetcht gangen + gerechten + inventory + menu_templates parallel.
   `_client.tsx` (1805r) blijft de body en doet vanaf zijn `useEffect`
   nog steeds `loadData()` voor realtime + edits, maar krijgt nu een
   initial-snapshot zodat first paint geen waterfall toont.
   Tenant-isolatie via RLS-policies op elke tabel. */
export default async function GerechtenPage() {
    const supabase = await createServerSupabase();

    const [gangenRes, gerechtenRes, inventoryRes, templatesRes] = await Promise.all([
        supabase.from('gangen').select('*').order('volgorde').limit(50),
        supabase.from('gerechten').select('*').order('volgorde').limit(1000),
        supabase.from('inventory').select('*').order('naam').limit(2000),
        supabase.from('menu_templates').select('*').limit(100),
    ]);

    const initial: GerechtenInitial = {
        gangen: gangenRes.data ?? [],
        gerechten: gerechtenRes.data ?? [],
        inventory: inventoryRes.data ?? [],
        menuTemplates: templatesRes.data ?? [],
    };

    return <GerechtenClient initial={initial} />;
}
