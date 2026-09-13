/**
 * Het contract met de Hop & Bites-website — de vormen die over de grens gaan.
 * Bron: OVERDRACHT-BBQ-ARCHITECT-WEBSHOP.md (website-repo, 11 sep 2026).
 *
 * Alle bedragen in hele centen. Datums ISO, tijdzone Europe/Amsterdam.
 * De website stuurt slugs, aantallen, een moment en contactgegevens; alles
 * wat geld is komt van hier.
 */

export type Leverwijze = 'afhalen' | 'verzenden';

/** Wat de website stuurt: alleen keuzes, nooit bedragen. */
export interface MandRegel {
    slug: string;
    aantal: number;
    /** Het moment (plank) of de dag (Kerst-Box) van deze regel. */
    moment: string | null;
}

export interface Mand {
    versie: 1;
    regels: MandRegel[];
}

export interface Moment {
    id: string;
    datum: string;
    van: string | null;
    tot: string | null;
    /** In besteleenheden (planken, dozen). 0 mag: de site toont "vol". */
    vrij: number;
}

export interface Offerteregel {
    slug: string;
    naam: string;
    aantal: number;
    eenheid: string;
    stukCenten: number;
    bedragCenten: number;
    /** De vaste afhaalafspraak in woorden, los van het gekozen moment. */
    afhaalmoment: string | null;
}

export interface Offerte {
    regels: Offerteregel[];
    subtotaalCenten: number;
    leverwijze: Leverwijze;
    leverkostenCenten: number;
    totaalCenten: number;
    moment: Moment | null;
    geldigTot: string;
}

export type Foutsoort = 'validatie' | 'moment-vol' | 'moment-verlopen' | 'prijs-gewijzigd' | 'niet-beschikbaar';

export type OfferteUitkomst =
    | { ok: true; offerte: Offerte }
    | { ok: false; soort: 'validatie'; fouten: string[] }
    | { ok: false; soort: 'moment-vol' | 'moment-verlopen' | 'niet-beschikbaar'; melding: string };

export interface Contact {
    naam: string;
    email: string;
    telefoon: string;
}

export interface Adres {
    straat: string;
    postcode: string;
    plaats: string;
}

export interface Orderinvoer {
    mand: Mand;
    leverwijze: Leverwijze;
    momentId: string | null;
    contact: Contact;
    adres: Adres | null;
    opmerking: string;
    sleutel: string;
    verwachtTotaalCenten: number;
    terugUrl: string;
}

export type OrderUitkomst =
    | { ok: true; token: string; betaalUrl: string }
    | { ok: false; soort: 'prijs-gewijzigd'; offerte: Offerte }
    | { ok: false; soort: 'validatie'; fouten: string[] }
    | { ok: false; soort: 'moment-vol' | 'moment-verlopen' | 'niet-beschikbaar'; melding: string };

export type Orderstatussoort = 'wacht' | 'betaald' | 'afgebroken' | 'mislukt' | 'verlopen';

export interface Orderstatus {
    token: string;
    nummer: string;
    status: Orderstatussoort;
    regels: Offerteregel[];
    subtotaalCenten: number;
    leverkostenCenten: number;
    totaalCenten: number;
    leverwijze: Leverwijze;
    moment: Moment | null;
    naam: string;
    emailGemaskeerd: string;
    aangemaakt: string;
    betaalUrl: string | null;
}
