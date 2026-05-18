/**
 * NVWA HACCP-rapport — branded PDF voor controle.
 *
 * Genereert een professioneel PDF-dossier met:
 *  - Tenant branding (logo + naam) bovenaan
 *  - Event-meta (titel, datum, klantnaam, gasten)
 *  - Stats-grid (totaal, OK, afwijkingen, compliance%)
 *  - Anomaly-banner indien aanwezig (Pillar #3: mens-bevestigde afwijking)
 *  - Volledige registratie-tabel met chef + tijd + meting
 *  - Footer met juridische bron-referenties (EU 852/2004, Warenwetbesluit)
 *
 * Gebruikt jspdf + jspdf-autotable (al in deps voor offerte-PDF's).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { HaccpCheck, HaccpLogEntry, HaccpEvent } from '@/app/haccp/_data';
import { CHECK_TYPES } from '@/app/haccp/_data';

export interface NvwaPdfInput {
    event: HaccpEvent;
    checks: HaccpCheck[];
    logEntries: Record<string, HaccpLogEntry>;
    orgName?: string;
    orgLogoUrl?: string;
    generatedAt?: Date;
}

const NVWA_REFS = [
    'EU Verordening (EG) Nr. 852/2004 — HACCP-beginselen',
    'EU Verordening (EG) Nr. 853/2004 — Dierlijke producten',
    'Warenwetbesluit Hygiëne — Nederlandse aanvullende eisen',
    'NVWA Infoblad 75 — Regenereren vleesproducten',
];

export function generateNvwaHaccpPdf(input: NvwaPdfInput): jsPDF {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const MARGIN = 40;
    const now = input.generatedAt ?? new Date();

    /* ── Header ──────────────────────────────────────────── */
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text('NVWA HACCP-Dossier', MARGIN, 60);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
        `${input.orgName ?? 'BBQ Catering'} · gegenereerd ${now.toLocaleDateString('nl-NL')} ${now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
        MARGIN,
        76,
    );

    // Brand bar
    doc.setFillColor(255, 191, 0);
    doc.rect(MARGIN, 84, W - 2 * MARGIN, 2, 'F');

    /* ── Event-meta ──────────────────────────────────────── */
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(20, 20, 20);
    doc.text(input.event.title, MARGIN, 110);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    const metaLines = [
        `Datum: ${input.event.dayLabel ?? input.event.date}`,
        `Gasten: ${input.event.guests}`,
        `Serveertijd: ${input.event.servingTime}`,
        input.event.location ? `Locatie: ${input.event.location}` : null,
        input.event.client ? `Klant: ${input.event.client}` : null,
        input.event.offerte ? `Offerte: ${input.event.offerte}` : null,
    ].filter(Boolean) as string[];
    metaLines.forEach((line, i) => {
        doc.text(line, MARGIN, 128 + i * 14);
    });

    /* ── Stats grid ──────────────────────────────────────── */
    const enabled = input.checks.filter((c) => c.enabled !== false);
    const okCount = enabled.filter((c) => input.logEntries[c.id]?.status === 'ok').length;
    const anomCount = enabled.filter((c) => input.logEntries[c.id]?.status === 'afwijking').length;
    const compliancePct = enabled.length > 0 ? Math.round((okCount / enabled.length) * 100) : 0;

    const statsY = 128 + metaLines.length * 14 + 16;
    const tileWidth = (W - 2 * MARGIN - 24) / 4;
    const tiles = [
        { label: 'Totaal checks', value: enabled.length.toString(), color: [80, 80, 80] as [number, number, number] },
        { label: 'Goedgekeurd', value: okCount.toString(), color: [34, 197, 94] as [number, number, number] },
        { label: 'Afwijkingen', value: anomCount.toString(), color: anomCount > 0 ? ([245, 158, 11] as [number, number, number]) : ([80, 80, 80] as [number, number, number]) },
        { label: 'Compliance', value: `${compliancePct}%`, color: anomCount === 0 ? ([34, 197, 94] as [number, number, number]) : ([245, 158, 11] as [number, number, number]) },
    ];
    tiles.forEach((tile, i) => {
        const x = MARGIN + i * (tileWidth + 8);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.5);
        doc.roundedRect(x, statsY, tileWidth, 56, 6, 6);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(tile.color[0], tile.color[1], tile.color[2]);
        doc.text(tile.value, x + 12, statsY + 26);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(tile.label.toUpperCase(), x + 12, statsY + 44);
    });

    /* ── Anomaly banner ──────────────────────────────────── */
    let tableY = statsY + 56 + 20;
    if (anomCount > 0) {
        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(245, 158, 11);
        doc.roundedRect(MARGIN, tableY, W - 2 * MARGIN, 32, 4, 4, 'FD');
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(146, 64, 14);
        doc.text(`⚠ ${anomCount} afwijking${anomCount > 1 ? 'en' : ''} gedetecteerd`, MARGIN + 12, tableY + 14);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text('Data-integriteit: registraties zijn niet aangepast — anomaly genoteerd achteraf', MARGIN + 12, tableY + 26);
        tableY += 48;
    }

    /* ── Registratie-tabel ───────────────────────────────── */
    const tableRows = enabled.map((c, i) => {
        const entry = input.logEntries[c.id];
        const typeLabel = CHECK_TYPES[c.type]?.label ?? c.type;
        return [
            (i + 1).toString(),
            c.label,
            typeLabel,
            c.target,
            c.time,
            entry?.at ?? '—',
            entry?.val ?? '—',
            entry?.status === 'ok' ? 'OK' : entry?.status === 'afwijking' ? 'AFWIJKING' : 'OPENSTAAND',
            entry?.by ?? '—',
        ];
    });

    autoTable(doc, {
        startY: tableY,
        head: [['#', 'Check', 'Type', 'Norm', 'Plan', 'Log', 'Waarde', 'Status', 'Door']],
        body: tableRows,
        theme: 'grid',
        headStyles: {
            fillColor: [30, 30, 32],
            textColor: 240,
            fontSize: 8,
            fontStyle: 'bold',
        },
        bodyStyles: { fontSize: 9, textColor: 60 },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        didParseCell: (data) => {
            // Highlight afwijking-rijen
            if (data.section === 'body' && data.column.index === 7 && data.cell.text[0] === 'AFWIJKING') {
                data.cell.styles.textColor = [245, 158, 11];
                data.cell.styles.fontStyle = 'bold';
            }
            if (data.section === 'body' && data.column.index === 7 && data.cell.text[0] === 'OK') {
                data.cell.styles.textColor = [34, 197, 94];
            }
        },
        columnStyles: {
            0: { cellWidth: 20 },
            4: { cellWidth: 40, halign: 'center' },
            5: { cellWidth: 40, halign: 'center' },
            6: { cellWidth: 50, halign: 'right', fontStyle: 'bold' },
            7: { cellWidth: 60 },
        },
        margin: { left: MARGIN, right: MARGIN },
    });

    /* ── Footer met juridische bronnen ───────────────────── */
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? tableY + 200;
    let footerY = finalY + 24;
    if (footerY > 770) {
        doc.addPage();
        footerY = 60;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text('Verklaring van data-integriteit', MARGIN, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
        'Alle registraties in dit dossier zijn door een bevoegd persoon ter plaatse bevestigd.\nGeen AI-derived rijen. Anomalies (indien aanwezig) zijn achteraf gedetecteerd en gerapporteerd zonder aanpassing op de oorspronkelijke meetwaarden.',
        MARGIN,
        footerY + 14,
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text('Toegepaste regelgeving', MARGIN, footerY + 60);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    NVWA_REFS.forEach((ref, i) => {
        doc.text(`• ${ref}`, MARGIN, footerY + 76 + i * 12);
    });

    // Page numbering
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(160, 160, 160);
        doc.text(
            `${i} / ${pageCount}`,
            W - MARGIN,
            doc.internal.pageSize.getHeight() - 20,
            { align: 'right' },
        );
        doc.text(`Generated by BBQ Architect · NVWA-compliant`, MARGIN, doc.internal.pageSize.getHeight() - 20);
    }

    return doc;
}

export function downloadNvwaHaccpPdf(input: NvwaPdfInput, filename?: string) {
    const doc = generateNvwaHaccpPdf(input);
    const safeName = (input.event.title || 'haccp-event').replace(/[^a-z0-9-]+/gi, '_').toLowerCase();
    doc.save(filename ?? `HACCP_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
