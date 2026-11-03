import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan, datumGroepen } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import DatumsClient from '../_components/DatumsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Datums',
    description: 'Wat er in de winkel ligt, vroegste THT eerst: naar de keuken of weggooien.',
};

export default async function DatumsPage() {
    const supabase = await createServerSupabase();
    const nu = new Date();
    const o = await laadWinkelOverzicht(supabase, nu);
    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const groepen = datumGroepen(o.stuks, nu).map((g) => {
        const p = o.producten.find((x) => x.id === g.product_id);
        return { ...g, naam: p?.naam ?? '—', afdeling: o.afdelingen.find((a) => a.id === plek.get(g.product_id))?.naam ?? null };
    });
    return <DatumsClient groepen={groepen} ontbreekt={o.ontbreekt.stuks} />;
}
