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
];
