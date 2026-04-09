// =============================================
// PDF Template Builder — Variable Registry
// =============================================

export interface TemplateVariable {
  key: string;
  label: string;
  category: 'bedrijf' | 'klant' | 'document' | 'financieel' | 'event' | 'menu';
  availableIn: ('factuur' | 'offerte' | 'menukaart' | 'haccp' | 'bon')[];
  example: string;
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // ── Bedrijf ──
  { key: 'bedrijfsnaam', label: 'Bedrijfsnaam', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'], example: 'Hop & Bites' },
  { key: 'ondertitel', label: 'Ondertitel', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'], example: 'BBQ Catering Drenthe' },
  { key: 'bedrijf_email', label: 'Email', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'], example: 'info@hopenbites.nl' },
  { key: 'bedrijf_telefoon', label: 'Telefoon', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'], example: '06-12345678' },
  { key: 'bedrijf_adres', label: 'Adres', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart', 'haccp', 'bon'], example: 'Hoofdstraat 1, 1234 AB Amsterdam' },
  { key: 'website', label: 'Website', category: 'bedrijf', availableIn: ['factuur', 'offerte', 'menukaart'], example: 'www.hopenbites.nl' },
  { key: 'kvk', label: 'KvK-nummer', category: 'bedrijf', availableIn: ['factuur', 'offerte'], example: '12345678' },
  { key: 'btw_nr', label: 'BTW-nummer', category: 'bedrijf', availableIn: ['factuur', 'offerte'], example: 'NL123456789B01' },
  { key: 'iban', label: 'IBAN', category: 'bedrijf', availableIn: ['factuur'], example: 'NL91 ABNA 0417 1643 00' },

  // ── Klant ──
  { key: 'client_naam', label: 'Klantnaam', category: 'klant', availableIn: ['factuur', 'offerte'], example: 'Jan de Vries' },
  { key: 'client_adres', label: 'Klantadres', category: 'klant', availableIn: ['factuur', 'offerte'], example: 'Kerkstraat 10, 5678 CD Utrecht' },

  // ── Document ──
  { key: 'nummer', label: 'Documentnummer', category: 'document', availableIn: ['factuur', 'offerte'], example: 'F-2026-001' },
  { key: 'datum', label: 'Datum', category: 'document', availableIn: ['factuur', 'offerte', 'haccp', 'bon'], example: '9 april 2026' },
  { key: 'vervaldatum', label: 'Vervaldatum', category: 'document', availableIn: ['factuur'], example: '23 april 2026' },
  { key: 'geldig_tot', label: 'Geldig tot', category: 'document', availableIn: ['offerte'], example: '9 mei 2026' },
  { key: 'document_type', label: 'Document type', category: 'document', availableIn: ['factuur', 'offerte'], example: 'FACTUUR' },
  { key: 'notitie', label: 'Notitie/opmerking', category: 'document', availableIn: ['factuur', 'offerte'], example: 'Inclusief opbouw en afbraak' },

  // ── Financieel ──
  { key: 'subtotaal', label: 'Subtotaal', category: 'financieel', availableIn: ['factuur', 'offerte'], example: '€ 1.250,00' },
  { key: 'btw_bedrag', label: 'BTW bedrag', category: 'financieel', availableIn: ['factuur', 'offerte'], example: '€ 262,50' },
  { key: 'totaal', label: 'Totaal', category: 'financieel', availableIn: ['factuur', 'offerte'], example: '€ 1.512,50' },
  { key: 'betaalvoorwaarden', label: 'Betaalvoorwaarden', category: 'financieel', availableIn: ['factuur'], example: 'Betaling binnen 14 dagen na factuurdatum.' },

  // ── Event ──
  { key: 'event_naam', label: 'Eventnaam', category: 'event', availableIn: ['offerte', 'haccp'], example: 'BBQ Festival Drenthe' },
  { key: 'event_datum', label: 'Eventdatum', category: 'event', availableIn: ['offerte', 'haccp'], example: '15 juni 2026' },
  { key: 'aantal_gasten', label: 'Aantal gasten', category: 'event', availableIn: ['offerte'], example: '80' },

  // ── HACCP ──
  { key: 'haccp_datum', label: 'Meetdatum', category: 'event', availableIn: ['haccp'], example: '9 april 2026' },

  // ── Bon ──
  { key: 'winkel', label: 'Winkel', category: 'document', availableIn: ['bon'], example: 'Albert Heijn' },
  { key: 'bon_totaal', label: 'Bon totaal', category: 'financieel', availableIn: ['bon'], example: '€ 45,67' },
];

// Group variables by category
export function getVariablesByCategory(documentType: string) {
  const filtered = TEMPLATE_VARIABLES.filter(function (v) {
    return v.availableIn.includes(documentType as TemplateVariable['availableIn'][0]);
  });

  const groups: Record<string, TemplateVariable[]> = {};
  filtered.forEach(function (v) {
    if (!groups[v.category]) groups[v.category] = [];
    groups[v.category].push(v);
  });

  return groups;
}

// Category labels
export const CATEGORY_LABELS: Record<string, string> = {
  bedrijf: 'Bedrijfsgegevens',
  klant: 'Klantgegevens',
  document: 'Document',
  financieel: 'Financieel',
  event: 'Event',
  menu: 'Menu',
};

// Interpolate variables in a string
export function interpolateVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, function (match, key) {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

// Resolve a color value (supports 'brand_primary', 'brand_accent', or hex)
export function resolveColor(
  color: string,
  branding: { primaryColor: string; accentColor: string }
): string {
  if (color === 'brand_primary') return branding.primaryColor;
  if (color === 'brand_accent') return branding.accentColor;
  return color;
}
