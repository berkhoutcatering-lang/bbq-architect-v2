/**
 * De opslag van de Toonbank-API — één interface, twee implementaties
 * (zoals src/lib/winkel/store.ts):
 *
 *   supabaseStore.ts   de echte: service-role client + de databasefuncties
 *                      uit 20261006130000_toonbank_apparaten (en later BA-8)
 *   geheugenStore.ts   in het geheugen, voor de tests van de routes en logica
 *
 * De logica (koppelen.ts, sessie.ts, …) kent alleen deze interface. De
 * organisatie komt altijd uit de apparaatsleutel: elke methode met orgId
 * krijgt die van de guard, nooit van de tablet.
 */

export type ToonbankRol = 'medewerker' | 'eigenaar';
export type SessieDoel = 'dienst' | 'vrij_overschrijden';

/** Een rij van toonbank_apparaten, zonder de hashes. */
export interface Apparaat {
    id: string;
    organization_id: string;
    naam: string;
    code: string;
    locatie: 'winkel' | 'event';
    ingetrokken_at: string | null;
    hoogste_volgnummer_gemeld: number;
    bevestigd_tot_volgnummer: number;
}

/** Een open koppelcode (toonbank_koppel_kandidaten). */
export interface KoppelKandidaat {
    apparaat_id: string;
    organization_id: string;
    koppelcode_hash: string;
}

/** Wat toonbank_koppel_af teruggeeft. */
export interface Koppeling {
    apparaat_id: string;
    organization_id: string;
    code: string;
    naam: string;
}

/** Een persoon uit personeel, met wat inloggen nodig heeft. Nooit naar de tablet. */
export interface Medewerker {
    id: string;
    organization_id: string;
    naam: string;
    actief: boolean;
    toonbank_rol: ToonbankRol | null;
    kds_pin_hash: string | null;
    kds_pin_lockout_until: string | null;
}

export interface InlogTeller {
    mislukt: number;
    over: number;
    /** Gezet als de persoon nu geblokkeerd is. */
    geblokkeerd_tot: string | null;
}

export interface NieuweSessie {
    organization_id: string;
    apparaat_id: string;
    medewerker_id: string;
    token_hash: string;
    rol: ToonbankRol;
    doel: SessieDoel;
    geldig_tot: string;
}

export interface Sessie {
    id: string;
    organization_id: string;
    apparaat_id: string;
    medewerker_id: string;
    rol: ToonbankRol;
    doel: SessieDoel;
    geldig_tot: string;
    beeindigd_at: string | null;
}

/** Wat toonbank_status teruggeeft (alles van GET status behalve contract). */
export interface StatusBron {
    servertijd: string;
    apparaat: { apparaat_id: string; code: string; naam: string };
    catalogus_versie: number;
    voorraad_versie: number;
    vrij_verloopt_at: string | null;
    afhaallijst_versie: number;
    wegzetten_open: number;
    wegzetten_binnen_24u: number;
    hoogste_volgnummer_gemeld: number;
    bevestigd_tot_volgnummer: number;
    hoogste_bon_volgnummer: number;
    instellingen: { alcohol_toegestaan: boolean; contant_aan: boolean; contant_limiet_cents: number; beschikbaar_grens: number };
    te_controleren: number;
}

export interface ApparaatGezien {
    volgnummer: number | null;
    app_versie: string | null;
    contract_versie: string | null;
}

/* ── BA-8: wat de databasefuncties teruggeven ───────────────────────────── */

/** Een artikel uit toonbank_catalogus, met de ruwe foto (de API maakt er een URL van). */
export interface CatalogusArtikelRuw {
    artikel_id: string;
    naam: string;
    prijs_cents: number;
    btw_pct: number;
    btw_verdeling: { pct: number; gewicht: number }[] | null;
    alcohol: boolean;
    groep: string | null;
    volgorde: number;
    favoriet: boolean;
    /** winkel_producten.foto van het product bij een één-slot-artikel (winkel-fotos). */
    foto: unknown;
    /** winkel_producten.foto_url (oud veld), als terugval. */
    foto_url_ruw: string | null;
    onderdelen: { product_id: string; hoeveelheid: number; eenheid: string }[];
    actief: boolean;
    kanalen: string[];
}

