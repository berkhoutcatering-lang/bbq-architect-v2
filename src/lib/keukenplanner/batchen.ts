/**
 * Batchen en meerijden — twee dingen die op elkaar lijken en het niet zijn.
 *
 * **Batchen** is werk dat één handeling wordt. Drie gerechten met gesnipperde
 * ui: één keer snipperen. De Piggy Mix die zowel onder de oerham als onder de
 * spareribs gaat: één keer aanmaken. Sleutel: bewerking + component.
 * Hoeveelheden tellen op, de duur is één keer vast plus de som maal tarief.
 *
 * **Meerijden** is werk dat tegelijk in hetzelfde apparaat past. Pulled beef
 * en oerham draaien allebei op 120 °C en kunnen samen de smoker in. Het
 * blijven twee taken met twee eigen eindes; ze delen alleen een venster.
 *
 * Het verschil is niet academisch: meerijden vraagt een temperatuurtoets die
 * batchen niet nodig heeft. Spareribs draaien op 110 °C en kunnen er dus niet
 * bij, hoeveel plek er ook over is.
 *
 * Beide worden begrensd door de capaciteit van het apparaat. Zonder die
 * controle plan je veertig kilo in een smoker die er twintig houdt, en dat
 * merk je pas als je ervoor staat.
 */

import type { Taak } from './types';
import { actieveDuurMin } from './duur';

/** Hoeveel graden verschil nog samen in één pit mag. */
export const TEMP_MARGE_C = 5;

export interface Batch {
    /** Stabiele sleutel: bewerking + component + apparaat + dag. */
    key: string;
    /** Welke lading binnen deze batch — 1 als hij in één keer past. */
    ladingNr: number;
    taken: Taak[];
    titel: string;
    totaalHoeveelheid: number | null;
    eenheid: string | null;
    /** Uitgerekend voor de opgetelde hoeveelheid: één keer vast, één keer opzetten. */
    actiefMin: number | null;
    /** Reden in mensentaal, voor op het scherm. */
    reden: string | null;
}

export interface CapaciteitsProbleem {
    /** Een enkel stuk past al niet — dit is geen batch-probleem maar een onmogelijk plan. */
    soort: 'past_niet' | 'gesplitst' | 'capaciteit_onbekend';
    apparaatNaam: string;
    tekst: string;
    taakIds: number[];
}

export interface BatchResultaat {
    batches: Batch[];
    problemen: CapaciteitsProbleem[];
}

/** Sleutel waarop gebatcht wordt. Het werkwoord alleen is te grof. */
export function batchSleutel(taak: Taak, dag: string): string | null {
    if (!taak.bewerkingCode) return null;
    const comp = taak.componentId ?? 'geen';
    const app = taak.apparaat?.id ?? 'geen';
    return `${taak.bewerkingCode}:${comp}:${app}:${dag}`;
}

/**
 * Batch de taken van één dag.
 *
 * `stapVelden` levert per taak de vaste en variabele duur, zodat de batch
 * zijn duur kan herberekenen over de opgetelde hoeveelheid in plaats van de
 * losse duren op te tellen — dat is precies de winst.
 */
export function batch(
    taken: Taak[],
    dag: string,
    stapVelden: (taak: Taak) => { duur_vast_min?: number | null; duur_per_eenheid_min?: number | null; duur_actief_min?: number | null },
): BatchResultaat {
    const groepen = new Map<string, Taak[]>();
    const los: Taak[] = [];

    for (const t of taken) {
        const key = batchSleutel(t, dag);
        if (key == null) {
            los.push(t);
            continue;
        }
        const bestaand = groepen.get(key);
        if (bestaand) bestaand.push(t);
        else groepen.set(key, [t]);
    }

    const batches: Batch[] = [];
    const problemen: CapaciteitsProbleem[] = [];

    for (const [key, groep] of groepen) {
        if (groep.length === 1) {
            batches.push(losseBatch(key, groep[0]));
            continue;
        }

        const verdeling = verdeelOverLadingen(groep);
        problemen.push(...verdeling.problemen);

        verdeling.ladingen.forEach((lading, i) => {
            const eerste = lading[0];
            const eenheden = new Set(lading.map((t) => t.eenheid).filter(Boolean));
            const zelfdeEenheid = eenheden.size <= 1;
            const hoeveelheden = lading.map((t) => t.hoeveelheid).filter((h): h is number => h != null);
            const totaal = zelfdeEenheid && hoeveelheden.length === lading.length
                ? round2(hoeveelheden.reduce((a, b) => a + b, 0))
                : null;

            const velden = stapVelden(eerste);
            const actief = lading.length > 1 && totaal != null
                ? actieveDuurMin(velden, totaal)
                : lading.reduce<number | null>((a, t) => (a == null || t.actiefMin == null ? null : a + t.actiefMin), 0);

            batches.push({
                key,
                ladingNr: i + 1,
                taken: lading,
                titel: eerste.titel,
                totaalHoeveelheid: totaal,
                eenheid: zelfdeEenheid ? (eerste.eenheid ?? null) : null,
                actiefMin: actief,
                reden: lading.length > 1
                    ? `${lading.length}× dezelfde bewerking — in één keer scheelt ${lading.length - 1}× opzetten en schoonmaken`
                    : verdeling.ladingen.length > 1
                        ? `lading ${i + 1} van ${verdeling.ladingen.length} — past niet in één keer`
                        : null,
            });
        });
    }

    for (const t of los) batches.push(losseBatch(`taak:${t.id}`, t));

    return { batches, problemen };
}

