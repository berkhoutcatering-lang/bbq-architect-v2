/**
 * Prijskaartjes voor de winkel — de 3D-geprinte schaphouders aan de
 * Tramstraat. Overgenomen uit het losse systeempje van Mathijs
 * (hop-bites-prijskaartjes, 13 oktober 2026): dezelfde maten, dezelfde
 * huisstijl, hetzelfde A4-vel. Nieuw: de kaartjes komen uit de
 * winkelvoorraad (winkel_producten) en de prijs is de winkelprijs van het
 * product — één plek voor een prijswijziging.
 *
 * Maten (niet aanpassen zonder de houder aan te passen):
 *  - kaartje 85 × 55 mm, de maat van een visitekaartje (24 oktober 2026,
 *    Mathijs: de houders zijn klaar, het kaartje moet vallen als een
 *    visitekaartje; het systeempje had 90 × 55); de onderste 7 mm valt in
 *    de gleuf;
 *  - A4: 2 kolommen × 5 rijen = 10 kaartjes, gecentreerd, grijze snijlijnen;
 *  - printen op 100 % / werkelijke grootte.
 *
 * Puur: geen DOM, geen database. De tekenfuncties krijgen een canvas-context
 * en de twee lettertypen (Bitter, Barlow Semi Condensed) mee.
 */

export const CARD_W = 85;
export const CARD_H = 55;
export const INSERT = 7;
export const VIS_H = CARD_H - INSERT;
export const COLS = 2;
export const ROWS = 5;
export const PER_VEL = COLS * ROWS;
export const A4_W = 210;
export const A4_H = 297;
const MARGIN_X = (A4_W - COLS * CARD_W) / 2;
const MARGIN_Y = (A4_H - ROWS * CARD_H) / 2;
const PT = 0.3528; // 1 pt in mm
const PAPIER = { bg: '#FFFFFF', ink: '#1F1F1C', soft: '#56574C', olive: '#5B6236', gold: '#A3833F', cut: '#BDBDB6' };

export const SOORTEN = ['Speciaalbier', 'Alcoholvrij', 'Wijn · rood', 'Wijn · wit', 'Wijn · rosé', 'Bubbels', 'Noten', 'Borrel', 'Kaas', 'Rubs & sauzen'] as const;

export const INHOUD_EENHEDEN = ['cl', 'ml', 'l', 'g', 'kg', 'los'] as const;
export type InhoudEenheid = (typeof INHOUD_EENHEDEN)[number];

/** Wat op het kaartje staat. `prijsCents` is per stuk, of per 100 gram bij `los`. */
export interface Kaartje {
    productId: string;
    soort: string;
    naam: string;
    maker: string;
    details: string;
    inhoud: number | null;
    inhoudEenheid: InhoudEenheid;
    prijsCents: number | null;
    bij: string;
    aantal: number;
    printen: boolean;
}

/** Het product uit winkel_producten, voor zover het kaartje het nodig heeft. */
export interface KaartjeProduct {
    id: string;
    naam: string;
    type: string;
    eenheid: 'stuk' | 'gram';
    prijs_per: number;
    winkelprijs_incl_cents: number | null;
    alcohol: boolean;
}

/** Wat er in winkel_prijskaartjes staat (null = nog geen kaartje bewaard). */
export interface KaartjeOpgeslagen {
    soort: string | null;
    naam: string | null;
    maker: string | null;
    details: string | null;
    inhoud: number | null;
    inhoud_eenheid: string | null;
    bij: string | null;
    aantal: number;
    printen: boolean;
}

/** Dozen en verpakking staan niet op de plank: daar komt geen kaartje voor. */
export const GEEN_KAARTJE = new Set(['doos', 'verpakking']);

const SOORT_VAN_TYPE: Record<string, string> = {
    wijn: 'Wijn · rood',
    amandelen: 'Noten',
    worst: 'Borrel',
    vleeswaar: 'Borrel',
    kaas: 'Kaas',
    crackers: 'Borrel',
    krokant: 'Borrel',
    zuur: 'Borrel',
    marmelade: 'Borrel',
};

export function soortVanProduct(p: Pick<KaartjeProduct, 'type' | 'alcohol'>): string {
    if (p.type === 'bier') return p.alcohol ? 'Speciaalbier' : 'Alcoholvrij';
    return SOORT_VAN_TYPE[p.type] ?? '';
}

