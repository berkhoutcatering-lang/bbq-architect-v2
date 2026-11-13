import { datumNL } from '@/lib/winkel/afdelingen';
import { laadAfdelingVanProduct, laadUitsluitingen, laadVerkoopRegels } from '@/lib/winkelboek/laden';
import { periodeVan } from '@/lib/winkelboek/periode';
import { verkoopPerArtikel } from '@/lib/winkelboek/verkoop';
import VerkoopScherm from '../_components/VerkoopScherm';
import { winkelboekLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Verkoop',
    description: 'Per artikel wat het opbracht en wat het kostte.',
};

export default async function VerkoopPagina({ searchParams }: { searchParams: Promise<{ p?: string; q?: string; afdeling?: string }> }) {
    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const { p, q, afdeling } = await searchParams;
    const periode = periodeVan(p, datumNL(new Date()));

    const proef = await laadUitsluitingen(supabase, orgId, periode.start, periode.eind);
    const uitgesloten = proef.dagen;
    const [verkoop, afdelingen] = await Promise.all([
        laadVerkoopRegels(supabase, orgId, periode.start, periode.eind, uitgesloten),
        laadAfdelingVanProduct(supabase, orgId),
    ]);

    return (
        <VerkoopScherm
            periode={periode}
            artikelen={verkoopPerArtikel(verkoop.regels, afdelingen.afdelingen)}
            zoek={q}
            afdeling={afdeling}
            fout={verkoop.fout ?? proef.fout ?? afdelingen.fout}
        />
    );
}
