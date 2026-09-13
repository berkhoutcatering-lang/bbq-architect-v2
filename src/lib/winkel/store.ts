/**
 * De opslag van de kassa — één interface, twee implementaties.
 *
 *   supabaseStore.ts   de echte: service-role client + de databasefuncties
 *                      die tellen en schrijven onder vergrendeling
 *   geheugenStore.ts   in het geheugen, voor de route-tests
 *
 * De service (kassa.ts) kent alleen deze interface. Wat atomair moet zijn
 * (plaatsen, betaalpoging starten, betaling bevestigen) is hier één aanroep,
 * zodat de route nooit "eerst lezen, dan schrijven" hoeft te doen.
 */
import type { Artikel, Instellingen, MomentRij, Regelintern } from './rekenen';
import type { Leverwijze, Orderstatussoort } from './types';

export interface Tenant {
    orgId: string;
    slug: string;
    bedrijfsnaam: string;
    email: string | null;
    telefoon: string | null;
    brandColor: string | null;
    ondertitel: string | null;
}

export interface Bronnen {
    artikelen: Artikel[];
    momenten: MomentRij[];
    instellingen: Instellingen & { site_url: string | null };
}

export interface OrderRij {
    id: number;
    organization_id: string;
    nummer: string;
    token: string;
    sleutel: string;
    status: Orderstatussoort;
    status_reden: string | null;
    leverwijze: Leverwijze;
    moment_id: string | null;
    contact_naam: string;
    contact_email: string;
    contact_telefoon: string | null;
    adres: { straat: string; postcode: string; plaats: string } | null;
    opmerking: string | null;
    subtotaal_cents: number;
    leverkosten_cents: number;
    totaal_cents: number;
    btw_cents: Record<string, number>;
    reservering_tot: string;
    terug_url: string;
    betaalpoging: number;
    mypos_order_id: string | null;
    mypos_trnref: string | null;
    betaald_cents: number | null;
    betaald_at: string | null;
    betaalmethode: string | null;
    refund_status: 'nodig' | 'gelukt' | 'mislukt' | null;
    refund_fout: string | null;
    mail_status: 'niet_verstuurd' | 'verstuurd' | 'mislukt';
    mail_fout: string | null;
    created_at: string;
}

export interface OrderRegelRij {
    slug: string;
    naam: string;
    aantal: number;
    eenheid: string;
    stuk_cents: number;
    bedrag_cents: number;
    btw_pct: number;
    moment_id: string | null;
    eenheden: number;
    voorraad_eenheden: number;
    afhaalmoment_tekst: string | null;
}

export interface NieuweOrder {
    orgId: string;
    sleutel: string;
    token: string;
    leverwijze: Leverwijze;
    momentId: string | null;
    contact: { naam: string; email: string; telefoon: string };
    adres: { straat: string; postcode: string; plaats: string } | null;
    opmerking: string;
    subtotaalCenten: number;
    leverkostenCenten: number;
    totaalCenten: number;
    btwCenten: Record<string, number>;
    terugUrl: string;
    regels: Regelintern[];
}

/** De codes van de databasefuncties (zie de migratie). */
export type OpslagCode = 'WK001' | 'WK002' | 'WK003' | 'WK004' | 'WK005' | 'WK006' | 'WK007' | 'onbekend';

export type OpslagUitkomst<T> = { ok: true; waarde: T } | { ok: false; code: OpslagCode; detail?: string };

export interface WinkelStore {
    laadTenant(slug: string): Promise<Tenant | null>;
    /** null = deze organisatie heeft geen kassa (geen winkel_instellingen). */
    laadBronnen(orgId: string): Promise<Bronnen | null>;
    laadMoment(id: string): Promise<MomentRij | null>;

    vindOrderOpSleutel(orgId: string, sleutel: string): Promise<OrderRij | null>;
    vindOrderOpToken(orgId: string, token: string): Promise<OrderRij | null>;
    /** Op ordernummer (HB-2026-0042); het OrderID richting myPOS is nummer + '-' + poging. */
    vindOrderOpNummer(orgId: string, nummer: string): Promise<OrderRij | null>;
    laadRegels(orderId: number): Promise<OrderRegelRij[]>;

    /** Atomair: idempotentie op sleutel, capaciteit/voorraad tellen, nummer uitgeven, schrijven. */
    plaatsOrder(order: NieuweOrder): Promise<OpslagUitkomst<OrderRij>>;
    /** Atomair: (opnieuw) op 'wacht' met verse reservering en een OrderID voor myPOS. */
    startBetaalpoging(orderId: number): Promise<OpslagUitkomst<OrderRij>>;
    /** Atomair en idempotent: betaald / al_betaald / vol (verlopen en geen plek meer). */
    bevestigBetaling(orderId: number, b: { trnref: string; centen: number | null; methode: string | null }): Promise<'betaald' | 'al_betaald' | 'vol' | 'onbekend'>;
    zetStatus(orderId: number, status: Orderstatussoort, reden?: string | null): Promise<void>;

    /** false = dit bericht is al eerder gezien. */
    registreerBetaalbericht(orgId: string, referentie: string, methode: string, payload: unknown, orderId: number | null): Promise<boolean>;
    noteerBetaalberichtUitkomst(orgId: string, referentie: string, uitkomst: string): Promise<void>;
    noteerRefund(orderId: number, status: 'gelukt' | 'mislukt', fout?: string | null): Promise<void>;
    noteerMail(orderId: number, status: 'verstuurd' | 'mislukt', fout?: string | null): Promise<void>;
}