/**
 * De prijs op het kaartje uit de winkelprijs. Die geldt per `prijs_per`
 * eenheden: een fles per 1 stuk, amandelen per 100 gram. Op het kaartje:
 * per stuk, of per 100 gram bij los gewogen waar.
 */
export function kaartPrijsCents(p: Pick<KaartjeProduct, 'eenheid' | 'prijs_per' | 'winkelprijs_incl_cents'>): number | null {
    if (p.winkelprijs_incl_cents == null || !(p.prijs_per > 0)) return null;
    const per = p.eenheid === 'gram' ? 100 : 1;
    return Math.round((p.winkelprijs_incl_cents * per) / p.prijs_per);
}

/** Terug van het kaartje naar winkelprijs_incl_cents (per `prijs_per` eenheden). */
export function winkelPrijsCents(kaartCents: number, p: Pick<KaartjeProduct, 'eenheid' | 'prijs_per'>): number {
    const per = p.eenheid === 'gram' ? 100 : 1;
    return Math.round((kaartCents * p.prijs_per) / per);
}

function isInhoudEenheid(v: string | null | undefined): v is InhoudEenheid {
    return !!v && (INHOUD_EENHEDEN as readonly string[]).includes(v);
}

/** Het kaartje van een product: wat bewaard is, en anders een voorstel uit het product. */
export function kaartjeVoorProduct(p: KaartjeProduct, k: KaartjeOpgeslagen | null): Kaartje {
    const losGewogen = p.eenheid === 'gram';
    return {
        productId: p.id,
        soort: k?.soort ?? soortVanProduct(p),
        naam: k?.naam ?? p.naam,
        maker: k?.maker ?? '',
        details: k?.details ?? '',
        inhoud: k ? k.inhoud : losGewogen ? 100 : null,
        inhoudEenheid: isInhoudEenheid(k?.inhoud_eenheid) ? k.inhoud_eenheid : losGewogen ? 'los' : 'cl',
        prijsCents: kaartPrijsCents(p),
        bij: k?.bij ?? '',
        aantal: k?.aantal ?? 1,
        printen: k?.printen ?? true,
    };
}

/** Zonder prijs komt een kaartje nooit op het vel: een leeg prijsvak in de winkel is erger dan geen kaartje. */
export function kanPrinten(k: Kaartje): boolean {
    return k.printen && k.prijsCents != null && k.naam.trim() !== '';
}

/** De kaartjes in de volgorde van de lijst, elk zo vaak als `aantal` (1–50). */
export function kaartjesVoorPrint(lijst: readonly Kaartje[]): Kaartje[] {
    const uit: Kaartje[] = [];
    for (const k of lijst) {
        if (!kanPrinten(k)) continue;
        const n = Math.max(1, Math.min(50, Math.round(k.aantal) || 1));
        for (let i = 0; i < n; i++) uit.push(k);
    }
    return uit;
}

export function aantalVellen(kaartjes: number): number {
    return Math.max(1, Math.ceil(kaartjes / PER_VEL));
}

const nl2 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nlQ = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });

/** € 4,95 → ['4', '95']. */
export function prijsDelen(cents: number): [string, string] {
    const [euro, cent] = nl2.format(cents / 100).split(',');
    return [euro ?? '0', cent ?? '00'];
}

/** Alleen de inhoud; geen prijs per liter of kilo op het kaartje (bewuste keuze). */
export function inhoudTekst(k: Pick<Kaartje, 'inhoud' | 'inhoudEenheid'>): { onderPrijs: string; links: string } {
    if (k.inhoudEenheid === 'los') return { onderPrijs: 'per 100 gram', links: '' };
    const label = ({ l: 'liter', g: 'gram' } as Record<string, string>)[k.inhoudEenheid] ?? k.inhoudEenheid;
    return { onderPrijs: '', links: k.inhoud && k.inhoud > 0 ? `${nlQ.format(k.inhoud)} ${label}` : '' };
}

/* ── tekenen ──────────────────────────────────────────────────────────────── */

export interface Letters {
    /** Bitter: naam, prijs, "Lekker bij". */
    display: string;
    /** Barlow Semi Condensed: soort, details, inhoud. */
    ui: string;
}

