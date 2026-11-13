import { laadToonbank } from '@/lib/btwAangifteBronnen';
import { datumNL } from '@/lib/winkel/afdelingen';
import {
    laadAfdelingVanProduct, laadDagBonnen, laadDagstaten, laadDerving, laadKasBegin, laadKasMutaties, laadUitsluitingen, laadVerkoopRegels, zonderProefdagen,
} from '@/lib/winkelboek/laden';
import { periodeVan } from '@/lib/winkelboek/periode';
import OverzichtScherm from './_components/OverzichtScherm';
import { winkelboekLid } from './_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Overzicht',
    description: 'De laatste dag in hokjes en of kas en pin kloppen.',
};

/**
 * Het Overzicht van Boekhouding winkel. Deze pagina laadt alleen; rekenen en
 * tonen doet OverzichtScherm. Alles wordt bij het openen uit de bonnen en
 * dagstaten van de kassa gerekend; er hoeft niets geboekt te worden.
 */
export default async function WinkelboekPagina({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const { p } = await searchParams;
    const periode = periodeVan(p, datumNL(new Date()));
    const { start, eind } = periode;

    const uitgesloten = await laadUitsluitingen(supabase, orgId, start, eind);
    const [bonnen, staten, kas, kasBegin, toonbank, verkoop, afdelingen, derving] = await Promise.all([
        laadDagBonnen(supabase, orgId, start, eind),
        laadDagstaten(supabase, orgId, start, eind),
        laadKasMutaties(supabase, orgId, start, eind),
        laadKasBegin(supabase, orgId, start),
        laadToonbank(supabase, orgId, start, eind),
        laadVerkoopRegels(supabase, orgId, start, eind, uitgesloten),
        laadAfdelingVanProduct(supabase),
        laadDerving(supabase, orgId, start, eind),
    ]);

    return (
        <OverzichtScherm
            periode={periode}
            fout={bonnen.fout ?? staten.fout ?? toonbank.fout ?? verkoop.fout}
            bonnen={zonderProefdagen(bonnen.bonnen, uitgesloten)}
            dagstaten={zonderProefdagen(staten.dagstaten, uitgesloten)}
            kasMutaties={kas.mutaties}
            kasBegin={kasBegin}
            verkoopRegels={verkoop.regels}
            afdelingen={afdelingen}
            kassaRegels={toonbank.regels}
            kassaDagen={toonbank.dagen}
            derving={derving}
        />
    );
}