/**
 * Verdeel een groep over ladingen zodat elke lading in het apparaat past.
 *
 * Onbekende capaciteit betekent **niet batchen** — niet "dan waarschijnlijk
 * wel". Dat is de veilige kant van de fout.
 */
export function verdeelOverLadingen(groep: Taak[]): { ladingen: Taak[][]; problemen: CapaciteitsProbleem[] } {
    const problemen: CapaciteitsProbleem[] = [];
    const apparaat = groep[0]?.apparaat ?? null;

    if (!apparaat) return { ladingen: [groep], problemen };

    const maxAantal = apparaat.concurrentJobs ?? null;
    const maxGewicht = apparaat.capaciteitWaarde ?? null;
    const maxOppervlak = apparaat.kookoppervlakCm2 ?? null;

    if (maxAantal == null && maxGewicht == null && maxOppervlak == null) {
        problemen.push({
            soort: 'capaciteit_onbekend',
            apparaatNaam: apparaat.naam,
            tekst: `Capaciteit van ${apparaat.naam} is onbekend — niet gebundeld, één taak per keer.`,
            taakIds: groep.map((t) => t.id),
        });
        return { ladingen: groep.map((t) => [t]), problemen };
    }

    /* Een enkel stuk dat al niet past is geen batch-probleem maar een
       onmogelijk plan. Hard melden, niet stil afronden. */
    for (const t of groep) {
        const gewicht = t.hoeveelheid ?? t.stukGewichtKg ?? null;
        if (maxGewicht != null && gewicht != null && gewicht > maxGewicht) {
            problemen.push({
                soort: 'past_niet',
                apparaatNaam: apparaat.naam,
                tekst: `${t.titel} (${gewicht} ${t.eenheid ?? ''}) past niet in ${apparaat.naam} — die houdt ${maxGewicht} ${apparaat.capaciteitEenheid ?? ''}.`,
                taakIds: [t.id],
            });
        }
        /* Bij een grill is dit meestal de grens die als eerste raakt. */
        if (maxOppervlak != null && t.oppervlakCm2 != null && t.oppervlakCm2 > maxOppervlak) {
            problemen.push({
                soort: 'past_niet',
                apparaatNaam: apparaat.naam,
                tekst: `${t.titel} beslaat ${t.oppervlakCm2} cm² en past niet op ${apparaat.naam} — die heeft ${maxOppervlak} cm² rooster.`,
                taakIds: [t.id],
            });
        }
    }

    const ladingen = verdeelGelijkmatig(groep, { maxAantal, maxGewicht, maxOppervlak });

    if (ladingen.length > 1) {
        problemen.push({
            soort: 'gesplitst',
            apparaatNaam: apparaat.naam,
            /* Dit is het stuk dat je niet ziet aankomen: de eerste lading komt
               er eerder uit en moet ergens naartoe. Terugkoelen, wegzetten,
               koelruimte — HACCP-werk op de dag dat de koeling het krapst zit. */
            tekst: `${ladingen.length} ladingen in ${apparaat.naam}. De eerste komt eerder klaar en moet terugkoelen en weggezet worden — reken op een extra koelmoment en koelruimte.`,
            taakIds: groep.map((t) => t.id),
        });
    }

    return { ladingen, problemen };
}

/**
 * Kunnen deze twee taken samen in hetzelfde apparaat?
 *
 * Alleen als de temperatuur klopt. Dit is de toets die batchen niet nodig
 * heeft en meerijden wel — ribs van 110 °C horen niet in een pit van 120.
 */
