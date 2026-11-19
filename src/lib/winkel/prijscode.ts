/**
 * De prijscode op een pakje van de leverancier (Veerbeek Uw Slager): een
 * EAN-13 `21 PPPP K CCCCC E` (GS1, winkelcode met een prijs van 5 cijfers).
 *   21    = winkelcode met een prijs erin
 *   PPPP  = het artikelnummer (PLU) van de slager: winkel_producten.prijscode_nr
 *   K     = prijscontrolecijfer over de vijf prijscijfers (GS1)
 *   CCCCC = totaalprijs van het pakje in centen
 *   E     = controlecijfer van de hele EAN-13
 * Hetzelfde product heeft dus altijd dezelfde PLU, maar K wisselt met de
 * prijs: haasbiefstuk 2101015028237 (pakje, K 5) en 2101012076774 (krat, K 2)
 * hebben allebei PLU 0101. Tot 19 november 2026 lazen we hier `21 AAAAA PPPPP C`
 * en bewaarden we PLU + K van één toevallig pakje.
 *
 * PLU 0000 gebruikt Veerbeek voor meer producten (gekruid gehakt en Honey
 * Pops): die koppelen we nooit vast aan één product.
 *
 * Gewicht en THT staan er niet in. Dezelfde regel staat in de database
 * (private.prijscode_geldig) en in de Toonbank.
 */

export interface Prijscode {
    code: string;
    /** Het artikelnummer van de slager, vier cijfers ("0101"). */
    plu: string;
    prijs_cents: number;
}

/** Deze PLU deelt de slager tussen producten: altijd vragen welk product het is. */
export const GEDEELDE_PLU = '0000';

/** Het EAN-13-controlecijfer van de eerste 12 cijfers. */
export function eanControlecijfer(twaalf: string): number {
    let som = 0;
    for (let i = 0; i < 12; i++) som += Number(twaalf[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (som % 10)) % 10;
}

/* De gewogen tabellen van GS1 voor het prijscontrolecijfer. */
const TWEE_MIN = [0, 2, 4, 6, 8, 9, 1, 3, 5, 7];
const VIJF_PLUS = [0, 5, 1, 6, 2, 7, 3, 8, 4, 9];
const VIJF_MIN = [0, 5, 9, 4, 8, 3, 7, 2, 6, 1];
const WEGING = [VIJF_PLUS, TWEE_MIN, VIJF_MIN, VIJF_PLUS, TWEE_MIN];

/** Het prijscontrolecijfer (GS1) bij een prijs van vijf cijfers, bijvoorbeeld "02823" → 5. */
export function prijsControlecijfer(vijf: string): number {
    let som = 0;
    for (let i = 0; i < 5; i++) som += WEGING[i][Number(vijf[i])];
    const r = (10 - (som % 10)) % 10;
    return VIJF_MIN.indexOf(r);
}

export type PrijscodeUitkomst =
    | { ok: true; prijscode: Prijscode }
    | { ok: false; reden: 'geen_prijscode' | 'controlecijfer' };

/** Wat de scanner intypt → de prijscode, of waarom het er geen is. */
export function leesPrijscode(invoer: string): PrijscodeUitkomst {
    const code = invoer.trim();
    if (!/^21\d{11}$/.test(code)) return { ok: false, reden: 'geen_prijscode' };
    if (eanControlecijfer(code.slice(0, 12)) !== Number(code[12])) return { ok: false, reden: 'controlecijfer' };
    if (prijsControlecijfer(code.slice(7, 12)) !== Number(code[6])) return { ok: false, reden: 'controlecijfer' };
    return { ok: true, prijscode: { code, plu: code.slice(2, 6), prijs_cents: Number(code.slice(7, 12)) } };
}
