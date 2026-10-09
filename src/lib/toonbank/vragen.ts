/**
 * BA-8 — de lees- en vraagroutes van de Toonbank: catalogus, vrij,
 * wegzetten, afhaallijst en scannen. Contract §1.9, §1.10, §3.2, §3.3, §3.5.
 *
 * De databasefuncties (20261006150000_toonbank_vragen) leveren de rijen; hier
 * komt de vorm van het contract: tijden als ISO met Z, foto-URL's, en de
 * vertaling van een uitkomst of SQLSTATE naar een HTTP-antwoord volgens de
 * tabel "Van databasefunctie naar antwoord" (§3.2):
 *
 *   winkel_zet_order_apart        apart, al_apart, geen_taak → 200
 *                                 P0002 → 404 niet_gevonden
 *                                 WV006 → 409 niet_betaald
 *                                 WV010 → 422 te_weinig_voorraad
 *   winkel_zet_order_apart_terug  ongedaan, niet_apart, geen_taak → 200
 *                                 niet_zelfde_dag → 422 niet_zelfde_dag
 *                                 P0002 → 404, WV011 → 422 al_opgehaald
 */
import { codeUitScan } from '@/lib/winkel/productie';
import type { AfhaallijstAntwoord, CatalogusAntwoord, OngedaanAntwoord, ScanAntwoord, VrijAntwoord, WegzetAntwoord, WegzettenAntwoord } from './contract';
import type { CatalogusArtikelRuw, CatalogusRuw, ToonbankStore, WegzetTaakRij } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