function font(weight: number, sizePt: number, family: string, s: number, italic = false): string {
    return `${italic ? 'italic ' : ''}${weight} ${sizePt * PT * s}px ${family}`;
}

/** Letterafstand met de hand, zodat het in elke browser hetzelfde oogt. */
function gespatieerd(ctx: CanvasRenderingContext2D, tekst: string, x: number, y: number, spatie: number, rechts = false): void {
    const tekens = [...tekst];
    const w = tekens.reduce((a, c) => a + ctx.measureText(c).width, 0) + spatie * (tekens.length - 1);
    let cx = rechts ? x - w : x;
    const vorige = ctx.textAlign;
    ctx.textAlign = 'left';
    for (const c of tekens) {
        ctx.fillText(c, cx, y);
        cx += ctx.measureText(c).width + spatie;
    }
    ctx.textAlign = vorige;
}

function pasIn(ctx: CanvasRenderingContext2D, tekst: string, maxW: number): string {
    if (ctx.measureText(tekst).width <= maxW) return tekst;
    let t = tekst;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
}

function tweeRegels(ctx: CanvasRenderingContext2D, tekst: string, maxW: number): string[] {
    const woorden = tekst.split(/\s+/);
    let a = '';
    for (let i = 0; i < woorden.length; i++) {
        const t = a ? a + ' ' + woorden[i] : woorden[i];
        if (ctx.measureText(t).width > maxW && a) return [a, woorden.slice(i).join(' ')];
        a = t;
    }
    return [a];
}

/**
 * Eén kaartje op (ox, oy), schaal `s0` pixels per mm. Het ontwerp is opgezet
 * voor een zichtbaar deel van 38 mm; het echte kaartje schaalt alles mee.
 */
