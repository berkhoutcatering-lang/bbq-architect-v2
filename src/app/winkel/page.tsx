import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingTegels, datumGroepen, regelsPerProduct } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import AfdelingenClient from './_components/AfdelingenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Afdelingen',
    description: 'Per afdeling wat er ligt, wat het opbrengt en wat bijna over de datum gaat.',
};

/**
 * De werkruimte Winkel: één tegel per afdeling (Vlees, Kazen, Nootjes,
 * Broodbeleg …). Omzet van de laatste 7 dagen tegen de week ervoor, het
 * aantal producten, en een rood bolletje als er stuks bijna over de datum
 * gaan. Tik op een tegel voor de producten.
 */
export default async function WinkelPage() {
    const supabase = await createServerSupabase();
    const nu = new Date();
    const o = await laadWinkelOverzicht(supabase, nu);

    const tegels = afdelingTegels(o.afdelingen, o.plaatsingen, o.producten, o.regels, o.stuks, nu);
    const metPlek = new Set(o.plaatsingen.filter((p) => o.afdelingen.some((a) => a.id === p.locatie_id)).map((p) => p.product_id));
    /* Alleen wat los te koop is (een actief eigen artikel); onderdelen van pakketten en oude artikelen tellen niet. */
    const losTeKoop = new Set(o.artikelen.filter((a) => a.actief && a.product_id).map((a) => a.product_id!));
    const zonderPlek = o.producten.filter((p) => p.actief && losTeKoop.has(p.id) && !metPlek.has(p.id)).length;
    const urgent = datumGroepen(o.stuks, nu, true);
    const { pakketten } = regelsPerProduct(o.regels);
    const pakketOmzet7 = pakketten
        .filter((r) => Date.parse(r.op) > nu.getTime() - 7 * 86_400_000)
        .reduce((som, r) => som + r.bedrag_cents, 0);

    return (
        <AfdelingenClient
            tegels={tegels}
            heeftWinkel={!!o.ruimteId}
            plekkenOntbreken={o.ontbreekt.plekken}
            zonderPlek={zonderPlek}
            urgent={{ over: urgent.filter((g) => g.urgentie === 'over').reduce((n, g) => n + g.stuks.length, 0), bijna: urgent.filter((g) => g.urgentie !== 'over').reduce((n, g) => n + g.stuks.length, 0) }}
            pakketOmzet7_cents={pakketOmzet7}
            heeftVerkoop={o.regels.length > 0}
        />
    );
}
