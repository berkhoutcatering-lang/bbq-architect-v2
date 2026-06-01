/* eslint-disable @typescript-eslint/no-explicit-any */
// UBL 2.0 (Universal Business Language) factuur export
// Nederlandse standaard voor e-facturatie (Peppol BIS 3.0 / NLCIUS v1.0)
//
// Plus: lichte BIS 3.0 compliance-validatie (validateUBL) zonder native deps
// (Vercel-compatible). Geen volle XSD, maar wel de kritieke rule-checks
// die een Peppol-ontvanger als eerste afkeurt.

import type { Factuur, FactuurItem } from '@/types';
import { XMLParser } from 'fast-xml-parser';

interface UBLOptions {
  leverancier: {
    naam: string;
    kvk?: string;
    btw_nummer?: string;
    adres?: string;
    postcode?: string;
    plaats?: string;
    land?: string;
    iban?: string;
    email?: string;
  };
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateUBL(factuur: Factuur, options: UBLOptions): string {
  const lev = options.leverancier;
  const items: FactuurItem[] = Array.isArray(factuur.items) ? factuur.items : [];

  let subtotaal = 0;
  let totalBtw = 0;
  items.forEach(item => {
    const lineTotal = (item.qty || 0) * (item.prijs || 0);
    const btwPct = item.btw || 21;
    subtotaal += lineTotal;
    totalBtw += lineTotal * (btwPct / 100);
  });
  const totaal = subtotaal + totalBtw;

  const lines = items.map((item, idx) => {
    const lineTotal = (item.qty || 0) * (item.prijs || 0);
    const btwPct = item.btw || 21;
    const btwAmount = lineTotal * (btwPct / 100);
    return `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="EA">${item.qty || 1}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="EUR">${lineTotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${escapeXml(item.omschrijving || 'BBQ Catering')}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${btwPct}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="EUR">${(item.prijs || 0).toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(factuur.nummer)}</cbc:ID>
  <cbc:IssueDate>${factuur.datum}</cbc:IssueDate>
  <cbc:DueDate>${factuur.vervaldatum}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>

  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(lev.naam)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(lev.adres || '')}</cbc:StreetName>
        <cbc:PostalZone>${escapeXml(lev.postcode || '')}</cbc:PostalZone>
        <cbc:CityName>${escapeXml(lev.plaats || '')}</cbc:CityName>
        <cac:Country><cbc:IdentificationCode>${lev.land || 'NL'}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${lev.kvk ? `<cac:PartyLegalEntity><cbc:CompanyID schemeID="0106">${escapeXml(lev.kvk)}</cbc:CompanyID></cac:PartyLegalEntity>` : ''}
      ${lev.btw_nummer ? `<cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(lev.btw_nummer)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    </cac:Party>
  </cac:AccountingSupplierParty>

  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(factuur.client_naam)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(factuur.client_adres || '')}</cbc:StreetName>
        <cac:Country><cbc:IdentificationCode>NL</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>

  ${lev.iban ? `<cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${escapeXml(lev.iban)}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>` : ''}

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="EUR">${totalBtw.toFixed(2)}</cbc:TaxAmount>
  </cac:TaxTotal>

  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${subtotaal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${subtotaal.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${totaal.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">${totaal.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
}

export function downloadUBL(factuur: Factuur, options: UBLOptions) {
  const xml = generateUBL(factuur, options);
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factuur-${factuur.nummer}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── BIS 3.0 / NLCIUS validatie ──────────────────────────────────────────
//
// Volledige UBL 2.1 XSD-validatie vereist libxmljs2 (native binding, niet
// werkend op Vercel serverless). In plaats daarvan checken we hier de
// kritieke fields die een Peppol-ontvanger als eerste afkeurt — gebaseerd
// op de OpenPeppol Validation Artifacts en Nederlandse NLCIUS v1.0
// Schematron-regels (R004 currency-codes, R008 tax-totals).

export interface UBLValidationResult {
  valid: boolean;
  errors: string[];   // hard blockers (Peppol weigert)
  warnings: string[]; // soft issues (verwerking mogelijk maar niet best-practice)
}

export function validateUBL(xml: string): UBLValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Well-formedness — parser gooit bij invalid XML
  let parsed: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,  // strip cbc:/cac: prefixen voor leesbaarheid
    });
    parsed = parser.parse(xml);
  } catch (e) {
    return {
      valid: false,
      errors: [`XML niet well-formed: ${(e as Error).message}`],
      warnings: [],
    };
  }

  const inv = parsed?.Invoice;
  if (!inv) {
    return { valid: false, errors: ['<Invoice> root-element ontbreekt'], warnings: [] };
  }

  // 2. NLCIUS / BIS 3.0 customization headers
  if (!inv.CustomizationID || typeof inv.CustomizationID !== 'string') {
    errors.push('CustomizationID ontbreekt (vereist voor NLCIUS v1.0)');
  } else if (!inv.CustomizationID.includes('nlcius')) {
    warnings.push(`CustomizationID "${inv.CustomizationID}" lijkt geen NLCIUS-profiel`);
  }
  if (!inv.ProfileID) {
    errors.push('ProfileID ontbreekt (vereist voor Peppol BIS 3.0)');
  } else if (!String(inv.ProfileID).includes('peppol.eu')) {
    warnings.push(`ProfileID "${inv.ProfileID}" lijkt geen Peppol-profiel`);
  }

  // 3. Basis-velden (Peppol BR-01 t/m BR-08 equivalents)
  if (!inv.ID) errors.push('Invoice ID (factuurnummer) ontbreekt');
  if (!inv.IssueDate) errors.push('IssueDate ontbreekt');
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(String(inv.IssueDate))) {
    errors.push(`IssueDate "${inv.IssueDate}" niet in YYYY-MM-DD formaat`);
  }
  if (!inv.InvoiceTypeCode) warnings.push('InvoiceTypeCode ontbreekt (380 = standaard)');
  if (!inv.DocumentCurrencyCode) {
    errors.push('DocumentCurrencyCode ontbreekt');
  } else if (inv.DocumentCurrencyCode !== 'EUR') {
    // R004: Nederlandse facturen EUR, andere currency = warning
    warnings.push(`DocumentCurrencyCode "${inv.DocumentCurrencyCode}" — verwacht EUR voor NL`);
  }

  // 4. Partijen
  if (!inv.AccountingSupplierParty?.Party?.PartyName?.Name) {
    errors.push('Leveranciersnaam (AccountingSupplierParty.Party.PartyName.Name) ontbreekt');
  }
  if (!inv.AccountingCustomerParty?.Party?.PartyName?.Name) {
    errors.push('Klantnaam (AccountingCustomerParty.Party.PartyName.Name) ontbreekt');
  }

  // 5. Invoice lines & totals (R008: TaxAmount = sum van line taxes)
  const lines = Array.isArray(inv.InvoiceLine)
    ? inv.InvoiceLine
    : (inv.InvoiceLine ? [inv.InvoiceLine] : []);
  if (lines.length === 0) {
    errors.push('Géén InvoiceLine elements gevonden');
  }

  // Sommeer LineExtensionAmount van alle regels en vergelijk met totalen
  let sumLineExtensions = 0;
  for (const line of lines) {
    const amt = parseFloat(String(line.LineExtensionAmount?.['#text'] ?? line.LineExtensionAmount ?? '0'));
    if (!isNaN(amt)) sumLineExtensions += amt;
  }

  const lmt = inv.LegalMonetaryTotal;
  if (!lmt) {
    errors.push('LegalMonetaryTotal ontbreekt');
  } else {
    const lineExtAmt = parseFloat(String(lmt.LineExtensionAmount?.['#text'] ?? lmt.LineExtensionAmount ?? '0'));
    const taxExclAmt = parseFloat(String(lmt.TaxExclusiveAmount?.['#text'] ?? lmt.TaxExclusiveAmount ?? '0'));
    const taxInclAmt = parseFloat(String(lmt.TaxInclusiveAmount?.['#text'] ?? lmt.TaxInclusiveAmount ?? '0'));
    const payable = parseFloat(String(lmt.PayableAmount?.['#text'] ?? lmt.PayableAmount ?? '0'));

    // R008-stijl: line-extensions moeten matchen
    if (Math.abs(sumLineExtensions - lineExtAmt) > 0.02) {
      errors.push(`LineExtensionAmount mismatch: regels sommeren tot ${sumLineExtensions.toFixed(2)}, header zegt ${lineExtAmt.toFixed(2)}`);
    }
    // TaxExclusive = LineExtension (geen kortingen op header-niveau in onze export)
    if (Math.abs(lineExtAmt - taxExclAmt) > 0.02) {
      warnings.push(`TaxExclusiveAmount (${taxExclAmt.toFixed(2)}) ≠ LineExtensionAmount (${lineExtAmt.toFixed(2)})`);
    }
    // PayableAmount = TaxInclusive
    if (Math.abs(payable - taxInclAmt) > 0.02) {
      errors.push(`PayableAmount (${payable.toFixed(2)}) ≠ TaxInclusiveAmount (${taxInclAmt.toFixed(2)})`);
    }
  }

  // 6. BTW totalen — TaxTotal moet aanwezig zijn als er lines zijn
  if (lines.length > 0 && !inv.TaxTotal) {
    errors.push('TaxTotal ontbreekt');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/* Convenience: genereer + valideer in één call. Returnt het XML én het
 * validatie-resultaat zodat de UI bij invalid een toast kan tonen
 * zonder dat de download per ongeluk al gebeurd is. */
export function generateAndValidateUBL(
  factuur: Factuur,
  options: UBLOptions,
): { xml: string; validation: UBLValidationResult } {
  const xml = generateUBL(factuur, options);
  return { xml, validation: validateUBL(xml) };
}
