import { laadToonbank } from '@/lib/btwAangifteBronnen';
import { datumNL } from '@/lib/winkel/afdelingen';
import { maakLeveringen } from '@/lib/winkelboek/inkoop';
import { laadInkoopBonnen, laadOntvangsten, laadVoorraadwaarde } from '@/lib/winkelboek/laden';
import { periodeVan } from '@/lib/winkelboek/periode';
import InkoopScherm from '../_components/InkoopScherm';
import { winkelboekLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Inkoop',
    description: 'Elke levering met bedrag, btw en bon.',
};

export default async function InkoopPagina({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const { p } = await searchParams;
    const periode = periodeVan(p, datumNL(new Date()));
    const { start, eind } = periode;

    const [ontvangsten, bonnen, voorraadwaarde, toonbank] = await Promise.all([
        laadOntvangsten(supabase, orgId, start, eind),
        laadInkoopBonnen(supabase, orgId, start, eind),
        laadVoorraadwaarde(supabase, orgId),
        laadToonbank(supabase, orgId, start, eind),
    ]);

    return (
        <InkoopScherm
            periode={periode}
            leveringen={maakLeveringen(ontvangsten.ontvangsten, bonnen.bonnen)}
            voorraadwaarde={voorraadwaarde}
            /* laadToonbank geeft euro's als kommagetal. */
            omzetCents={toonbank.fout ? null : Math.round(toonbank.regels.reduce((s, r) => s + r.omzet, 0) * 100)}
            fout={ontvangsten.fout}
            bonFout={bonnen.fout}
        />
    );
}
