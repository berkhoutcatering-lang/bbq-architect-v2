/**
 * De Toonbank-opslag in het geheugen, voor de tests van de logica en de
 * routes. Doet wat de databasefuncties doen (20261006130000_toonbank_
 * apparaten), zonder database: koppelen met 5 pogingen, de inlogteller met
 * blokkade, sessies op hash. supabase/tests/toonbank_apparaten.sql bewaakt
 * dat de echte functies hetzelfde zeggen.
 */
import { randomUUID } from 'node:crypto';
import type {
    Apparaat, CatalogusRuw, InlogTeller, KoppelKandidaat, Koppeling, Medewerker, NieuweSessie, Sessie, StatusBron, ToonbankStore,
    WegzetTaakRij, WegzetVraag, WegzetVraagRuw,
} from './store';

export interface GeheugenApparaat extends Apparaat {
    sleutel_hash: string | null;
    sleutel_prefix: string | null;
    koppelcode_hash: string | null;
    koppelcode_geldig_tot: string | null;
    koppelpogingen: number;
}

export interface GeheugenSessie extends Sessie {
    token_hash: string;
    aangemaakt_at: string;
}

export interface ToonbankGeheugen {
    apparaten: GeheugenApparaat[];
    medewerkers: Medewerker[];
    sessies: GeheugenSessie[];
    /** Foute inlogcodes: tijdstip per medewerker. */
    mislukt: { medewerker_id: string; at: string }[];
    /** De klok van de opslag (de database bepaalt now()). */
    nu: Date;
    /** Wat toonbank_status per organisatie zou uitrekenen (versies, badge, instellingen). */
    stand: Record<string, Omit<StatusBron, 'servertijd' | 'apparaat' | 'hoogste_volgnummer_gemeld' | 'bevestigd_tot_volgnummer'>>;
    /* BA-8: wat de databasefuncties per organisatie teruggeven (vooraf ingevuld door de test). */
    catalogus: Record<string, CatalogusRuw>;
    vrij: Record<string, { versie: number; volledig: boolean; vrij_verloopt_at: string | null; producten: unknown[] }>;
    wegzetTaken: Record<string, WegzetTaakRij[]>;
    afhaallijst: Record<string, Record<string, { versie: number; datum: string; orders: unknown[] }>>;
    scan: Record<string, Record<string, Record<string, unknown>>>;
    /** Wat winkel_zet_order_apart(_terug) zou geven: {ok: true, …} of {ok: false, sqlstate, …}. */
    wegzetResultaat: (v: WegzetVraag) => Record<string, unknown>;
    /** Het journaal van de vragen, op gebeurtenis_id (per organisatie). */
    journaal: { organization_id: string; gebeurtenis_id: string; payload: Record<string, unknown>; resultaat: Record<string, unknown> }[];
    /** Hoe vaak de vraag echt is uitgevoerd (niet uit het journaal). */
    wegzetUitgevoerd: number;
}

export const STANDAARD_STAND: ToonbankGeheugen['stand'][string] = {
    catalogus_versie: 0,
    voorraad_versie: 0,
    vrij_verloopt_at: null,
    afhaallijst_versie: 0,
    wegzetten_open: 0,
    wegzetten_binnen_24u: 0,
    hoogste_bon_volgnummer: 0,
    instellingen: { alcohol_toegestaan: false, contant_aan: true, contant_limiet_cents: 300_000, beschikbaar_grens: 5 },
    te_controleren: 0,
};

export type ToonbankGeheugenStore = ToonbankStore & { g: ToonbankGeheugen };

