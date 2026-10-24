import { createServerSupabase } from '@/lib/supabase-server';
import { GEEN_KAARTJE, kaartjeVoorProduct, type KaartjeOpgeslagen, type KaartjeProduct } from '@/lib/winkel/prijskaartje';
import PrijskaartjesClient, { type KaartjeRegel } from './_components/PrijskaartjesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Prijskaartjes',
    description: 'Prijskaartjes van 90 × 55 mm voor de schaphouders in de winkel, tien per A4.',
};

/**
 * Prijskaartjes — server-shell. Elk actief winkelproduct (behalve dozen en
 * verpakking) krijgt een kaartje: wat in winkel_prijskaartjes bewaard is, of
 * een voorstel uit het product. De prijs is altijd de winkelprijs van het
 * product. Zie lib/winkel/prijskaartje.ts.
 */
export default async function PrijskaartjesPage() {
    const supabase = await createServerSupabase();
    const [{ data: producten }, { data: kaartjes }] = await Promise.all([
        supabase.from('winkel_producten')
            .select('id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, alcohol, voorraad')
            .eq('actief', true)
            .order('type').order('naam'),
        supabase.from('winkel_prijskaartjes')
            .select('winkel_product_id, soort, naam, maker, details, inhoud, inhoud_eenheid, bij, aantal, printen'),
    ]);

    const bewaard = new Map<string, KaartjeOpgeslagen>((kaartjes ?? []).map((k) => [k.winkel_product_id as string, {
        soort: (k.soort as string | null) ?? null,
        naam: (k.naam as string | null) ?? null,
        maker: (k.maker as string | null) ?? null,
        details: (k.details as string | null) ?? null,
        inhoud: k.inhoud == null ? null : Number(k.inhoud),
        inhoud_eenheid: (k.inhoud_eenheid as string | null) ?? null,
        bij: (k.bij as string | null) ?? null,
        aantal: Number(k.aantal ?? 1),
        printen: k.printen !== false,
    }]));

    const regels: KaartjeRegel[] = (producten ?? [])
        .filter((p) => !GEEN_KAARTJE.has(p.type as string))
        .map((p) => {
            const product: KaartjeProduct = {
                id: p.id as string,
                naam: p.naam as string,
                type: p.type as string,
                eenheid: p.eenheid as 'stuk' | 'gram',
                prijs_per: Number(p.prijs_per),
                winkelprijs_incl_cents: (p.winkelprijs_incl_cents as number | null) ?? null,
                alcohol: !!p.alcohol,
            };
            return {
                kaartje: kaartjeVoorProduct(product, bewaard.get(product.id) ?? null),
                productNaam: product.naam,
                voorraad: p.voorraad == null ? null : Number(p.voorraad),
                eenheid: product.eenheid,
                bewaard: bewaard.has(product.id),
            };
        });

    return <PrijskaartjesClient regels={regels} />;
}
