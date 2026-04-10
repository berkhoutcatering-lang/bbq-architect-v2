/**
 * Template Context Builder — Maps PDFOptions to RenderContext
 * Bridge between the existing generatePDF interface and the template renderer
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { RenderContext } from '@/types/template.types';
import type { BrandingConfig } from '@/lib/branding';

function eur(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '\u20ac 0,00';
  return '\u20ac ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function nlDate(d: string | null | undefined): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return d; }
}

interface ContextOptions {
  type: string;
  form?: any;
  settings?: any;
  totals?: { subtotaal: number; btw: number; totaal: number };
  branding?: BrandingConfig;
  // HACCP
  eventName?: string;
  eventDatum?: string;
  records?: any[];
  // Bon
  winkel?: string;
  datum?: string;
  totaal_bedrag?: number;
  items?: any[];
  imageData?: string;
  // Menukaart
  gerechten?: any[];
}

export function buildRenderContext(opts: ContextOptions): RenderContext {
  const s = opts.settings || {};
  const f = opts.form || {};
  const t = opts.totals || { subtotaal: 0, btw: 0, totaal: 0 };
  const b = opts.branding || {
    logoUrl: null, logoDarkUrl: null,
    primaryColor: '#9e781c', accentColor: '#8b6914',
    primaryRgb: [158, 120, 28] as [number, number, number],
    accentRgb: [139, 105, 20] as [number, number, number],
  };

  // Map document type
  const docType = opts.type === 'receipt' ? 'bon' : opts.type;

  // Build variables map from settings + form + totals
  const variables: Record<string, string> = {
    // Bedrijf
    bedrijfsnaam: s.bedrijfsnaam || '',
    ondertitel: s.ondertitel || '',
    bedrijf_email: s.email || '',
    bedrijf_telefoon: s.telefoon || '',
    bedrijf_adres: s.adres || '',
    website: s.website || '',
    kvk: s.kvk || '',
    btw_nr: s.btw || s.btw_nummer || '',
    iban: s.iban || '',

    // Klant
    client_naam: f.client_naam || '',
    client_adres: f.client_adres || '',

    // Document
    nummer: f.nummer || '',
    datum: nlDate(f.datum) || '',
    vervaldatum: nlDate(f.vervaldatum) || '',
    geldig_tot: nlDate(f.geldig_tot) || '',
    document_type: docType === 'factuur' ? 'FACTUUR' : docType === 'offerte' ? 'OFFERTE' : docType.toUpperCase(),
    notitie: f.notitie || '',

    // Financieel
    subtotaal: eur(t.subtotaal),
    btw_bedrag: eur(t.btw),
    totaal: eur(t.totaal),
    betaalvoorwaarden: s.betaalvoorwaarden || '',

    // Event
    event_naam: opts.eventName || f.name || '',
    event_datum: nlDate(opts.eventDatum || f.date) || '',
    aantal_gasten: String(f.aantal_gasten || f.guests || ''),

    // HACCP
    haccp_datum: nlDate(opts.eventDatum || opts.datum) || '',

    // Bon
    winkel: opts.winkel || '',
    bon_totaal: eur(opts.totaal_bedrag),
  };

  // Build data (items, menu, haccp)
  const items = (f.items || opts.items || []).map(function (item: any) {
    return {
      omschrijving: item.omschrijving || item.desc || '',
      qty: item.qty || 1,
      prijs: item.prijs || 0,
      btw: item.btw || 0,
    };
  });

  // Parse menu from form.menu_selectie
  let menuSelectie: Record<string, string[]> | undefined;
  if (f.menu_selectie) {
    const ms = typeof f.menu_selectie === 'string' ? JSON.parse(f.menu_selectie) : f.menu_selectie;
    if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
      menuSelectie = {};
      for (const [gang, dishes] of Object.entries(ms)) {
        const gangName = gang.charAt(0).toUpperCase() + gang.slice(1);
        menuSelectie[gangName] = (dishes as any[]).map(function (d: any) {
          return typeof d === 'string' ? d : d.naam || d.gerecht_naam || '';
        }).filter(Boolean);
      }
    }
  }

  // For menukaart type with gerechten
  if (opts.gerechten && opts.gerechten.length > 0 && !menuSelectie) {
    menuSelectie = { Gerechten: opts.gerechten.map(function (g: any) { return g.naam || ''; }).filter(Boolean) };
  }

  // HACCP records
  const haccpRecords = (opts.records || []).map(function (r: any) {
    return {
      wat: r.wat || '',
      temp: r.temp || 0,
      type: r.type || '',
      status: r.status || '',
      tijd: r.tijd || '',
      notitie: r.notitie || '',
    };
  });

  return {
    variables,
    branding: b,
    data: {
      items: items.length > 0 ? items : undefined,
      menuSelectie,
      haccpRecords: haccpRecords.length > 0 ? haccpRecords : undefined,
    },
    documentType: docType as RenderContext['documentType'],
  };
}

// Build preview context with example data
export function buildPreviewContext(documentType: string): RenderContext {
  return {
    variables: {
      bedrijfsnaam: 'Hop & Bites',
      ondertitel: 'BBQ Catering Drenthe',
      bedrijf_email: 'info@hopenbites.nl',
      bedrijf_telefoon: '06-12345678',
      bedrijf_adres: 'Hoofdstraat 1, 1234 AB Drenthe',
      website: 'www.hopenbites.nl',
      kvk: '12345678',
      btw_nr: 'NL123456789B01',
      iban: 'NL91 ABNA 0417 1643 00',
      client_naam: 'Jan de Vries',
      client_adres: 'Kerkstraat 10, 5678 CD Utrecht',
      nummer: documentType === 'factuur' ? 'F2026-001' : 'OFF-2026-001',
      datum: '10 april 2026',
      vervaldatum: '24 april 2026',
      geldig_tot: '10 mei 2026',
      document_type: documentType === 'factuur' ? 'FACTUUR' : documentType === 'offerte' ? 'OFFERTE' : documentType.toUpperCase(),
      notitie: 'Inclusief opbouw en afbraak',
      subtotaal: '\u20ac 1.250,00',
      btw_bedrag: '\u20ac 262,50',
      totaal: '\u20ac 1.512,50',
      betaalvoorwaarden: 'Betaling binnen 14 dagen na factuurdatum. Graag onder vermelding van het factuurnummer.',
      event_naam: 'BBQ Festival Drenthe',
      event_datum: '15 juni 2026',
      aantal_gasten: '80',
      haccp_datum: '10 april 2026',
      winkel: 'Albert Heijn',
      bon_totaal: '\u20ac 45,67',
    },
    branding: {
      logoUrl: null,
      logoDarkUrl: null,
      primaryColor: '#9e781c',
      accentColor: '#8b6914',
      primaryRgb: [158, 120, 28],
      accentRgb: [139, 105, 20],
    },
    data: {
      items: [
        { omschrijving: 'BBQ Catering pakket Premium', qty: 1, prijs: 1000, btw: 21 },
        { omschrijving: 'Extra bediening (4 uur)', qty: 2, prijs: 125, btw: 21 },
      ],
      menuSelectie: {
        Voorgerechten: ['Pulled Pork Slider', 'Coleslaw'],
        Hoofdgerechten: ['Smoked Brisket', 'BBQ Ribs', 'Grilled Corn'],
        Desserts: ['S\'mores', 'Grilled Pineapple'],
      },
      haccpRecords: [
        { wat: 'Brisket', temp: 92.5, type: 'kern', status: 'ok', tijd: '14:30' },
        { wat: 'Koeling', temp: 3.2, type: 'opslag', status: 'ok', tijd: '08:00' },
        { wat: 'Kip', temp: 78.0, type: 'kern', status: 'ok', tijd: '13:45' },
      ],
    },
    documentType: documentType as RenderContext['documentType'],
  };
}