export function maakToonbankGeheugenStore(start: Partial<ToonbankGeheugen> = {}): ToonbankGeheugenStore {
    const g: ToonbankGeheugen = {
        apparaten: start.apparaten ?? [],
        medewerkers: start.medewerkers ?? [],
        sessies: start.sessies ?? [],
        mislukt: start.mislukt ?? [],
        nu: start.nu ?? new Date(),
        stand: start.stand ?? {},
        catalogus: start.catalogus ?? {},
        vrij: start.vrij ?? {},
        wegzetTaken: start.wegzetTaken ?? {},
        afhaallijst: start.afhaallijst ?? {},
        scan: start.scan ?? {},
        wegzetResultaat: start.wegzetResultaat ?? (() => ({ ok: false, sqlstate: 'P0002', melding: 'order niet in deze organisatie', detail: null })),
        journaal: start.journaal ?? [],
        wegzetUitgevoerd: 0,
    };
    const nu = () => g.nu.getTime();
    const open = (a: GeheugenApparaat) =>
        a.koppelcode_hash != null && a.koppelcode_geldig_tot != null && new Date(a.koppelcode_geldig_tot).getTime() > nu() && a.koppelpogingen < 5 && !a.ingetrokken_at;
    const zonderHashes = (a: GeheugenApparaat): Apparaat => ({
        id: a.id, organization_id: a.organization_id, naam: a.naam, code: a.code, locatie: a.locatie,
        ingetrokken_at: a.ingetrokken_at, hoogste_volgnummer_gemeld: a.hoogste_volgnummer_gemeld, bevestigd_tot_volgnummer: a.bevestigd_tot_volgnummer,
    });

    return {
        g,

        async koppelKandidaten() {
            return g.apparaten.filter(open).map((a): KoppelKandidaat => ({ apparaat_id: a.id, organization_id: a.organization_id, koppelcode_hash: a.koppelcode_hash! }));
        },

        async koppelMislukt() {
            let vervallen = 0;
            for (const a of g.apparaten) {
                if (a.koppelcode_hash && a.koppelcode_geldig_tot && new Date(a.koppelcode_geldig_tot).getTime() > nu() && !a.ingetrokken_at) a.koppelpogingen += 1;
                if (a.koppelcode_hash && a.koppelpogingen >= 5) {
                    a.koppelcode_hash = null;
                    a.koppelcode_geldig_tot = null;
                    vervallen += 1;
                }
            }
            return vervallen;
        },

        async koppelAf(apparaatId, sleutelHash, sleutelPrefix) {
            const a = g.apparaten.find((x) => x.id === apparaatId);
            if (!a || !open(a)) return null;
            if (g.apparaten.some((x) => x.id !== a.id && x.sleutel_hash === sleutelHash)) throw new Error('sleutel_hash bestaat al');
            a.sleutel_hash = sleutelHash;
            a.sleutel_prefix = sleutelPrefix;
            a.koppelcode_hash = null;
            a.koppelcode_geldig_tot = null;
            a.koppelpogingen = 0;
            for (const s of g.sessies) if (s.apparaat_id === a.id && !s.beeindigd_at) s.beeindigd_at = g.nu.toISOString();
            return { apparaat_id: a.id, organization_id: a.organization_id, code: a.code, naam: a.naam } satisfies Koppeling;
        },

        async apparaatOpSleutel(sleutelHash) {
            const a = g.apparaten.find((x) => x.sleutel_hash === sleutelHash);
            return a ? zonderHashes(a) : null;
        },

        async medewerkers(orgId) {
            return g.medewerkers
                .filter((m) => m.organization_id === orgId && m.actief && m.toonbank_rol)
                .sort((a, b) => a.naam.localeCompare(b.naam))
                .map((m) => ({ id: m.id, naam: m.naam, toonbank_rol: m.toonbank_rol }));
        },

        async medewerker(orgId, id) {
            return g.medewerkers.find((m) => m.organization_id === orgId && m.id === id) ?? null;
        },

        async inlogcodeMislukt(orgId, medewerkerId) {
            const m = g.medewerkers.find((x) => x.organization_id === orgId && x.id === medewerkerId);
            if (!m) throw new Error('medewerker niet in deze organisatie');
            g.mislukt.push({ medewerker_id: medewerkerId, at: g.nu.toISOString() });
            const laatsteSessie = Math.max(-Infinity, ...g.sessies.filter((s) => s.medewerker_id === medewerkerId).map((s) => new Date(s.aangemaakt_at).getTime()));
            const sinds = Math.max(nu() - 10 * 60_000, laatsteSessie);
            const n = g.mislukt.filter((f) => f.medewerker_id === medewerkerId && new Date(f.at).getTime() >= sinds).length;
            if (n >= 5) m.kds_pin_lockout_until = new Date(nu() + 5 * 60_000).toISOString();
            const tot = m.kds_pin_lockout_until && new Date(m.kds_pin_lockout_until).getTime() > nu() ? m.kds_pin_lockout_until : null;
            return { mislukt: n, over: Math.max(5 - n, 0), geblokkeerd_tot: tot } satisfies InlogTeller;
        },

        async maakSessie(s: NieuweSessie) {
            if (g.sessies.some((x) => x.token_hash === s.token_hash)) throw new Error('token_hash bestaat al');
            if (s.doel === 'vrij_overschrijden' && s.rol !== 'eigenaar') throw new Error('toonbank_sessies_eigenaar');
            const id = randomUUID();
            g.sessies.push({ ...s, id, beeindigd_at: null, aangemaakt_at: g.nu.toISOString() });
            return { id };
        },

        async sessieOpToken(orgId, apparaatId, tokenHash) {
            const s = g.sessies.find((x) => x.organization_id === orgId && x.apparaat_id === apparaatId && x.token_hash === tokenHash);
            if (!s) return null;
            const { token_hash: _t, aangemaakt_at: _a, ...rest } = s;
            void _t; void _a;
            return rest;
        },

        async status(orgId, apparaatId, gezien) {
            const a = g.apparaten.find((x) => x.id === apparaatId && x.organization_id === orgId && !x.ingetrokken_at);
            if (!a) throw new Error('tablet niet gevonden of ingetrokken (P0002)');
            a.hoogste_volgnummer_gemeld = Math.max(a.hoogste_volgnummer_gemeld, gezien.volgnummer ?? 0);
            const stand = g.stand[orgId] ?? STANDAARD_STAND;
            return {
                ...stand,
                servertijd: g.nu.toISOString(),
                apparaat: { apparaat_id: a.id, code: a.code, naam: a.naam },
                hoogste_volgnummer_gemeld: a.hoogste_volgnummer_gemeld,
                bevestigd_tot_volgnummer: a.bevestigd_tot_volgnummer,
            } satisfies StatusBron;
        },

        async catalogusVersie(orgId) {
            return g.catalogus[orgId]?.versie ?? 0;
        },
        async catalogus(orgId) {
            return g.catalogus[orgId] ?? { versie: 0, volledig: true, artikelen: [], producten: [], codes: [], groepen: [] };
        },
        async voorraadStand(orgId) {
            const s = g.stand[orgId] ?? STANDAARD_STAND;
            return { versie: s.voorraad_versie, vrij_verloopt_at: s.vrij_verloopt_at };
        },
        async vrij(orgId) {
            const s = g.stand[orgId] ?? STANDAARD_STAND;
            return g.vrij[orgId] ?? { versie: s.voorraad_versie, volledig: true, vrij_verloopt_at: s.vrij_verloopt_at, producten: [] };
        },
        async wegzetTaken(orgId) {
            return g.wegzetTaken[orgId] ?? [];
        },
        async wegzetVraag(v) {
            const oud = g.journaal.find((j) => j.organization_id === v.orgId && j.gebeurtenis_id === v.gebeurtenisId);
            if (oud) return { journaal: 'bestond', soort: 'wegzetten', payload: oud.payload, resultaat: oud.resultaat } satisfies WegzetVraagRuw;
            const payload: Record<string, unknown> = { order_id: v.orderId, actie: v.actie, medewerker_id: v.medewerkerId, moment: v.moment };
            if (v.reden) payload.reden = v.reden;
            g.wegzetUitgevoerd += 1;
            const resultaat = g.wegzetResultaat(v);
            g.journaal.push({ organization_id: v.orgId, gebeurtenis_id: v.gebeurtenisId, payload, resultaat });
            return { journaal: 'nieuw', soort: 'wegzetten', payload, resultaat } satisfies WegzetVraagRuw;
        },
        async afhaallijst(orgId, datum) {
            return g.afhaallijst[orgId]?.[datum] ?? { versie: 0, datum, orders: [] };
        },
        async scan(orgId, code) {
            return g.scan[orgId]?.[code] ?? { soort: 'onbekend', code };
        },
    };
}
