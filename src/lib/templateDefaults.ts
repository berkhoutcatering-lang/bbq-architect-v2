// =============================================
// PDF Template Builder — Default Template Configs
// Replicates the current hardcoded output from pdfGenerator.ts
// =============================================

import type { TemplateBlock, PageSettings, BlockPaletteItem } from '@/types/template.types';

// ── Page Settings ──

const PAGE_WHITE: PageSettings = {
  format: 'a4', orientation: 'portrait',
  margins: { top: 15, right: 15, bottom: 20, left: 15 },
  backgroundColor: '#ffffff',
};

const PAGE_DARK: PageSettings = {
  format: 'a4', orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundColor: '#121212',
};

// ── Helper: generate block IDs ──
let _counter = 0;
function bid(): string { return 'blk_' + (++_counter).toString(36); }

// ── Factuur Default ──
export const FACTUUR_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 60, maxHeight: 25, alignment: 'center' },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 1 },
  { id: bid(), type: 'text', content: '{{bedrijf_adres}} | {{bedrijf_telefoon}} | {{bedrijf_email}}', fontSize: 7, fontWeight: 'normal', fontStyle: 'normal', color: '#999999', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'text', content: 'KvK: {{kvk}} | BTW: {{btw_nr}} | IBAN: {{iban}}', fontSize: 7, fontWeight: 'normal', fontStyle: 'normal', color: '#999999', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'document_badge', text: 'F A C T U U R', backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 14 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Aan', bold: true, visible: true },
    { key: 'client_adres', label: '', bold: false, visible: true },
    { key: 'nummer', label: 'Factuurnummer', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'vervaldatum', label: 'Vervaldatum', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 38, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 10, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 13, alignment: 'right' },
    { key: 'btw', label: 'BTW%', width: 10, alignment: 'center' },
    { key: 'prijs_incl_btw', label: 'Prijs incl. BTW', width: 15, alignment: 'right' },
    { key: 'totaal', label: 'Totaal', width: 14, alignment: 'right' },
  ], headerStyle: { backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: false },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'payment_details', content: 'Betaling graag binnen {{betaalvoorwaarden}} overmaken naar:\nIBAN: {{iban}}\nt.n.v. {{bedrijfsnaam}}', backgroundColor: '#f8f8f8', borderColor: 'brand_primary', fontSize: 9, conditions: [{ field: 'document_type', operator: 'eq', value: 'factuur' }] },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'footer', content: '{{bedrijfsnaam}} | {{bedrijf_adres}} | {{bedrijf_email}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: true, borderColor: 'brand_primary' },
];

// ── Offerte Default ──
export const OFFERTE_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 60, maxHeight: 25, alignment: 'center' },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 1 },
  { id: bid(), type: 'text', content: '{{bedrijf_adres}} | {{bedrijf_telefoon}} | {{bedrijf_email}}', fontSize: 7, fontWeight: 'normal', fontStyle: 'normal', color: '#999999', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'document_badge', text: 'O F F E R T E', backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 14 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Aan', bold: true, visible: true },
    { key: 'client_adres', label: '', bold: false, visible: true },
    { key: 'nummer', label: 'Offertenummer', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'geldig_tot', label: 'Geldig tot', bold: false, visible: true },
    { key: 'aantal_gasten', label: 'Aantal gasten', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'menu', layout: '2col', gangTitleStyle: { fontSize: 11, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 9, color: '#333333' }, dishDescStyle: { fontSize: 8, color: '#666666', fontStyle: 'italic' }, showDescriptions: false, gangSeparator: 'line' },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 38, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 10, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 13, alignment: 'right' },
    { key: 'btw', label: 'BTW%', width: 10, alignment: 'center' },
    { key: 'prijs_incl_btw', label: 'Prijs incl. BTW', width: 15, alignment: 'right' },
    { key: 'totaal', label: 'Totaal', width: 14, alignment: 'right' },
  ], headerStyle: { backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: false },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'footer', content: '{{bedrijfsnaam}} | {{bedrijf_adres}} | {{bedrijf_email}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: true, borderColor: 'brand_primary' },
];

