/**
 * Ophalen aan de balie (BA-2, plan v5 M1) — puur: geen database, geen klok.
 *
 * Het meegeven zelf gebeurt in één databasefunctie, winkel_order_ophalen
 * (migratie 20261005120000): die controleert, pakt in wat nog niet ingepakt
 * is (verkoop_online), boekt de rest en zet regels en dozen op opgehaald, in
 * één transactie. Hier staan dezelfde regels voor het scherm (welke stap
 * eerst) en de geheugen-opslag, en de meldingen in mensentaal.
 *
 * De controles, in dezelfde volgorde als de database:
 *   onbekend → niet_betaald → al_opgehaald → geweigerd → rest_nodig →
 *   leeftijd_nodig → (inpakken: te_weinig_voorraad) → opgehaald.
 * Geweigerd komt vóór de rest: wie de order niet meekrijgt, betaalt ook
 * geen rest.
 *
 * Op het scherm is de volgorde andersom vriendelijker: eerst 18+ ("ID gezien"
 * of "Geweigerd"), dan de rest (contant of pin), dan "Opgehaald". Omdat het
 * scherm beide antwoorden verzamelt vóór het de database vraagt, maakt dat
 * voor de uitkomst niets uit.
 */

import type { Betaalwijze } from './types';

export type Leeftijd = 'vastgesteld' | 'geweigerd';
export type RestMethode = 'contant' | 'pin';
export type OphaalBron = 'ba' | 'toonbank';

/** Wat de regels van ophalen van een order nodig hebben. */
export interface OphaalOrder {
    status: string;
    /* 'bij_afhalen' (Kerst-Box) kent de rest-stap hier nog niet, net als
       winkel_order_ophalen in de database: restOpen kijkt alleen naar
       'reservering'. */
    betaalwijze: Betaalwijze;
    rest_cents: number;
    rest_betaald_at: string | null;
    regels: { alcohol?: boolean | null; opgehaald_at?: string | null }[];
}

/** Wat de balie al gekozen heeft. */
export interface OphaalKeuze {
    leeftijd?: Leeftijd | null;
    restMethode?: RestMethode | null;
}

export interface Boeking {
    product_id: string;
    hoeveelheid: number;
    voorraad: number | null;
}

interface Basis {
    order_id: number;
    nummer: string;
    klant: string;
    /** Regels die nog niet zijn opgehaald (vóór deze aanroep; 0 na opgehaald). */
    nog_open: number;
    /** Er zit alcohol in wat nog mee moet. */
    alcohol: boolean;
    /** De rest die nog openstaat (0 = niets open). */
    rest_cents: number;
}

/** Het antwoord van winkel_order_ophalen. Alleen bij 'opgehaald' is er iets gewijzigd. */
export type OphaalUitkomst =
    | { uitkomst: 'onbekend'; order_id: number }
    | (Basis & { uitkomst: 'niet_betaald'; status: string })
    | (Basis & { uitkomst: 'al_opgehaald'; opgehaald_at: string | null })
    /** Niets meegegeven; alleen de weigering vastgelegd (winkel_orders.leeftijd_geweigerd_at). */
    | (Basis & { uitkomst: 'geweigerd'; geweigerd_at: string })
    | (Basis & { uitkomst: 'rest_nodig'; reeds_cents: number })
    | (Basis & { uitkomst: 'leeftijd_nodig' })
    | (Basis & { uitkomst: 'te_weinig_voorraad'; melding: string })
    | (Basis & {
        uitkomst: 'opgehaald';
        opgehaald_at: string;
        regels: number;
        rest_geboekt: RestMethode | null;
        leeftijd: Leeftijd | null;
        boekingen: Boeking[];
    });

export type OphaalUitkomstSoort = OphaalUitkomst['uitkomst'];

/** Het antwoord van winkel_order_ophalen_terug. Alleen de status; voorraad en rest blijven. */
export type TerugUitkomst =
    | { uitkomst: 'onbekend'; order_id: number }
    | { uitkomst: 'niet_opgehaald'; order_id: number; nummer: string }
    | { uitkomst: 'niet_zelfde_dag'; order_id: number; nummer: string; opgehaald_at: string | null }
    | { uitkomst: 'teruggezet'; order_id: number; nummer: string; regels: number; dozen: number };

/** Regels die nog mee moeten. */
export function nogOpen(o: Pick<OphaalOrder, 'regels'>): number {
    return o.regels.filter((r) => !r.opgehaald_at).length;
}

/** Alcohol in wat nog mee moet: dan eerst de leeftijd vaststellen. */
export function heeftAlcohol(o: Pick<OphaalOrder, 'regels'>): boolean {
    return o.regels.some((r) => !r.opgehaald_at && Boolean(r.alcohol));
}

/** Een reservering met een rest die nog niet betaald is. */
export function restOpen(o: Pick<OphaalOrder, 'betaalwijze' | 'rest_cents' | 'rest_betaald_at'>): boolean {
    return o.betaalwijze === 'reservering' && o.rest_cents > 0 && !o.rest_betaald_at;
}

/**
 * Wat de database controleert vóór er iets gebeurt, in dezelfde volgorde als
 * winkel_order_ophalen. null = mag mee (inpakken kan dan nog op te weinig
 * voorraad stuklopen).
 */
