import { datumNL } from '@/lib/winkel/afdelingen';
import { maakKasboek } from '@/lib/winkelboek/kasboek';
import { laadDagstaten, laadKasBegin, laadKasMutaties, laadUitsluitingen } from '@/lib/winkelboek/laden';
import { periodeVan } from '@/lib/winkelboek/periode';
import KasboekScherm from '../_components/KasboekScherm';
import { winkelboekLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Kasboek',
    description: 'Wat erbij kwam, wat eraf ging en wat er in de la ligt.',
};

/** Het kasboek van de winkel. Standaard de lopende maand. */
export default async function KasboekPagina({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const { p } = await searchParams;
    const vandaag = datumNL(new Date());
    const periode = periodeVan(p ?? vandaag.slice(0, 7), vandaag);

    const [proef, staten, kas, begin] = await Promise.all([
        laadUitsluitingen(supabase, orgId, periode.start, periode.eind),
        laadDagstaten(supabase, orgId, periode.start, periode.eind),
        laadKasMutaties(supabase, orgId, periode.start, periode.eind),
        laadKasBegin(supabase, orgId, periode.start),
    ]);

    return (
        <KasboekScherm
            periode={periode}
            kasboek={maakKasboek(staten.dagstaten, kas.mutaties, proef.dagen, begin.begin)}
            beschikbaar={kas.beschikbaar}
            vandaag={vandaag}
            /* Elk van deze vier bepaalt het saldo: mist er één, dan is het boek niet te vertrouwen. */
            fout={staten.fout ?? proef.fout ?? kas.fout ?? begin.fout}
        />
    );
}
