/**
 * Voice-HACCP parser — Pillar #4 (Lars-persona).
 *
 * Web Speech API transcribeert spraak ("kerntemp kip vijfenzeventig graden"),
 * deze parser zet het om in een HACCP-record. Pure-functie zodat we het
 * makkelijk kunnen testen zonder microfoon.
 *
 * Strategie: regex + keyword-detection. Bewust geen AI-call — we willen
 * <100ms response (vs Anthropic ~2s) zodat Lars in field-flow blijft.
 * Onbekende input → null = fallback naar handmatig formulier.
 */

const CHECK_TYPE_KEYWORDS: Record<string, RegExp> = {
    koeling: /\b(koel(ing|kast)|frigo)\b/i,
    vriezer: /\bvriez(er|en|ing)\b/i,
    kerntemp: /\b(kern[\s-]?temp|kerntemperatuur)\b/i,
    serveer: /\b(serveer|uitserveer|uitgifte|bereik)\b/i,
};

/** Productnaam-aliases naar canonieke naam (uit /haccp/field PRESETS). */
const PRODUCT_KEYWORDS: Array<[RegExp, string]> = [
    [/\bkip\b/i, 'Kip'],
    [/\bvis\b/i, 'Vis'],
    [/\b(rund|biefstuk|brisket|entrecote|ribeye)\b/i, 'Rundvlees'],
    [/\b(varken|pork|spareribs|pulled\s*pork)\b/i, 'Varkensvlees'],
    [/\b(salade|coleslaw)\b/i, 'Salade'],
    [/\b(dessert|toetje|pavlova|mousse|tiramisu)\b/i, 'Dessert'],
];

/** Schrijftaal-cijfers naar getallen. */
const NUMBER_WORDS: Record<string, number> = {
    nul: 0, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9,
    tien: 10, elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15, zestien: 16,
    zeventien: 17, achttien: 18, negentien: 19, twintig: 20,
    dertig: 30, veertig: 40, vijftig: 50, zestig: 60, zeventig: 70, tachtig: 80, negentig: 90,
};

const TEN_SUFFIXES: Array<[string, number]> = [
    ['twintig', 20], ['dertig', 30], ['veertig', 40], ['vijftig', 50],
    ['zestig', 60], ['zeventig', 70], ['tachtig', 80], ['negentig', 90],
];

/**
 * Parse Nederlandse getal-uitdrukking → number. Werkt voor:
 *   - "25", "25.5", "-3"
 *   - "vijfentwintig", "drieenzeventig"
 *   - "vijfentwintig komma drie"
 *   - "min vijf"
 */
export function parseDutchNumber(input: string): number | null {
    const s = input.trim().toLowerCase();
    if (!s) return null;

    // Digits eerst
    const m = s.match(/-?\d+([.,]\d+)?/);
    if (m) return parseFloat(m[0].replace(',', '.'));

    // "min X" / "minus X"
    let sign = 1;
    let rest = s;
    if (/^(min|minus|minder)\s+/.test(rest)) {
        sign = -1;
        rest = rest.replace(/^(min|minus|minder)\s+/, '');
    }

    // "X komma Y" → X.Y
    const kommaMatch = rest.match(/^(.+?)\s+komma\s+(.+)$/);
    if (kommaMatch) {
        const whole = parseDutchNumber(kommaMatch[1]);
        const dec = parseDutchNumber(kommaMatch[2]);
        if (whole != null && dec != null) {
            return sign * (whole + dec / Math.pow(10, String(Math.abs(Math.round(dec))).length));
        }
    }

    // Direct in tabel
    if (rest in NUMBER_WORDS) return sign * NUMBER_WORDS[rest];

    // Patroon: "vijfentwintig" = vijf + en + twintig
    const enMatch = rest.match(/^(\w+?)en(\w+?)$/);
    if (enMatch) {
        const ones = NUMBER_WORDS[enMatch[1]];
        const tens = TEN_SUFFIXES.find(function ([w]) { return w === enMatch[2]; })?.[1];
        if (typeof ones === 'number' && typeof tens === 'number') {
            return sign * (tens + ones);
        }
    }

    // Patroon: "zeventig" alleen
    const tens = TEN_SUFFIXES.find(function ([w]) { return rest === w; })?.[1];
    if (typeof tens === 'number') return sign * tens;

    return null;
}

export interface VoiceHaccpResult {
    wat: string | null;
    temp: number | null;
    check_type: keyof typeof CHECK_TYPE_KEYWORDS | null;
    confidence: number; // 0..1
    matchedText: string;
}

/**
 * Parse een Nederlandse spraak-transcript naar HACCP-record-velden.
 * Voorbeelden die werken:
 *   - "kerntemp kip vijfenzeventig graden"        → {wat:'Kip', temp:75, check_type:'kerntemp'}
 *   - "koeling vis twee graden"                   → {wat:'Vis', temp:2, check_type:'koeling'}
 *   - "min achttien vriezer dessert"              → {wat:'Dessert', temp:-18, check_type:'vriezer'}
 *
 * Faalmodus: returnt confidence < 0.5, frontend toont fallback-formulier.
 */
export function parseVoiceHaccp(transcript: string): VoiceHaccpResult {
    const text = (transcript || '').trim().replace(/[°]/g, '').replace(/\s+/g, ' ');
    const lower = text.toLowerCase();

    // Detect check-type
    let checkType: keyof typeof CHECK_TYPE_KEYWORDS | null = null;
    for (const [type, re] of Object.entries(CHECK_TYPE_KEYWORDS)) {
        if (re.test(lower)) { checkType = type as keyof typeof CHECK_TYPE_KEYWORDS; break; }
    }

    // Detect product
    let wat: string | null = null;
    for (const [re, canonical] of PRODUCT_KEYWORDS) {
        if (re.test(lower)) { wat = canonical; break; }
    }

    // Detect temperatuur: probeer eerst expliciet "<getal> graden"
    let temp: number | null = null;
    const gradenMatch = lower.match(/(-?\d+([.,]\d+)?)\s*graden/);
    if (gradenMatch) {
        temp = parseFloat(gradenMatch[1].replace(',', '.'));
    } else {
        // Probeer een getal-woord direct
        const tokens = lower.split(/\s+/);
        for (let i = 0; i < tokens.length; i++) {
            // "min X graden"
            if ((tokens[i] === 'min' || tokens[i] === 'minus') && i + 1 < tokens.length) {
                const n = parseDutchNumber(tokens[i] + ' ' + tokens[i + 1]);
                if (n != null) { temp = n; break; }
            }
            const n = parseDutchNumber(tokens[i]);
            if (n != null && Math.abs(n) <= 200) { temp = n; break; }
        }
    }

    // Confidence-score: alle 3 velden gevonden = 1.0, anders weighted.
    let confidence = 0;
    if (checkType) confidence += 0.4;
    if (wat) confidence += 0.3;
    if (temp != null) confidence += 0.3;

    return { wat, temp, check_type: checkType, confidence, matchedText: text };
}
