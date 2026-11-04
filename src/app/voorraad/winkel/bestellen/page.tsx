import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import BestellenClient, { type BestelRij } from './BestellenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Bestelinstellingen',
    description: 'Per product de leverancier, het minimum en het aanvulniveau.',
};

/** Bestelinstellingen: alle producten in één tabel, zodat je een hele afdeling in één keer invult. */
export default async function BestellenPage() {
    const supabase = await createServerSupabase();
    const [o, { data }] = await Promise.all([
        laadWinkelOverzicht(supabase),
        supabase.from('winkel_producten')
            .select('id, naam, eenheid, actief, drempel, par_niveau, bestel_hoeveelheid, bestel_eenheid_naam, bestel_prijs_cents, leverancier_id, ean')
            .eq('actief', true).order('naam'),
    ]);
    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const getal = (n: unknown) => (n == null ? null : Number(n));
    const producten: BestelRij[] = (data ?? []).map((p) => ({
        id: p.id as string,
        naam: p.naam as string,
        eenheid: p.eenheid === 'gram' ? 'gram' : 'stuk',
        actief: true,
        verkocht28: 0,
        afdeling_id: plek.get(p.id as string) ?? null,
        drempel: getal(p.drempel),
        par_niveau: getal(p.par_niveau),
        bestel_hoeveelheid: getal(p.bestel_hoeveelheid),
        bestel_eenheid_naam: (p.bestel_eenheid_naam as string | null) ?? null,
        bestel_prijs_cents: getal(p.bestel_prijs_cents),
        leverancier_id: getal(p.leverancier_id),
        ean: (p.ean as string | null) ?? null,
    }));
    return <BestellenClient afdelingen={o.afdelingen} producten={producten} leveranciers={o.leveranciers} />;
}