// ── Menukaart Default ──
export const MENUKAART_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'spacer', height: 15 },
  { id: bid(), type: 'logo', variant: 'dark', maxWidth: 70, maxHeight: 30, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 5 },
  { id: bid(), type: 'divider', style: 'solid', color: '#c4a35a', thickness: 0.5 },
  { id: bid(), type: 'spacer', height: 5 },
  { id: bid(), type: 'text', content: '{{ondertitel}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'italic', color: '#c4a35a', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 13, fontWeight: 'bold', color: '#c4a35a', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 10, color: '#e8e0d0' }, dishDescStyle: { fontSize: 8, color: '#999999', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 15 },
  { id: bid(), type: 'divider', style: 'solid', color: '#c4a35a', thickness: 0.5 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 8, fontWeight: 'normal', fontStyle: 'normal', color: '#666666', alignment: 'center', lineHeight: 1.4 },
];

// ── HACCP Default ──
export const HACCP_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 50, maxHeight: 20, alignment: 'left' },
  { id: bid(), type: 'document_badge', text: 'HACCP RAPPORT', backgroundColor: '#c83232', textColor: '#ffffff', fontSize: 14 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'text', content: 'Datum: {{haccp_datum}}', fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'haccp_table', columns: [
    { key: 'tijd', label: 'Tijd', width: 12, alignment: 'center' },
    { key: 'wat', label: 'Product', width: 30, alignment: 'left' },
    { key: 'type', label: 'Type', width: 15, alignment: 'center' },
    { key: 'temp', label: 'Temp (°C)', width: 15, alignment: 'center' },
    { key: 'status', label: 'Status', width: 15, alignment: 'center' },
    { key: 'notitie', label: 'Notitie', width: 13, alignment: 'left' },
  ], headerColor: '#c83232', statusColors: { ok: '#22c55e', warn: '#f59e0b', danger: '#ef4444' } },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'footer', content: 'Digitaal HACCP rapport — {{bedrijfsnaam}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: false, borderColor: '#999999' },
];

// ── Bon Default ──
export const BON_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 40, maxHeight: 15, alignment: 'left' },
  { id: bid(), type: 'document_badge', text: 'BON / KASSATICKET', backgroundColor: '#333333', textColor: '#ffffff', fontSize: 12 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: 'Winkel: {{winkel}}\nDatum: {{datum}}\nTotaal: {{bon_totaal}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.6 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 50, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 15, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 20, alignment: 'right' },
    { key: 'btw', label: 'BTW', width: 15, alignment: 'center' },
  ], headerStyle: { backgroundColor: '#333333', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: true },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'image', src: '{{receipt_image}}', maxWidth: 160, maxHeight: 200, alignment: 'center' },
];

// ── All Defaults ──
export const DEFAULT_TEMPLATES: Record<string, { blocks: TemplateBlock[]; pageSettings: PageSettings; name: string }> = {
  factuur: { blocks: FACTUUR_BLOCKS, pageSettings: PAGE_WHITE, name: 'Standaard Factuur' },
  offerte: { blocks: OFFERTE_BLOCKS, pageSettings: PAGE_WHITE, name: 'Standaard Offerte' },
  menukaart: { blocks: MENUKAART_BLOCKS, pageSettings: PAGE_DARK, name: 'Standaard Menukaart' },
  haccp: { blocks: HACCP_BLOCKS, pageSettings: PAGE_WHITE, name: 'Standaard HACCP Rapport' },
  bon: { blocks: BON_BLOCKS, pageSettings: PAGE_WHITE, name: 'Standaard Bon' },
};

// ─────────────────────────────────────────────────────────────
// Starter Templates — 3 varianten per document type om goed te beginnen.
// Flow-mode arrays: worden auto-gemigreerd naar absolute layout bij openen.
// ─────────────────────────────────────────────────────────────

const PAGE_CREAM: PageSettings = {
  format: 'a4', orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundColor: '#faf7f0',
};

// ══ FACTUUR varianten ══

