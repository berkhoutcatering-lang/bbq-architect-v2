/**
 * Cadeaubonnen op de Toonbank (contract toonbank/v1 1.2, op verzoek van Mathijs, 28 oktober 2026).
 *
 * BBQ Architect bezit de cadeaubon en het saldo; de Toonbank vraagt en meldt alleen:
 *   GET  cadeaubonnen/{code}             → zoekCadeaubon: wat erop staat
 *   POST cadeaubonnen/{code}/reserveren  → reserveerCadeaubon: 15 minuten vasthouden voor een bon
 *   POST cadeaubonnen/{code}/vrijgeven   → geefCadeaubonVrij: de verkoop gaat niet door
 * Afschrijven gebeurt pas als de bon binnenkomt (POST bonnen), in de database
 * (toonbank_boek_bon → private.toonbank_cadeaubon_boek_bon, migratie 20261029120000). Een bon
 * die al betaald is, wordt nooit geweigerd: wat niet klopt wordt "Te controleren".
 *
 * De database doet het rekenwerk en houdt het slot (twee tablets kunnen niet hetzelfde saldo
 * reserveren). Hier: de code netjes maken, de uitkomst vertalen naar het contract en een melding
 * in gewone taal voor het vel Cadeaubon op de Toonbank.
 */
import {
    Cadeauboncode, normaliseerCadeauboncode,
    type CadeaubonAntwoord, type CadeaubonReserveerAntwoord, type CadeaubonReserveerVerzoek, type CadeaubonVrijgevenAntwoord, type CadeaubonVrijgevenVerzoek,
} from './contract';
import { euro } from './overzicht';
import type { CadeaubonReserveerRuw, CadeaubonStand, CadeaubonStatusRuw, ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

export interface CadeaubonContext {
    orgId: string;
    apparaatId: string;
    /** De ingelogde medewerker (reserveren en vrijgeven); null bij opzoeken. */
    medewerkerId: string | null;
}

/** Hoe lang een reservering het bedrag vasthoudt (voorstel in het contract; c_duur in de migratie). */
export const RESERVERING_MINUTEN = 15;

/** De code uit het adres of de scan, netjes; null als het geen geldige code kan zijn. */
export function cadeauboncodeUit(ruw: string | null | undefined): string | null {
    let t = String(ruw ?? '');
    try { t = decodeURIComponent(t); } catch { /* al leesbaar */ }
    const code = normaliseerCadeauboncode(t);
    return Cadeauboncode.safeParse(code).success ? code : null;
}

function onbekend<T>(code: string | null): Uitkomst<T> {
    return mislukt('cadeaubon_onbekend', 'Deze cadeaubon kent BBQ Architect niet. Kijk het nummer na, of laat de klant op een andere manier betalen.', { code });
}

/** De stand uit de database naar het contract (CadeaubonAntwoord). */
export function cadeaubonAntwoord(s: CadeaubonStand): CadeaubonAntwoord {
    return {
        code: s.code,
        status: s.status,
        saldo_cents: Math.max(0, s.saldo_cents),
        gereserveerd_cents: Math.max(0, s.gereserveerd_cents),
        beschikbaar_cents: s.status === 'actief' ? Math.max(0, s.beschikbaar_cents) : 0,
        waarde_cents: s.waarde_cents,
        geldig_tot: s.geldig_tot,
    };
}

export async function zoekCadeaubon(store: ToonbankStore, ctx: CadeaubonContext, ruweCode: string): Promise<Uitkomst<CadeaubonAntwoord>> {
    const code = cadeauboncodeUit(ruweCode);
    if (!code) return onbekend(normaliseerCadeauboncode(String(ruweCode ?? '')).slice(0, 40) || null);
    const stand = await store.cadeaubon(ctx.orgId, code);
    return stand ? gelukt(cadeaubonAntwoord(stand)) : onbekend(code);
}

/** Een geweigerde reservering in gewone taal (contract §3.2). Er is dan niets afgeschreven. */
export function reserveerFout<T>(r: Extract<CadeaubonReserveerRuw, { ok: false }>, code: string): Uitkomst<T> {
    switch (r.fout) {
        case 'cadeaubon_saldo_te_laag':
            return mislukt('cadeaubon_saldo_te_laag', r.beschikbaar_cents > 0
                ? `Er staat nog ${euro(r.beschikbaar_cents)} op deze cadeaubon. Reken dat af met de cadeaubon en de rest op een andere manier.`
                : 'Er staat niets meer op deze cadeaubon. De klant betaalt op een andere manier.', { code, beschikbaar_cents: r.beschikbaar_cents });
        case 'cadeaubon_verlopen':
            return mislukt('cadeaubon_verlopen', 'Deze cadeaubon is verlopen. Er is niets afgeschreven; de klant betaalt op een andere manier.', { code, geldig_tot: r.geldig_tot ?? null });
        case 'cadeaubon_geblokkeerd':
            return mislukt('cadeaubon_geblokkeerd', 'Deze cadeaubon is geblokkeerd in BBQ Architect. Er is niets afgeschreven; de klant betaalt op een andere manier.', { code });
        case 'reservering_anders':
            return mislukt('ongeldig_verzoek', 'Deze reservering bestaat al met een andere cadeaubon, bon of bedrag. Maak een nieuwe reservering.', { code });
        default:
            return onbekend(code);
    }
}

export async function reserveerCadeaubon(store: ToonbankStore, ctx: CadeaubonContext, ruweCode: string, v: CadeaubonReserveerVerzoek): Promise<Uitkomst<CadeaubonReserveerAntwoord>> {
    const code = cadeauboncodeUit(ruweCode);
    if (!code) return onbekend(null);
    const r = await store.cadeaubonReserveren({
        orgId: ctx.orgId, apparaatId: ctx.apparaatId, code, reserveringId: v.reservering_id.toLowerCase(), bonId: v.bon_id.toLowerCase(),
        bedragCents: v.bedrag_cents, medewerkerId: ctx.medewerkerId,
    });
    /* 'in' en niet r.ok: de tsconfig staat niet op strict, dan vernauwt een boolean-discriminant niet. */
    if ('fout' in r) return reserveerFout(r, code);
    return gelukt({ reservering_id: r.reservering_id, code: r.code, bedrag_cents: r.bedrag_cents, beschikbaar_na_cents: r.beschikbaar_na_cents, verloopt_at: r.verloopt_at });
}

export async function geefCadeaubonVrij(store: ToonbankStore, ctx: CadeaubonContext, ruweCode: string, v: CadeaubonVrijgevenVerzoek): Promise<Uitkomst<CadeaubonVrijgevenAntwoord>> {
    const code = cadeauboncodeUit(ruweCode);
    if (!code) return onbekend(null);
    const r = await store.cadeaubonVrijgeven({ orgId: ctx.orgId, apparaatId: ctx.apparaatId, code, reserveringId: v.reservering_id.toLowerCase(), medewerkerId: ctx.medewerkerId });
    if ('fout' in r) return onbekend(code);
    return gelukt({ reservering_id: r.reservering_id, vrijgegeven: r.vrijgegeven, beschikbaar_cents: r.beschikbaar_cents });
}

/* ── Beheer (Instellingen → Toonbank → Cadeaubonnen) ─────────────────────── */

/** Geen tekens die op elkaar lijken (0/O, 1/I/L): de code wordt overgetikt. */
export const CODE_TEKENS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Een willekeurig getal 0 … n−1 uit de cryptografische bron (zonder scheefheid: te grote waarden opnieuw). */
function willekeurig(n: number): number {
    const grens = Math.floor(0x1_0000_0000 / n) * n;
    const buf = new Uint32Array(1);
    for (;;) {
        globalThis.crypto.getRandomValues(buf);
        if (buf[0]! < grens) return buf[0]! % n;
    }
}

/**
 * Een nieuwe code: HB-XXXX-XXXX, 8 willekeurige tekens uit 31 (ruim 850 miljard mogelijkheden).
 * De code is als geld: wie hem kent, kan ermee betalen. Daarom willekeurig, niet doorlopend.
 */
export function maakCadeauboncode(kies: (n: number) => number = willekeurig): string {
    const stuk = () => Array.from({ length: 4 }, () => CODE_TEKENS[kies(CODE_TEKENS.length)]).join('');
    return `HB-${stuk()}-${stuk()}`;
}

export const CADEAUBON_STATUS_TEKST: Record<CadeaubonStatusRuw, string> = {
    actief: 'Actief',
    leeg: 'Leeg',
    verlopen: 'Verlopen',
    geblokkeerd: 'Geblokkeerd',
};

/** Een rij uit cadeaubonnen_overzicht (het beheerscherm). */
export interface CadeaubonRij {
    id: string;
    code: string;
    waarde_cents: number;
    /** Kan onder nul zijn (een bon die binnenkwam na een verlopen reservering): dan Te controleren. */
    saldo_cents: number;
    gereserveerd_cents: number;
    status: CadeaubonStatusRuw;
    geldig_tot: string | null;
    uitgegeven_at: string;
    notitie: string | null;
    geblokkeerd_reden: string | null;
    laatste_mutatie_at: string | null;
}

/** jsonb van cadeaubonnen_overzicht → rijen. */
export function naarCadeaubonRijen(lijst: unknown): CadeaubonRij[] {
    return ((Array.isArray(lijst) ? lijst : []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        code: String(r.code),
        waarde_cents: Number(r.waarde_cents ?? 0),
        saldo_cents: Number(r.saldo_cents ?? 0),
        gereserveerd_cents: Number(r.gereserveerd_cents ?? 0),
        status: (['actief', 'leeg', 'verlopen', 'geblokkeerd'] as const).find((s) => s === r.status) ?? 'geblokkeerd',
        geldig_tot: typeof r.geldig_tot === 'string' ? r.geldig_tot : null,
        uitgegeven_at: String(r.uitgegeven_at ?? ''),
        notitie: typeof r.notitie === 'string' ? r.notitie : null,
        geblokkeerd_reden: typeof r.geblokkeerd_reden === 'string' ? r.geblokkeerd_reden : null,
        laatste_mutatie_at: typeof r.laatste_mutatie_at === 'string' ? r.laatste_mutatie_at : null,
    }));
}

/** "25", "25,00", "€ 25,50", "1.250,5" → centen; null als het geen bedrag boven 0 is. */
export function leesEuro(invoer: string): number | null {
    const t = invoer.replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const cents = Math.round(Number(t) * 100);
    return cents > 0 ? cents : null;
}
