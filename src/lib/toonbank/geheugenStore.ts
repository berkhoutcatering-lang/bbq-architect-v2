/**
 * De Toonbank-opslag in het geheugen, voor de tests van de logica en de
 * routes. Doet wat de databasefuncties doen (20261028130000_toonbank_
 * apparaten), zonder database: koppelen met 5 pogingen per bron en 25 per
 * code, de inlogteller met blokkade, sessies op hash.
 * supabase/tests/toonbank_apparaten.sql bewaakt dat de echte functies
 * hetzelfde zeggen.
 */
import { randomUUID } from 'node:crypto';
import { KOPPEL_BRON_MINUTEN, KOPPEL_MAX_POGINGEN, KOPPEL_POGINGEN_PER_BRON } from './koppelcode';
import {
    OngeldigeMelding,
    type Apparaat, type CatalogusRuw, type DagstaatStand, type InlogTeller, type JournaalResultaat, type KoppelKandidaat, type Koppeling, type Medewerker,
    type NieuweSessie, type OphaalVraag, type OphaalVraagRuw, type Sessie, type StatusBron, type ToonbankStore, type VerwerktRij, type WegzetTaakRij,
    type Pinbetaling, type WegzetVraag, type WegzetVraagRuw,
    type CadeaubonStand, type CadeaubonStatusRuw,
} from './store';

/* ── Contract 1.2: cadeaubonnen, zoals de tabellen uit 20261029120000 ── */

export interface GeheugenCadeaubon {
    id: string;
    organization_id: string;
    code: string;
    waarde_cents: number;
    saldo_cents: number;
    /** jjjj-mm-dd, tot en met; null = geen einddatum. */
    geldig_tot: string | null;
    geblokkeerd: boolean;
}

export interface GeheugenCadeaubonReservering {
    organization_id: string;
    reservering_id: string;
    cadeaubon_id: string;
    apparaat_id: string;
    medewerker_id: string | null;
    bon_id: string;
    bedrag_cents: number;
    status: 'vast' | 'vrij' | 'gebruikt';
    verloopt_at: string;
    gebruikt_bon_id: string | null;
}

export interface GeheugenCadeaubonMutatie {
    organization_id: string;
    cadeaubon_id: string;
    soort: 'uitgifte' | 'reservering' | 'vrijgave' | 'afschrijving' | 'correctie' | 'blokkade' | 'deblokkade';
    bedrag_cents: number;
    saldo_wijziging_cents: number;
    saldo_na_cents: number;
    reservering_id: string | null;
    bon_id: string | null;
    idempotency_key: string | null;
}

/** Hoe lang een reservering het bedrag vasthoudt (zoals c_duur in toonbank_cadeaubon_reserveren). */
export const CADEAUBON_RESERVERING_MS = 15 * 60_000;