const FACTUUR_MODERN_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'shape', shape: 'rectangle', fillColor: 'brand_primary', strokeColor: 'none', strokeWidth: 0, cornerRadius: 0, opacity: 1 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 55, maxHeight: 22, alignment: 'left' },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'document_badge', text: 'F A C T U U R', backgroundColor: '#1a1a1a', textColor: '#ffffff', fontSize: 13 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Aan', bold: true, visible: true },
    { key: 'client_adres', label: '', bold: false, visible: true },
    { key: 'nummer', label: 'Factuurnummer', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'vervaldatum', label: 'Vervaldatum', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 50, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 12, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 18, alignment: 'right' },
    { key: 'totaal', label: 'Totaal', width: 20, alignment: 'right' },
  ], headerStyle: { backgroundColor: '#1a1a1a', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: false },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'payment_details', content: 'Betaling graag binnen {{betaalvoorwaarden}}\nIBAN: {{iban}} — t.n.v. {{bedrijfsnaam}}', backgroundColor: '#f4f4f4', borderColor: 'brand_primary', fontSize: 9 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'footer', content: '{{bedrijfsnaam}} · {{bedrijf_email}} · {{website}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: false, borderColor: '#cccccc' },
];

const FACTUUR_ELEGANT_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'border_frame', style: 'corners', color: 'brand_primary', thickness: 1.2, inset: 8, cornerSize: 18, useBlockBounds: false },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 55, maxHeight: 24, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'icon', icon: 'sparkle', color: 'brand_primary', size: 8 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 11, fontWeight: 'bold', fontStyle: 'normal', color: 'brand_primary', alignment: 'center', lineHeight: 1.3 },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.5 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'document_badge', text: 'F A C T U U R', backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 13 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Aan', bold: true, visible: true },
    { key: 'client_adres', label: '', bold: false, visible: true },
    { key: 'nummer', label: 'Factuurnummer', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'vervaldatum', label: 'Vervaldatum', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 45, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 12, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 18, alignment: 'right' },
    { key: 'btw', label: 'BTW%', width: 10, alignment: 'center' },
    { key: 'totaal', label: 'Totaal', width: 15, alignment: 'right' },
  ], headerStyle: { backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: false },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'payment_details', content: 'Gelieve binnen {{betaalvoorwaarden}} over te maken naar:\nIBAN: {{iban}} — t.n.v. {{bedrijfsnaam}}', backgroundColor: '#faf7f0', borderColor: 'brand_primary', fontSize: 9 },
];

// ══ OFFERTE varianten ══

const OFFERTE_LUXE_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'border_frame', style: 'ornament', color: 'brand_primary', thickness: 1, inset: 7, cornerSize: 16, useBlockBounds: false },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 65, maxHeight: 26, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'icon', icon: 'sparkle', color: 'brand_primary', size: 7 },
  { id: bid(), type: 'spacer', height: 2 },
  { id: bid(), type: 'text', content: '{{ondertitel}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'italic', color: 'brand_primary', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'document_badge', text: 'O F F E R T E', backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 14 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Voor', bold: true, visible: true },
    { key: 'client_adres', label: '', bold: false, visible: true },
    { key: 'nummer', label: 'Offertenummer', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'geldig_tot', label: 'Geldig tot', bold: false, visible: true },
    { key: 'aantal_gasten', label: 'Aantal gasten', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 12, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 9, color: '#333333' }, dishDescStyle: { fontSize: 8, color: '#666666', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 },
];

const OFFERTE_COMPACT_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 45, maxHeight: 18, alignment: 'left' },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.8 },
  { id: bid(), type: 'document_badge', text: 'OFFERTE', backgroundColor: '#333333', textColor: '#ffffff', fontSize: 12 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'client_info', layout: 'two-column', fields: [
    { key: 'client_naam', label: 'Aan', bold: true, visible: true },
    { key: 'nummer', label: 'Nr.', bold: false, visible: true },
    { key: 'datum', label: 'Datum', bold: false, visible: true },
    { key: 'geldig_tot', label: 'Geldig tot', bold: false, visible: true },
  ] },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'menu', layout: '2col', gangTitleStyle: { fontSize: 10, fontWeight: 'bold', color: 'brand_primary', alignment: 'left', uppercase: true }, dishNameStyle: { fontSize: 8, color: '#333333' }, dishDescStyle: { fontSize: 7, color: '#666666', fontStyle: 'italic' }, showDescriptions: false, gangSeparator: 'line' },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 55, alignment: 'left' },
    { key: 'qty', label: 'Aant.', width: 12, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 16, alignment: 'right' },
    { key: 'totaal', label: 'Totaal', width: 17, alignment: 'right' },
  ], headerStyle: { backgroundColor: '#333333', textColor: '#ffffff', fontSize: 8 }, bodyStyle: { fontSize: 8, textColor: '#333333' }, showGridLines: false },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: '#333333', alignment: 'right', fontSize: 9 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'footer', content: '{{bedrijfsnaam}} · {{bedrijf_email}} · {{bedrijf_telefoon}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: true, borderColor: '#cccccc' },
];

