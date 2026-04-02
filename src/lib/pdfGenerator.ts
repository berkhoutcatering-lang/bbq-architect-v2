/**
 * PDF Generator for BBQ Architect
 * Premium white-background design with gold accents
 */

import type { Settings, LineTotals } from '@/types';

interface LogoResult {
    data: string;
    w: number;
    h: number;
}

interface PDFOptions {
    type: 'factuur' | 'offerte' | 'haccp' | 'receipt';
    form?: Record<string, any>;
    settings?: Partial<Settings>;
    totals?: LineTotals;
    // HACCP specific
    eventName?: string;
    eventDatum?: string;
    eventGasten?: number;
    records?: Array<Record<string, any>>;
    // Receipt specific
    winkel?: string;
    datum?: string;
    totaal_bedrag?: number;
    items?: Array<Record<string, any>>;
    imageData?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

let jsPDFLoaded: Promise<any> | null = null;

function loadJsPDF(): Promise<any> {
    if (jsPDFLoaded) return jsPDFLoaded;
    jsPDFLoaded = new Promise(function (resolve, reject) {
        let attempts = 0;
        function check(): void {
            if ((window as any).jspdf) { resolve((window as any).jspdf); return; }
            attempts++;
            if (attempts > 50) { reject(new Error('jsPDF kon niet geladen worden.')); return; }
            setTimeout(check, 100);
        }
        check();
    });
    return jsPDFLoaded;
}

function loadLogoAsBase64(): Promise<LogoResult | null> {
    return new Promise(function (resolve) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            console.log('[PDF] Logo geladen:', img.naturalWidth + 'x' + img.naturalHeight);
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
        };
        img.onerror = function () { console.warn('[PDF] Logo niet gevonden'); resolve(null); };
        img.src = '/logo.png';
    });
}

