/**
 * Test-only render-page voor Boekhouding winkel.
 *
 * Bestaat om wat geen unit-test kan zien: of de schermen er met echte fonts en
 * kleuren ook uitzien zoals bedoeld, en of een lange artikelnaam binnen de
 * kolom blijft. De rekenregels zelf zijn in src/lib/winkelboek getest.
 *
 * Geen auth, geen fetch, geen database: alleen de vaste week uit ./voorbeeld.
 *
 * Gated achter NEXT_PUBLIC_E2E=1: zonder die env een 404, dus nooit in
 * productie blootgesteld. Zelfde patroon als /e2e-test/keukenscherm.
 */
import { notFound } from 'next/navigation';
import '@/styles/menu-hub.css';
import '@/styles/winkel.css';
import DagScherm from '@/app/winkelboek/_components/DagScherm';
import OverzichtScherm from '@/app/winkelboek/_components/OverzichtScherm';
import { maakDagboeking } from '@/lib/winkelboek/dagboeking';
import { periodeVan } from '@/lib/winkelboek/periode';
import { AFDELINGEN, BONNEN, DAGSTATEN, DERVING, KASSA_DAGEN, KASSA_REGELS, KAS_MUTATIES, VERKOOP_REGELS } from './voorbeeld';

export const dynamic = 'force-dynamic';

const BASIS = '/e2e-test/winkelboek';

function dag(datum: string) {
    const staten = DAGSTATEN.filter((s) => s.bedrijfsdag === datum);
    return (
        <DagScherm
            dag={maakDagboeking(datum, BONNEN.filter((b) => b.bedrijfsdag === datum), staten)}
            dagstaten={staten}
            eigenTijdens={KAS_MUTATIES.filter((m) => m.datum === datum && m.moment === 'tijdens').reduce((s, m) => s + m.bedrag_cents, 0)}
            proefdag={false}
        />
    );
}

/** Welk scherm: ?scherm=overzicht|leeg|dag|dag-punten|dag-open */
export default async function WinkelboekTestPagina({ searchParams }: { searchParams: Promise<{ scherm?: string; p?: string }> }) {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();
    const { scherm = 'overzicht', p } = await searchParams;
    const periode = periodeVan(p ?? '2026-W48', '2026-11-28');

    let inhoud: React.ReactNode;
    switch (scherm) {
        case 'leeg':
            inhoud = <OverzichtScherm periode={periode} fout={null} bonnen={[]} dagstaten={[]} kasMutaties={[]} verkoopRegels={[]} afdelingen={new Map()}
                kassaRegels={[]} kassaDagen={[]} derving={{ cents: 0, aantal: 0, zonder_waarde: 0 }} basis={BASIS} />;
            break;
        case 'dag':
            inhoud = dag('2026-11-28');
            break;
        case 'dag-punten':
            inhoud = dag('2026-11-26');
            break;
        case 'dag-open':
            inhoud = <DagScherm dag={maakDagboeking('2026-11-28', BONNEN.filter((b) => b.bedrijfsdag === '2026-11-28'), [])} dagstaten={[]} eigenTijdens={0} proefdag={false} />;
            break;
        default:
            inhoud = <OverzichtScherm periode={periode} fout={null} bonnen={BONNEN} dagstaten={DAGSTATEN} kasMutaties={KAS_MUTATIES} verkoopRegels={VERKOOP_REGELS}
                afdelingen={AFDELINGEN} kassaRegels={KASSA_REGELS} kassaDagen={KASSA_DAGEN} derving={DERVING} basis={BASIS} />;
    }

    return <div className="wk-pagina mobile-safe-bottom">{inhoud}</div>;
}