// ══ MENUKAART varianten ══

const MENUKAART_LICHT_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'spacer', height: 12 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 65, maxHeight: 28, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'icon', icon: 'leaf', color: 'brand_primary', size: 9 },
  { id: bid(), type: 'spacer', height: 2 },
  { id: bid(), type: 'text', content: '{{ondertitel}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'italic', color: '#666666', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.5 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 13, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 10, color: '#2c2c2c' }, dishDescStyle: { fontSize: 8, color: '#888888', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.5 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 8, fontWeight: 'normal', fontStyle: 'normal', color: '#999999', alignment: 'center', lineHeight: 1.4 },
];

const MENUKAART_VINTAGE_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'border_frame', style: 'ornament', color: '#8b6914', thickness: 1.2, inset: 10, cornerSize: 20, useBlockBounds: false },
  { id: bid(), type: 'spacer', height: 14 },
  { id: bid(), type: 'icon', icon: 'sparkle', color: '#8b6914', size: 10 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 70, maxHeight: 28, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: '{{ondertitel}}', fontSize: 11, fontWeight: 'normal', fontStyle: 'italic', color: '#8b6914', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'icon', icon: 'diamond_small', color: '#8b6914', size: 5 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 13, fontWeight: 'bold', color: '#8b6914', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 10, color: '#3a2f1f' }, dishDescStyle: { fontSize: 8, color: '#8b7355', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'icon', icon: 'diamond_small', color: '#8b6914', size: 5 },
  { id: bid(), type: 'spacer', height: 2 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 9, fontWeight: 'normal', fontStyle: 'italic', color: '#8b6914', alignment: 'center', lineHeight: 1.4 },
];

// ── Nieuwe starters die overeenkomen met de hub MenuCard voorvertoningen ──

const PAGE_AMBACHT: PageSettings = {
  format: 'a4', orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundColor: '#f5eedf',
};

const PAGE_SLATE: PageSettings = {
  format: 'a4', orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
  backgroundColor: '#1a1a1c',
};

// Ambacht: cream papier, gouden accenten, gecentreerd, elegante horeca-stijl
const MENUKAART_AMBACHT_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'spacer', height: 14 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 55, maxHeight: 22, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}} · AMBACHT', fontSize: 8, fontWeight: 'bold', fontStyle: 'normal', color: 'brand_primary', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: '{{event_naam}}', fontSize: 22, fontWeight: 'bold', fontStyle: 'italic', color: '#1a1410', alignment: 'center', lineHeight: 1.15 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: '{{event_datum}}', fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', color: '#6b5a3e', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.6 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 10, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 12, color: '#1a1410' }, dishDescStyle: { fontSize: 10, color: '#6b5a3e', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 12 },
  { id: bid(), type: 'text', content: '— GENIET ERVAN —', fontSize: 8, fontWeight: 'bold', fontStyle: 'normal', color: 'brand_primary', alignment: 'center', lineHeight: 1.4 },
];

// Modern: wit papier, gouden accent-balk links, strakke sans-serif, links uitgelijnd
const MENUKAART_MODERN_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'spacer', height: 12 },
  { id: bid(), type: 'shape', shape: 'rectangle', fillColor: 'brand_primary', strokeColor: 'none', strokeWidth: 0, cornerRadius: 0, opacity: 1 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 50, maxHeight: 20, alignment: 'left' },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 9, fontWeight: 'bold', fontStyle: 'normal', color: 'brand_primary', alignment: 'left', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 2 },
  { id: bid(), type: 'text', content: '{{event_naam}}', fontSize: 22, fontWeight: 'normal', fontStyle: 'normal', color: '#0a0a0c', alignment: 'left', lineHeight: 1.1 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: '{{event_datum}}', fontSize: 9, fontWeight: 'normal', fontStyle: 'normal', color: '#6b6b6b', alignment: 'left', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 13, fontWeight: 'bold', color: 'brand_primary', alignment: 'left', uppercase: false }, dishNameStyle: { fontSize: 11, color: '#0a0a0c' }, dishDescStyle: { fontSize: 9, color: '#707070', fontStyle: 'normal' }, showDescriptions: false, gangSeparator: 'space' },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'text', content: '{{bedrijfsnaam}}', fontSize: 8, fontWeight: 'normal', fontStyle: 'normal', color: '#9e9e9e', alignment: 'left', lineHeight: 1.4 },
];