export function magMeerijden(a: Taak, b: Taak): boolean {
    if (!a.apparaat || !b.apparaat) return false;
    if (a.apparaat.id !== b.apparaat.id) return false;
    if (a.tempDoelC == null || b.tempDoelC == null) return false;
    return Math.abs(a.tempDoelC - b.tempDoelC) <= TEMP_MARGE_C;
}

/**
 * Groepeer taken die tegelijk in hetzelfde apparaat kunnen. Blijven losse
 * taken met eigen eindes — ze delen alleen een venster.
 */
export function meerijders(taken: Taak[]): Taak[][] {
    const groepen: Taak[][] = [];
    for (const t of taken) {
        const passend = groepen.find((g) => g.every((x) => magMeerijden(x, t)));
        if (passend) passend.push(t);
        else groepen.push([t]);
    }
    return groepen;
}

/**
 * Verdeel over zo min mogelijk ladingen, en verdeel die dan **gelijk**.
 *
 * Niet greedy volgooien tot de grens en de rest in een tweede lading. Negentig
 * kilo wordt twee keer vijfenveertig en niet zestig plus dertig — een volle
 * en een halfvolle smoker garen ongelijk, en dan smaakt de ene lading anders
 * dan de andere. Gelijkmatig beladen is dus geen netjesheid maar kwaliteit.
 *
 * Werkwijze: eerst uitrekenen hoeveel ladingen er minimaal nodig zijn, dan de
 * grootste stukken eerst in de lichtste lading leggen. Dat is de standaard
 * aanpak voor dit soort verdelen en hij komt hier heel dicht bij gelijk uit.
 * Alleen als iets echt nergens meer bij past komt er een lading bij.
 */
export function verdeelGelijkmatig(
    taken: Taak[],
    grenzen: { maxAantal: number | null; maxGewicht: number | null; maxOppervlak: number | null },
): Taak[][] {
    const { maxAantal, maxGewicht, maxOppervlak } = grenzen;
    const gewichtVan = (t: Taak) => t.hoeveelheid ?? t.stukGewichtKg ?? 0;
    const oppervlakVan = (t: Taak) => t.oppervlakCm2 ?? 0;

    /* Hoeveel ladingen zijn er minimaal nodig? De strengste grens telt. */
    const totaalGewicht = taken.reduce((a, t) => a + gewichtVan(t), 0);
    const totaalOppervlak = taken.reduce((a, t) => a + oppervlakVan(t), 0);
    let n = 1;
    if (maxAantal != null && maxAantal > 0) n = Math.max(n, Math.ceil(taken.length / maxAantal));
    if (maxGewicht != null && maxGewicht > 0) n = Math.max(n, Math.ceil(totaalGewicht / maxGewicht));
    if (maxOppervlak != null && maxOppervlak > 0) n = Math.max(n, Math.ceil(totaalOppervlak / maxOppervlak));

    const ladingen: Taak[][] = Array.from({ length: n }, () => []);
    const gewicht = new Array(n).fill(0);
    const oppervlak = new Array(n).fill(0);

    /* Grootste stukken eerst: die zijn het lastigst te plaatsen, en wie ze
       voor het laatst bewaart houdt een scheve verdeling over. */
    const gesorteerd = [...taken].sort((a, b) => gewichtVan(b) - gewichtVan(a) || oppervlakVan(b) - oppervlakVan(a));

    for (const t of gesorteerd) {
        const g = gewichtVan(t);
        const o = oppervlakVan(t);

        const past = (i: number) =>
            (maxAantal == null || ladingen[i].length < maxAantal)
            && (maxGewicht == null || ladingen[i].length === 0 || gewicht[i] + g <= maxGewicht)
            && (maxOppervlak == null || ladingen[i].length === 0 || oppervlak[i] + o <= maxOppervlak);

        /* De lichtste lading die het nog aankan. */
        let doel = -1;
        for (let i = 0; i < ladingen.length; i++) {
            if (!past(i)) continue;
            if (doel === -1 || gewicht[i] + oppervlak[i] / 1000 < gewicht[doel] + oppervlak[doel] / 1000) doel = i;
        }
        if (doel === -1) {
            ladingen.push([]);
            gewicht.push(0);
            oppervlak.push(0);
            doel = ladingen.length - 1;
        }

        ladingen[doel].push(t);
        gewicht[doel] += g;
        oppervlak[doel] += o;
    }

    return ladingen.filter((l) => l.length > 0);
}

function losseBatch(key: string, taak: Taak): Batch {
    return {
        key,
        ladingNr: 1,
        taken: [taak],
        titel: taak.titel,
        totaalHoeveelheid: taak.hoeveelheid ?? null,
        eenheid: taak.eenheid ?? null,
        actiefMin: taak.actiefMin,
        reden: null,
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
