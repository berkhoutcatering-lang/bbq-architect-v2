import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan, datumNL, productCijfers, regelsPerProduct, urgentie } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import AfdelingClient, { type AfdelingProduct } from '../../_components/AfdelingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Afdeling',
    description: 'De producten van één afdeling: verkocht, omzet, voorraad en datums.',
};

export default async function AfdelingPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const nu = new Date();
    const o = await laadWinkelOverzicht(supabase, nu);
    const afdeling = o.afdelingen.find((a) => a.id === id);
    if (!afdeling) notFound();

    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const { perProduct } = regelsPerProduct(o.regels);
    const vandaag = datumNL(nu);
    const artikelVan = new Map(o.artikelen.filter((a) => a.product_id).map((a) => [a.product_id!, a]));

    const producten: AfdelingProduct[] = o.producten
        .filter((p) => plek.get(p.id) === id)
        .map((p) => {
            const art = artikelVan.get(p.id) ?? null;
            return {
                ...p,
                cijfers: productCijfers(perProduct.get(p.id) ?? [], nu),
                artikel: art ? { naam: art.naam, prijs_cents: art.prijs_cents, verkoop_per: art.verkoop_per, kiloprijs_cents: art.kiloprijs_cents, sticker_plu: art.sticker_plu, opToonbank: art.kanalen.includes('toonbank') && art.actief } : null,
                stuks: o.stuks.filter((s) => s.product_id === p.id).map((s) => ({ ...s, urgentie: urgentie(s.tht, vandaag) })),
                partijen: o.partijen.filter((x) => x.product_id === p.id),
            };
        });

    /* Wat er nog niet op deze afdeling staat, om toe te voegen. */
    const elders = o.producten
        .filter((p) => plek.get(p.id) !== id)
        .map((p) => ({ id: p.id, naam: p.naam, type: p.type, actief: p.actief, afdeling: o.afdelingen.find((a) => a.id === plek.get(p.id))?.naam ?? null }));

    return (
        <AfdelingClient
            afdeling={afdeling}
            afdelingen={o.afdelingen}
            producten={producten}
            elders={elders}
            leveranciers={o.leveranciers}
            stuksOntbreken={o.ontbreekt.stuks}
        />
    );
}
