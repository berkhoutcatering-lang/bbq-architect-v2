/* eslint-disable @typescript-eslint/no-explicit-any */
// CSV export voor boekhouding (Exact Online / Moneybird import)

import type { Factuur, FactuurItem } from '@/types';
import { resolveBtwPct } from '@/lib/btw-rules';

function escapeCsv(val: any): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

interface CsvRow {
  [key: string]: string | number;
}

// Export facturen als CSV (Exact Online format)
export function facturenToCsv(facturen: Factuur[]): string {
  const headers = [
    'Factuurnummer', 'Datum', 'Vervaldatum', 'Klantnaam', 'Klantadres',
    'Status', 'Omschrijving', 'Aantal', 'Prijs excl. BTW', 'BTW %',
    'Regeltotaal excl.', 'BTW bedrag', 'Regeltotaal incl.'
  ];

  const rows: string[][] = [];

  facturen.forEach(f => {
    let items: FactuurItem[] = f.items || [];
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) { items = []; }
    if (items.length === 0) {
      rows.push([
        f.nummer, f.datum, f.vervaldatum, f.client_naam, f.client_adres || '',
        f.status, '', '', '', '', '', '', ''
      ]);
    } else {
      items.forEach(item => {
        const qty = item.qty || 0;
        const prijs = item.prijs || 0;
        const btwPct = resolveBtwPct(item.btw);
        const lineTotal = qty * prijs;
        const btwBedrag = lineTotal * (btwPct / 100);
        rows.push([
          f.nummer, f.datum, f.vervaldatum, f.client_naam, f.client_adres || '',
          f.status, item.omschrijving || '', String(qty), prijs.toFixed(2), String(btwPct),
          lineTotal.toFixed(2), btwBedrag.toFixed(2), (lineTotal + btwBedrag).toFixed(2)
        ]);
      });
    }
  });

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n');

  return csv;
}

// Export offertes als CSV
export function offertesToCsv(offertes: any[]): string {
  const headers = [
    'Offertenummer', 'Datum', 'Geldig tot', 'Klantnaam', 'Status',
    'Aantal gasten', 'Basis prijs p.p.', 'Omschrijving', 'Aantal',
    'Prijs', 'BTW %', 'Regeltotaal'
  ];

  const rows: string[][] = [];

  offertes.forEach(o => {
    let items: any[] = o.items || [];
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }

    if (items.length === 0) {
      rows.push([
        o.nummer || '', o.datum || '', o.geldig_tot || '', o.client_naam || '',
        o.status || '', String(o.aantal_gasten || ''), String(o.basis_prijs_pp || ''),
        '', '', '', '', ''
      ]);
    } else {
      items.forEach((item: any) => {
        const qty = item.qty || 0;
        const prijs = item.prijs || 0;
        const btw = resolveBtwPct(item.btw);
        rows.push([
          o.nummer || '', o.datum || '', o.geldig_tot || '', o.client_naam || '',
          o.status || '', String(o.aantal_gasten || ''), String(o.basis_prijs_pp || ''),
          item.desc || item.omschrijving || '', String(qty), prijs.toFixed(2),
          String(btw), (qty * prijs).toFixed(2)
        ]);
      });
    }
  });

  return [
    headers.map(escapeCsv).join(','),
    ...rows.map(row => row.map(escapeCsv).join(','))
  ].join('\n');
}

export function downloadCsv(content: string, filename: string) {
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
