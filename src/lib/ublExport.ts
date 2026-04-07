/* eslint-disable @typescript-eslint/no-explicit-any */
// UBL 2.0 (Universal Business Language) factuur export
// Nederlandse standaard voor e-facturatie (Peppol / NLCIUS)

import type { Factuur, FactuurItem } from '@/types';

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
