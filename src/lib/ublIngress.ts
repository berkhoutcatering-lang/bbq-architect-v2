/**
 * UBL / Peppol BIS 3.0 e-invoice ingress.
 *
 * Pure parser zonder Anthropic-calls. Een gevalideerde UBL-factuur is een
 * deterministische bron: leverancier, items, BTW-bedragen staan exact in de
 * XML. Geen vision-call nodig — dat scheelt €0.03 per bon én het levert
 * 100% confidence op.
 *
 * Ondersteunde formaten (alle gebruiken dezelfde cac:/cbc: namespaces):
 *   - SI-UBL 2.0 (NL Peppol overheid)
 *   - Peppol BIS 3.0 (EU-breed B2B)
 *   - UBL 2.1 Invoice (generiek)
 *   - UBL 2.1 CreditNote (creditnota)
 *
 * Hard rules:
 *   - BTW komt ALTIJD uit cac:TaxCategory/cbc:Percent — niet uit cbc:TaxAmount
 *     gedeeld door TaxableAmount (kan afrondings-ruis geven).
 *   - cbc:Percent wordt door validateBtwPct() gesnapd naar 0/9/21.
 *   - Geen AI-call, dus geen ai_usage row, dus geen cost-cap-check nodig.
 *   - Leverancier-match via matchLeverancier; bij geen match returnt
 *     leverancier_id=null en de UI vraagt om een handmatige selectie.
 */

import { XMLParser } from 'fast-xml-parser';
import { matchInventory } from '@/lib/inventoryDeduction';
import { matchLeverancier, type LeverancierLookup } from '@/lib/bonProcessing';
import { validateBtwPct } from '@/lib/btw-rules';
import type { BonItemRow } from '@/types';

/* ── Type-shapes voor de minimaal benodigde UBL-velden ──────────────── */

export interface UblParseResult {
    /** Was deze XML een valid UBL Invoice / CreditNote? */
    is_ubl: boolean;
    /** Korte reden bij is_ubl=false ("missing-supplier", "invalid-xml", etc). */
    error?: string;

    /* Leverancier-info — direct uit cac:AccountingSupplierParty */
    leverancier_naam: string | null;
    leverancier_kvk: string | null;
    leverancier_btw_nr: string | null;
    /** Match-result tegen tenant's leveranciers-tabel (null = nieuw). */
    matched_leverancier: LeverancierLookup | null;

    /* Factuur-meta */
    invoice_id: string | null;
    datum: string | null;           // YYYY-MM-DD
    valuta: string;                  // ISO 4217 (default EUR)

    /* Regels — al genormaliseerd naar BonItemRow shape */
    items: Array<BonItemRow & {
        inventory_id: number | null;
        inventory_naam: string | null;
        match_confidence: 'high' | 'medium' | 'low' | 'none';
    }>;

    /* Totalen — direct uit cac:LegalMonetaryTotal */
    netto_bedrag: number;            // TaxExclusiveAmount
    totaal_bedrag: number;            // TaxInclusiveAmount
    btw_laag_bedrag: number;          // 9% subtotaal uit cac:TaxSubtotal[]
    btw_hoog_bedrag: number;          // 21% subtotaal uit cac:TaxSubtotal[]

    /** Wordt door extract-route gezet als bonnen.processing_status. */
    suggested_status: 'extracted' | 'committed';
    confidence: number;               // 1.0 voor valide UBL
}

/* ── Detectie ─────────────────────────────────────────────────────── */

const XML_MIMES = new Set([
    'application/xml',
    'text/xml',
    'application/ubl+xml',
    'application/peppol+xml',
]);

/**
 * Bepaal of een file UBL-achtig is op basis van mime en/of filename.
 * Bewust ruim: vangt ook .xml-files die als octet-stream binnenkomen.
 */
export function isLikelyUbl(opts: { mime?: string; filename?: string }): boolean {
    const mime = (opts.mime || '').toLowerCase().split(';')[0].trim();
    if (XML_MIMES.has(mime)) return true;
    const name = (opts.filename || '').toLowerCase();
    return name.endsWith('.xml');
}

/* ── Helpers voor XML-traversal ──────────────────────────────────── */

/**
 * fast-xml-parser geeft of een object (1 child) of een array (N children).
 * Deze helper normaliseert naar altijd-array zodat de loop simpel blijft.
 */
function toArray<T>(v: T | T[] | undefined): T[] {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
}

/**
 * Veilig een geneste waarde lezen. fast-xml-parser unwrapt simpele text-
 * nodes naar string, complexe (met attributes) naar { '#text': string, ... }.
 */
function readText(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
        return String((v as Record<string, unknown>)['#text'] ?? '');
    }
    return '';
}

