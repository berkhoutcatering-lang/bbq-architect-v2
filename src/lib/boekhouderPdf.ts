/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side BTW-aangifte PDF generator
 * ──────────────────────────────────────
 * Genereert een NL-aangifte-ready PDF die je 1-op-1 in het Belastingdienst-
 * portaal kan overtypen. Daarnaast een lijst inkoop-bonnen + verkoop-facturen
 * gegroepeerd per RGS-code zodat de boekhouder direct ziet hoe alles geboekt
 * moet worden.
 *
 * Pillar #4 — Maandpakket-PDF die de boekhouder 40% tijdwinst geeft.
 *
 * jsPDF server-side: runtime moet 'nodejs' zijn (geen edge), max 10MB output.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RGS_BY_CODE, rgsLookup } from './rgsCategories';

export interface PdfBon {
  datum: string | null;
  leverancier_naam: string;
  rgs_code: string | null;
  rgs_label: string | null;
  event_naam?: string | null;
  netto: number;
  btw_9: number;
  btw_21: number;
  totaal: number;
  notities?: string | null;
}

export interface PdfFactuur {
  datum: string | null;
  nummer: string;
  client_naam: string;
  rgs_code: string | null;
  netto: number;
  btw_9: number;
  btw_21: number;
  totaal: number;
}

export interface PdfPakketInput {
  org_name: string;
  org_address?: string;
  org_btw_nr?: string;
  boekhouder_naam?: string;
  period_label: string;          // "Mei 2026"
  period_start: string;          // "2026-05-01"
  period_end: string;            // "2026-05-31"
  generated_at: string;          // ISO timestamp
  bonnen: PdfBon[];
  facturen: PdfFactuur[];
  totals: {
    inkoop_totaal: number;
    verkoop_totaal: number;
    btw_voorbelasting_9: number;
    btw_voorbelasting_21: number;
    btw_verschuldigd_9: number;
    btw_verschuldigd_21: number;
    btw_af_te_dragen: number;
    voorraadwaarde_eur?: number;
  };
}

const GOLD = '#c4a35a';
const INK = '#111111';
const MUTED = '#666666';

