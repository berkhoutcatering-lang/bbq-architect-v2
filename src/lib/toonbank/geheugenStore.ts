/**
 * De Toonbank-opslag in het geheugen, voor de tests van de logica en de
 * routes. Doet wat de databasefuncties doen (20261006130000_toonbank_
 * apparaten), zonder database: koppelen met 5 pogingen, de inlogteller met
 * blokkade, sessies op hash. supabase/tests/toonbank_apparaten.sql bewaakt
 * dat de echte functies hetzelfde zeggen.
 */
import { randomUUID } from 'node:crypto';
import type { Apparaat, InlogTeller, KoppelKandidaat, Koppeling, Medewerker, NieuweSessie, Sessie, ToonbankStore } from './store';

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
}

export type ToonbankGeheugenStore = ToonbankStore & { g: ToonbankGeheugen };

export function maakToonbankGeheugenStore(start: Partial<ToonbankGeheugen> = {}): ToonbankGeheugenStore {
    const g: ToonbankGeheugen = {
        apparaten: start.apparaten ?? [],
        medewerkers: start.medewerkers ?? [],
        sessies: start.sessies ?? [],
        mislukt: start.mislukt ?? [],
        nu: start.nu ?? new Date(),
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
    };
}