export interface CatalogusRuw {
    versie: number;
    volledig: boolean;
    artikelen: CatalogusArtikelRuw[];
    producten: { product_id: string; naam: string; statiegeld_cents: number; voorraad_bijgehouden: boolean; alcohol: boolean }[];
    codes: { code: string; soort: 'ean' | 'plu'; artikel_id: string }[];
    groepen: { groep_id: string; naam: string; volgorde: number; open_prijs: boolean; btw_pct: number | null; alcohol: boolean }[];
}

/** Een rij uit de view winkel_wegzet_taken (BA-6). */
export interface WegzetTaakRij {
    order_id: number;
    nummer: string;
    naam: string | null;
    afhaalmoment: string | null;
    ophalen_binnen_24u: boolean;
    regels: { regel_id: number; artikel: string; aantal: number; producten: { product_id: string | null; naam: string | null; hoeveelheid: number; eenheid: string | null }[] }[];
}

export interface WegzetVraag {
    orgId: string;
    apparaatId: string;
    orderId: number;
    actie: 'apart' | 'ongedaan';
    gebeurtenisId: string;
    moment: string;
    medewerkerId: string;
    contractVersie: string | null;
    reden: string | null;
}

/** Wat toonbank_wegzet_vraag teruggeeft. */
export interface WegzetVraagRuw {
    journaal: 'nieuw' | 'bestond';
    soort: string;
    payload: Record<string, unknown>;
    /** {ok: true, uitkomst, order_id, nummer, boekingen, apart_gezet_at?} of {ok: false, sqlstate, melding, detail}. */
    resultaat: Record<string, unknown> | null;
}

/* ── BA-9: het journaal (eerst opslaan, dan verwerken) ──────────────────── */

export interface JournaalOpslag {
    orgId: string;
    apparaatId: string;
    /** De meldingen zoals de tablet ze stuurde (de envelop is al gecontroleerd). */
    meldingen: unknown[];
    contractVersie: string | null;
    /** Te oude app (contract §6.6): wel opslaan, als fout contract_verouderd. */
    verouderd: boolean;
    /**
     * De strenge controle (zod) vóór het opslaan: gebeurtenis_id (kleine letters) → wat er niet klopt.
     * Zo'n nieuwe melding komt meteen als fout (code schema) in het journaal (review M2, klein 12).
     */
    schemaFouten?: Record<string, string>;
}

export interface JournaalResultaat {
    gebeurtenis_id: string;
    journaal: 'nieuw' | 'bestond';
    journaal_id: number;
    /** De verwerk_status op dit moment (wacht, verwerkt, niet_nodig, fout, conflict, opgelost). */
    verwerking: string;
    soort: string;
}

/** Wat toonbank_journaal_opslaan teruggeeft. */
export interface JournaalOpslagRuw {
    resultaten: JournaalResultaat[];
    bevestigd_tot_volgnummer: number;
}

/** Eén verwerkte melding uit toonbank_verwerk_wachtrij. */
export interface VerwerktRij {
    journaal_id: number;
    gebeurtenis_id: string;
    soort: string;
    status: string;
    /** De producten waarvan de voorraad veranderde (voor de meldingen en het ververs-signaal). */
    product_ids: string[];
}

/* ── BA-10: ophalen en dagstaten ────────────────────────────────────────── */

export interface OphaalVraag {
    orgId: string;
    apparaatId: string;
    soort: 'order' | 'doos';
    orderId: number | null;
    code: string | null;
    gebeurtenisId: string;
    moment: string;
    medewerkerId: string;
    bonId: string | null;
    restMethode: 'pin' | 'contant' | null;
    restBedragCents: number | null;
    leeftijd: 'vastgesteld' | 'geweigerd' | null;
    /** leeftijd.at van de tablet; de database begrenst hem op nu (review M2, klein 11). */
    leeftijdAt: string | null;
    contractVersie: string | null;
}

/** Wat toonbank_ophaal_vraag teruggeeft. */
export interface OphaalVraagRuw {
    journaal: 'nieuw' | 'bestond';
    soort: string;
    payload: Record<string, unknown>;
    /** De uitkomst van winkel_order_ophalen of winkel_doos_ophalen, plus ok en rest_dubbel. */
    resultaat: Record<string, unknown> | null;
}

export interface DagstaatStand {
    status: string;
    verschillen: { veld: string; tablet_cents: number; ba_cents: number }[];
}

/** De envelop van een melding klopt niet (de database zegt 22023): 400 ongeldig_verzoek. */
export class OngeldigeMelding extends Error {
    constructor(melding: string, public readonly index: number | null = null) {
        super(melding);
        this.name = 'OngeldigeMelding';
    }
}

