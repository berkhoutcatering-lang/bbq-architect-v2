import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan, datumGroepen } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import LeveringenClient from '../_components/LeveringenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Leveringen',
    description: 'Een levering binnenmelden en wat er bijna over de datum gaat.',
};

/**
 * Leveringen: het A4 van de slager overnemen (productiedatum en THT worden
 * een partij die de Toonbank bij het stickeren laat kiezen) en daarna de
 * gestickerde stuks, vroegste THT eerst: naar de keuken of weggooien. Alleen
 * producten op gewicht horen hier.
 */
export default async function LeveringenPage({ searchParams }: { searchParams: Promise<{ binnen?: string }> }) {
    const { binnen } = await searchParams;
    const supabase = await createServerSupabase();
    const nu = new Date();
    const o = await laadWinkelOverzicht(supabase, nu);
    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const afdelingVanProduct = (id: string) => o.afdelingen.find((a) => a.id === plek.get(id))?.naam ?? null;
    const opGewicht = new Set(o.artikelen.filter((a) => a.verkoop_per === 'kg' && a.product_id).map((a) => a.product_id!));

    return (
        <LeveringenClient
            openBinnen={binnen === '1'}
            producten={o.producten
                .filter((p) => p.actief && opGewicht.has(p.id))
                .map((p) => ({ id: p.id, naam: p.naam, leverancier_id: p.leverancier_id, voorverpakt: p.binnen_per_sticker, afdeling: afdelingVanProduct(p.id) }))}
            leveranciers={o.leveranciers}
            partijen={o.partijen.map((x) => ({ ...x, product: o.producten.find((p) => p.id === x.product_id)?.naam ?? '—', gestickerd: o.stuks.filter((s) => s.partij_id === x.id).length }))}
            groepen={datumGroepen(o.stuks, nu).map((g) => ({ ...g, naam: o.producten.find((x) => x.id === g.product_id)?.naam ?? '—', afdeling: afdelingVanProduct(g.product_id) }))}
            ontbreekt={o.ontbreekt.stuks}
        />
    );
}