/** Een tijd uit de database (jsonb of timestamptz) als ISO met Z; null blijft null. */
export function iso(v: unknown): string | null {
    if (v === null || v === undefined || v === '') return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const getal = (v: unknown): number => Math.round(Number(v ?? 0) * 1000) / 1000;
const getalOfNull = (v: unknown): number | null => (v === null || v === undefined ? null : getal(v));

/* ── Catalogus ─────────────────────────────────────────────────────────────── */

/** De tegelfoto van 256 px uit winkel-fotos: de kleinste maat van minstens 256, anders de grootste. */
export function fotoUrl(supabaseUrl: string | null | undefined, foto: unknown, terugval: string | null): string | null {
    const f = foto as { basis?: unknown; maten?: { w?: unknown }[]; formaten?: unknown[] } | null;
    if (supabaseUrl && f && typeof f.basis === 'string' && /^[0-9a-f-]{36}\/[a-z0-9-]+$/.test(f.basis) && Array.isArray(f.maten) && f.maten.length) {
        const breedtes = f.maten.map((m) => Number(m?.w)).filter((w) => Number.isInteger(w) && w > 0).sort((a, b) => a - b);
        if (breedtes.length) {
            const w = breedtes.find((x) => x >= 256) ?? breedtes[breedtes.length - 1]!;
            const formaten = Array.isArray(f.formaten) ? f.formaten.map(String) : [];
            const formaat = formaten.includes('webp') ? 'webp' : formaten.includes('avif') ? 'avif' : 'webp';
            return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/winkel-fotos/${f.basis}-${w}.${formaat}`;
        }
    }
    return terugval && /^https?:\/\/\S+$/.test(terugval) ? terugval : null;
}

function naarArtikel(a: CatalogusArtikelRuw, supabaseUrl: string | null | undefined): CatalogusAntwoord['artikelen'][number] {
    return {
        artikel_id: a.artikel_id,
        naam: a.naam,
        prijs_cents: Number(a.prijs_cents),
        btw_pct: Number(a.btw_pct),
        btw_verdeling: a.btw_verdeling && a.btw_verdeling.length ? a.btw_verdeling.map((v) => ({ pct: Number(v.pct), gewicht: Number(v.gewicht) })) : null,
        alcohol: !!a.alcohol,
        groep: a.groep ?? null,
        volgorde: Number(a.volgorde ?? 0),
        favoriet: !!a.favoriet,
        foto_url: fotoUrl(supabaseUrl, a.foto, a.foto_url_ruw),
        onderdelen: (a.onderdelen ?? []).map((o) => ({ product_id: o.product_id, hoeveelheid: getal(o.hoeveelheid), eenheid: o.eenheid })),
        actief: !!a.actief,
        kanalen: (a.kanalen ?? []).filter((k): k is 'toonbank' | 'webshop' | 'event' => k === 'toonbank' || k === 'webshop' || k === 'event'),
    };
}

export function catalogusAntwoord(ruw: CatalogusRuw, supabaseUrl: string | null | undefined): CatalogusAntwoord {
    return {
        versie: Number(ruw.versie ?? 0),
        volledig: true,
        artikelen: (ruw.artikelen ?? []).map((a) => naarArtikel(a, supabaseUrl)),
        producten: (ruw.producten ?? []).map((p) => ({
            product_id: p.product_id, naam: p.naam, statiegeld_cents: Number(p.statiegeld_cents ?? 0),
            voorraad_bijgehouden: !!p.voorraad_bijgehouden, alcohol: !!p.alcohol,
        })),
        codes: (ruw.codes ?? []).map((c) => ({ code: c.code, soort: c.soort, artikel_id: c.artikel_id })),
        groepen: (ruw.groepen ?? []).map((g) => ({
            groep_id: g.groep_id, naam: g.naam, volgorde: Number(g.volgorde), open_prijs: !!g.open_prijs,
            btw_pct: g.btw_pct == null ? null : Number(g.btw_pct), alcohol: !!g.alcohol,
        })),
    };
}

/* ── Vrij ──────────────────────────────────────────────────────────────────── */

export function vrijAntwoord(ruw: { versie: number; vrij_verloopt_at: string | null; producten: unknown[] }): VrijAntwoord {
    return {
        versie: Number(ruw.versie ?? 0),
        volledig: true,
        vrij_verloopt_at: iso(ruw.vrij_verloopt_at),
        producten: (ruw.producten ?? []).map((x) => {
            const p = x as Record<string, unknown>;
            return {
                product_id: String(p.product_id),
                eenheid: p.eenheid === 'gram' ? 'gram' as const : 'stuk' as const,
                ligt_er: getalOfNull(p.ligt_er),
                gereserveerd: Math.max(0, getal(p.gereserveerd)),
                vrij: getalOfNull(p.vrij),
                bijgehouden: !!p.bijgehouden,
                reserveringen: ((p.reserveringen as Record<string, unknown>[] | null) ?? []).map((r) => ({
                    order_id: Number(r.order_id),
                    nummer: String(r.nummer),
                    naam: String(r.naam || 'Onbekend'),
                    afhaalmoment: iso(r.afhaalmoment),
                    aantal: getal(r.aantal),
                })),
            };
        }),
    };
}

/** ETag van GET vrij: de versie én het eerste verloopmoment (een verlopen reservering verandert vrij zonder nieuwe versie). */
export function vrijEtagSleutel(versie: number, vrijVerlooptAt: string | null): string {
    const t = vrijVerlooptAt ? new Date(vrijVerlooptAt).getTime() : 0;
    return `${versie}-${Number.isFinite(t) ? t : 0}`;
}

/* ── Wegzetten ─────────────────────────────────────────────────────────────── */

export function wegzetTakenAntwoord(rijen: WegzetTaakRij[]): WegzettenAntwoord {
    const taken: WegzettenAntwoord['taken'] = [];
    for (const t of rijen) {
        const regels = (t.regels ?? [])
            .filter((r) => Number(r.aantal) > 0)
            .map((r) => ({
                artikel: r.artikel || 'Artikel',
                aantal: Math.round(Number(r.aantal)),
                producten: (r.producten ?? [])
                    .filter((p): p is typeof p & { product_id: string } => !!p.product_id && Number(p.hoeveelheid) > 0)
                    .map((p) => ({ product_id: p.product_id, naam: p.naam || 'Product', hoeveelheid: getal(p.hoeveelheid) })),
            }));
        if (!regels.length) continue;
        taken.push({
            order_id: Number(t.order_id),
            nummer: t.nummer,
            naam: t.naam?.trim() || 'Onbekend',
            afhaalmoment: iso(t.afhaalmoment),
            ophalen_binnen_24u: !!t.ophalen_binnen_24u,
            regels,
        });
    }
    return { taken };
}

function boekingen(lijst: unknown): WegzetAntwoord['boekingen'] {
    return ((lijst as Record<string, unknown>[] | null) ?? []).map((b) => {
        const uit: WegzetAntwoord['boekingen'][number] = {
            product_id: String(b.product_id),
            hoeveelheid: getal(b.hoeveelheid),
            voorraad: getalOfNull(b.voorraad),
            type: String(b.type || 'onbekend'),
        };
        const regel = Number(b.regel_id);
        if (Number.isInteger(regel) && regel > 0) uit.regel_id = regel;
        return uit;
    });
}

/** "Er liggen er 3 Naober, deze order vraagt er 4. Er is niets apart gezet. …" (contract §3.2, voorbeeldtekst). */
export function tekortMelding(tekorten: { naam: string; ligt_er: number; nodig: number }[]): string {
    const tal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 3, useGrouping: false });
    const eerste = tekorten.length === 1
        ? `Er liggen er ${tal(tekorten[0]!.ligt_er)} ${tekorten[0]!.naam}, deze order vraagt er ${tal(tekorten[0]!.nodig)}`
        : `Te weinig op het schap: ${tekorten.map((t) => `${t.naam} (ligt er ${tal(t.ligt_er)}, nodig ${tal(t.nodig)})`).join('; ')}`;
    return `${eerste}. Er is niets apart gezet. Tel het schap en corrigeer de voorraad in BBQ Architect.`;
}

export interface WegzetContext {
    orgId: string;
    apparaatId: string;
    medewerkerId: string;
    contract: string | null;
}

/**
 * POST wegzetten/{order_id} (actie 'apart') of /ongedaan (actie 'ongedaan').
 * Idempotent op gebeurtenis_id: een herhaling geeft hetzelfde antwoord. Wordt
 * een gebeurtenis_id hergebruikt voor een andere order of actie, dan 400.
 */
export async function wegzetVraag(
    store: ToonbankStore,
    ctx: WegzetContext,
    orderId: number,
    actie: 'apart' | 'ongedaan',
    verzoek: { gebeurtenis_id: string; moment: string; reden?: string },
): Promise<Uitkomst<WegzetAntwoord | OngedaanAntwoord>> {
    const ruw = await store.wegzetVraag({
        orgId: ctx.orgId, apparaatId: ctx.apparaatId, orderId, actie, gebeurtenisId: verzoek.gebeurtenis_id,
        moment: verzoek.moment, medewerkerId: ctx.medewerkerId, contractVersie: ctx.contract, reden: verzoek.reden ?? null,
    });

    if (ruw.journaal === 'bestond' && (ruw.soort !== 'wegzetten' || Number(ruw.payload?.order_id) !== orderId || ruw.payload?.actie !== actie)) {
        return mislukt('ongeldig_verzoek', 'Dit gebeurtenis_id is al gebruikt voor een andere melding of vraag.', { gebeurtenis_id: verzoek.gebeurtenis_id });
    }
    const r = ruw.resultaat ?? {};

    if (r.ok === true) {
        const uitkomst = String(r.uitkomst);
        if (actie === 'ongedaan' && uitkomst === 'niet_zelfde_dag') {
            return mislukt('niet_zelfde_dag', 'Deze order is op een eerdere dag apart gezet; dat kan hier niet meer terug. Corrigeer het met een telling in BBQ Architect.', {
                order_id: Number(r.order_id ?? orderId), nummer: String(r.nummer ?? ''), apart_gezet_at: iso(r.apart_gezet_at),
            });
        }
        const toegestaan = actie === 'apart' ? ['apart', 'al_apart', 'geen_taak'] : ['ongedaan', 'niet_apart', 'geen_taak'];
        if (!toegestaan.includes(uitkomst)) throw new Error(`onverwachte uitkomst ${uitkomst} bij ${actie}`);
        const { versie } = await store.voorraadStand(ctx.orgId);
        return gelukt({ uitkomst, voorraad_versie: versie, boekingen: boekingen(r.boekingen) } as WegzetAntwoord | OngedaanAntwoord);
    }

    const detail = (r.detail ?? {}) as Record<string, unknown>;
    switch (r.sqlstate) {
        case 'P0002':
            return mislukt('niet_gevonden', 'Deze order bestaat niet (meer) in BBQ Architect.', { order_id: orderId });
        case 'WV006':
            return mislukt('niet_betaald', 'Niet betaald: niet apart zetten.', {
                wv_code: 'WV006', order_id: Number(detail.order_id ?? orderId), nummer: String(detail.nummer ?? ''), status: String(detail.status ?? 'onbekend'),
            });
        case 'WV010': {
            const tekorten = ((detail.tekorten as Record<string, unknown>[] | null) ?? []).map((t) => ({
                product_id: String(t.product_id), naam: String(t.naam || 'Product'), ligt_er: getal(t.ligt_er), nodig: getal(t.nodig),
            }));
            return mislukt('te_weinig_voorraad', tekortMelding(tekorten), {
                wv_code: 'WV010', order_id: Number(detail.order_id ?? orderId), nummer: String(detail.nummer ?? ''), tekorten,
            });
        }
        case 'WV011':
            return mislukt('al_opgehaald', 'Deze order is al opgehaald; apart zetten kan niet meer terug.', {
                wv_code: 'WV011', order_id: Number(detail.order_id ?? orderId), nummer: String(detail.nummer ?? ''), opgehaald_at: iso(detail.opgehaald_at),
            });
        default:
            throw new Error(`onverwacht resultaat van toonbank_wegzet_vraag: ${String(r.sqlstate ?? 'leeg')}`);
    }
}

/* ── Afhaallijst ───────────────────────────────────────────────────────────── */

/** "2027-03-06" en een bestaande datum; anders null. */
export function leesDatum(v: string | null): string | null {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

export function afhaallijstAntwoord(ruw: { versie: number; datum: string; orders: unknown[] }): AfhaallijstAntwoord {
    return {
        versie: Number(ruw.versie ?? 0),
        datum: ruw.datum,
        orders: (ruw.orders ?? []).map((x) => {
            const o = x as Record<string, unknown>;
            return {
                order_id: Number(o.order_id),
                nummer: String(o.nummer),
                naam: String(o.naam || 'Onbekend'),
                afhaalmoment: iso(o.afhaalmoment),
                alcohol: !!o.alcohol,
                rest_cents: Math.max(0, Number(o.rest_cents ?? 0)),
                status: String(o.status || 'betaald'),
                apart_gezet: !!o.apart_gezet,
                dozen: ((o.dozen as Record<string, unknown>[] | null) ?? []).map((d) => ({
                    code: String(d.code), omschrijving: String(d.omschrijving ?? ''), volgnr: Number(d.volgnr), opgehaald_at: iso(d.opgehaald_at),
                })),
            };
        }),
    };
}

/* ── Scannen ───────────────────────────────────────────────────────────────── */

/** Een volledige doos-URL (…/g/{code}) wordt eerst de code; verder alleen spaties eraf. */
export function scanCode(invoer: string): string {
    const t = invoer.trim();
    return codeUitScan(t) ?? t.slice(0, 200);
}

export async function scanAntwoord(store: ToonbankStore, orgId: string, invoer: string): Promise<ScanAntwoord> {
    const code = scanCode(invoer);
    if (!code) return { soort: 'onbekend', code: '?' };
    const r = await store.scan(orgId, code);
    switch (r.soort) {
        case 'artikel':
            return { soort: 'artikel', code: String(r.code), artikel_id: String(r.artikel_id) };
        case 'doos':
            return { soort: 'doos', code: String(r.code), order_id: Number(r.order_id), nummer: String(r.nummer) };
        default:
            return { soort: 'onbekend', code: String(r.code || code) };
    }
}
