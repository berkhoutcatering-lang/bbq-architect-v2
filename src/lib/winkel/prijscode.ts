/**
 * De prijscode op een pakje van de leverancier (Veerbeek Uw Slager): een
 * EAN-13 `21 AAAAA PPPPP C`.
 *   21    = winkelcode met een prijs erin
 *   AAAAA = artikelnummer van de leverancier (winkel_producten.prijscode_nr)
 *   PPPPP = totaalprijs van het pakje in centen
 *   C     = controlecijfer (EAN-13)
 * Gewicht en THT staan er niet in. Dezelfde regel staat in de database
 * (private.prijscode_geldig) en in de Toonbank.
 */

export interface Prijscode {
    code: string;
    nr: string;
    prijs_cents: number;
}

/** Het EAN-13-controlecijfer van de eerste 12 cijfers. */
export function eanControlecijfer(twaalf: string): number {
    let som = 0;
    for (let i = 0; i < 12; i++) som += Number(twaalf[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (som % 10)) % 10;
}

export type PrijscodeUitkomst =
    | { ok: true; prijscode: Prijscode }
    | { ok: false; reden: 'geen_prijscode' | 'controlecijfer' };

/** Wat de scanner intypt → de prijscode, of waarom het er geen is. */
export function leesPrijscode(invoer: string): PrijscodeUitkomst {
    const code = invoer.trim();
    if (!/^21\d{11}$/.test(code)) return { ok: false, reden: 'geen_prijscode' };
    if (eanControlecijfer(code.slice(0, 12)) !== Number(code[12])) return { ok: false, reden: 'controlecijfer' };
    return { ok: true, prijscode: { code, nr: code.slice(2, 7), prijs_cents: Number(code.slice(7, 12)) } };
}
