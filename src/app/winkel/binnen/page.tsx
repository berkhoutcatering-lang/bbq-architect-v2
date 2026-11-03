import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import BinnenClient from '../_components/BinnenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Binnen',
    description: 'Een levering binnenmelden: per product de productiedatum en de THT van het A4.',
};

/**
 * Binnen: het A4 van de slager overnemen. Per product de productiedatum en
 * de THT; dat wordt een partij die de Toonbank bij het stickeren laat kiezen.
 * Alleen producten op gewicht (die gestickerd worden) staan hier.
 */
export default async function BinnenPage() {
    const supabase = await createServerSupabase();
    const o = await laadWinkelOverzicht(supabase);
    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const opGewicht = new Set(o.artikelen.filter((a) => a.verkoop_per === 'kg' && a.product_id).map((a) => a.product_id!));
    const producten = o.producten
        .filter((p) => p.actief && opGewicht.has(p.id))
        .map((p) => ({
            id: p.id, naam: p.naam, leverancier_id: p.leverancier_id, voorverpakt: p.binnen_per_sticker,
            afdeling: o.afdelingen.find((a) => a.id === plek.get(p.id))?.naam ?? null,
        }));

    return (
        <BinnenClient
            producten={producten}
            leveranciers={o.leveranciers}
            partijen={o.partijen.map((x) => ({ ...x, product: o.producten.find((p) => p.id === x.product_id)?.naam ?? '—', gestickerd: o.stuks.filter((s) => s.partij_id === x.id).length }))}
            ontbreekt={o.ontbreekt.stuks}
        />
    );
}