// Slate: donkere achtergrond, crème tekst, gouden accenten, gecentreerd met sterren
const MENUKAART_SLATE_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'spacer', height: 14 },
  { id: bid(), type: 'logo', variant: 'dark', maxWidth: 55, maxHeight: 22, alignment: 'center' },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'text', content: '★ {{bedrijfsnaam}} ★', fontSize: 8, fontWeight: 'bold', fontStyle: 'normal', color: 'brand_primary', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: '{{event_naam}}', fontSize: 20, fontWeight: 'bold', fontStyle: 'italic', color: '#f0e8d0', alignment: 'center', lineHeight: 1.15 },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'text', content: '{{event_datum}}', fontSize: 8, fontWeight: 'bold', fontStyle: 'normal', color: '#8a7c60', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'divider', style: 'solid', color: 'brand_primary', thickness: 0.6 },
  { id: bid(), type: 'spacer', height: 10 },
  { id: bid(), type: 'menu', layout: '1col', gangTitleStyle: { fontSize: 9, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 13, color: '#f0e8d0' }, dishDescStyle: { fontSize: 10, color: '#9a8a6a', fontStyle: 'italic' }, showDescriptions: true, gangSeparator: 'space' },
];

// ══ HACCP varianten ══

const HACCP_COMPACT_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 40, maxHeight: 16, alignment: 'left' },
  { id: bid(), type: 'document_badge', text: 'HACCP', backgroundColor: '#c83232', textColor: '#ffffff', fontSize: 12 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: 'Datum: {{haccp_datum}} · {{bedrijfsnaam}}', fontSize: 9, fontWeight: 'bold', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.3 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'haccp_table', columns: [
    { key: 'tijd', label: 'Tijd', width: 12, alignment: 'center' },
    { key: 'wat', label: 'Product', width: 32, alignment: 'left' },
    { key: 'type', label: 'Type', width: 14, alignment: 'center' },
    { key: 'temp', label: '°C', width: 12, alignment: 'center' },
    { key: 'status', label: 'Status', width: 14, alignment: 'center' },
    { key: 'notitie', label: 'Notitie', width: 16, alignment: 'left' },
  ], headerColor: '#c83232', statusColors: { ok: '#22c55e', warn: '#f59e0b', danger: '#ef4444' } },
  { id: bid(), type: 'footer', content: 'HACCP logboek · automatisch gegenereerd', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: false, borderColor: '#cccccc' },
];

const HACCP_OFFICIEEL_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'border_frame', style: 'single', color: '#c83232', thickness: 1, inset: 8, cornerSize: 0, useBlockBounds: false },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 50, maxHeight: 20, alignment: 'left' },
  { id: bid(), type: 'document_badge', text: 'HACCP RAPPORT', backgroundColor: '#c83232', textColor: '#ffffff', fontSize: 14 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'text', content: 'Controledatum: {{haccp_datum}}\nOndernemer: {{bedrijfsnaam}} — {{bedrijf_adres}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.5 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'haccp_table', columns: [
    { key: 'tijd', label: 'Tijd', width: 12, alignment: 'center' },
    { key: 'wat', label: 'Product', width: 30, alignment: 'left' },
    { key: 'type', label: 'Type', width: 15, alignment: 'center' },
    { key: 'temp', label: 'Temp (°C)', width: 15, alignment: 'center' },
    { key: 'status', label: 'Status', width: 15, alignment: 'center' },
    { key: 'notitie', label: 'Notitie', width: 13, alignment: 'left' },
  ], headerColor: '#c83232', statusColors: { ok: '#22c55e', warn: '#f59e0b', danger: '#ef4444' } },
  { id: bid(), type: 'spacer', height: 14 },
  { id: bid(), type: 'stamp', text: 'GOEDGEKEURD', subtext: '{{haccp_datum}}', color: '#22c55e', shape: 'circle', borderStyle: 'double', rotation: -8, fontSize: 10 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'footer', content: 'Officieel HACCP rapport · {{bedrijfsnaam}}', fontSize: 8, color: '#666666', alignment: 'center', showTopBorder: true, borderColor: '#c83232' },
];

