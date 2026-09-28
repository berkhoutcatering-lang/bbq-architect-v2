/**
 * Voorraad toevoegen (W2b) — het voorstel voor het controlescherm. Puur.
 *
 * Elke manier van invoeren levert regels "zoals op het papier" (naam, aantal,
 * eenheid, prijs, soms een EAN). Hier wordt per regel voorgesteld:
 *
 *   1. onthouden   — deze leverancier + regelnaam (of EAN) is eerder bevestigd
 *   2. ean         — de EAN hoort bij een winkelproduct
 *   3. naam        — een product met (bijna) dezelfde naam
 *   4. geen        — Mathijs kiest zelf
 *
 * De omrekening ("krat (24)" = 24 flesjes, "kg" = 1000 g) is een voorstel
 * uit de tekst; het getal staat altijd zichtbaar in het controlescherm en
 * wordt pas na bevestigen geboekt. Geen AI: dit is tekst lezen.
 */

export type Plek = 'winkel' | 'makerij';

export interface BronRegel {
    naam: string;
    aantal: number | null;
    eenheid: string | null;
    prijs_cents: number | null;
    btw_pct: number | null;
    ean?: string | null;
}

export interface Koppeling {
    sleutel: string;
    plek: Plek;
    winkel_product_id: string | null;
    inventory_id: number | null;
    omrekening: number;
}

export interface WinkelKandidaat { id: string; naam: string; eenheid: 'stuk' | 'gram'; ean: string | null }
export interface KeukenKandidaat { id: number; naam: string; unit: string | null }

export interface Voorstel {
    plek: Plek | null;
    winkel_product_id: string | null;
    inventory_id: number | null;
    omrekening: number | null;
    aantal: number | null;
    voorstel: 'onthouden' | 'ean' | 'naam' | 'geen';
}

