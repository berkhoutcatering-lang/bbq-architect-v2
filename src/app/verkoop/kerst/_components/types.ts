/** De rijen zoals het Kerst-scherm ze leest (RLS, via de browser). */

export interface KerstRegelRij {
    id: number;
    slug: string;
    naam: string;
    aantal: number;
    klaar_op: string;
    eenheden: number;
    opgehaald_at: string | null;
    klaargezet_at: string | null;
    event_id: number | null;
}

export interface KerstOrderRij {
    id: number;
    nummer: string;
    status: string;
    contact_naam: string;
    contact_email: string;
    contact_telefoon: string | null;
    opmerking: string | null;
    totaal_cents: number;
    rest_cents: number;
    rest_betaald_at: string | null;
    rest_betaalmethode: 'contant' | 'pin' | null;
    betaalwijze: string;
    mail_status: 'niet_verstuurd' | 'verstuurd' | 'mislukt';
    mail_fout: string | null;
    plaatsing_status: string | null;
    plaatsing_fout: string | null;
    created_at: string;
    lead_id: number | null;
    aantal_onzeker: boolean;
    navraag_verstuurd_at: string | null;
    herinnering_verstuurd_at: string | null;
    geannuleerd_at: string | null;
    winkel_order_regels: KerstRegelRij[];
}

export interface KerstLead {
    id: number;
    naam: string;
    email: string | null;
    telefoon: string | null;
    event_datum: string | null;
    gasten: number | null;
    bericht: string | null;
    omzet_fout: string | null;
    created_at: string;
}

export interface ArtikelRij {
    id: string;
    slug: string;
    naam: string;
    eenheid: string;
    prijs_cents: number | null;
    actief: boolean;
    minimum: number;
}

export interface MomentRij {
    id: string;
    datum: string;
    capaciteit: number | null;
    actief: boolean;
    bestellen_tot: string | null;
}

export type Melding = (tekst: string, soort?: 'success' | 'error' | 'info') => void;
