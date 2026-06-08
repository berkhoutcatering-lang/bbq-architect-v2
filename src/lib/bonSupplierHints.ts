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
        hint: `Bon is een FACTUUR van Sligro. KRITIEK: prices_include_btw=false.
Sligro-factuur heeft kolommen: [artnr | groep | besteld | geleverd | verpakking | inhoud | omschrijving | b/t/w | E.M. | prijs | bedrag].
- De "bedrag"-kolom is EXCLUSIEF BTW. BTW wordt onderaan apart getoond per tarief (laag/hoog).
- Geef item.totaal exact zoals in "bedrag"-kolom staat — niet zelf vermenigvuldigen met BTW.
- b/t/w kolom: L = laag (9%), H = hoog (21%) → zet btw_pct: 9 of 21 per regel.
- Negeer "Subtotaal", "Totaal", "Gegeven", "Wisselgeld", "TRANSPORT" — geen items.
- Statiegeld + emballage = wél items, ze staan met L/H aangegeven.
- Bij "retour"/"creditregel" → totaal negatief teruggeven.
- Lange artikel-omschrijvingen kunnen over 2 regels gaan (zoals "No waste, 30% korting" of "Van X voor Y") — combineer in 1 item.
- Footer-rij heeft "goederen hoog % btw" / "btw hoog %" / "goederen laag % btw" / "btw laag %" → dit BEVESTIGT prices_include_btw=false.`,
    },
    {
        key: 'hanos',
        displayName: 'Hanos',
        matchPatterns: ['hanos'],
        hint: `Bon is een FACTUUR van Hanos. KRITIEK: prices_include_btw=false.
- Bedrag-kolom is EXCLUSIEF BTW (zoals Sligro). BTW staat onderaan apart per tarief.
- Geef item.totaal exact uit "bedrag"-kolom; niet zelf BTW oprekenen.
- Negeer subtotalen + kortings-regels.
- "Statiegeld retour" → negatieve item-regel.`,
    },
    {
        key: 'makro',
        displayName: 'Makro',
        matchPatterns: ['makro', 'metro'],
        hint: `Bon is een KASSABON van Makro/Metro. prices_include_btw=true.
- Kassabonnen zijn smal (thermisch papier) — vaak vervaagd.
- Bedragen per regel zijn INCLUSIEF BTW.
- Bovenaan staat "BON" of "FACTUUR" + bon-nummer — negeer dat als item.
- Onderaan staat "BTW 9% / BTW 21%" sub-totaal blok — negeer dat als items.
- Productnaam staat soms in HOOFDLETTERS afgekort — neem letterlijk over.`,
    },
    {
        key: 'bidfood',
        displayName: 'Bidfood',
        matchPatterns: ['bidfood', 'deli xl', 'deli-xl'],
        hint: `Bon is een FACTUUR van Bidfood (voorheen Deli XL). KRITIEK: prices_include_btw=false.
- Bedrag-kolom is EXCLUSIEF BTW. BTW apart onderaan per tarief.
- Items per pallet/doos — "aantal × inhoud" patroon (bv. "6 × 1kg" = 6 stuks van 1 kg elk; aantal=6, eenheid="stuks").
- Statiegeld/emballage in aparte sectie onderaan — wel meenemen.`,
    },
    {
        key: 'crisp',
        displayName: 'Crisp',
        matchPatterns: ['crisp'],
        hint: `Bon is een KASSABON van Crisp (online supermarkt). prices_include_btw=true.
- Items hebben vaak gewicht IN de productnaam (bv. "Biefstuk 200g"). Aantal = 1, eenheid = "stuks".
- Bedrag is INCLUSIEF BTW per regel.
- Bezorgkosten zijn een item-regel onderaan (BTW 21%).`,
    },
    {
        key: 'agf',
        displayName: 'AGF Suijkerbuijk',
        matchPatterns: ['suijkerbuijk', 'agf'],
        hint: `Bon is meestal een FACTUUR van een AGF-groothandel (groente/fruit). prices_include_btw=false (tenzij duidelijk een kassabon).
- Bedrag-kolom is meestal EXCLUSIEF BTW; BTW staat apart onderaan.
- Items in kg of stuks per krat — "10kg" of "1 krat" patroon.
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
