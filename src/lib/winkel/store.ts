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
    /* Vakjes (plan §2.3): wat er uit de opmerking gelezen is en hoe het plaatsen ging. */
    wensen: Wensen | null;
    wensen_bron: WensenBron | null;
    plaatsing_status: PlaatsingStatus | null;
    plaatsing_fout: string | null;
    plaatsing_at: string | null;
}

/** Wat uit de opmerking van de klant gelezen is. Staat altijd naast het origineel. */
export interface Wensen {
    vegetarisch: number;
    veganistisch: number;
    glutenvrij: number;
    allergenen: string[];
    overig: string[];
}
export type WensenBron = 'geen' | 'ai' | 'handmatig' | 'mislukt';
export type PlaatsingStatus = 'geplaatst' | 'vaste_bak' | 'mislukt';

export interface OrderRegelRij {
    id: number;
    artikel_id: string;
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
    /** De dag van het vakje (plan §2.2). Altijd gevuld. */
    klaar_op: string;
    /** Het event waarin deze regel is geplaatst; leeg = vaste bak of nog niet geplaatst. */
    event_id: number | null;
    klaargezet_at: string | null;
}

/* ── Vakjes (plan §4) ─────────────────────────────────────────────────────── */

export interface EventVakje {
    id: number;
    winkel_moment_id: string;
    name: string;
}

export interface NieuwEvent {
    orgId: string;
    momentId: string;
    naam: string;
    datum: string;
    van: string | null;
    tot: string | null;
}

export interface EventTotalen {
    guests: number;
    veg_guests: number;
    vegan_guests: number;
    gluten_free_guests: number;
    /** De gekoppelde gerecht-uuid's — de vorm die de MEP en bulkSchedule lezen. */
    menu: string[];
    /** Per gerecht-uuid het aantal. */
    menu_gasten: Record<string, number>;
    notitie: string;
}

export interface RegelOpEvent {
    regel: OrderRegelRij;
    order: Pick<OrderRij, 'id' | 'nummer' | 'contact_naam' | 'opmerking' | 'wensen'>;
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

    /* ── Vakjes (plan §4) ── */
    /** Alle artikelen van de organisatie, met hun koppeling (gerecht / voorraad-item / dieet). */
    laadArtikelen(orgId: string): Promise<Artikel[]>;
    /** Het event van dit afhaalmoment, of een nieuw. Bij een botsing wint de eerste; de tweede leest die. */
    vindOfMaakEvent(e: NieuwEvent): Promise<EventVakje>;
    werkRegelsBij(orderId: number, wijzigingen: { id: number; klaar_op: string; event_id: number | null }[]): Promise<void>;
    /** Alle regels van betaalde orders op dit event, met wat de hertelling van de order nodig heeft. */
    laadBetaaldeRegelsOpEvent(eventId: number): Promise<RegelOpEvent[]>;
    werkEventTotalenBij(eventId: number, t: EventTotalen): Promise<void>;
    noteerPlaatsing(orderId: number, status: PlaatsingStatus, fout?: string | null): Promise<void>;
}
