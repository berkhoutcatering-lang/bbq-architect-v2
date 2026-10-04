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
}
