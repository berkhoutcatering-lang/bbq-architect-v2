import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingTegels, datumGroepen, regelsPerProduct } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import OverzichtClient from './_components/OverzichtClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Overzicht',
    description: 'Wat er nu moet gebeuren en wat de afdelingen opbrengen.',
};

/**
 * De werkruimte Winkel: bovenaan wat er nu moet gebeuren, daaronder één regel
 * per afdeling (Vlees, Kazen, Nootjes, Broodbeleg …) met de omzet van de
 * laatste 7 dagen tegen de week ervoor. Tik op een afdeling voor de producten.
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

    const inAssortiment = o.producten.filter((p) => p.actief);
    const nietGeteld = inAssortiment.filter((p) => p.voorraad == null).length;

    return (
        <OverzichtClient
            tegels={tegels}
            heeftWinkel={!!o.ruimteId}
            plekkenOntbreken={o.ontbreekt.plekken}
            zonderPlek={zonderPlek}
            nietGeteld={nietGeteld}
            nietsGeteld={nietGeteld === inAssortiment.length}
            urgent={{ over: urgent.filter((g) => g.urgentie === 'over').reduce((n, g) => n + g.stuks.length, 0), bijna: urgent.filter((g) => g.urgentie !== 'over').reduce((n, g) => n + g.stuks.length, 0) }}
            pakketOmzet7_cents={pakketOmzet7}
            heeftVerkoop={o.regels.length > 0}
        />
    );
}