function fmtEur(n: number): string {
  const v = Number(n) || 0;
  return v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Bouw de PDF en returneer als base64 (zonder data-URL prefix).
 * Server-side gebruikt deze functie en stuurt het base64-bytes terug naar
 * client of Resend attachment.
 */
export function generateBoekhouderPdf(input: PdfPakketInput): { base64: string; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // ─── Cover ─────────────────────────────────────────────
  doc.setFillColor(GOLD);
  doc.rect(0, 0, W, 6, 'F'); // gold strip top

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  doc.text('BOEKHOUDER-PAKKET', margin, y + 30);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK);
  doc.setFontSize(28);
  doc.text(input.period_label, margin, y + 64);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text(input.org_name, margin, y + 86);
  if (input.org_btw_nr) doc.text(`BTW-nr: ${input.org_btw_nr}`, margin, y + 100);
  doc.text(`Periode: ${fmtDate(input.period_start)} – ${fmtDate(input.period_end)}`, margin, y + 114);
  doc.text(`Gegenereerd: ${fmtDate(input.generated_at)}`, margin, y + 128);
  if (input.boekhouder_naam) doc.text(`Voor: ${input.boekhouder_naam}`, margin, y + 142);

  y = 180;

  // ─── BTW-aangifte-blok (de killer-feature) ─────────────
  doc.setFillColor(245, 245, 240);
  doc.rect(margin, y, W - margin * 2, 200, 'F');
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(margin, y, margin, y + 200);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(INK);
  doc.text('BTW-aangifte concept', margin + 14, y + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(
    'Concept voor je BTW-aangifte. Boekhouder reviewt en dient in via Belastingdienst-portaal.',
    margin + 14, y + 36
  );

  // BTW-tabel
  const btwLines = [
    ['Rubriek 1a — Verschuldigd BTW 9% (leveringen food)', fmtEur(input.totals.btw_verschuldigd_9)],
    ['Rubriek 1b — Verschuldigd BTW 21% (leveringen overig)', fmtEur(input.totals.btw_verschuldigd_21)],
    ['Rubriek 5b — Voorbelasting BTW 9% (inkoop food)', fmtEur(input.totals.btw_voorbelasting_9)],
    ['Rubriek 5b — Voorbelasting BTW 21% (inkoop overig)', fmtEur(input.totals.btw_voorbelasting_21)],
  ];
  let by = y + 58;
  doc.setFontSize(10);
  doc.setTextColor(INK);
  btwLines.forEach(function ([label, val]) {
    doc.setFont('helvetica', 'normal');
    doc.text(label, margin + 14, by);
    doc.setFont('helvetica', 'bold');
    doc.text(`€ ${val}`, W - margin - 14, by, { align: 'right' });
    by += 16;
  });

  // Totaal-regel
  doc.setDrawColor(200, 200, 200);
  doc.line(margin + 14, by + 4, W - margin - 14, by + 4);
  by += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const afTeDragenColor = input.totals.btw_af_te_dragen >= 0 ? '#a83232' : '#2d8c4f';
  doc.text('Af te dragen aan Belastingdienst', margin + 14, by);
  doc.setTextColor(afTeDragenColor);
  doc.text(
    `€ ${fmtEur(input.totals.btw_af_te_dragen)}`,
    W - margin - 14, by, { align: 'right' }
  );

  y += 220;

  // ─── Samenvatting ─────────────────────────────────────
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Samenvatting', margin, y);
  y += 18;

  const sumLines = [
    ['Aantal bonnen (inkoop)', String(input.bonnen.length)],
    ['Aantal facturen (verkoop)', String(input.facturen.length)],
    ['Totaal inkoop (incl. BTW)', `€ ${fmtEur(input.totals.inkoop_totaal)}`],
    ['Totaal verkoop (incl. BTW)', `€ ${fmtEur(input.totals.verkoop_totaal)}`],
  ];
  if (input.totals.voorraadwaarde_eur != null) {
    sumLines.push(['Voorraadwaarde einde maand', `€ ${fmtEur(input.totals.voorraadwaarde_eur)}`]);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  sumLines.forEach(function ([k, v]) {
    doc.text(k, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(INK);
    doc.text(v, W - margin, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    y += 14;
  });

  // ─── Page 2 — Inkoop-bonnen ────────────────────────────
  doc.addPage();
  y = margin;
  doc.setFillColor(GOLD);
  doc.rect(0, 0, W, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text('Inkoop-bonnen', margin, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`${input.bonnen.length} bonnen — gegroepeerd per RGS-categorie`, margin, y + 36);

  // Groepeer per RGS-code
  const byCode = new Map<string, PdfBon[]>();
  input.bonnen.forEach(function (b) {
    const k = b.rgs_code || 'WBedKostOv';
    const list = byCode.get(k) || [];
    list.push(b);
    byCode.set(k, list);
  });

  y += 56;

  // Tabel per RGS-code-groep
  const sortedCodes = Array.from(byCode.keys()).sort();
  for (const code of sortedCodes) {
    const rows = byCode.get(code)!;
    const meta = rgsLookup(code);
    const groupTotal = rows.reduce(function (s, r) { return s + r.totaal; }, 0);
    const groupBtw9 = rows.reduce(function (s, r) { return s + r.btw_9; }, 0);
    const groupBtw21 = rows.reduce(function (s, r) { return s + r.btw_21; }, 0);

    // Heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(INK);
    doc.text(`${code} — ${meta?.label || 'Onbekend'}`, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED);
    doc.setFontSize(9);
    doc.text(`${rows.length} bonnen · € ${fmtEur(groupTotal)} totaal`, W - margin, y, { align: 'right' });
    y += 4;

    autoTable(doc, {
      startY: y + 4,
      head: [['Datum', 'Leverancier', 'Event', 'Netto', 'BTW 9%', 'BTW 21%', 'Totaal']],
      body: rows.map(function (r) {
        return [
          fmtDate(r.datum),
          r.leverancier_naam || '—',
          r.event_naam || '',
          fmtEur(r.netto),
          fmtEur(r.btw_9),
          fmtEur(r.btw_21),
          fmtEur(r.totaal),
        ];
      }),
      foot: [['', '', 'Subtotaal', fmtEur(rows.reduce(function (s, r) { return s + r.netto; }, 0)), fmtEur(groupBtw9), fmtEur(groupBtw21), fmtEur(groupTotal)]],
      styles: { fontSize: 9, cellPadding: 4, textColor: '#222222' },
      headStyles: { fillColor: '#f5f5f0', textColor: INK, fontStyle: 'bold' },
      footStyles: { fillColor: '#fafafa', textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    if (y > H - 100) {
      doc.addPage();
      y = margin;
    }
  }

  // ─── Page — Verkoop-facturen ───────────────────────────
  if (input.facturen.length > 0) {
    doc.addPage();
    y = margin;
    doc.setFillColor(GOLD);
    doc.rect(0, 0, W, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(INK);
    doc.text('Verkoop-facturen', margin, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(`${input.facturen.length} facturen — omzet voor de maand`, margin, y + 36);
    y += 56;

    autoTable(doc, {
      startY: y,
      head: [['Datum', 'Nr.', 'Klant', 'RGS', 'Netto', 'BTW 9%', 'BTW 21%', 'Totaal']],
      body: input.facturen.map(function (f) {
        return [
          fmtDate(f.datum), f.nummer, f.client_naam, f.rgs_code || 'WOpbCat',
          fmtEur(f.netto), fmtEur(f.btw_9), fmtEur(f.btw_21), fmtEur(f.totaal),
        ];
      }),
      foot: [['', '', '', 'Totaal',
        fmtEur(input.facturen.reduce(function (s, f) { return s + f.netto; }, 0)),
        fmtEur(input.facturen.reduce(function (s, f) { return s + f.btw_9; }, 0)),
        fmtEur(input.facturen.reduce(function (s, f) { return s + f.btw_21; }, 0)),
        fmtEur(input.facturen.reduce(function (s, f) { return s + f.totaal; }, 0)),
      ]],
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: '#f5f5f0', textColor: INK, fontStyle: 'bold' },
      footStyles: { fillColor: '#fafafa', textColor: INK, fontStyle: 'bold' },
      columnStyles: {
        4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    });
  }

  // ─── Voettekst op laatste pagina ──────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(
      `${input.org_name} · ${input.period_label} · pagina ${i} van ${pageCount}`,
      W / 2, H - 18, { align: 'center' }
    );
    doc.text(
      'Gegenereerd door BBQ Architect · BTW-bedragen uit bestaande bon-data, niet AI-derived',
      W / 2, H - 8, { align: 'center' }
    );
  }

  // Output als base64 (zonder data-URL prefix)
  const arrayBuffer = doc.output('arraybuffer');
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const filename = `boekhouding-${input.period_label.replace(/\s+/g, '-').toLowerCase()}.pdf`;
  return { base64, filename };
}