// ── Helpers ──
function eur(n: number | null | undefined): string {
    if (n == null || isNaN(n)) return '\u20ac 0,00';
    return '\u20ac ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nlDate(d: string | null | undefined): string {
    if (!d) return '';
    const p = d.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

// ── Brand Colors ──
const GOLD: [number, number, number] = [180, 140, 20];
const DARK_GOLD: [number, number, number] = [140, 105, 10];
const BLACK: [number, number, number] = [35, 35, 35];
const DARK_GRAY: [number, number, number] = [80, 80, 80];
const MID_GRAY: [number, number, number] = [130, 130, 130];
const LIGHT_BG: [number, number, number] = [250, 248, 244];
const WHITE: [number, number, number] = [255, 255, 255];

/**
 * Generate a premium PDF invoice or quote
 */
export async function generatePDF(opts: PDFOptions): Promise<void> {
    try {
        const type = opts.type;

        // ═══ HACCP RAPPORT PDF ═══
        if (type === 'haccp') {
            const jspdf2 = await loadJsPDF();
            const doc2 = new jspdf2.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW2 = 210; const mL2 = 18; const mR2 = 18;

            doc2.setFillColor(...GOLD);
            doc2.rect(0, 0, pageW2, 3, 'F');

            const logo2 = await loadLogoAsBase64();
            let y2 = 10;
            if (logo2 && logo2.data) {
                let lw2 = 50; let lh2 = lw2 * (logo2.h / logo2.w);
                if (lh2 > 30) { lh2 = 30; lw2 = lh2 * (logo2.w / logo2.h); }
                doc2.addImage(logo2.data, 'PNG', (pageW2 - lw2) / 2, y2, lw2, lh2);
                y2 += lh2 + 4;
            } else {
                doc2.setFontSize(20); doc2.setTextColor(...GOLD); doc2.setFont('helvetica', 'bold');
                doc2.text('HOP & BITES', pageW2 / 2, y2 + 8, { align: 'center' });
                y2 += 16;
            }

            const bw2 = 60; const bx2 = (pageW2 - bw2) / 2;
            doc2.setFillColor(200, 50, 50);
            doc2.roundedRect(bx2, y2, bw2, 9, 2, 2, 'F');
            doc2.setFontSize(12); doc2.setFont('helvetica', 'bold'); doc2.setTextColor(...WHITE);
            doc2.text('HACCP RAPPORT', pageW2 / 2, y2 + 6.5, { align: 'center' });
            y2 += 15;

            doc2.setFontSize(10); doc2.setFont('helvetica', 'bold'); doc2.setTextColor(...BLACK);
            doc2.text('Event: ' + (opts.eventName || 'Onbekend'), mL2, y2);
            y2 += 5;
            doc2.setFontSize(9); doc2.setFont('helvetica', 'normal'); doc2.setTextColor(...DARK_GRAY);
            doc2.text('Datum: ' + nlDate(opts.eventDatum || '') + (opts.eventGasten ? '   \u2022   Gasten: ' + opts.eventGasten : ''), mL2, y2);
            y2 += 8;

            const haccpHead = [['Tijd', 'Type Check', 'Product', 'Temp', 'Status', 'Chef']];
            const haccpBody = (opts.records || []).map(function (r) {
                const ctLabels: Record<string, string> = { ontvangst: 'Ontvangst', opslag: 'Opslag/Koeling', bereiding: 'Bereiding', regenereren: 'Regenereren', uitgifte: 'Uitgifte' };
                return [
                    (r.tijd || '') + (r.datum ? ' (' + nlDate(r.datum) + ')' : ''),
                    ctLabels[r.check_type] || r.type || '',
                    r.wat || '',
                    r.temp + '\u00b0C',
                    r.status === 'ok' ? 'OK' : r.status === 'warn' ? 'LET OP' : 'AFWIJKING',
                    r.chef || 'Cor'
                ];
            });

            doc2.autoTable({
                startY: y2,
                head: haccpHead,
                body: haccpBody,
                margin: { left: mL2, right: mR2 },
                styles: { fontSize: 8, cellPadding: 3, textColor: BLACK, lineColor: [200, 200, 200], lineWidth: 0.2 },
                headStyles: { fillColor: [200, 50, 50], textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
                columnStyles: {
                    0: { cellWidth: 35 }, 1: { cellWidth: 28 }, 2: { cellWidth: 'auto' },
                    3: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                    4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 20 }
                },
                didParseCell: function (data: any) {
                    if (data.section === 'body' && data.column.index === 4) {
                        const val = data.cell.raw;
                        if (val === 'AFWIJKING') { data.cell.styles.textColor = [200, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
                        else if (val === 'LET OP') { data.cell.styles.textColor = [200, 150, 0]; data.cell.styles.fontStyle = 'bold'; }
                        else { data.cell.styles.textColor = [34, 150, 80]; }
                    }
                },
                theme: 'grid'
            });

            const fy2 = doc2.lastAutoTable.finalY + 12;
            doc2.setDrawColor(...GOLD); doc2.setLineWidth(0.3);
            doc2.line(mL2, fy2, pageW2 - mR2, fy2);
            const fy2b = fy2 + 5;
            doc2.setFontSize(7); doc2.setFont('helvetica', 'italic'); doc2.setTextColor(...MID_GRAY);
            doc2.text('Digitaal HACCP Dossier \u2014 Gegenereerd door BBQ Architect op ' + new Date().toLocaleString('nl-NL'), pageW2 / 2, fy2b, { align: 'center' });
            doc2.text('Dit document dient als bewijs van temperatuurregistratie conform HACCP-normen.', pageW2 / 2, fy2b + 3, { align: 'center' });

            doc2.setFillColor(...GOLD);
            doc2.rect(0, 294, pageW2, 3, 'F');

            doc2.save('HACCP_Rapport_' + (opts.eventName || 'event').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf');
            return;
        }

        // ═══ RECEIPT / BON PDF ═══
        if (type === 'receipt') {
            const jspdf3 = await loadJsPDF();
            const doc3 = new jspdf3.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW3 = 210; const mL3 = 20;

            doc3.setFillColor(...GOLD);
            doc3.rect(0, 0, pageW3, 3, 'F');
            doc3.setFontSize(18); doc3.setTextColor(...GOLD); doc3.setFont('helvetica', 'bold');
            doc3.text('DIGITAAL BON-ARCHIEF', pageW3 / 2, 15, { align: 'center' });

            doc3.setFontSize(10); doc3.setTextColor(...BLACK);
            doc3.text('Winkel: ' + (opts.winkel || 'Onbekend'), mL3, 25);
            doc3.text('Datum: ' + nlDate(opts.datum || ''), mL3, 30);
            doc3.text('Totaal: ' + eur(opts.totaal_bedrag || 0), mL3, 35);

            const receiptHead = [['Omschrijving', 'Aantal', 'Prijs', 'BTW']];
            const receiptBody = (opts.items || []).map(function (i) {
                return [i.naam || '', i.aantal || 1, eur(i.prijs), (i.btw_tarief || 21) + '%'];
            });

            doc3.autoTable({
                startY: 45,
                head: receiptHead,
                body: receiptBody,
                margin: { left: mL3, right: mL3 },
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: GOLD }
            });

            if (opts.imageData) {
                const imgY = doc3.lastAutoTable.finalY + 10;
                doc3.setFontSize(9); doc3.setFont('helvetica', 'bold');
                doc3.text('ORIGINEEL BEWIJS:', mL3, imgY);
                const imgW = 120;
                const imgH = 160;
                doc3.addImage(opts.imageData, 'JPEG', mL3, imgY + 5, imgW, imgH, undefined, 'FAST');
            }

            doc3.save('BON_' + (opts.winkel || 'scan').replace(/[^a-zA-Z0-9]/g, '_') + '_' + (opts.datum || 'nu') + '.pdf');
            return;
        }

        // ═══ INVOICE / QUOTE PDF ═══
        const form = opts.form!;
        const s = opts.settings || {};
        const totals = opts.totals!;
        const isFactuur = type === 'factuur';

        const jspdf = await loadJsPDF();
        const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageW = 210;
        const pageH = 297;
        const mL = 22;
        const mR = 22;
        const rightX = pageW - mR;
        const contentW = pageW - mL - mR;

        doc.setFillColor(...GOLD);
        doc.rect(0, 0, pageW, 3, 'F');

        const logoResult = await loadLogoAsBase64();
        let logoBottomY = 18;

        if (logoResult && logoResult.data) {
            const logoMaxW = 65;
            const logoMaxH = 40;
            let logoW = logoMaxW;
            let logoH = logoW * (logoResult.h / logoResult.w);
            if (logoH > logoMaxH) {
                logoH = logoMaxH;
                logoW = logoH * (logoResult.w / logoResult.h);
            }
            const logoX = (pageW - logoW) / 2;
            const logoY = 8;
            doc.addImage(logoResult.data, 'PNG', logoX, logoY, logoW, logoH);
            logoBottomY = logoY + logoH + 3;
        } else {
            doc.setFontSize(24);
            doc.setTextColor(...GOLD);
            doc.setFont('helvetica', 'bold');
            doc.text('HOP & BITES', pageW / 2, 25, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(...MID_GRAY);
            doc.setFont('helvetica', 'normal');
            doc.text(s.ondertitel || 'BBQ Catering', pageW / 2, 32, { align: 'center' });
            logoBottomY = 38;
        }

        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.4);
        doc.line(mL + 30, logoBottomY, pageW - mR - 30, logoBottomY);

        let compY = logoBottomY + 5;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);

        const compParts: string[] = [];
        if (s.adres) compParts.push(s.adres);
        if (s.telefoon) compParts.push('Tel: ' + s.telefoon);
        if (s.email) compParts.push(s.email);
        if (compParts.length > 0) {
            doc.text(compParts.join('   \u2022   '), pageW / 2, compY, { align: 'center' });
            compY += 4;
        }
        const compParts2: string[] = [];
        if (s.kvk) compParts2.push('KVK: ' + s.kvk);
        if (s.btw) compParts2.push('BTW: ' + s.btw);
        if (s.iban) compParts2.push('IBAN: ' + s.iban);
        if (compParts2.length > 0) {
            doc.text(compParts2.join('   \u2022   '), pageW / 2, compY, { align: 'center' });
            compY += 4;
        }
        if ((s as any).website) {
            doc.text((s as any).website, pageW / 2, compY, { align: 'center' });
            compY += 4;
        }

        const badgeY = compY + 4;
        const badgeText = isFactuur ? 'FACTUUR' : 'OFFERTE';

        const badgeW = 50;
        const badgeH = 10;
        const badgeX = (pageW - badgeW) / 2;
        doc.setFillColor(...GOLD);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text(badgeText, pageW / 2, badgeY + 7.3, { align: 'center' });

        let y = badgeY + badgeH + 10;

        const colLeftX = mL;
        const colRightLabelX = pageW / 2 + 15;
        const colRightValX = rightX;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GOLD);
        doc.text('FACTUUR AAN', colLeftX, y);
        y += 5;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLACK);
        doc.text(form.client_naam || '', colLeftX, y);

        let detY = y - 5;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GOLD);
        doc.text('GEGEVENS', colRightLabelX, detY);
        detY += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        doc.setTextColor(...MID_GRAY);
        doc.text('Nummer:', colRightLabelX, detY);
        doc.setTextColor(...BLACK);
        doc.setFont('helvetica', 'bold');
        doc.text(form.nummer || '', colRightValX, detY, { align: 'right' });
        detY += 5;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);
        doc.text(isFactuur ? 'Factuurdatum:' : 'Datum:', colRightLabelX, detY);
        doc.setTextColor(...BLACK);
        doc.text(nlDate(form.datum), colRightValX, detY, { align: 'right' });
        detY += 5;

        doc.setTextColor(...MID_GRAY);
        doc.text(isFactuur ? 'Vervaldatum:' : 'Geldig tot:', colRightLabelX, detY);
        doc.setTextColor(...BLACK);
        doc.text(nlDate(isFactuur ? form.vervaldatum : form.geldig_tot), colRightValX, detY, { align: 'right' });
        detY += 5;

        y += 5;
        if (form.client_adres) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...DARK_GRAY);
            const adresLines = doc.splitTextToSize(form.client_adres, 80);
            doc.text(adresLines, colLeftX, y);
            y += adresLines.length * 4.5;
        }

        y = Math.max(y + 8, detY + 8);

        if (form.notitie) {
            doc.setFontSize(9);
            doc.setTextColor(...DARK_GRAY);
            doc.setFont('helvetica', 'italic');
            doc.text('Betreft: ' + form.notitie, colLeftX, y);
            y += 7;
        }

        const tableHead = [['Omschrijving', 'Aantal', 'Prijs', 'BTW%', 'Totaal']];
        const tableBody = (form.items || []).map(function (item: any) {
            const lineTotal = (item.qty || 0) * (item.prijs || 0);
            return [
                item.desc || '',
                String(item.qty || 0),
                eur(item.prijs),
                (item.btw || 0) + '%',
                eur(lineTotal)
            ];
        });

        doc.autoTable({
            startY: y,
            head: tableHead,
            body: tableBody,
            margin: { left: mL, right: mR },
            styles: {
                fontSize: 9,
                cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
                textColor: BLACK,
                lineColor: [220, 215, 205],
                lineWidth: 0.2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: LIGHT_BG,
                textColor: DARK_GOLD,
                fontStyle: 'bold',
                fontSize: 8,
                lineColor: GOLD,
                lineWidth: 0.3
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 28, halign: 'right' },
                3: { cellWidth: 18, halign: 'center' },
                4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
            },
            alternateRowStyles: { fillColor: [255, 255, 255] },
            bodyStyles: { fillColor: [255, 255, 255] },
            theme: 'grid',
            tableLineColor: [220, 215, 205],
            tableLineWidth: 0.2
        });

        y = doc.lastAutoTable.finalY + 8;

        const totBoxX = rightX - 75;
        const totValX = rightX;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);
        doc.text('Subtotaal', totBoxX, y);
        doc.setTextColor(...BLACK);
        doc.text(eur(totals.subtotaal), totValX, y, { align: 'right' });
        y += 5.5;

        doc.setTextColor(...MID_GRAY);
        doc.text('BTW', totBoxX, y);
        doc.setTextColor(...BLACK);
        doc.text(eur(totals.btw), totValX, y, { align: 'right' });
        y += 3;

        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.8);
        doc.line(totBoxX, y, totValX, y);
        y += 6;

        const totBoxW = 75;
        doc.setFillColor(...GOLD);
        doc.roundedRect(totBoxX - 3, y - 5, totBoxW + 6, 10, 1.5, 1.5, 'F');

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text('TOTAAL', totBoxX, y + 1.5);
        doc.text(eur(totals.totaal), totValX, y + 1.5, { align: 'right' });
        y += 18;

        if (isFactuur) {
            const payH = 20;
            doc.setFillColor(252, 250, 245);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'F');
            doc.setDrawColor(...GOLD);
            doc.setLineWidth(0.3);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'S');

            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GOLD);
            doc.text('BETALINGSGEGEVENS', mL + 5, y + 3);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...DARK_GRAY);

            if ((s as any).betaalvoorwaarden) {
                const betLines = doc.splitTextToSize((s as any).betaalvoorwaarden, contentW - 12);
                doc.text(betLines, mL + 5, y + 8);
            } else {
                const defText = 'Gelieve ' + eur(totals.totaal) + ' over te maken voor ' + nlDate(form.vervaldatum) + ' op:';
                doc.text(defText, mL + 5, y + 8);
            }

            if (s.iban) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...BLACK);
                doc.text(s.iban + ' t.n.v. ' + (s.bedrijfsnaam || 'Hop & Bites') + ' o.v.v. "' + (form.nummer || '') + '"', mL + 5, y + 13);
            }

            y += payH + 8;
        }

        doc.setFillColor(...GOLD);
        doc.rect(0, pageH - 3, pageW, 3, 'F');

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);

        const footItems: string[] = [];
        if (s.bedrijfsnaam) footItems.push(s.bedrijfsnaam);
        if (s.email) footItems.push(s.email);
        if (s.telefoon) footItems.push(s.telefoon);
        if ((s as any).website) footItems.push((s as any).website);
        if (footItems.length > 0) {
            doc.text(footItems.join('   \u2022   '), pageW / 2, pageH - 6, { align: 'center' });
        }

        const prefix = isFactuur ? 'Factuur' : 'Offerte';
        doc.save(prefix + '_' + (form.nummer || 'document') + '.pdf');

    } catch (err: any) {
        console.error('PDF generatie fout:', err);
        alert('PDF kon niet gegenereerd worden: ' + (err.message || 'Onbekende fout') + '\n\nProbeer de pagina te vernieuwen.');
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