function readNumber(v: unknown): number {
    const s = readText(v);
    const cleaned = s.replace(/[€$\s]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
}

/* ── Hoofdfunctie ─────────────────────────────────────────────────── */

export interface UblParseOptions {
    /** Lijst van leveranciers voor matchLeverancier. */
    leveranciers: LeverancierLookup[];
    /** Lijst van inventory-items voor matchInventory. */
    inventory: Array<{ id: number; naam: string }>;
    /** Optionele datum-hint van de user (overschrijft IssueDate). */
    datum_hint?: string;
}

/**
 * Parse een UBL Invoice/CreditNote XML-string en return een gestructureerd
 * preview-object dat de extract-route direct kan returnen.
 *
 * Faalt nooit hard: bij parse-error returnt is_ubl:false met een error-veld
 * zodat de caller kan fallbacken naar AI-extractie.
 */
export function parseUbl(xml: string, opts: UblParseOptions): UblParseResult {
    const empty: UblParseResult = {
        is_ubl: false,
        leverancier_naam: null,
        leverancier_kvk: null,
        leverancier_btw_nr: null,
        matched_leverancier: null,
        invoice_id: null,
        datum: null,
        valuta: 'EUR',
        items: [],
        netto_bedrag: 0,
        totaal_bedrag: 0,
        btw_laag_bedrag: 0,
        btw_hoog_bedrag: 0,
        suggested_status: 'extracted',
        confidence: 1.0,
    };

    let parsed: Record<string, unknown>;
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
            removeNSPrefix: true,        // strip cbc:/cac: zodat keys simpel blijven
            parseTagValue: false,         // strings, niet auto-cast (voorkomt locale bugs)
            trimValues: true,
        });
        parsed = parser.parse(xml) as Record<string, unknown>;
    } catch (e) {
        return { ...empty, error: `invalid-xml: ${(e as Error).message}` };
    }

    /* Root element kan Invoice of CreditNote zijn (beide UBL 2.1). */
    const root =
        (parsed.Invoice as Record<string, unknown> | undefined) ||
        (parsed.CreditNote as Record<string, unknown> | undefined);
    if (!root) {
        return { ...empty, error: 'not-an-invoice' };
    }

    /* ── Supplier ───────────────────────────────────────────────── */
    const supplierParty = (
        (root.AccountingSupplierParty as Record<string, unknown> | undefined)?.Party as
            | Record<string, unknown>
            | undefined
    );
    if (!supplierParty) {
        return { ...empty, error: 'missing-supplier' };
    }

    /* PartyName kan een object of array zijn (UBL allows multiple names). */
    const partyName = toArray(supplierParty.PartyName as unknown)[0] as
        | Record<string, unknown>
        | undefined;
    const leverancier_naam = readText(partyName?.Name).trim() || null;

    /* PartyLegalEntity bevat KVK (RegistrationName + CompanyID). */
    const legalEntity = toArray(supplierParty.PartyLegalEntity as unknown)[0] as
        | Record<string, unknown>
        | undefined;
    const leverancier_kvk = readText(legalEntity?.CompanyID).trim() || null;

    /* PartyTaxScheme bevat BTW-nummer (NL-prefix). */
    const taxScheme = toArray(supplierParty.PartyTaxScheme as unknown)[0] as
        | Record<string, unknown>
        | undefined;
    const leverancier_btw_nr = readText(taxScheme?.CompanyID).trim() || null;

    /* Match tegen bestaande leveranciers (fuzzy op naam). */
    const matched = leverancier_naam
        ? matchLeverancier(leverancier_naam, opts.leveranciers)
        : null;

    /* ── Invoice-meta ────────────────────────────────────────────── */
    const invoice_id = readText(root.ID).trim() || null;
    const issueDate = readText(root.IssueDate).trim();
    /* IssueDate is altijd YYYY-MM-DD per UBL spec; valideer alleen format. */
    const datum =
        opts.datum_hint ||
        (/^\d{4}-\d{2}-\d{2}$/.test(issueDate) ? issueDate : null);
    const valuta = readText(root.DocumentCurrencyCode).trim() || 'EUR';

    /* ── Items ────────────────────────────────────────────────── */
    /* Invoice gebruikt InvoiceLine, CreditNote gebruikt CreditNoteLine. */
    const rawLines = toArray(
        (root.InvoiceLine ?? root.CreditNoteLine) as unknown,
    ) as Array<Record<string, unknown>>;

    const items: UblParseResult['items'] = [];
    for (const line of rawLines) {
        const itemBlock = line.Item as Record<string, unknown> | undefined;
        const naam = readText(itemBlock?.Name).trim();
        if (!naam) continue;

        /* InvoicedQuantity heeft @_unitCode attribuut voor eenheid (KGM, EA, ...). */
        const qtyNode = (line.InvoicedQuantity ?? line.CreditedQuantity) as
            | Record<string, unknown>
            | string
            | undefined;
        const aantal = readNumber(qtyNode);
        const unitCode = (
            typeof qtyNode === 'object' && qtyNode != null
                ? readText((qtyNode as Record<string, unknown>)['@_unitCode'])
                : ''
        ).toUpperCase().trim();
        /* UBL unitCode → eigen unit (subset; rest valt op 'stuks'). */
        let unit = 'stuks';
        if (unitCode === 'KGM') unit = 'kg';
        else if (unitCode === 'GRM') unit = 'g';
        else if (unitCode === 'LTR') unit = 'L';
        else if (unitCode === 'MLT') unit = 'ml';
        else if (unitCode === 'EA' || unitCode === 'PCE' || unitCode === 'H87') unit = 'stuks';

        const priceNode = line.Price as Record<string, unknown> | undefined;
        const prijs = readNumber(priceNode?.PriceAmount);

        /* LineExtensionAmount = netto-totaal per regel (excl BTW). */
        const lineNet = readNumber(line.LineExtensionAmount);

        /* BTW-percentage UIT cac:Item/cac:ClassifiedTaxCategory/cbc:Percent.
           Fallback: cac:TaxCategory direct op de line (sommige varianten). */
        const taxCategory =
            (itemBlock?.ClassifiedTaxCategory as Record<string, unknown> | undefined) ||
            (line.TaxCategory as Record<string, unknown> | undefined);
        const rawPct = readNumber(taxCategory?.Percent);
        const btw_pct = validateBtwPct(rawPct);

        /* totaal = inclusief BTW (UI verwacht dat). */
        const totaal_incl = lineNet * (1 + btw_pct / 100);

        const matchedInv = matchInventory(naam, opts.inventory);
        let confidence: 'high' | 'medium' | 'low' | 'none' = 'none';
        if (matchedInv) {
            const t = naam.toLowerCase().trim();
            const m = matchedInv.naam.toLowerCase().trim();
            if (t === m) confidence = 'high';
            else if (t.includes(m) || m.includes(t)) confidence = 'medium';
            else confidence = 'low';
        }

        items.push({
            naam,
            aantal: aantal > 0 ? aantal : 1,
            unit,
            prijs,
            btw_pct,
            totaal: Math.round(totaal_incl * 100) / 100,
            inventory_id: matchedInv ? Number(matchedInv.id) : null,
            inventory_naam: matchedInv ? matchedInv.naam : null,
            match_confidence: confidence,
        });
    }

    /* ── Totalen + BTW-subtotalen ──────────────────────────────── */
    const legalTotal = root.LegalMonetaryTotal as Record<string, unknown> | undefined;
    const netto_bedrag = readNumber(legalTotal?.TaxExclusiveAmount);
    const totaal_bedrag = readNumber(legalTotal?.TaxInclusiveAmount);

    /* cac:TaxTotal/cac:TaxSubtotal[] — één per tarief. */
    const taxTotalNode = toArray(root.TaxTotal as unknown)[0] as
        | Record<string, unknown>
        | undefined;
    const subtotals = toArray(taxTotalNode?.TaxSubtotal as unknown) as Array<
        Record<string, unknown>
    >;

    let btw_laag_bedrag = 0;
    let btw_hoog_bedrag = 0;
    for (const sub of subtotals) {
        const subCategory = sub.TaxCategory as Record<string, unknown> | undefined;
        const pct = validateBtwPct(readNumber(subCategory?.Percent));
        const bedrag = readNumber(sub.TaxAmount);
        if (pct === 9) btw_laag_bedrag += bedrag;
        else if (pct === 21) btw_hoog_bedrag += bedrag;
        /* pct=0 → vrijgesteld, geen optelling. */
    }

    return {
        is_ubl: true,
        leverancier_naam,
        leverancier_kvk,
        leverancier_btw_nr,
        matched_leverancier: matched,
        invoice_id,
        datum,
        valuta,
        items,
        netto_bedrag: Math.round(netto_bedrag * 100) / 100,
        totaal_bedrag: Math.round(totaal_bedrag * 100) / 100,
        btw_laag_bedrag: Math.round(btw_laag_bedrag * 100) / 100,
        btw_hoog_bedrag: Math.round(btw_hoog_bedrag * 100) / 100,
        /* Bij volledig valide UBL: alle leverancier-velden + ≥1 item met BTW gevonden
           → status mag 'committed' worden (Sam wil "instant fill"). Anders 'extracted'
           voor user-review. */
        suggested_status:
            !!leverancier_naam && items.length > 0 && totaal_bedrag > 0
                ? 'committed'
                : 'extracted',
        confidence: 1.0,
    };
}
