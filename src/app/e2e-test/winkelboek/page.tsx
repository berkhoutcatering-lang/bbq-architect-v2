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
import InkoopScherm from '@/app/winkelboek/_components/InkoopScherm';
import KasboekScherm from '@/app/winkelboek/_components/KasboekScherm';
import LopersScherm from '@/app/winkelboek/_components/LopersScherm';
import OverzichtScherm from '@/app/winkelboek/_components/OverzichtScherm';
import VerkoopScherm from '@/app/winkelboek/_components/VerkoopScherm';
import { maakDagboeking } from '@/lib/winkelboek/dagboeking';
import { maakLeveringen } from '@/lib/winkelboek/inkoop';
import { maakKasboek } from '@/lib/winkelboek/kasboek';
import { deelLopersIn } from '@/lib/winkelboek/lopers';
import { periodeVan } from '@/lib/winkelboek/periode';
import { verkoopPerArtikel } from '@/lib/winkelboek/verkoop';
import { AFDELINGEN, BONNEN, DAGSTATEN, DERVING, INKOOP_BONNEN, KASSA_DAGEN, KASSA_REGELS, KAS_MUTATIES, LOPER_INVOER, ONTVANGSTEN, VERKOOP_REGELS, VOORRAADWAARDE } from './voorbeeld';

export const dynamic = 'force-dynamic';

const BASIS = '/e2e-test/winkelboek';

function dag(datum: string, fout: string | null = null) {
    const staten = DAGSTATEN.filter((s) => s.bedrijfsdag === datum);
    const eigenTijdens = KAS_MUTATIES.filter((m) => m.datum === datum && m.moment === 'tijdens').reduce((s, m) => s + m.bedrag_cents, 0);
    return (
        <DagScherm
            dag={maakDagboeking(datum, BONNEN.filter((b) => b.bedrijfsdag === datum), staten, eigenTijdens)}
            dagstaten={staten}
            eigenTijdens={eigenTijdens}
            proefdag={false}
            fout={fout}
        />
    );
}

/** Welk scherm: ?scherm=overzicht|leeg|dag|dag-punten|dag-open|kasboek|kasboek-leeg */
export default async function WinkelboekTestPagina({ searchParams }: { searchParams: Promise<{ scherm?: string; p?: string; q?: string; afdeling?: string; groep?: string }> }) {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();
    const { scherm = 'overzicht', p, q, afdeling, groep } = await searchParams;
    const periode = periodeVan(p ?? '2026-W48', '2026-11-28');

    let inhoud: React.ReactNode;
    switch (scherm) {
        case 'leeg':
            inhoud = <OverzichtScherm periode={periode} fout={null} bonnen={[]} dagstaten={[]} kasMutaties={[]} verkoopRegels={[]} afdelingen={new Map()}
                kassaRegels={[]} kassaDagen={[]} derving={{ cents: 0, aantal: 0, zonder_waarde: 0 }} basis={BASIS} />;
            break;
        case 'kasboek':
            inhoud = <KasboekScherm periode={periode} kasboek={maakKasboek(DAGSTATEN, KAS_MUTATIES)} beschikbaar vandaag="2026-11-28" basis={BASIS} extra={{ scherm }} />;
            break;
        case 'kasboek-leeg':
            inhoud = <KasboekScherm periode={periode} kasboek={maakKasboek([], [])} beschikbaar={false} vandaag="2026-11-28" basis={BASIS} extra={{ scherm }} />;
            break;
        case 'verkoop':
            inhoud = <VerkoopScherm periode={periode} artikelen={verkoopPerArtikel(VERKOOP_REGELS, AFDELINGEN)} zoek={q} afdeling={afdeling} fout={null} basis={BASIS} extra={{ scherm }} />;
            break;
        case 'inkoop':
            inhoud = <InkoopScherm periode={periode} leveringen={maakLeveringen(ONTVANGSTEN, INKOOP_BONNEN)} voorraadwaarde={VOORRAADWAARDE} omzetCents={363700} fout={null} basis={BASIS} extra={{ scherm }} />;
            break;
        case 'lopers':
            inhoud = <LopersScherm lopers={deelLopersIn(LOPER_INVOER, { verkoopdagen: 5, dagen_open: 8 })} groep={groep} vandaag="2026-11-28" fout={null} basis={BASIS} extra={{ scherm }} />;
            break;
        case 'dag':
            inhoud = dag('2026-11-28');
            break;
        case 'dag-punten':
            inhoud = dag('2026-11-26');
            break;
        case 'dag-verklaard':
            inhoud = dag('2026-11-27');
            break;
        case 'dag-fout':
            inhoud = dag('2026-11-28', 'Kassabonnen niet te lezen: de verbinding viel weg');
            break;
        case 'kasboek-fout':
            inhoud = <KasboekScherm periode={periode} kasboek={maakKasboek([], [])} beschikbaar vandaag="2026-11-28" fout="Dagstaten niet te lezen: de verbinding viel weg" basis={BASIS} extra={{ scherm }} />;
            break;
        case 'kasboek-begin':
            inhoud = <KasboekScherm periode={periode} kasboek={maakKasboek(DAGSTATEN, KAS_MUTATIES, undefined, { datum: periode.start, saldo_cents: 14945 })} beschikbaar vandaag="2026-11-28" basis={BASIS} extra={{ scherm }} />;
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