/** De dag in Europe/Amsterdam (jjjj-mm-dd), zoals (now() AT TIME ZONE 'Europe/Amsterdam')::DATE. */
export function dagInAmsterdam(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Een melding in het journaal (BA-9), zoals toonbank_journaal hem bewaart. */
export interface GeheugenMelding {
    id: number;
    organization_id: string;
    apparaat_id: string;
    gebeurtenis_id: string;
    volgnummer: number | null;
    soort: string;
    payload: Record<string, unknown>;
    verwerk_status: string;
    fout_code: string | null;
    fout_melding: string | null;
    gat_voor: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    /** Foute koppelcodes per bron (review M2 klein 7), zoals toonbank_koppel_pogingen. */
    koppelFouten: { bron: string; at: number }[];
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
    journaal: { organization_id: string; gebeurtenis_id: string; payload: Record<string, unknown>; resultaat: Record<string, unknown>; soort?: string }[];
    /** Hoe vaak de vraag echt is uitgevoerd (niet uit het journaal). */
    wegzetUitgevoerd: number;
    /* BA-9: de meldingen in het journaal en wat verwerken ervan maakt. */
    meldingen: GeheugenMelding[];
    /** Wat toonbank_verwerk_wachtrij met één melding doet (standaard: bon → verwerkt, kleine melding → niet_nodig). */
    verwerkMelding: (m: GeheugenMelding) => { status: string; product_ids?: string[]; fout_code?: string };
    /** Hoe vaak de wachtrij gedraaid heeft. */
    wachtrijGedraaid: number;
    /* BA-10 */
    /** Wat winkel_order_ophalen / winkel_doos_ophalen zou geven. */
    ophaalResultaat: (v: OphaalVraag) => Record<string, unknown>;
    /** Hoe vaak een ophaalvraag echt is uitgevoerd (niet uit het journaal). */
    ophaalUitgevoerd: number;
    dagstaatOverzicht: Record<string, Record<string, Record<string, unknown>>>;
    /** Wat toonbank_dagstaten na verwerken zegt, op dagstaat-ID. */
    dagstaten: Record<string, DagstaatStand>;
    /* Contract 1.3: de myPOS-terminal per apparaat-ID, en de pinbetalingen. */
    myposTerminals: Record<string, string>;
    pinbetalingen: Pinbetaling[];
    /* Contract 1.2: cadeaubonnen (de instelling per organisatie, de bonnen, reserveringen en mutaties). */
    cadeaubonAan: Record<string, boolean>;
    cadeaubonnen: GeheugenCadeaubon[];
    cadeaubonReserveringen: GeheugenCadeaubonReservering[];
    cadeaubonMutaties: GeheugenCadeaubonMutatie[];
}

export function standaardVerwerking(m: GeheugenMelding): { status: string; product_ids?: string[]; fout_code?: string } {
    if (m.soort === 'bon' || m.soort === 'tegenbon' || m.soort === 'vrij_overschreden') return { status: 'verwerkt' };
    if (['pinpoging', 'inloggen', 'uitloggen', 'dag_openen'].includes(m.soort)) return { status: 'niet_nodig' };
    if (m.soort === 'dagstaat') return { status: 'verwerkt' };
    return { status: 'fout', fout_code: 'ongeldig' };
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
        koppelFouten: start.koppelFouten ?? [],
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
        meldingen: start.meldingen ?? [],
        verwerkMelding: start.verwerkMelding ?? standaardVerwerking,
        wachtrijGedraaid: 0,
        ophaalResultaat: start.ophaalResultaat ?? (() => ({ uitkomst: 'onbekend', order_id: null })),
        ophaalUitgevoerd: 0,
        dagstaatOverzicht: start.dagstaatOverzicht ?? {},
        dagstaten: start.dagstaten ?? {},
        myposTerminals: start.myposTerminals ?? {},
        pinbetalingen: start.pinbetalingen ?? [],
        cadeaubonAan: start.cadeaubonAan ?? {},
        cadeaubonnen: start.cadeaubonnen ?? [],
        cadeaubonReserveringen: start.cadeaubonReserveringen ?? [],
        cadeaubonMutaties: start.cadeaubonMutaties ?? [],
    };
    const nu = () => g.nu.getTime();
    const open = (a: GeheugenApparaat) =>
        a.koppelcode_hash != null && a.koppelcode_geldig_tot != null && new Date(a.koppelcode_geldig_tot).getTime() > nu() && a.koppelpogingen < KOPPEL_MAX_POGINGEN && !a.ingetrokken_at;
    const foutenVanBron = (bron: string) => g.koppelFouten.filter((f) => f.bron === bron && f.at > nu() - KOPPEL_BRON_MINUTEN * 60_000).length;
    /* ── Cadeaubonnen: zoals private.cadeaubon_status, _gereserveerd en _stand ── */
    const cbStatus = (c: GeheugenCadeaubon): CadeaubonStatusRuw =>
        c.geblokkeerd ? 'geblokkeerd' : c.geldig_tot && c.geldig_tot < dagInAmsterdam(g.nu) ? 'verlopen' : c.saldo_cents <= 0 ? 'leeg' : 'actief';
    const cbGereserveerd = (c: GeheugenCadeaubon) => g.cadeaubonReserveringen
        .filter((r) => r.cadeaubon_id === c.id && r.status === 'vast' && new Date(r.verloopt_at).getTime() > nu())
        .reduce((som, r) => som + r.bedrag_cents, 0);
    const cbStand = (c: GeheugenCadeaubon): CadeaubonStand => {
        const status = cbStatus(c);
        const gereserveerd = cbGereserveerd(c);
        return {
            code: c.code, status, saldo_cents: Math.max(c.saldo_cents, 0), gereserveerd_cents: gereserveerd,
            beschikbaar_cents: status === 'actief' ? Math.max(c.saldo_cents - gereserveerd, 0) : 0, waarde_cents: c.waarde_cents, geldig_tot: c.geldig_tot,
        };
    };
    const cbZoek = (orgId: string, code: string) => g.cadeaubonnen.find((c) => c.organization_id === orgId && c.code === code.replace(/\s+/g, '').toUpperCase());

    /**
     * Zoals private.toonbank_cadeaubon_boek_bon: de betaalregels cadeaubon van een binnengekomen,
     * afgeronde bon afschrijven. Weigert nooit; geeft de controles.
     */
    function cbBoekBon(m: GeheugenMelding): { code: string; melding: string }[] {
        const p = m.payload;
        if (p.status !== 'afgerond' || !Array.isArray(p.regels)) return [];
        const uit: { code: string; melding: string }[] = [];
        const bonId = String(p.bon_id ?? m.gebeurtenis_id).toLowerCase();
        const bonnummer = String(p.bonnummer ?? '');
        const tijd = new Date(String(p.moment ?? g.nu.toISOString()));
        for (const r of (p.regels as Record<string, unknown>[]).filter((x) => x.soort === 'betaling' && x.betaalmethode === 'cadeaubon')) {
            const nr = Number(r.regelnr);
            const bedrag = Number(r.bedrag_cents);
            const code = typeof r.cadeaubon_code === 'string' && r.cadeaubon_code.trim() ? r.cadeaubon_code.replace(/\s+/g, '').toUpperCase() : null;
            const resId = typeof r.reservering_id === 'string' && UUID_RE.test(r.reservering_id) ? r.reservering_id.toLowerCase() : null;
            if (m.soort === 'tegenbon') { uit.push({ code: 'cadeaubon_terug', melding: `Regel ${nr}: retour op cadeaubon ${code ?? '(zonder code)'}; niets teruggezet.` }); continue; }
            if (!(bedrag > 0)) { uit.push({ code: 'cadeaubon_bedrag', melding: `Regel ${nr}: geen bedrag; niets afgeschreven.` }); continue; }
            if (!code) { uit.push({ code: 'cadeaubon_zonder_code', melding: `Regel ${nr}: cadeaubon zonder code; niets afgeschreven.` }); continue; }
            const sleutel = `tb:${bonId}:${resId ?? `regel-${nr}`}`;
            if (g.cadeaubonMutaties.some((x) => x.organization_id === m.organization_id && x.idempotency_key === sleutel)) continue;
            const cb = cbZoek(m.organization_id, code);
            if (!cb) { uit.push({ code: 'cadeaubon_onbekend', melding: `Regel ${nr}: cadeaubon ${code} onbekend; niets afgeschreven.` }); continue; }
            if (!resId) {
                uit.push({ code: 'cadeaubon_zonder_reservering', melding: `Regel ${nr}: zonder reservering; toch afgeschreven.` });
            } else {
                const res = g.cadeaubonReserveringen.find((x) => x.organization_id === m.organization_id && x.reservering_id === resId);
                if (!res || res.cadeaubon_id !== cb.id) {
                    uit.push({ code: 'cadeaubon_reservering_onbekend', melding: `Regel ${nr}: de reservering hoort niet bij ${code}; toch afgeschreven.` });
                } else if (res.status === 'gebruikt' && res.gebruikt_bon_id !== bonId) {
                    uit.push({ code: 'cadeaubon_reservering_gebruikt', melding: `Regel ${nr}: reservering al gebruikt; toch afgeschreven.` });
                } else {
                    if (res.bedrag_cents !== bedrag) uit.push({ code: 'cadeaubon_bedrag_anders', melding: `Regel ${nr}: ${res.bedrag_cents} gereserveerd, ${bedrag} op de bon.` });
                    res.status = 'gebruikt';
                    res.gebruikt_bon_id = bonId;
                }
            }
            if (cb.geblokkeerd) uit.push({ code: 'cadeaubon_geblokkeerd', melding: `Regel ${nr}: ${code} is geblokkeerd; toch afgeschreven.` });
            if (cb.geldig_tot && cb.geldig_tot < dagInAmsterdam(tijd)) uit.push({ code: 'cadeaubon_verlopen', melding: `Regel ${nr}: ${code} was verlopen; toch afgeschreven.` });
            cb.saldo_cents -= bedrag;
            g.cadeaubonMutaties.push({
                organization_id: m.organization_id, cadeaubon_id: cb.id, soort: 'afschrijving', bedrag_cents: bedrag, saldo_wijziging_cents: -bedrag,
                saldo_na_cents: cb.saldo_cents, reservering_id: resId, bon_id: bonId, idempotency_key: sleutel,
            });
            if (cb.saldo_cents < 0) uit.push({ code: 'cadeaubon_saldo_negatief', melding: `Regel ${nr}: na bon ${bonnummer} staat ${code} op ${cb.saldo_cents} ct (onder nul).` });
        }
        return uit;
    }

    const zonderHashes = (a: GeheugenApparaat): Apparaat => ({
        id: a.id, organization_id: a.organization_id, naam: a.naam, code: a.code, locatie: a.locatie,
        ingetrokken_at: a.ingetrokken_at, hoogste_volgnummer_gemeld: a.hoogste_volgnummer_gemeld, bevestigd_tot_volgnummer: a.bevestigd_tot_volgnummer,
    });

    return {
        g,

        async koppelKandidaten() {
            return g.apparaten.filter(open).map((a): KoppelKandidaat => ({ apparaat_id: a.id, organization_id: a.organization_id, koppelcode_hash: a.koppelcode_hash! }));
        },

        async koppelGeblokkeerd(bron) {
            return foutenVanBron(bron) >= KOPPEL_POGINGEN_PER_BRON;
        },

        async koppelMislukt(bron) {
            /* Zoals toonbank_koppel_mislukt: een bron telt hooguit 5 keer mee bij de open codes. */
            let telt = true;
            if (bron) {
                g.koppelFouten.push({ bron, at: nu() });
                telt = foutenVanBron(bron) <= KOPPEL_POGINGEN_PER_BRON;
            }
            let vervallen = 0;
            for (const a of g.apparaten) {
                if (telt && a.koppelcode_hash && a.koppelcode_geldig_tot && new Date(a.koppelcode_geldig_tot).getTime() > nu() && !a.ingetrokken_at) a.koppelpogingen += 1;
                if (a.koppelcode_hash && a.koppelpogingen >= KOPPEL_MAX_POGINGEN) {
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
            /* Zoals de join in supabaseStore (review M2 K7): de persoon is nog actief en heeft nog een rol. */
            const m = g.medewerkers.find((x) => x.id === s.medewerker_id && x.organization_id === orgId);
            if (!m || !m.actief || !m.toonbank_rol) return null;
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

        /* ── BA-9: zoals toonbank_journaal_opslaan / _markeer / toonbank_verwerk_wachtrij ── */
        async journaalOpslaan(o) {
            const a = g.apparaten.find((x) => x.id === o.apparaatId && x.organization_id === o.orgId && !x.ingetrokken_at);
            if (!a) throw new Error('tablet niet gevonden of ingetrokken (P0002)');
            const lijst = o.meldingen as Record<string, unknown>[];
            lijst.forEach((m, i) => {
                const ok = m && typeof m === 'object' && UUID_RE.test(String(m.gebeurtenis_id ?? '')) && Number.isInteger(m.volgnummer) && Number(m.volgnummer) > 0
                    && typeof m.soort === 'string' && m.soort.trim() !== '' && typeof m.moment === 'string' && m.moment !== '';
                if (!ok) throw new OngeldigeMelding(`melding ${i + 1}: de envelop klopt niet`, i);
            });
            const resultaten: JournaalResultaat[] = [];
            let hoogste = 0;
            for (const m of [...lijst].sort((x, y) => Number(x.volgnummer) - Number(y.volgnummer))) {
                const gid = String(m.gebeurtenis_id).toLowerCase();
                const nr = Number(m.volgnummer);
                const oud = g.meldingen.find((x) => x.organization_id === o.orgId && x.gebeurtenis_id === gid);
                if (oud) {
                    if (oud.verwerk_status === 'fout' && oud.fout_code === 'contract_verouderd' && !o.verouderd) {
                        oud.verwerk_status = 'wacht'; oud.fout_code = null; oud.fout_melding = null;
                    }
                    resultaten.push({ gebeurtenis_id: gid, journaal: 'bestond', journaal_id: oud.id, verwerking: oud.verwerk_status, soort: oud.soort });
                    continue;
                }
                let soort = String(m.soort).trim().toLowerCase();
                let status = 'wacht';
                let fout: string | null = null;
                let volgnummer: number | null = nr;
                if (!/^[a-z][a-z_]{1,40}$/.test(soort)) { soort = 'onbekend'; status = 'fout'; fout = 'soort_onbekend'; }
                if (Number.isNaN(new Date(String(m.moment)).getTime())) { status = 'fout'; fout = fout ?? 'moment_ongeldig'; }
                if (g.meldingen.some((x) => x.apparaat_id === o.apparaatId && x.volgnummer === nr)) { volgnummer = null; status = 'fout'; fout = 'volgnummer_dubbel'; }
                if (status === 'wacht' && o.schemaFouten?.[gid] !== undefined) { status = 'fout'; fout = 'schema'; }
                if (o.verouderd) { status = 'fout'; fout = 'contract_verouderd'; }
                const rij: GeheugenMelding = {
                    id: g.meldingen.length + 1, organization_id: o.orgId, apparaat_id: o.apparaatId, gebeurtenis_id: gid, volgnummer, soort,
                    payload: m, verwerk_status: status, fout_code: fout, fout_melding: fout,
                    gat_voor: volgnummer !== null && volgnummer > 1 && !g.meldingen.some((x) => x.apparaat_id === o.apparaatId && x.volgnummer === volgnummer - 1),
                };
                g.meldingen.push(rij);
                resultaten.push({ gebeurtenis_id: gid, journaal: 'nieuw', journaal_id: rij.id, verwerking: status, soort });
                hoogste = Math.max(hoogste, nr);
            }
            let bevestigd = a.bevestigd_tot_volgnummer;
            while (g.meldingen.some((x) => x.apparaat_id === o.apparaatId && x.volgnummer === bevestigd + 1)) bevestigd += 1;
            a.bevestigd_tot_volgnummer = bevestigd;
            a.hoogste_volgnummer_gemeld = Math.max(a.hoogste_volgnummer_gemeld, hoogste);
            return { resultaten, bevestigd_tot_volgnummer: bevestigd };
        },

        async wachtrijTeVerwerken(orgId, apparaatId) {
            return g.meldingen.some((x) => x.organization_id === orgId && x.apparaat_id === apparaatId && x.verwerk_status === 'wacht'
                && x.fout_code !== 'wacht_op_bon');
        },

        async verwerkWachtrij(orgId, apparaatId) {
            g.wachtrijGedraaid += 1;
            const uit: VerwerktRij[] = [];
            const wacht = g.meldingen
                .filter((x) => x.organization_id === orgId && x.apparaat_id === apparaatId && x.verwerk_status === 'wacht')
                .sort((x, y) => (x.volgnummer ?? Infinity) - (y.volgnummer ?? Infinity) || x.id - y.id);
            for (const m of wacht) {
                const r = g.verwerkMelding(m);
                m.verwerk_status = r.status;
                m.fout_code = r.fout_code ?? null;
                /* Contract 1.2: zoals toonbank_boek_bon de cadeaubon afschrijven; een controle maakt hem conflict. */
                if ((m.soort === 'bon' || m.soort === 'tegenbon') && (r.status === 'verwerkt' || r.status === 'conflict')) {
                    const controles = cbBoekBon(m);
                    if (controles.length > 0) {
                        if (m.verwerk_status === 'verwerkt') { m.verwerk_status = 'conflict'; m.fout_code = controles[0]!.code; }
                        m.fout_melding = [m.fout_melding, ...controles.map((c) => c.melding)].filter(Boolean).join(' ');
                    }
                }
                uit.push({ journaal_id: m.id, gebeurtenis_id: m.gebeurtenis_id, soort: m.soort, status: m.verwerk_status, product_ids: r.product_ids ?? [] });
            }
            return uit;
        },

        /* ── BA-10: zoals toonbank_ophaal_vraag ── */
        async ophaalVraag(v) {
            const soort = v.soort === 'order' ? 'ophalen' : 'doos_ophalen';
            const oud = g.journaal.find((j) => j.organization_id === v.orgId && j.gebeurtenis_id === v.gebeurtenisId);
            if (oud) return { journaal: 'bestond', soort: oud.soort ?? soort, payload: oud.payload, resultaat: oud.resultaat } satisfies OphaalVraagRuw;
            const payload: Record<string, unknown> = {
                order_id: v.orderId, code: v.code, bon_id: v.bonId, medewerker_id: v.medewerkerId, moment: v.moment, leeftijd: v.leeftijd,
                leeftijd_at: v.leeftijd ? v.leeftijdAt : null,
                rest: v.restMethode ? { methode: v.restMethode, bedrag_cents: v.restBedragCents } : null,
            };
            g.ophaalUitgevoerd += 1;
            const resultaat = { ok: true, rest_dubbel: false, ...g.ophaalResultaat(v) };
            g.journaal.push({ organization_id: v.orgId, gebeurtenis_id: v.gebeurtenisId, payload, resultaat, soort });
            return { journaal: 'nieuw', soort, payload, resultaat } satisfies OphaalVraagRuw;
        },

        async dagstaatOverzicht(orgId, apparaatId, datum) {
            const a = g.apparaten.find((x) => x.id === apparaatId && x.organization_id === orgId);
            if (!a) throw new Error('tablet niet in deze organisatie (P0002)');
            return g.dagstaatOverzicht[orgId]?.[datum] ?? {
                datum, apparaat_code: a.code, aantal_bonnen: 0, hoogste_bonnummer: null, omzet: [], pin_cents: 0, contant_cents: 0,
            };
        },

        async dagstaatStand(_orgId, dagstaatId) {
            return g.dagstaten[dagstaatId] ?? null;
        },

        /* ── Contract 1.3: pinnen via de koppeling met de myPOS ── */
        async myposTerminal(orgId, apparaatId) {
            const a = g.apparaten.find((x) => x.id === apparaatId && x.organization_id === orgId);
            const t = g.myposTerminals[apparaatId];
            return a && t ? { terminal_id: t, naam: a.naam } : null;
        },

        async pinbetaling(orgId, pogingId) {
            const p = g.pinbetalingen.find((x) => x.organization_id === orgId && x.poging_id === pogingId);
            return p ? { ...p } : null;
        },

        async maakPinbetaling(p) {
            const oud = g.pinbetalingen.find((x) => x.organization_id === p.organization_id && x.poging_id === p.poging_id);
            if (oud) return { rij: { ...oud }, nieuw: false };
            g.pinbetalingen.push({ ...p });
            return { rij: { ...p }, nieuw: true };
        },

        async werkPinbetalingBij(orgId, pogingId, wijziging) {
            const p = g.pinbetalingen.find((x) => x.organization_id === orgId && x.poging_id === pogingId);
            if (!p) return null;
            Object.assign(p, wijziging);
            return { ...p };
        },

        /* ── Contract 1.2: zoals toonbank_cadeaubon_opzoeken, _reserveren en _vrijgeven ── */
        async cadeaubonAan(orgId) {
            return g.cadeaubonAan[orgId] === true;
        },

        async cadeaubon(orgId, code) {
            const c = cbZoek(orgId, code);
            return c ? cbStand(c) : null;
        },

        async cadeaubonReserveren(v) {
            const a = g.apparaten.find((x) => x.id === v.apparaatId && x.organization_id === v.orgId && !x.ingetrokken_at);
            if (!a) throw new Error('tablet niet in deze organisatie of ingetrokken (P0002)');
            const c = cbZoek(v.orgId, v.code);
            if (!c) return { ok: false, fout: 'cadeaubon_onbekend', beschikbaar_cents: 0 };
            const oud = g.cadeaubonReserveringen.find((r) => r.organization_id === v.orgId && r.reservering_id === v.reserveringId.toLowerCase());
            if (oud) {
                if (oud.cadeaubon_id !== c.id || oud.bon_id !== v.bonId.toLowerCase() || oud.bedrag_cents !== v.bedragCents) {
                    return { ok: false, fout: 'reservering_anders', beschikbaar_cents: 0 };
                }
                return { ok: true, reservering_id: oud.reservering_id, code: c.code, bedrag_cents: oud.bedrag_cents, beschikbaar_na_cents: cbStand(c).beschikbaar_cents, verloopt_at: oud.verloopt_at };
            }
            const stand = cbStand(c);
            if (stand.status === 'geblokkeerd') return { ok: false, fout: 'cadeaubon_geblokkeerd', beschikbaar_cents: 0 };
            if (stand.status === 'verlopen') return { ok: false, fout: 'cadeaubon_verlopen', beschikbaar_cents: 0, geldig_tot: c.geldig_tot };
            if (stand.beschikbaar_cents < v.bedragCents) return { ok: false, fout: 'cadeaubon_saldo_te_laag', beschikbaar_cents: stand.beschikbaar_cents };
            const res: GeheugenCadeaubonReservering = {
                organization_id: v.orgId, reservering_id: v.reserveringId.toLowerCase(), cadeaubon_id: c.id, apparaat_id: v.apparaatId, medewerker_id: v.medewerkerId,
                bon_id: v.bonId.toLowerCase(), bedrag_cents: v.bedragCents, status: 'vast', verloopt_at: new Date(nu() + CADEAUBON_RESERVERING_MS).toISOString(), gebruikt_bon_id: null,
            };
            g.cadeaubonReserveringen.push(res);
            g.cadeaubonMutaties.push({
                organization_id: v.orgId, cadeaubon_id: c.id, soort: 'reservering', bedrag_cents: v.bedragCents, saldo_wijziging_cents: 0,
                saldo_na_cents: c.saldo_cents, reservering_id: res.reservering_id, bon_id: res.bon_id, idempotency_key: null,
            });
            return { ok: true, reservering_id: res.reservering_id, code: c.code, bedrag_cents: res.bedrag_cents, beschikbaar_na_cents: cbStand(c).beschikbaar_cents, verloopt_at: res.verloopt_at };
        },

        async cadeaubonVrijgeven(v) {
            const c = cbZoek(v.orgId, v.code);
            if (!c) return { ok: false, fout: 'cadeaubon_onbekend' };
            const res = g.cadeaubonReserveringen.find((r) => r.organization_id === v.orgId && r.reservering_id === v.reserveringId.toLowerCase()
                && r.cadeaubon_id === c.id && r.apparaat_id === v.apparaatId);
            let vrij = false;
            if (res && res.status === 'vast' && new Date(res.verloopt_at).getTime() > nu()) {
                res.status = 'vrij';
                g.cadeaubonMutaties.push({
                    organization_id: v.orgId, cadeaubon_id: c.id, soort: 'vrijgave', bedrag_cents: res.bedrag_cents, saldo_wijziging_cents: 0,
                    saldo_na_cents: c.saldo_cents, reservering_id: res.reservering_id, bon_id: res.bon_id, idempotency_key: null,
                });
                vrij = true;
            }
            return { ok: true, reservering_id: v.reserveringId.toLowerCase(), vrijgegeven: vrij, beschikbaar_cents: cbStand(c).beschikbaar_cents };
        },
    };
}
