/**
 * prijsControle — herkent leveranciersprijzen die niet kunnen kloppen.
 *
 * Aanleiding, 2026-09-01. Een gerecht met 80 gram kipdij kwam uit op 5 cent.
 * De afleiding was correct: `MC KP Dij ZB/ZV 4X2.5 KG DV-W` staat in de
 * catalogus op €5,99 met een pakinhoud van 10 kg, en de canon zegt dat een
 * prijs bij een pakinhoud de prijs van het héle pak is (zie
 * supplierProductBaseCost en zijn tests). Tien kilo kipdij voor €5,99 kan
 * alleen niet.
 *
 * Er is dus niets mis met het rekenwerk en alles met de invoer, en juist dáár
 * zat geen enkele controle op. Een verkeerd getal liep ongehinderd door naar de
 * kostprijs, de marge, de bestellijst en de offerte.
 *
 * Wat deze module NIET doet: een prijs corrigeren of een betere schatten. Hij
 * wijst aan en zegt waarom. Wat de doos echt kost weet alleen de leverancier,
 * en dat blijft mensenwerk.
 *
 * Twee regels, allebei smal en uitlegbaar. Bewust geen slimme statistiek: een
 * drempel die je kunt navertellen is bruikbaar in een keuken, een uitschieter-
 * detectie niet.
 */

import { formatEur } from './format';

/** De velden uit `supplier_products` die de controle leest. */
export interface PrijsRij {
    name?: string | null;
    price_cents: number;
    unit?: string | null;
    package_size?: number | null;
    package_unit?: string | null;
}

export type VerdachtReden = 'prijs-is-pakgewicht' | 'onwaarschijnlijk-goedkoop';

export interface PrijsOordeel {
    verdacht: boolean;
    reden?: VerdachtReden;
    /** Wat de prijs per kilo of liter wordt, als dat te bepalen is. */
    perBasisEuro: number | null;
    /** Uitleg in mensentaal, klaar om te tonen. */
    toelichting?: string;
}

/**
 * Ondergrens in euro per kilo of liter waaronder een levensmiddel niet bestaat.
 *
 * Dit is een gekozen drempel, geen gemeten waarheid — zeg dat er ook bij als je
 * hem aanpast. Hij ligt op 75 cent omdat dat in de huidige catalogus precies de
 * scheidslijn is: budget-appels komen uit op €0,90 per kilo en dat is een echte
 * prijs, terwijl de kipdij op €0,60 en het paneermeel op €0,53 uitkomt en dat
 * allebei niet kan. Zakt er ooit iets echts onder deze grens, dan hoort de
 * grens te zakken en niet het product te verdwijnen.
 */
export const ONDERGRENS_EURO_PER_BASIS = 0.75;

/** Hoe dicht "prijs gelijk aan pakgewicht" mag liggen om als die fout te tellen. */
const GEWICHT_MARGE = 0.015;

/**
 * Totale pakinhoud in gram of milliliter, of null als het pak in stuks gaat.
 * Stuks laten we met rust: één stuk voor tien cent is bij een broodje raar en
 * bij een suikerzakje normaal, en dat onderscheid kunnen we hier niet maken.
 */
function pakInhoudBasis(rij: PrijsRij): number | null {
    const grootte = rij.package_size;
    if (typeof grootte !== 'number' || !Number.isFinite(grootte) || grootte <= 0) return null;
    const eenheid = (rij.package_unit ?? '').toString().trim().toLowerCase();
    if (eenheid === 'g' || eenheid === 'ml') return grootte;
    if (eenheid === 'kg' || eenheid === 'l' || eenheid === 'liter') return grootte * 1000;
    return null;
}

/** Prijs per kilo of liter, afgeleid volgens de canon: prijs ÷ pakinhoud. */
export function perBasisEuro(rij: PrijsRij): number | null {
    const inhoud = pakInhoudBasis(rij);
    if (inhoud == null) return null;
    if (!Number.isFinite(rij.price_cents) || rij.price_cents < 0) return null;
    return (rij.price_cents / inhoud) * 1000 / 100;
}

export function controleerLeveranciersprijs(rij: PrijsRij): PrijsOordeel {
    const perBasis = perBasisEuro(rij);
    if (perBasis == null) return { verdacht: false, perBasisEuro: null };

    /* Regel A — het pakgewicht is in het prijsveld beland.
       Vier rijen uit de browser-extensie hadden dit: een tray van 1,50 kg met
       een prijs van €1,50, een doosje van 1,75 kg met €1,75. Het valt op omdat
       de uitkomst dan altijd precies één euro per kilo is. */
    const inhoudKg = (pakInhoudBasis(rij) ?? 0) / 1000;
    const prijsEuro = rij.price_cents / 100;
    if (inhoudKg > 0 && Math.abs(prijsEuro - inhoudKg) <= inhoudKg * GEWICHT_MARGE) {
        return {
            verdacht: true,
            reden: 'prijs-is-pakgewicht',
            perBasisEuro: perBasis,
            toelichting:
                `De prijs (${formatEur(prijsEuro)}) is gelijk aan het pakgewicht `
                + `(${nummer(inhoudKg)} kg). Waarschijnlijk is bij het inlezen het gewicht `
                + `in het prijsveld beland.`,
        };
    }

    /* Regel B — goedkoper dan een levensmiddel kan zijn. */
    if (perBasis < ONDERGRENS_EURO_PER_BASIS) {
        return {
            verdacht: true,
            reden: 'onwaarschijnlijk-goedkoop',
            perBasisEuro: perBasis,
            toelichting:
                `Komt uit op ${formatEur(perBasis)} per kilo. Staat er een pakinhoud bij, `
                + `dan geldt de prijs voor het héle pak — ${formatEur(prijsEuro)} voor `
                + `${nummer(inhoudKg)} kg. Klopt dat, of is ${formatEur(prijsEuro)} de prijs per kilo?`,
        };
    }

    return { verdacht: false, perBasisEuro: perBasis };
}

function nummer(n: number): string {
    return n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ',');
}