export function tekenKaartje(ctx: CanvasRenderingContext2D, k: Kaartje, ox: number, oy: number, s0: number, letters: Letters, opties?: { toonGleuf?: boolean }): void {
    const K = VIS_H / 38, s = s0 * K, CW = CARD_W / K, CH = CARD_H / K, VH = VIS_H / K, IN = INSERT / K;
    const X = (mm: number) => ox + mm * s, Y = (mm: number) => oy + mm * s;
    const pad = 3.5, binnenW = CW - pad * 2;
    const { display: DISPLAY, ui: UI } = letters;
    ctx.save();
    ctx.fillStyle = PAPIER.bg;
    ctx.fillRect(X(0), Y(0), CW * s, CH * s);
    ctx.textBaseline = 'alphabetic';

    // olijfgroene kopbalk tot de rand: soort links, HOP & BITES rechts
    ctx.fillStyle = PAPIER.olive;
    ctx.fillRect(X(0), Y(0), CW * s, 7.2 * s);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(600, 7, UI, s);
    gespatieerd(ctx, (k.soort || '').toUpperCase(), X(pad), Y(4.7), 0.13 * 7 * PT * s);
    ctx.font = font(700, 6, DISPLAY, s);
    gespatieerd(ctx, 'HOP & BITES', X(CW - pad), Y(4.7), 0.1 * 6 * PT * s, true);

    // prijs rechtsonder (eerst meten: links mag er niet tegenaan)
    const inh = inhoudTekst(k);
    const [euro, cent] = prijsDelen(k.prijsCents ?? 0);
    const grootPt = 27, centPt = 15, eurPt = 13;
    ctx.font = font(800, grootPt, DISPLAY, s); const wE = ctx.measureText(euro).width;
    ctx.font = font(800, centPt, DISPLAY, s); const wC = ctx.measureText(',' + cent).width;
    ctx.font = font(700, eurPt, DISPLAY, s); const wS = ctx.measureText('€').width;
    const tussen = 0.7 * s, prijsW = wS + tussen + wE + wC;
    const basisY = inh.onderPrijs ? 32.6 : 35.2;
    let px = X(CW - pad) - prijsW;
    ctx.fillStyle = k.prijsCents == null ? PAPIER.cut : PAPIER.ink;
    ctx.font = font(700, eurPt, DISPLAY, s); ctx.fillText('€', px, Y(basisY) - 0.15 * s); px += wS + tussen;
    ctx.font = font(800, grootPt, DISPLAY, s); ctx.fillText(euro, px, Y(basisY)); px += wE;
    ctx.font = font(800, centPt, DISPLAY, s); ctx.fillText(',' + cent, px, Y(basisY) - 3.6 * s);
    if (inh.onderPrijs) {
        ctx.fillStyle = PAPIER.soft; ctx.font = font(600, 6.2, UI, s); ctx.textAlign = 'right';
        ctx.fillText(inh.onderPrijs, X(CW - pad), Y(36.0)); ctx.textAlign = 'left';
    }
    const prijsLinks = (X(CW - pad) - prijsW) / s - ox / s; // in mm, kaartcoördinaat
    const smalW = (prijsLinks - 2.2 - pad) * s, volW = binnenW * s;

    // naam: één regel 14 pt, anders twee regels 12 pt
    ctx.fillStyle = PAPIER.ink;
    let y = 14.0;
    const naam = (k.naam || 'Productnaam').trim();
    ctx.font = font(800, 14, DISPLAY, s);
    if (ctx.measureText(naam).width <= volW) ctx.fillText(naam, X(pad), Y(y));
    else {
        ctx.font = font(800, 12, DISPLAY, s);
        const regels = tweeRegels(ctx, naam, volW);
        ctx.fillText(pasIn(ctx, regels[0], volW), X(pad), Y(13.0));
        if (regels[1]) { ctx.fillText(pasIn(ctx, regels[1], volW), X(pad), Y(17.6)); y = 17.6; } else y = 13.0;
    }

    // kleine regels: maker, details, "Lekker bij …"
    const klein: { t: string; f: string; c: string }[] = [];
    if (k.maker) klein.push({ t: k.maker, f: font(500, 8.4, UI, s), c: PAPIER.soft });
    if (k.details) klein.push({ t: k.details, f: font(500, 8.4, UI, s), c: PAPIER.soft });
    if (k.bij) klein.push({ t: 'Lekker bij ' + k.bij, f: font(500, 8.2, DISPLAY, s, true), c: PAPIER.olive });
    let ly = y + 4.6;
    for (const r of klein) {
        if (ly > 30.6) break;
        ctx.font = r.f; ctx.fillStyle = r.c;
        ctx.fillText(pasIn(ctx, r.t, ly > 25.5 ? smalW : volW), X(pad), Y(ly));
        ly += 3.9;
    }
    // inhoud linksonder
    if (inh.links) {
        ctx.font = font(500, 7.2, UI, s); ctx.fillStyle = PAPIER.soft;
        ctx.fillText(pasIn(ctx, inh.links, smalW), X(pad), Y(35.2));
    }

    if (opties?.toonGleuf) {
        ctx.fillStyle = 'rgba(91,98,54,0.14)'; ctx.fillRect(X(0), Y(VH), CW * s, IN * s);
        ctx.strokeStyle = 'rgba(91,98,54,0.55)'; ctx.setLineDash([2 * s / 3, 1.2 * s / 3]); ctx.lineWidth = Math.max(1, 0.15 * s);
        ctx.beginPath(); ctx.moveTo(X(0), Y(VH)); ctx.lineTo(X(CW), Y(VH)); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(91,98,54,0.85)'; ctx.font = font(600, 6, UI, s); ctx.textAlign = 'center';
        ctx.fillText('valt in de houder', X(CW / 2), Y(VH + 4.4)); ctx.textAlign = 'left';
    }
    ctx.restore();
}

/** Eén A4-vel met maximaal tien kaartjes en de snijlijnen over het hele vel; `s` pixels per mm. */
export function tekenVel(ctx: CanvasRenderingContext2D, kaartjes: readonly Kaartje[], s: number, letters: Letters): void {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A4_W * s, A4_H * s);
    kaartjes.forEach((k, i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        tekenKaartje(ctx, k, (MARGIN_X + c * CARD_W) * s, (MARGIN_Y + r * CARD_H) * s, s, letters);
    });
    ctx.strokeStyle = PAPIER.cut;
    ctx.lineWidth = Math.max(0.6, 0.12 * s);
    ctx.beginPath();
    for (let c = 0; c <= COLS; c++) { const x = (MARGIN_X + c * CARD_W) * s; ctx.moveTo(x, 0); ctx.lineTo(x, A4_H * s); }
    for (let r = 0; r <= ROWS; r++) { const y = (MARGIN_Y + r * CARD_H) * s; ctx.moveTo(0, y); ctx.lineTo(A4_W * s, y); }
    ctx.stroke();
}
