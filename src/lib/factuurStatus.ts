/**
 * Wanneer telt een factuur als openstaande vordering?
 *
 * Overal in de app stond `status !== 'betaald' && status !== 'geannuleerd'`.
 * Daarmee telden **concepten** mee: het dashboard meldde "OPEN FACTUREN
 * € 5.442" en "3 facturen vervallen · € 3.608" terwijl alle vier die facturen
 * op concept stonden en nooit verstuurd waren. Je kunt niet te laat zijn met een
 * factuur die de klant nooit heeft gekregen.
 *
 * Een factuur wordt pas een vordering zodra hij de deur uit is. `vervallen` is
 * een handmatige status voor een verstuurde factuur die te lang openstaat en
 * telt dus wél mee.
 */

interface FactuurLike {
    status?: string | null;
    vervaldatum?: string | null;
}

/** Verstuurd naar de klant — dus geen concept meer. */
export function isVerstuurd(f: FactuurLike): boolean {
    const s = (f.status || '').toLowerCase();
    return s === 'verzonden' || s === 'vervallen';
}

/** Openstaande vordering: verstuurd, nog niet betaald, niet geannuleerd. */
export function isOpenstaand(f: FactuurLike): boolean {
    return isVerstuurd(f);
}

/** Verstuurd én de vervaldatum is gepasseerd. */
export function isVervallen(f: FactuurLike, vandaagIso: string): boolean {
    return isOpenstaand(f) && !!f.vervaldatum && f.vervaldatum < vandaagIso;
}

/** Nog niet verstuurd — staat klaar om te versturen. */
export function isConcept(f: FactuurLike): boolean {
    return (f.status || '').toLowerCase() === 'concept';
}
