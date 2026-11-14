/**
 * De schermen van Boekhouding winkel op twee nagemaakte winkelweken
 * (?bron=sim). Anders dan de vaste voorbeeldweek loopt dit door de echte
 * laders: dezelfde vragen als de echte pagina's, tegen een database in het
 * geheugen. "Vandaag" is zaterdag 5 december 2026, na sluitingstijd.
 */
import { laadToonbank } from '@/lib/btwAangifteBronnen';
import DagScherm from '@/app/winkelboek/_components/DagScherm';
import InkoopScherm from '@/app/winkelboek/_components/InkoopScherm';
import KasboekScherm from '@/app/winkelboek/_components/KasboekScherm';
import LopersScherm from '@/app/winkelboek/_components/LopersScherm';
import OverzichtScherm from '@/app/winkelboek/_components/OverzichtScherm';
import VerkoopScherm from '@/app/winkelboek/_components/VerkoopScherm';
import { maakDagboeking } from '@/lib/winkelboek/dagboeking';
import { maakLeveringen } from '@/lib/winkelboek/inkoop';
import { maakKasboek } from '@/lib/winkelboek/kasboek';
import {
    laadAfdelingVanProduct, laadDagBonnen, laadDagstaten, laadDerving, laadInkoopBonnen, laadKasBegin, laadKasMutaties, laadLoperInvoer,
    laadOntvangsten, laadUitsluitingen, laadVerkoopRegels, laadVoorraadwaarde, zonderProefdagen,
} from '@/lib/winkelboek/laden';
import { deelLopersIn } from '@/lib/winkelboek/lopers';
import { periodeVan } from '@/lib/winkelboek/periode';
import { geheugenDb } from '@/lib/winkelboek/simulatie/geheugenDb';
import { maakTweeWeken, SIM_NU, SIM_ORG } from '@/lib/winkelboek/simulatie/tweeWeken';
import { verkoopPerArtikel } from '@/lib/winkelboek/verkoop';

const VANDAAG = '2026-12-05';
const BASIS = '/e2e-test/winkelboek';

export async function simulatieScherm({ scherm, p, q, afdeling, groep, dag }: {
    scherm: string; p?: string; q?: string; afdeling?: string; groep?: string; dag?: string;
}): Promise<React.ReactNode> {
    const { sb } = geheugenDb(maakTweeWeken().tabellen);
    const extra = { bron: 'sim', scherm };

    if (scherm === 'dag') {
        const datum = dag ?? VANDAAG;
        const [proef, bonnen, staten, kas] = await Promise.all([
            laadUitsluitingen(sb, SIM_ORG, datum, datum), laadDagBonnen(sb, SIM_ORG, datum, datum),
            laadDagstaten(sb, SIM_ORG, datum, datum), laadKasMutaties(sb, SIM_ORG, datum, datum),
        ]);
        const eigenTijdens = kas.mutaties.filter((m) => m.moment === 'tijdens').reduce((s, m) => s + m.bedrag_cents, 0);
        return (
            <DagScherm dag={maakDagboeking(datum, bonnen.bonnen, staten.dagstaten, eigenTijdens)} dagstaten={staten.dagstaten} eigenTijdens={eigenTijdens}
                proefdag={proef.dagen.has(datum)} fout={bonnen.fout ?? staten.fout ?? proef.fout ?? kas.fout} />
        );
    }

    if (scherm === 'lopers') {
        const invoer = await laadLoperInvoer(sb, SIM_ORG, SIM_NU);
        return <LopersScherm lopers={deelLopersIn(invoer.producten, invoer.dagen)} groep={groep} vandaag={VANDAAG} fout={invoer.fout} basis={BASIS} extra={extra} />;
    }

    if (scherm === 'kasboek') {
        const periode = periodeVan(p ?? VANDAAG.slice(0, 7), VANDAAG);
        const [proef, staten, kas, begin] = await Promise.all([
            laadUitsluitingen(sb, SIM_ORG, periode.start, periode.eind), laadDagstaten(sb, SIM_ORG, periode.start, periode.eind),
            laadKasMutaties(sb, SIM_ORG, periode.start, periode.eind), laadKasBegin(sb, SIM_ORG, periode.start),
        ]);
        return (
            <KasboekScherm periode={periode} kasboek={maakKasboek(staten.dagstaten, kas.mutaties, proef.dagen, begin.begin)} beschikbaar={kas.beschikbaar}
                vandaag={VANDAAG} fout={staten.fout ?? proef.fout ?? kas.fout ?? begin.fout} basis={BASIS} extra={extra} />
        );
    }

    const periode = periodeVan(p, VANDAAG);
    const { start, eind } = periode;

    if (scherm === 'inkoop') {
        const [ontvangsten, bonnen, voorraadwaarde, toonbank] = await Promise.all([
            laadOntvangsten(sb, SIM_ORG, start, eind), laadInkoopBonnen(sb, SIM_ORG, start, eind), laadVoorraadwaarde(sb, SIM_ORG), laadToonbank(sb, SIM_ORG, start, eind),
        ]);
        return (
            <InkoopScherm periode={periode} leveringen={maakLeveringen(ontvangsten.ontvangsten, bonnen.bonnen)} voorraadwaarde={voorraadwaarde}
                omzetCents={toonbank.fout ? null : Math.round(toonbank.regels.reduce((s, r) => s + r.omzet, 0) * 100)}
                fout={ontvangsten.fout} bonFout={bonnen.fout} basis={BASIS} extra={extra} />
        );
    }

    const proef = await laadUitsluitingen(sb, SIM_ORG, start, eind);

    if (scherm === 'verkoop') {
        const [verkoop, afdelingen] = await Promise.all([laadVerkoopRegels(sb, SIM_ORG, start, eind, proef.dagen), laadAfdelingVanProduct(sb, SIM_ORG)]);
        return (
            <VerkoopScherm periode={periode} artikelen={verkoopPerArtikel(verkoop.regels, afdelingen.afdelingen)} zoek={q} afdeling={afdeling}
                fout={verkoop.fout ?? proef.fout ?? afdelingen.fout} basis={BASIS} extra={extra} />
        );
    }

    const [bonnen, staten, kas, kasBegin, toonbank, verkoop, afdelingen, derving] = await Promise.all([
        laadDagBonnen(sb, SIM_ORG, start, eind), laadDagstaten(sb, SIM_ORG, start, eind), laadKasMutaties(sb, SIM_ORG, start, eind),
        laadKasBegin(sb, SIM_ORG, start), laadToonbank(sb, SIM_ORG, start, eind), laadVerkoopRegels(sb, SIM_ORG, start, eind, proef.dagen),
        laadAfdelingVanProduct(sb, SIM_ORG), laadDerving(sb, SIM_ORG, start, eind),
    ]);
    return (
        <OverzichtScherm
            periode={periode}
            fout={bonnen.fout ?? staten.fout ?? toonbank.fout ?? verkoop.fout ?? proef.fout ?? kas.fout ?? kasBegin.fout ?? afdelingen.fout}
            bonnen={zonderProefdagen(bonnen.bonnen, proef.dagen)} dagstaten={zonderProefdagen(staten.dagstaten, proef.dagen)}
            kasMutaties={kas.mutaties} kasBegin={kasBegin.begin} verkoopRegels={verkoop.regels} afdelingen={afdelingen.afdelingen}
            kassaRegels={toonbank.regels} kassaDagen={toonbank.dagen} derving={derving} basis={BASIS}
        />
    );
}