export function normaliseer(naam: string): string {
    return naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** De sleutel waarop een bevestigde koppeling onthouden wordt — gelijk aan voorraad_invoer_boeken. */
export function koppelSleutel(r: Pick<BronRegel, 'naam' | 'ean'>, leverancierId: number | null): string {
    if (r.ean && r.ean.trim()) return `ean:${r.ean.trim()}`;
    return `lev:${leverancierId ?? '-'}:${r.naam.trim().replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Hoeveel stuks zitten er in één factuur-eenheid, volgens de tekst?
 * "Krat bier (24)", "24 x 33 cl", "doos 12 st", "6-pack", "tray à 24".
 * null = niet te zien; dan is het 1 tenzij Mathijs iets anders invult.
 */
export function stuksPerVerpakking(tekst: string): number | null {
    const t = tekst.toLowerCase();
    const patronen = [
        /\((\d{1,3})\s*(?:st(?:uks?)?|fl(?:essen)?|x)?\)/,
        /(\d{1,3})\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:cl|ml|l|g|gr|kg)\b/,
        /(\d{1,3})\s*[-\s]?pack\b/,
        /(?:krat|doos|tray|omdoos|pak)\s*(?:à|a|van)?\s*(\d{1,3})\b/,
        /\b(\d{1,3})\s*(?:st|stuks|flessen|fl|blikken|potten)\b/,
    ];
    for (const p of patronen) {
        const m = p.exec(t);
        if (m) {
            const n = Number(m[1]);
            if (n > 1 && n <= 500) return n;
        }
    }
    return null;
}

const GEWICHT: Record<string, number> = { g: 1, gr: 1, gram: 1, kg: 1000, kilo: 1000 };

/**
 * De omrekening van factuur-eenheid naar voorraad-eenheid.
 *  - winkelproduct in gram: kg → 1000, g → 1; anders onbekend
 *  - winkelproduct per stuk: stuks per verpakking uit de tekst, anders 1
 *  - keukenproduct: zelfde eenheid → 1, kg ⇄ g → 1000 of 0,001
 */
export function omrekeningVoor(r: Pick<BronRegel, 'naam' | 'eenheid'>, doel: { plek: 'winkel'; eenheid: 'stuk' | 'gram' } | { plek: 'makerij'; unit: string | null }): number | null {
    const e = (r.eenheid ?? '').toLowerCase().trim();
    if (doel.plek === 'winkel') {
        if (doel.eenheid === 'gram') return GEWICHT[e] ?? null;
        return stuksPerVerpakking(`${r.naam} ${r.eenheid ?? ''}`) ?? 1;
    }
    const u = (doel.unit ?? '').toLowerCase().trim();
    if (!e || e === u || (['st', 'stuk', 'stuks'].includes(e) && ['st', 'stuk', 'stuks'].includes(u))) return 1;
    if (GEWICHT[e] && GEWICHT[u]) return GEWICHT[e]! / GEWICHT[u]!;
    if ((e === 'l' || e === 'liter') && u === 'ml') return 1000;
    if (e === 'ml' && (u === 'l' || u === 'liter')) return 0.001;
    return null;
}

/** Hoe goed lijken twee namen: 1 = gelijk, 0 = niets gemeen. Woorden-overlap, geen AI. */
export function naamGelijkenis(a: string, b: string): number {
    const na = normaliseer(a);
    const nb = normaliseer(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    const wa = new Set(na.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const wb = new Set(nb.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    if (!wa.size || !wb.size) return 0;
    let gemeen = 0;
    for (const w of wa) if (wb.has(w)) gemeen += 1;
    return gemeen / Math.max(wa.size, wb.size);
}

const rond = (n: number) => Math.round(n * 1000) / 1000;

export function stelVoor(
    r: BronRegel,
    ctx: { leverancierId: number | null; koppelingen: Koppeling[]; winkel: WinkelKandidaat[]; keuken: KeukenKandidaat[]; voorkeurPlek?: Plek },
): Voorstel {
    const metAantal = (omrekening: number | null) => (r.aantal != null && omrekening != null ? rond(r.aantal * omrekening) : null);

    const k = ctx.koppelingen.find((x) => x.sleutel === koppelSleutel(r, ctx.leverancierId))
        ?? (r.ean ? undefined : ctx.koppelingen.find((x) => x.sleutel === koppelSleutel({ naam: r.naam }, ctx.leverancierId)));
    if (k) {
        return { plek: k.plek, winkel_product_id: k.winkel_product_id, inventory_id: k.inventory_id, omrekening: k.omrekening, aantal: metAantal(k.omrekening), voorstel: 'onthouden' };
    }

    if (r.ean) {
        const w = ctx.winkel.find((x) => x.ean === r.ean);
        if (w) {
            const om = omrekeningVoor(r, { plek: 'winkel', eenheid: w.eenheid });
            return { plek: 'winkel', winkel_product_id: w.id, inventory_id: null, omrekening: om, aantal: metAantal(om), voorstel: 'ean' };
        }
    }

    let beste: { plek: Plek; score: number; w?: WinkelKandidaat; k?: KeukenKandidaat } | null = null;
    for (const w of ctx.winkel) {
        const s = naamGelijkenis(r.naam, w.naam) + (ctx.voorkeurPlek === 'winkel' ? 0.01 : 0);
        if (!beste || s > beste.score) beste = { plek: 'winkel', score: s, w };
    }
    for (const kk of ctx.keuken) {
        const s = naamGelijkenis(r.naam, kk.naam) + (ctx.voorkeurPlek === 'makerij' ? 0.01 : 0);
        if (!beste || s > beste.score) beste = { plek: 'makerij', score: s, k: kk };
    }
    if (beste && beste.score >= 0.5) {
        if (beste.w) {
            const om = omrekeningVoor(r, { plek: 'winkel', eenheid: beste.w.eenheid });
            return { plek: 'winkel', winkel_product_id: beste.w.id, inventory_id: null, omrekening: om, aantal: metAantal(om), voorstel: 'naam' };
        }
        const om = omrekeningVoor(r, { plek: 'makerij', unit: beste.k!.unit });
        return { plek: 'makerij', winkel_product_id: null, inventory_id: beste.k!.id, omrekening: om, aantal: metAantal(om), voorstel: 'naam' };
    }
    return { plek: ctx.voorkeurPlek ?? null, winkel_product_id: null, inventory_id: null, omrekening: null, aantal: null, voorstel: 'geen' };
}

/** Kan dit concept geboekt worden? Dezelfde regel als voorraad_invoer_boeken (WV009). */
export function klaarOmTeBoeken(regels: { overslaan: boolean; plek: Plek | null; winkel_product_id: string | null; inventory_id: number | null; aantal: number | null }[]): { ok: boolean; open: number } {
    const actief = regels.filter((r) => !r.overslaan);
    const open = actief.filter((r) => !r.plek || !r.aantal || r.aantal <= 0 || (r.plek === 'winkel' ? !r.winkel_product_id : !r.inventory_id)).length;
    return { ok: actief.length > 0 && open === 0, open };
}
