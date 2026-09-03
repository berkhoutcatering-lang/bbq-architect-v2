import { createServerSupabase } from '@/lib/supabase-server';
import GerechtenClient, { type GerechtenInitial } from './_client';

export const dynamic = 'force-dynamic';

/* P0.19 — Gerechten hub Server Component shell.
   Prefetcht gangen + gerechten parallel.
   `_client.tsx` (1805r) blijft de body en doet vanaf zijn `useEffect`
   nog steeds `loadData()` voor realtime + edits, maar krijgt nu een
   initial-snapshot zodat first paint geen waterfall toont.
   Tenant-isolatie via RLS-policies op elke tabel. */
export default async function GerechtenPage() {
    const supabase = await createServerSupabase();

    /* Inventory-prefetch (2000 rijen) is vervallen met de oude kostprijs-invoer:
       kostprijs komt nu uit componenten, niet uit losse voorraad-regels. */
    /* menu_templates werd hier ook opgehaald, voor een Menu's-schakelaar die
       inmiddels dicht is (die lijst leeft onder de tab Menukaarten). Eén
       query minder per paginalading. */
    const [gangenRes, gerechtenRes] = await Promise.all([
        supabase.from('gangen').select('*').order('volgorde').limit(50),
        supabase.from('gerechten').select('*').order('volgorde').limit(1000),
    ]);

    const initial: GerechtenInitial = {
        gangen: gangenRes.data ?? [],
        gerechten: gerechtenRes.data ?? [],
    };

    return <GerechtenClient initial={initial} />;
}