export interface ToonbankStore {
    /* ── Koppelen (BA-7a) ── */
    koppelKandidaten(): Promise<KoppelKandidaat[]>;
    /** Een foute code: telt bij alle open codes. Geeft hoeveel codes daardoor vervielen. */
    koppelMislukt(): Promise<number>;
    /** null = de code was net niet meer open (verlopen, gebruikt, ingetrokken). */
    koppelAf(apparaatId: string, sleutelHash: string, sleutelPrefix: string): Promise<Koppeling | null>;

    /* ── Sleutel (BA-7b, de guard) ── */
    /** Op SHA-256 van de sleutel; ook een ingetrokken apparaat komt terug (dan ingetrokken_at gezet). */
    apparaatOpSleutel(sleutelHash: string): Promise<Apparaat | null>;

    /* ── Medewerkers en sessies (BA-7a) ── */
    /** Iedereen met een toonbank_rol en actief, op naam. */
    medewerkers(orgId: string): Promise<Pick<Medewerker, 'id' | 'naam' | 'toonbank_rol'>[]>;
    medewerker(orgId: string, id: string): Promise<Medewerker | null>;
    inlogcodeMislukt(orgId: string, medewerkerId: string, apparaatId: string): Promise<InlogTeller>;
    maakSessie(s: NieuweSessie): Promise<{ id: string }>;
    /** Op SHA-256 van het token, alleen binnen deze organisatie en dit apparaat. */
    sessieOpToken(orgId: string, apparaatId: string, tokenHash: string): Promise<Sessie | null>;

    /* ── Status (BA-7b) ── */
    /** Legt "laatst gezien" en het hoogste volgnummer vast en geeft de stand (toonbank_status). */
    status(orgId: string, apparaatId: string, gezien: ApparaatGezien): Promise<StatusBron>;

    /* ── Vragen en lijsten (BA-8) ── */
    catalogusVersie(orgId: string): Promise<number>;
    catalogus(orgId: string): Promise<CatalogusRuw>;
    /** winkel_voorraad_stand: de versie en het eerste moment waarop een reservering verloopt. */
    voorraadStand(orgId: string): Promise<{ versie: number; vrij_verloopt_at: string | null }>;
    /** toonbank_vrij: al in de vorm van het contract (VrijAntwoord). */
    vrij(orgId: string): Promise<{ versie: number; volledig: boolean; vrij_verloopt_at: string | null; producten: unknown[] }>;
    wegzetTaken(orgId: string): Promise<WegzetTaakRij[]>;
    wegzetVraag(v: WegzetVraag): Promise<WegzetVraagRuw>;
    /** toonbank_afhaallijst: al in de vorm van het contract (AfhaallijstAntwoord). */
    afhaallijst(orgId: string, datum: string): Promise<{ versie: number; datum: string; orders: unknown[] }>;
    /** scan_resolve: {soort, code, …}. */
    scan(orgId: string, code: string): Promise<Record<string, unknown>>;

    /* ── Het journaal (BA-9) ── */
    /** toonbank_journaal_opslaan. Gooit OngeldigeMelding bij een kapotte envelop (niets opgeslagen). */
    journaalOpslaan(o: JournaalOpslag): Promise<JournaalOpslagRuw>;
    /** toonbank_verwerk_wachtrij: alles op wacht van deze tablet. */
    verwerkWachtrij(orgId: string, apparaatId: string): Promise<VerwerktRij[]>;
    /**
     * Wacht er iets van deze tablet dat nog niet (of alleen met een tijdelijke fout) is verwerkt?
     * Dan verwerkt GET status de wachtrij (review M2, klein 1). Een tegenbon die op zijn bon wacht telt niet.
     */
    wachtrijTeVerwerken(orgId: string, apparaatId: string): Promise<boolean>;

    /* ── Ophalen en dagstaten (BA-10) ── */
    /** toonbank_ophaal_vraag: een order of doos meegeven, idempotent op gebeurtenis_id. */
    ophaalVraag(v: OphaalVraag): Promise<OphaalVraagRuw>;
    /** toonbank_dagstaat_overzicht (GET dagstaat). */
    dagstaatOverzicht(orgId: string, apparaatId: string, datum: string): Promise<Record<string, unknown>>;
    /** Status en verschillen van een dagstaat; null als hij (nog) niet bestaat. */
    dagstaatStand(orgId: string, dagstaatId: string): Promise<DagstaatStand | null>;
}
