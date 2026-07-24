/* adapters/lib/parse — pure extractie-helpers voor adapters.
 *
 * Zet zichtbare leverancierstekst ("€ 22,50", "24 × 330 ml", "per kg") om in de
 * gestructureerde observation-velden. GEEN euroberekening hier — dat doet de
 * server deterministisch (ADR-4). Deze helpers leveren alleen bronvelden +
 * behouden de ruwe tekst. Puur en fixture-testbaar (vitest importeert dit).
 */

/** "€ 22,50" / "22.50" / "1.234,56" → canonieke decimale string "22.50" (of null). */
export function toDecimalString(text) {
    if (text == null) return null;
    let s = String(text).trim().replace(/[^0-9.,-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return null;
    const neg = s.startsWith('-');
    s = s.replace(/-/g, '');
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let out;
    if (lastDot !== -1 && lastComma !== -1) {
        const commaDec = lastComma > lastDot;
        const dec = commaDec ? ',' : '.';
        const grp = commaDec ? '.' : ',';
        out = s.split(grp).join('').replace(dec, '.');
    } else if (lastComma !== -1) {
        out = singleSep(s, ',');
    } else if (lastDot !== -1) {
        out = singleSep(s, '.');
    } else {
        out = s;
    }
    const n = Number(out);
    if (!Number.isFinite(n)) return null;
    return (neg ? -n : n).toFixed(2);
}

function singleSep(s, sep) {
    const parts = s.split(sep);
    if (parts.length > 2) return parts.join('');
    const dec = parts[1] ?? '';
    if (dec.length === 3) return parts.join(''); // duizendtal
    return `${parts[0]}.${dec}`;
}

const UNIT_MAP = {
    g: 'g', gram: 'g', grams: 'g',
    kg: 'kg', kilo: 'kg', kilogram: 'kg',
    ml: 'ml',
    l: 'liter', liter: 'liter', ltr: 'liter',
    st: 'piece', stuk: 'piece', stuks: 'piece', stk: 'piece', piece: 'piece', pieces: 'piece', x: 'piece',
};

/**
 * Parse een verpakkingsomschrijving → gestructureerde velden.
 * Herkent: multipack "24 × 330 ml", enkel "2,5 kg"/"750 g", stuks "12 stuks",
 * en variabel gewicht ("per kg", "€/kg").
 * @returns {{priceBasis, packCount, contentPerItemQuantity, contentPerItemUnit, variableWeight, packageDescriptionRaw}}
 */
export function parsePackaging(raw) {
    const result = {
        priceBasis: 'unknown',
        packCount: null,
        contentPerItemQuantity: null,
        contentPerItemUnit: null,
        variableWeight: false,
        packageDescriptionRaw: raw == null ? null : String(raw).trim() || null,
    };
    if (raw == null) return result;
    const text = String(raw).toLowerCase().trim();
    if (!text) return result;

    // Variabel gewicht / prijs per eenheid.
    const perUnit = text.match(/(?:per|\/)\s*(kg|liter|l|stuk|st)\b/);
    const looksVariable = /vanggewicht|variabel|per\s*kg|€\s*\/\s*kg|\/\s*kg\b/.test(text);

    // Multipack: "24 × 330 ml", "6 x 1,5 l", "2 x 1 kg"
    const multi = text.match(/(\d+)\s*[×x*]\s*([\d.,]+)\s*(kg|kilo|kilogram|gram|g|ml|liter|ltr|l|stuks?|stk|st)\b/);
    if (multi) {
        result.packCount = String(parseInt(multi[1], 10));
        result.contentPerItemQuantity = toNumberString(multi[2]);
        result.contentPerItemUnit = UNIT_MAP[multi[3]] || null;
        result.priceBasis = 'package';
        return finalize(result);
    }

    // Enkel gewicht/volume: "2,5 kg", "750 g", "1,5 l", "330 ml"
    const single = text.match(/([\d.,]+)\s*(kg|kilo|kilogram|gram|g|ml|liter|ltr|l)\b/);
    if (single && !looksVariable) {
        result.packCount = '1';
        result.contentPerItemQuantity = toNumberString(single[1]);
        result.contentPerItemUnit = UNIT_MAP[single[2]] || null;
        result.priceBasis = 'package';
        return finalize(result);
    }

    // Stuks: "12 stuks", "12 st", "doos 12"
    const pieces = text.match(/(\d+)\s*(stuks?|stk|st)\b/);
    if (pieces) {
        result.packCount = String(parseInt(pieces[1], 10));
        result.contentPerItemQuantity = '1';
        result.contentPerItemUnit = 'piece';
        result.priceBasis = 'package';
        return finalize(result);
    }

    // Variabel gewicht zonder vaste inhoud.
    if (looksVariable || (perUnit && (perUnit[1] === 'kg' || perUnit[1] === 'liter' || perUnit[1] === 'l'))) {
        result.variableWeight = /kg/.test(text);
        result.priceBasis = perUnit ? mapBasis(perUnit[1]) : 'kg';
        return result;
    }

    return result;
}

function mapBasis(u) {
    if (u === 'kg') return 'kg';
    if (u === 'l' || u === 'liter') return 'liter';
    if (u === 'st' || u === 'stuk') return 'piece';
    return 'unknown';
}

function toNumberString(s) {
    const d = toDecimalString(s);
    if (d === null) return null;
    // strip trailing .00 → hele getallen netjes (330 i.p.v. 330.00), maar behoud decimalen
    const n = Number(d);
    return Number.isInteger(n) ? String(n) : String(n);
}

function finalize(result) {
    // Variabel-gewicht-vlag blijft false voor vaste verpakking.
    return result;
}
