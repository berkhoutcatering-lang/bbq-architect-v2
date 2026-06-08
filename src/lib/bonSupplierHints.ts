/**
 * Supplier-specifieke layout-hints voor bon-extractie.
 *
 * Probleem: een generieke prompt levert bij Sligro (multi-koloms factuur,
 * lange artnr's, subtotaal-regels) en Hanos (vergelijkbare layout) regelmatig
 * verkeerde extracties op. Door de leverancier-naam vooraf te detecteren en
 * een korte layout-hint mee te geven, stuurt het model zichzelf bij.
 *
 * De hints zijn KORT (1-3 zinnen) en zeggen alleen wat NIET vanzelf uit een
 * generieke bon-prompt komt: kolom-volgorde, omgang met subtotalen, bekende
 * randgevallen (statiegeld, korting, retour).
 *
 * Veiligheid: hints zijn server-controlled constants. User-content (leverancier-
 * naam uit AI-output) wordt alleen gebruikt als KEY in deze lookup — niet als
 * onderdeel van de prompt-string zelf. Dat voorkomt prompt-injection via een
 * geknoeide bon-foto.
 */

export interface SupplierHint {
    /** Canonical key — lowercase, simpel. */
    key: string;
    /** Display-naam voor in de prompt-tekst (controlled by us, not user). */
    displayName: string;
    /** Match-patroon op leverancier-naam — case-insensitive substring. */
    matchPatterns: string[];
    /** De daadwerkelijke prompt-snippet. Wordt gewoon in system prompt geappend. */
    hint: string;
}

/* ── Top-6 NL groothandels + ad-hoc patterns ─────────────────────────── */
const SUPPLIER_HINTS: SupplierHint[] = [
    {
        key: 'sligro',
        displayName: 'Sligro',
        matchPatterns: ['sligro'],
        hint: `Bon lijkt van Sligro. Sligro-facturen hebben kolommen: [artnr | omschrijving | aantal | eenheid | netto/stuk | totaal | btw%]. Belangrijke regels:
- Negeer "Subtotaal", "Totaal incl BTW" en kortings-regels — die zijn GEEN items.
- Statiegeld + emballage zijn aparte regels — wél meenemen als items met btw_pct: 9 of 21 zoals op de bon.
- Bij "retour"/"creditregel" → aantal of totaal negatief teruggeven (niet positief).
- Lange artikel-omschrijvingen kunnen over 2 regels gaan — combineer ze.`,
    },
    {
        key: 'hanos',
        displayName: 'Hanos',
        matchPatterns: ['hanos'],
        hint: `Bon lijkt van Hanos. Hanos-facturen lijken op Sligro: multi-koloms met artnr. Belangrijke regels:
- Negeer subtotalen + kortings-regels.
- Hanos toont prijs vaak ex-BTW per stuk; "totaal" kolom is incl BTW.
- Pas op met "statiegeld retour" → negatieve item-regel.`,
    },
    {
        key: 'makro',
        displayName: 'Makro',
        matchPatterns: ['makro', 'metro'],
        hint: `Bon lijkt van Makro/Metro. Makro-kassabonnen zijn smal (thermisch papier) — vaak vervaagd. Belangrijke regels:
- Bovenaan staat "BON" of "FACTUUR" + bon-nummer — negeer dat als item.
- Onderaan staat "BTW 9% / BTW 21%" sub-totaal blok — negeer dat als items.
- Productnaam staat soms in HOOFDLETTERS afgekort — neem letterlijk over.`,
    },
    {
        key: 'bidfood',
        displayName: 'Bidfood',
        matchPatterns: ['bidfood', 'deli xl', 'deli-xl'],
        hint: `Bon lijkt van Bidfood (voorheen Deli XL). Belangrijke regels:
- Items per pallet/doos — "aantal × inhoud" patroon (bv. "6 × 1kg" = 6 stuks van 1 kg elk; geef aantal=6, eenheid="stuks" terug).
- Statiegeld/emballage in aparte sectie onderaan — wel meenemen.`,
    },
    {
        key: 'crisp',
        displayName: 'Crisp',
        matchPatterns: ['crisp'],
        hint: `Bon lijkt van Crisp (online supermarkt). Belangrijke regels:
- Items hebben vaak gewicht IN de productnaam (bv. "Biefstuk 200g"). Aantal = 1, eenheid = "stuks".
- Bezorgkosten zijn een item-regel onderaan (BTW 21%).`,
    },
    {
        key: 'agf',
        displayName: 'AGF Suijkerbuijk',
        matchPatterns: ['suijkerbuijk', 'agf'],
        hint: `Bon lijkt van een AGF-groothandel (groente/fruit). Belangrijke regels:
- Veel items in kg of stuks per krat — "10kg" of "1 krat" patroon.
- BTW vrijwel altijd 9% (food).`,
    },
];

/**
 * Detecteer of de leverancier-naam uit de extract-output overeenkomt met een
 * bekende supplier-hint. Returnt null als generieke prompt prima volstaat.
 */
export function findSupplierHint(leverancierNaam: string | null | undefined): SupplierHint | null {
    if (!leverancierNaam) return null;
    const norm = leverancierNaam.toLowerCase().trim();
    for (const h of SUPPLIER_HINTS) {
        for (const pat of h.matchPatterns) {
            if (norm.includes(pat)) return h;
        }
    }
    return null;
}

/**
 * Voor de UI: lijst van bekende leverancier-namen zodat we kunnen tonen
 * "tip: deze scanner is geoptimaliseerd voor [Sligro, Hanos, Makro, ...]".
 */
export function listKnownSuppliers(): string[] {
    return SUPPLIER_HINTS.map(h => h.displayName);
}