export function ophaalBlokkade(o: OphaalOrder, keuze: OphaalKeuze = {}): 'niet_betaald' | 'al_opgehaald' | 'geweigerd' | 'rest_nodig' | 'leeftijd_nodig' | null {
    if (o.status !== 'betaald') return 'niet_betaald';
    if (nogOpen(o) === 0) return 'al_opgehaald';
    if (keuze.leeftijd === 'geweigerd') return 'geweigerd';
    if (restOpen(o) && !keuze.restMethode) return 'rest_nodig';
    if (heeftAlcohol(o) && !keuze.leeftijd) return 'leeftijd_nodig';
    return null;
}

export type OphaalStap = 'niet_betaald' | 'al_opgehaald' | 'leeftijd' | 'geweigerd' | 'rest' | 'ophalen';

/**
 * De volgende stap op het scherm: eerst 18+ (ID gezien / Geweigerd), dan de
 * rest (contant / pin), dan Opgehaald.
 */
export function welkeStapNodig(o: OphaalOrder, keuze: OphaalKeuze = {}): OphaalStap {
    if (o.status !== 'betaald') return 'niet_betaald';
    if (nogOpen(o) === 0) return 'al_opgehaald';
    if (keuze.leeftijd === 'geweigerd') return 'geweigerd';
    if (heeftAlcohol(o) && !keuze.leeftijd) return 'leeftijd';
    if (restOpen(o) && !keuze.restMethode) return 'rest';
    return 'ophalen';
}

/** Dezelfde kalenderdag in Nederland (voor ongedaan maken). */
export function opDezelfdeDag(iso: string, nu: Date): boolean {
    const dag = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    return dag(new Date(iso)) === dag(nu);
}

export type Melding = { tekst: string; soort: 'success' | 'error' | 'info' };

/** "€ 4,50" */
export function euro(centen: number): string {
    return '€ ' + (centen / 100).toFixed(2).replace('.', ',');
}

const STATUS_WOORD: Record<string, string> = {
    wacht: 'de betaling loopt nog',
    afgebroken: 'betaling afgebroken',
    mislukt: 'betaling mislukt',
    verlopen: 'reservering verlopen',
};

function tijd(iso: string | null): string {
    if (!iso) return '';
    return ' om ' + new Date(iso).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** De uitkomst van winkel_order_ophalen in mensentaal, voor de melding aan de balie. */
export function ophaalMelding(u: OphaalUitkomst): Melding {
    switch (u.uitkomst) {
        case 'onbekend':
            return { soort: 'error', tekst: 'Deze order kennen we niet. Zoek hem op nummer of naam.' };
        case 'niet_betaald':
            return { soort: 'error', tekst: `${u.nummer} is niet betaald (${STATUS_WOORD[u.status] ?? u.status}). Niet meegeven.` };
        case 'al_opgehaald':
            return { soort: 'info', tekst: `${u.nummer} is al opgehaald${tijd(u.opgehaald_at)}. Er is niets dubbel geboekt.` };
        case 'geweigerd':
            return { soort: 'info', tekst: `${u.nummer} niet meegegeven: leeftijd niet vastgesteld. De weigering is vastgelegd; er is niets meegegeven en geen rest geboekt.` };
        case 'rest_nodig':
            return { soort: 'info', tekst: `Eerst de rest: ${euro(u.rest_cents)} contant of pin (reeds betaald ${euro(u.reeds_cents)}). Er is nog niets meegegeven.` };
        case 'leeftijd_nodig':
            return { soort: 'info', tekst: `In ${u.nummer} zit alcohol: eerst de leeftijd vaststellen (ID gezien of geweigerd). Er is nog niets meegegeven.` };
        case 'te_weinig_voorraad':
            return { soort: 'error', tekst: `${u.nummer} kan niet mee: er ligt te weinig om in te pakken. Er is niets geboekt. Tel het schap en corrigeer de voorraad.${u.melding ? ` (${u.melding})` : ''}` };
        case 'opgehaald': {
            const delen = [`${u.nummer} opgehaald`];
            if (u.rest_geboekt) delen.push(`rest ${euro(u.rest_cents)} ${u.rest_geboekt} geboekt`);
            if (u.leeftijd === 'vastgesteld') delen.push('18+ vastgesteld');
            const producten = new Set(u.boekingen.map((b) => b.product_id)).size;
            if (producten > 0) delen.push(`ingepakt en afgeboekt (${producten} ${producten === 1 ? 'product' : 'producten'})`);
            return { soort: 'success', tekst: delen.join(' · ') + '.' };
        }
    }
}

/** De uitkomst van winkel_order_ophalen_terug in mensentaal. */
export function terugMelding(u: TerugUitkomst): Melding {
    switch (u.uitkomst) {
        case 'onbekend':
            return { soort: 'error', tekst: 'Deze order kennen we niet.' };
        case 'niet_opgehaald':
            return { soort: 'info', tekst: `${u.nummer} stond niet op opgehaald.` };
        case 'niet_zelfde_dag':
            return { soort: 'error', tekst: `${u.nummer} is op een eerdere dag opgehaald${tijd(u.opgehaald_at)}. Dat zet je niet meer terug; corrigeer zo nodig met een telling.` };
        case 'teruggezet':
            return { soort: 'success', tekst: `${u.nummer} weer op niet opgehaald. De voorraad blijft afgeboekt (het pakket is ingepakt) en een geboekte rest blijft staan.` };
    }
}