// ══ BON varianten ══

const BON_A4_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 55, maxHeight: 22, alignment: 'center' },
  { id: bid(), type: 'divider', style: 'solid', color: '#333333', thickness: 0.8 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'document_badge', text: 'KASSABON', backgroundColor: '#333333', textColor: '#ffffff', fontSize: 12 },
  { id: bid(), type: 'spacer', height: 5 },
  { id: bid(), type: 'text', content: 'Winkel: {{winkel}}\nDatum: {{datum}}\nBonnummer: {{nummer}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'center', lineHeight: 1.6 },
  { id: bid(), type: 'spacer', height: 6 },
  { id: bid(), type: 'items_table', columns: [
    { key: 'omschrijving', label: 'Omschrijving', width: 55, alignment: 'left' },
    { key: 'qty', label: 'Aantal', width: 12, alignment: 'center' },
    { key: 'prijs', label: 'Prijs', width: 16, alignment: 'right' },
    { key: 'totaal', label: 'Totaal', width: 17, alignment: 'right' },
  ], headerStyle: { backgroundColor: '#333333', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: true },
  { id: bid(), type: 'spacer', height: 4 },
  { id: bid(), type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: '#333333', alignment: 'right', fontSize: 11 },
  { id: bid(), type: 'spacer', height: 8 },
  { id: bid(), type: 'icon', icon: 'check', color: '#22c55e', size: 12 },
  { id: bid(), type: 'spacer', height: 2 },
  { id: bid(), type: 'text', content: 'Bedankt voor uw aankoop', fontSize: 10, fontWeight: 'bold', fontStyle: 'normal', color: '#333333', alignment: 'center', lineHeight: 1.4 },
  { id: bid(), type: 'footer', content: '{{bedrijfsnaam}} · {{bedrijf_email}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: true, borderColor: '#cccccc' },
];

const BON_FOTO_BLOCKS: TemplateBlock[] = [
  { id: bid(), type: 'logo', variant: 'light', maxWidth: 40, maxHeight: 15, alignment: 'left' },
  { id: bid(), type: 'document_badge', text: 'ONTVANGSTBEWIJS', backgroundColor: '#333333', textColor: '#ffffff', fontSize: 11 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: 'Winkel: {{winkel}}\nDatum: {{datum}}\nTotaal: {{bon_totaal}}', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.6 },
  { id: bid(), type: 'divider', style: 'dashed', color: '#cccccc', thickness: 0.5 },
  { id: bid(), type: 'spacer', height: 3 },
  { id: bid(), type: 'text', content: 'Scan / foto van de originele bon:', fontSize: 9, fontWeight: 'bold', fontStyle: 'normal', color: '#666666', alignment: 'left', lineHeight: 1.4 },
  { id: bid(), type: 'image', src: '{{receipt_image}}', maxWidth: 170, maxHeight: 210, alignment: 'center' },
];

// ── Starter Catalogus ──
export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  blocks: TemplateBlock[];
  pageSettings: PageSettings;
}

export const STARTER_TEMPLATES: Record<string, StarterTemplate[]> = {
  factuur: [
    { id: 'factuur-klassiek', name: 'Klassiek', description: 'Gecentreerd logo, nette lay-out — veilige keuze voor elke factuur.', blocks: FACTUUR_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'factuur-modern', name: 'Modern', description: 'Strakke accent-balk bovenaan, links uitgelijnd logo, minimalistisch.', blocks: FACTUUR_MODERN_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'factuur-elegant', name: 'Elegant', description: 'Decoratieve hoek-accenten + glinstering — stijlvol voor premium klanten.', blocks: FACTUUR_ELEGANT_BLOCKS, pageSettings: PAGE_CREAM },
  ],
  offerte: [
    { id: 'offerte-standaard', name: 'Standaard', description: 'Logo + menu sectie + items tabel — alles erin voor een complete offerte.', blocks: OFFERTE_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'offerte-luxe', name: 'Luxe Menu', description: 'Ornamentrand + menu met beschrijvingen — perfect voor bruiloften & galadinners.', blocks: OFFERTE_LUXE_BLOCKS, pageSettings: PAGE_CREAM },
    { id: 'offerte-compact', name: 'Compact Zakelijk', description: 'Dichte lay-out met 2-kolom menu — past op één pagina voor zakelijke klanten.', blocks: OFFERTE_COMPACT_BLOCKS, pageSettings: PAGE_WHITE },
  ],
  menukaart: [
    { id: 'menukaart-ambacht', name: 'Ambacht', description: 'Cr\u00e8me papier met gouden accenten, elegant en horecawaardig — past bij de hub-voorvertoning.', blocks: MENUKAART_AMBACHT_BLOCKS, pageSettings: PAGE_AMBACHT },
    { id: 'menukaart-modern', name: 'Modern', description: 'Wit papier, gouden accent-balk, strakke links-uitgelijnde typografie — past bij de hub-voorvertoning.', blocks: MENUKAART_MODERN_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'menukaart-slate', name: 'Slate', description: 'Donker papier met cr\u00e8me tekst en gouden accenten — past bij de hub-voorvertoning.', blocks: MENUKAART_SLATE_BLOCKS, pageSettings: PAGE_SLATE },
    { id: 'menukaart-donker', name: 'Donker Elegant', description: 'Zwarte achtergrond + gouden accenten — klassiek restaurantmenu.', blocks: MENUKAART_BLOCKS, pageSettings: PAGE_DARK },
    { id: 'menukaart-licht', name: 'Licht Modern', description: 'Witte achtergrond, grote menu typografie — fris & modern.', blocks: MENUKAART_LICHT_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'menukaart-vintage', name: 'Vintage Kader', description: 'Cr\u00e8me achtergrond met ornament rand — warme nostalgische sfeer.', blocks: MENUKAART_VINTAGE_BLOCKS, pageSettings: PAGE_CREAM },
  ],
  haccp: [
    { id: 'haccp-standaard', name: 'Standaard', description: 'Volledige kolommen, duidelijke statusaanduiding — standaard HACCP rapport.', blocks: HACCP_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'haccp-compact', name: 'Compact', description: 'Kleinere tabel voor dagelijkse rapporten — 1 pagina focus.', blocks: HACCP_COMPACT_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'haccp-officieel', name: 'Officieel met Stempel', description: 'Rand + goedkeuring stempel — voor formele controle rapporten.', blocks: HACCP_OFFICIEEL_BLOCKS, pageSettings: PAGE_WHITE },
  ],
  bon: [
    { id: 'bon-smal', name: 'Smal', description: 'Compacte bon met foto-plek — handig voor onkosten declaraties.', blocks: BON_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'bon-a4', name: 'A4 Breed', description: 'Volledige A4 met items tabel + totalen — nette kassabon voor catering.', blocks: BON_A4_BLOCKS, pageSettings: PAGE_WHITE },
    { id: 'bon-foto', name: 'Met Foto', description: 'Focus op foto van originele bon — ideaal voor scan + declaratie.', blocks: BON_FOTO_BLOCKS, pageSettings: PAGE_WHITE },
  ],
};

// ── Block Palette Items (for editor UI) ──
export const BLOCK_PALETTE: BlockPaletteItem[] = [
  { type: 'logo', label: 'Logo', icon: 'Image', category: 'content', defaultBlock: { type: 'logo', variant: 'light', maxWidth: 60, maxHeight: 25, alignment: 'center' }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'text', label: 'Tekst', icon: 'Type', category: 'content', defaultBlock: { type: 'text', content: 'Tekst hier...', fontSize: 10, fontWeight: 'normal', fontStyle: 'normal', color: '#333333', alignment: 'left', lineHeight: 1.4 }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'client_info', label: 'Klantgegevens', icon: 'User', category: 'data', defaultBlock: { type: 'client_info', layout: 'two-column', fields: [{ key: 'client_naam', label: 'Aan', bold: true, visible: true }, { key: 'client_adres', label: '', bold: false, visible: true }] }, availableIn: ['factuur', 'offerte'] },
  { type: 'document_badge', label: 'Document Badge', icon: 'Badge', category: 'content', defaultBlock: { type: 'document_badge', text: '{{document_type}}', backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 14 }, availableIn: ['factuur', 'offerte', 'haccp', 'bon'] },
  { type: 'items_table', label: 'Items Tabel', icon: 'Table', category: 'data', defaultBlock: { type: 'items_table', columns: [{ key: 'omschrijving', label: 'Omschrijving', width: 45, alignment: 'left' }, { key: 'qty', label: 'Aantal', width: 15, alignment: 'center' }, { key: 'prijs', label: 'Prijs', width: 20, alignment: 'right' }, { key: 'totaal', label: 'Totaal', width: 20, alignment: 'right' }], headerStyle: { backgroundColor: 'brand_primary', textColor: '#ffffff', fontSize: 9 }, bodyStyle: { fontSize: 9, textColor: '#333333' }, showGridLines: false }, availableIn: ['factuur', 'offerte', 'bon'] },
  { type: 'menu', label: 'Menu Sectie', icon: 'ChefHat', category: 'data', defaultBlock: { type: 'menu', layout: '2col', gangTitleStyle: { fontSize: 11, fontWeight: 'bold', color: 'brand_primary', alignment: 'center', uppercase: true }, dishNameStyle: { fontSize: 9, color: '#333333' }, dishDescStyle: { fontSize: 8, color: '#666666', fontStyle: 'italic' }, showDescriptions: false, gangSeparator: 'line' }, availableIn: ['offerte', 'menukaart'] },
  { type: 'totals', label: 'Totalen', icon: 'Calculator', category: 'data', defaultBlock: { type: 'totals', showSubtotaal: true, showBtw: true, showTotaal: true, totalBarColor: 'brand_primary', alignment: 'right', fontSize: 10 }, availableIn: ['factuur', 'offerte'] },
  { type: 'payment_details', label: 'Betalingsgegevens', icon: 'CreditCard', category: 'data', defaultBlock: { type: 'payment_details', content: 'Betaling graag overmaken naar:\nIBAN: {{iban}}\nt.n.v. {{bedrijfsnaam}}', backgroundColor: '#f8f8f8', borderColor: 'brand_primary', fontSize: 9 }, availableIn: ['factuur'] },
  { type: 'divider', label: 'Scheidingslijn', icon: 'Minus', category: 'layout', defaultBlock: { type: 'divider', style: 'solid', color: 'brand_primary', thickness: 1 }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'spacer', label: 'Ruimte', icon: 'ArrowDownUp', category: 'layout', defaultBlock: { type: 'spacer', height: 10 }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'image', label: 'Afbeelding', icon: 'ImagePlus', category: 'content', defaultBlock: { type: 'image', src: '', maxWidth: 100, maxHeight: 80, alignment: 'center' }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'footer', label: 'Footer', icon: 'PanelBottom', category: 'layout', defaultBlock: { type: 'footer', content: '{{bedrijfsnaam}} | {{bedrijf_adres}} | {{bedrijf_email}}', fontSize: 7, color: '#999999', alignment: 'center', showTopBorder: true, borderColor: 'brand_primary' }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'haccp_table', label: 'HACCP Tabel', icon: 'Thermometer', category: 'special', defaultBlock: { type: 'haccp_table', columns: [{ key: 'tijd', label: 'Tijd', width: 12, alignment: 'center' }, { key: 'wat', label: 'Product', width: 30, alignment: 'left' }, { key: 'temp', label: 'Temp', width: 15, alignment: 'center' }, { key: 'status', label: 'Status', width: 15, alignment: 'center' }], headerColor: '#c83232', statusColors: { ok: '#22c55e', warn: '#f59e0b', danger: '#ef4444' } }, availableIn: ['haccp'] },
  // Decoratie
  { type: 'shape', label: 'Vorm', icon: 'Square', category: 'layout', defaultBlock: { type: 'shape', shape: 'rectangle', fillColor: 'brand_primary', strokeColor: 'none', strokeWidth: 0, cornerRadius: 3, opacity: 1 }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'icon', label: 'Icoon', icon: 'Star', category: 'content', defaultBlock: { type: 'icon', icon: 'star', color: 'brand_primary', size: 10 }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
  { type: 'stamp', label: 'Stempel', icon: 'Stamp', category: 'content', defaultBlock: { type: 'stamp', text: 'BETAALD', subtext: '', color: '#c83232', shape: 'circle', borderStyle: 'double', rotation: -12, fontSize: 14 }, availableIn: ['factuur', 'offerte', 'haccp', 'bon'] },
  { type: 'border_frame', label: 'Rand / Kader', icon: 'Frame', category: 'layout', defaultBlock: { type: 'border_frame', style: 'corners', color: 'brand_primary', thickness: 1.5, inset: 6, cornerSize: 14, useBlockBounds: false }, availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'] },
];
