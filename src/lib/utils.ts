import type { FactuurItem, OfferteItem, LineTotals, MargeResult, Offerte, Gerecht, InventoryItem, MenuSelectieItem } from '@/types';

// Format number as Euro currency
export function fmt(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return '\u20ac 0,00';
    return '\u20ac ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function roundMoney(value: number | string | null | undefined): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function roundToDecimals(value: number | string | null | undefined, decimals: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function priceInclFromExcl(excl: number | string | null | undefined, btw: number | string | null | undefined): number {
    const exclAmount = Number(excl);
    const btwRate = Number(btw);
    if (!Number.isFinite(exclAmount)) return 0;
    if (!Number.isFinite(btwRate)) return exclAmount;
    return roundMoney(exclAmount * (1 + btwRate / 100));
}

export function priceExclFromIncl(incl: number | string | null | undefined, btw: number | string | null | undefined, decimals = 2): number {
    const inclAmount = roundMoney(incl);
    const btwRate = Number(btw);
    if (!Number.isFinite(btwRate) || btwRate <= -100) return inclAmount;
    return roundToDecimals(inclAmount / (1 + btwRate / 100), decimals);
}

// HTML escape
export function escH(s: string | null | undefined): string {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ISO date to NL format
export function fmtNl(d: string | null | undefined): string {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length !== 3) return d;
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

// Today as ISO string
export function today(): string {
    return new Date().toISOString().slice(0, 10);
}

// Safe JSON Parse
export function safeJsonParse<T = unknown>(val: string | null | undefined | T, fallback: T = {} as T): T {
    if (!val) return fallback;
    if (typeof val !== 'string') return val as T;
    try { return JSON.parse(val); } catch { return fallback; }
}

// Add days to ISO date string
export function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// Calculate line totals
export function calcLineTotals(items: (FactuurItem | OfferteItem)[] | null | undefined): LineTotals {
    let rawItems = items;
    if (typeof rawItems === 'string') { try { rawItems = JSON.parse(rawItems); } catch { rawItems = []; } }
    let subtotaal = 0;
    (rawItems || []).forEach(function (item: any) {
        subtotaal += (parseFloat(item.qty) || 0) * (parseFloat(item.prijs) || 0);
    });
    let btwBedrag = 0;
    (rawItems || []).forEach(function (item: any) {
        const lineTotal = (parseFloat(item.qty) || 0) * (parseFloat(item.prijs) || 0);
        btwBedrag += lineTotal * ((parseFloat(item.btw) || 0) / 100);
    });
    return { subtotaal, btw: btwBedrag, totaal: subtotaal + btwBedrag };
}

/**
 * Pluraliseert een Nederlands zelfstandig naamwoord op basis van count.
 * Voorkomt "1 offertes" en soortgelijke grammatica-fouten.
 *
 * @example
 *   plural(1, 'offerte', 'offertes') → "1 offerte"
 *   plural(2, 'offerte', 'offertes') → "2 offertes"
 *   plural(0, 'klant', 'klanten')   → "0 klanten"
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
    const word = count === 1 ? singular : (pluralForm || singular + 'en');
    return `${count} ${word}`;
}

// Month names in Dutch
export const MAANDEN = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
export const MAANDEN_KORT = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
export const DAGEN = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

// Generate invoice/quote number (legacy — use nextNummer for dedup-safe numbering)
export function genNummer(prefix: string, nr: number): string {
    return prefix + String(nr).padStart(3, '0');
}

// Dedup-safe nummer generator — finds max existing nummer and increments
export function nextNummer(prefix: string, existingNummers: (string | undefined | null)[]): string {
    let maxNum = 0;
    existingNummers.forEach(nr => {
        if (nr && nr.startsWith(prefix)) {
            const num = parseInt(nr.replace(prefix, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        }
    });
    return prefix + String(maxNum + 1).padStart(3, '0');
}

// Resize image to max dimensions to avoid API limits and 'expected pattern' errors
export function resizeImage(base64Str: string, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<string> {
    return new Promise(function (resolve) {
        const img = new Image();
        img.src = base64Str;
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function () { resolve(base64Str); };
    });
}

// ── Marge Calculation Engine ──
export function calcMargeForOfferte(offerte: Offerte | null, gerechtenData: Gerecht[] | null, inventoryData: InventoryItem[] | null): MargeResult {
    if (!offerte) return { omzet: 0, foodcostTotaal: 0, winst: 0, nettoWinst: 0, margePct: 0 };

    function getInv(naam: string | null | undefined): InventoryItem | undefined {
        if (!naam) return undefined;
        return (inventoryData || []).find(function (i) { return i.naam && i.naam.toLowerCase() === String(naam).toLowerCase(); });
    }

    function dishCost(name: string): number {
        const g = (gerechtenData || []).find(function (x) { return x.naam === name; });
        if (!g || !g.ingredient_costs) return 0;
        return (g.ingredient_costs || []).reduce(function (sum, it) {
            const inv = getInv(it.naam);
            const p = inv ? inv.purchase_price : 0;
            const y = it.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
            let f = 1;
            if (it.unit === 'g' && inv && inv.unit === 'kg') f = 0.001;
            if (it.unit === 'ml' && inv && inv.unit === 'L') f = 0.001;
            return sum + ((it.qty_pp || 0) * f / y) * p;
        }, 0);
    }

    const gasten = offerte.aantal_gasten || 0;
    const omzet = gasten * (offerte.basis_prijs_pp || 0);

    // Safely parse and flatten menu_selectie
    const parsedMenu = typeof offerte.menu_selectie === 'string' ? safeJsonParse(offerte.menu_selectie, {}) : (offerte.menu_selectie || {});
    let menuArray: MenuSelectieItem[] = [];
    if (Array.isArray(parsedMenu)) {
        menuArray = parsedMenu;
    } else if (parsedMenu && typeof parsedMenu === 'object') {
        Object.values(parsedMenu as Record<string, MenuSelectieItem[]>).forEach(function (arr) {
            if (Array.isArray(arr)) {
                arr.forEach(function (item) {
                    menuArray.push(typeof item === 'string' ? { naam: item } : item);
                });
            }
        });
    }

    const foodcostTotaal = menuArray.reduce(function (sum, sel) {
        return sum + dishCost(sel.gerecht_naam || sel.naam || '') * gasten;
    }, 0);
    const vk = (offerte.vaste_kosten || []).reduce(function (sum, k) { return sum + (parseFloat(String(k.bedrag)) || 0); }, 0);

    const nettoWinst = omzet - foodcostTotaal - vk;
    const margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;

    return { omzet, foodcostTotaal, winst: nettoWinst, nettoWinst, margePct };
}

export function margeColor(pct: number): string {
    if (pct > 70) return 'green';
    if (pct >= 60) return 'orange';
    return 'red';
}

// Normalize ingredients for DB storage
export function normalizeIngredienten(raw: string | Array<Record<string, unknown>> | null | undefined): string {
    if (!raw) return '';
    const source = raw;
    if (typeof source === 'string') return source.split(',').map(function (s) { return s.trim(); }).filter(Boolean).join(', ');
    if (!Array.isArray(source)) return '';
    return source.map(function (i) {
        if (typeof i === 'object' && i !== null) {
            const obj = i as { hoeveelheid?: string; eenheid?: string; naam?: string };
            return (obj.hoeveelheid ? obj.hoeveelheid + (obj.eenheid ? ' ' + obj.eenheid + ' ' : ' ') : '') + (obj.naam || JSON.stringify(i));
        }
        return String(i);
    }).join(', ');
}

// Normalize preparation steps for DB storage
export function normalizeBereidingswijze(data: string | Record<string, unknown> | null | undefined): string {
    if (!data) return '';
    const raw = typeof data === 'object'
        ? ((data as Record<string, unknown>).bereidingswijze || (data as Record<string, unknown>).bereiding || (data as Record<string, unknown>).stappenplan || (data as Record<string, unknown>).instructies || (data as Record<string, unknown>).preparation_steps || '')
        : data;
    return Array.isArray(raw) ? raw.join('\n') : String(raw || '');
}
