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
    type: 'factuur' | 'offerte' | 'haccp' | 'receipt' | 'menukaart';
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
    // Menukaart specific
    gerechten?: Array<{ naam: string; beschrijving?: string }>;
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

function loadDarkLogoAsBase64(): Promise<LogoResult | null> {
    return new Promise(function (resolve) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            console.log('[PDF] Dark logo geladen:', img.naturalWidth + 'x' + img.naturalHeight);
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
        };
        img.onerror = function () { console.warn('[PDF] Dark logo niet gevonden, fallback naar tekst'); resolve(null); };
        img.src = '/logo-dark.jpeg';
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
const GOLD: [number, number, number] = [158, 120, 28];
const DARK_GOLD: [number, number, number] = [130, 95, 15];
const BLACK: [number, number, number] = [30, 30, 30];
const NEAR_BLACK: [number, number, number] = [15, 15, 15];
const DARK_PANEL: [number, number, number] = [245, 242, 235];
const DARK_GRAY: [number, number, number] = [70, 70, 70];
const MID_GRAY: [number, number, number] = [120, 115, 105];
const LIGHT_TEXT: [number, number, number] = [245, 240, 230];
const LIGHT_BG: [number, number, number] = [250, 248, 244];
const WHITE: [number, number, number] = [255, 255, 255];

// ── Corner decorations helper ──
function drawCornerDecorations(doc: any, x: number, y: number, w: number, h: number, len: number, color: [number, number, number], lineW: number) {
    doc.setDrawColor(...color);
    doc.setLineWidth(lineW);
    // Top-left
    doc.line(x, y, x + len, y);
    doc.line(x, y, x, y + len);
    // Top-right
    doc.line(x + w - len, y, x + w, y);
    doc.line(x + w, y, x + w, y + len);
    // Bottom-left
    doc.line(x, y + h - len, x, y + h);
    doc.line(x, y + h, x + len, y + h);
    // Bottom-right
    doc.line(x + w, y + h - len, x + w, y + h);
    doc.line(x + w - len, y + h, x + w, y + h);
}

// ── Gang name mappings (module-level for reuse) ──
const courseNames: Record<string, string> = {
    '1': 'Amuse', '2': 'Voorgerecht', '3': 'Hoofdgerecht', '4': 'Dessert',
    '5': 'Nagerecht', '6': 'Petit Four'
};
const slugNames: Record<string, string> = {
    'bite': 'Bites', 'voorgerecht': 'Voorgerechten', 'hoofdgerecht': 'Hoofdgerechten',
    'vegetarisch': 'Vegetarisch', 'dessert': 'Dessert', 'bijgerecht': 'Bijgerechten',
    'borrelhap': 'Borrelhapjes', 'anders': 'Overig'
};
function gangToDisplayName(gangLabel: string): string {
    const lower = gangLabel.toLowerCase().trim();
    if (slugNames[lower]) return slugNames[lower];
    const m = gangLabel.match(/\d+/);
    if (m && courseNames[m[0]]) return courseNames[m[0]];
    return gangLabel;
}

// ── Parse menu_selectie into structured gang data ──
function parseMenuGangen(menuSel: any): { gang: string; gerechten: string[] }[] {
    if (!menuSel) return [];
    const result: { gang: string; gerechten: string[] }[] = [];

    if (typeof menuSel === 'object' && !Array.isArray(menuSel)) {
        // Object format: { "Gang 1": [{naam: "..."}, ...], ... }
        Object.keys(menuSel).forEach(function (gangName) {
            const items = menuSel[gangName];
            if (Array.isArray(items)) {
                result.push({
                    gang: gangName,
                    gerechten: items.map(function (i: any) { return typeof i === 'string' ? i : (i.gerecht_naam || i.naam || ''); }).filter(Boolean)
                });
            }
        });
    } else if (Array.isArray(menuSel)) {
        // Flat array — group into single gang
        const names = menuSel.map(function (i: any) { return typeof i === 'string' ? i : (i.gerecht_naam || i.naam || ''); }).filter(Boolean);
        if (names.length > 0) {
            result.push({ gang: 'Menu', gerechten: names });
        }
    }
    return result;
}

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

        // ═══ MENUKAART PDF — DARK ELEGANT RESTAURANT STYLE ═══
        if (type === 'menukaart') {
            const form = opts.form || {};
            const jspdfM = await loadJsPDF();
            const docM = new jspdfM.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = 210;
            const pageH = 297;
            const centerX = pageW / 2;

            // Color palette for dark menu
            const MENU_BG: [number, number, number] = [18, 18, 18];
            const MENU_GOLD: [number, number, number] = [178, 145, 62];
            const MENU_CREAM: [number, number, number] = [245, 240, 230];
            const MENU_GRAY: [number, number, number] = [160, 155, 145];

            // Gang sort order for correct menu sequence
            const gangOrder: Record<string, number> = {
                'bites': 0, 'amuse': 1, 'voorgerechten': 2, 'voorgerecht': 2,
                'hoofdgerechten': 3, 'hoofdgerecht': 3, 'vegetarisch': 4,
                'bijgerechten': 5, 'dessert': 6, 'nagerecht': 7, 'petit four': 8
            };

            function drawMenuBackground(d: any) {
                d.setFillColor(...MENU_BG);
                d.rect(0, 0, pageW, pageH, 'F');
            }

            function drawMenuBorder(d: any) {
                // Outer border
                d.setDrawColor(...MENU_GOLD);
                d.setLineWidth(0.5);
                d.roundedRect(12, 12, pageW - 24, pageH - 24, 3, 3, 'S');
                // Inner border
                d.setLineWidth(0.15);
                d.roundedRect(15, 15, pageW - 30, pageH - 30, 2, 2, 'S');
            }

            // -- Draw first page background + border
            drawMenuBackground(docM);
            drawMenuBorder(docM);

            // -- Logo (try dark logo, fallback to text-only)
            let y = 28;
            const logoDark = await loadDarkLogoAsBase64();
            if (logoDark && logoDark.data) {
                let lw = 50; let lh = lw * (logoDark.h / logoDark.w);
                if (lh > 45) { lh = 45; lw = lh * (logoDark.w / logoDark.h); }
                docM.addImage(logoDark.data, 'PNG', centerX - lw / 2, y, lw, lh);
                y += lh + 8;
            } else {
                // Text-only fallback
                y = 45;
                docM.setFontSize(22);
                docM.setFont('helvetica', 'bold');
                docM.setTextColor(...MENU_GOLD);
                docM.text('H O P   &   B I T E S', centerX, y, { align: 'center' });
                y += 8;
            }

            // Gold divider
            docM.setDrawColor(...MENU_GOLD);
            docM.setLineWidth(0.3);
            docM.line(centerX - 30, y, centerX + 30, y);
            y += 14;

            // -- Parse menu data
            let gangen = parseMenuGangen(form.menu_selectie);
            if (gangen.length === 0 && form.notitie) {
                const notitieText = String(form.notitie);
                const gangRegex = /GANG\s*(\d+)\s*:\s*([\s\S]*?)(?=GANG\s*\d|$)/gi;
                let match;
                while ((match = gangRegex.exec(notitieText)) !== null) {
                    const gangNum = match[1];
                    const gerechtenStr = match[2].trim();
                    const gerechtenList = gerechtenStr.split(/\s*-\s*/).map(function (g: string) { return g.trim(); }).filter(Boolean);
                    if (gerechtenList.length > 0) {
                        gangen.push({ gang: 'Gang ' + gangNum, gerechten: gerechtenList });
                    }
                }
            }
            gangen = gangen.map(function (g) {
                return { gang: gangToDisplayName(g.gang), gerechten: g.gerechten };
            });
            // Sort gangen in correct menu order
            gangen.sort(function (a, b) {
                const oa = gangOrder[a.gang.toLowerCase()] ?? 99;
                const ob = gangOrder[b.gang.toLowerCase()] ?? 99;
                return oa - ob;
            });

            // Build beschrijving lookup from gerechten data
            const beschrijvingMap: Record<string, string> = {};
            if (opts.gerechten) {
                opts.gerechten.forEach(function (gr) {
                    if (gr.naam && gr.beschrijving) beschrijvingMap[gr.naam.toLowerCase()] = gr.beschrijving;
                });
            }

            // -- Render gangen
            gangen.forEach(function (gang, gi) {
                // Check page overflow
                if (y > pageH - 50) {
                    docM.addPage();
                    drawMenuBackground(docM);
                    drawMenuBorder(docM);
                    y = 30;
                }

                // Gang title: "— VOORGERECHTEN —"
                docM.setFontSize(13);
                docM.setFont('helvetica', 'bold');
                docM.setTextColor(...MENU_GOLD);
                docM.text('\u2014  ' + gang.gang.toUpperCase() + '  \u2014', centerX, y, { align: 'center' });
                y += 9;

                // Dishes: even index = name, odd = description
                for (let i = 0; i < gang.gerechten.length; i += 2) {
                    if (y > pageH - 40) {
                        docM.addPage();
                        drawMenuBackground(docM);
                        drawMenuBorder(docM);
                        y = 30;
                    }

                    const dishName = gang.gerechten[i];
                    // Description: try beschrijvingMap first, then odd-index entry
                    let desc = beschrijvingMap[dishName.toLowerCase()] || '';
                    if (!desc && i + 1 < gang.gerechten.length) {
                        desc = gang.gerechten[i + 1];
                    }

                    // Dish name
                    docM.setFontSize(12);
                    docM.setFont('helvetica', 'bold');
                    docM.setTextColor(...MENU_CREAM);
                    docM.text(dishName, centerX, y, { align: 'center' });
                    y += 5;

                    // Description
                    if (desc) {
                        docM.setFontSize(9);
                        docM.setFont('helvetica', 'italic');
                        docM.setTextColor(...MENU_GRAY);
                        const descLines = docM.splitTextToSize(desc, 130);
                        descLines.forEach(function (line: string) {
                            docM.text(line, centerX, y, { align: 'center' });
                            y += 3.8;
                        });
                    }
                    y += 4;
                }

                // Spacing between gangen (no dots)
                if (gi < gangen.length - 1) {
                    y += 6;
                }
            });

            docM.save('Menukaart_' + (form.nummer || 'menu').replace(/[^a-zA-Z0-9-]/g, '_') + '.pdf');
            return;
        }

        // ═══ INVOICE / QUOTE PDF — HOPBITES WHITE LUXURY STYLE ═══
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

        // ── White background (default) ──

        // ── Single page corner frame ──
        drawCornerDecorations(doc, 10, 10, pageW - 20, pageH - 20, 16, GOLD, 0.4);

        // ── Top gold accent bar ──
        doc.setFillColor(...GOLD);
        doc.rect(0, 0, pageW, 2.5, 'F');

        // ── Logo ──
        const logoResult = await loadLogoAsBase64();
        let logoBottomY = 22;

        if (logoResult && logoResult.data) {
            const logoMaxW = 60;
            const logoMaxH = 38;
            let logoW = logoMaxW;
            let logoH = logoW * (logoResult.h / logoResult.w);
            if (logoH > logoMaxH) { logoH = logoMaxH; logoW = logoH * (logoResult.w / logoResult.h); }
            const logoX = (pageW - logoW) / 2;
            doc.addImage(logoResult.data, 'PNG', logoX, 8, logoW, logoH);
            logoBottomY = 8 + logoH + 3;
        } else {
            doc.setFontSize(26);
            doc.setTextColor(...DARK_GOLD);
            doc.setFont('helvetica', 'bold');
            doc.text('HOP & BITES', pageW / 2, 24, { align: 'center' });
            doc.setFontSize(8);
            doc.setTextColor(...MID_GRAY);
            doc.setFont('helvetica', 'normal');
            doc.text('B B Q   C A T E R I N G', pageW / 2, 30, { align: 'center' });
            logoBottomY = 36;
        }

        // ── Simple gold divider under logo ──
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.4);
        doc.line(mL + 30, logoBottomY, pageW - mR - 30, logoBottomY);

        // ── Company info ──
        let compY = logoBottomY + 5;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);

        const compParts: string[] = [];
        if (s.adres) compParts.push(s.adres);
        if (s.telefoon) compParts.push(s.telefoon);
        if (s.email) compParts.push(s.email);
        if (compParts.length > 0) {
            doc.text(compParts.join('    \u2022    '), pageW / 2, compY, { align: 'center' });
            compY += 3.5;
        }
        const compParts2: string[] = [];
        if (s.kvk) compParts2.push('KVK ' + s.kvk);
        if (s.btw) compParts2.push('BTW ' + s.btw);
        if (s.iban) compParts2.push('IBAN ' + s.iban);
        if (compParts2.length > 0) {
            doc.text(compParts2.join('    \u2022    '), pageW / 2, compY, { align: 'center' });
            compY += 3.5;
        }

        // ── Document type badge ──
        const badgeY = compY + 4;
        const badgeText = isFactuur ? 'F A C T U U R' : 'O F F E R T E';
        const badgeW = 54;
        const badgeH = 10;
        const badgeX = (pageW - badgeW) / 2;

        doc.setFillColor(...GOLD);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text(badgeText, pageW / 2, badgeY + 7, { align: 'center' });

        let y = badgeY + badgeH + 12;

        // ── Client & document details ──
        const colLeftX = mL;
        const colRightLabelX = pageW / 2 + 15;
        const colRightValX = rightX;

        // Left: client
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GOLD);
        doc.text(isFactuur ? 'F A C T U U R   A A N' : 'O F F E R T E   A A N', colLeftX, y);
        y += 5;

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BLACK);
        doc.text(form.client_naam || '', colLeftX, y);

        // Right: details (same Y baseline)
        let detY = y - 5;
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...GOLD);
        doc.text('G E G E V E N S', colRightLabelX, detY);
        detY += 5;

        const details = [
            { label: 'Nummer', value: form.nummer || '' },
            { label: isFactuur ? 'Factuurdatum' : 'Datum', value: nlDate(form.datum) },
            { label: isFactuur ? 'Vervaldatum' : 'Geldig tot', value: nlDate(isFactuur ? form.vervaldatum : form.geldig_tot) }
        ];
        if (form.aantal_gasten) {
            details.push({ label: 'Gasten', value: String(form.aantal_gasten) });
        }

        details.forEach(function (d) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...MID_GRAY);
            doc.text(d.label + ':', colRightLabelX, detY);
            doc.setTextColor(...BLACK);
            doc.setFont('helvetica', 'bold');
            doc.text(d.value, colRightValX, detY, { align: 'right' });
            detY += 5;
        });

        y += 5;
        if (form.client_adres) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...DARK_GRAY);
            const adresLines = doc.splitTextToSize(form.client_adres, 80);
            doc.text(adresLines, colLeftX, y);
            y += adresLines.length * 4.5;
        }

        y = Math.max(y + 6, detY + 6);

        // ── Opmerking / Notitie ──
        if (form.notitie) {
            // Split notitie: text before first "GANG" is the remark, rest is menu (handled separately)
            const notitieText = String(form.notitie);
            const gangIdx = notitieText.search(/GANG\s*\d/i);
            const hasGangen = gangIdx >= 0;
            const opmerking = hasGangen && gangIdx > 0 ? notitieText.substring(0, gangIdx).trim() : (!hasGangen ? notitieText.trim() : '');

            if (opmerking) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.setTextColor(...DARK_GRAY);
                const opmLines = doc.splitTextToSize('Opmerking: ' + opmerking, contentW);
                doc.text(opmLines, colLeftX, y);
                y += opmLines.length * 4.5 + 4;
            }
        }

        // ── Menu / Gang Section ──
        // Try structured menu_selectie first, fallback to parsing notitie text
        let gangen: { gang: string; gerechten: string[] }[] = parseMenuGangen(form.menu_selectie);

        // Fallback: parse gang info from notitie if no structured menu_selectie
        if (gangen.length === 0 && form.notitie) {
            const notitieText = String(form.notitie);
            const gangRegex = /GANG\s*(\d+)\s*:\s*([\s\S]*?)(?=GANG\s*\d|$)/gi;
            let match;
            while ((match = gangRegex.exec(notitieText)) !== null) {
                const gangNum = match[1];
                const gerechtenStr = match[2].trim();
                const gerechten = gerechtenStr.split(/\s*-\s*/).map(function (g: string) { return g.trim(); }).filter(Boolean);
                if (gerechten.length > 0) {
                    gangen.push({ gang: 'Gang ' + gangNum, gerechten: gerechten });
                }
            }
        }

        // Rename gang labels to course names
        gangen = gangen.map(function (g) {
            return { gang: gangToDisplayName(g.gang), gerechten: g.gerechten };
        });

        // ── Render menu gangen (2-column compact layout) ──
        if (gangen.length > 0) {
            const menuStartY = y - 2;
            const colW = (contentW - 8) / 2;
            const col1X = mL + 5;
            const col2X = mL + colW + 8;
            const titleH = 5.5;   // height for gang title line
            const dishH = 3.2;    // height for dish line
            const gangGap = 4;    // gap between gangen

            // Build structured lines per gang: title, then alternating dish name + description
            const gangLines: { text: string; role: 'title' | 'dish' | 'desc' }[][] = [];
            gangen.forEach(function (gang) {
                const lines: { text: string; role: 'title' | 'dish' | 'desc' }[] = [];
                lines.push({ text: gang.gang.toUpperCase(), role: 'title' });
                gang.gerechten.forEach(function (g, i) {
                    // Even index (0, 2, 4...) = dish name, odd index (1, 3, 5...) = description
                    lines.push({ text: g, role: i % 2 === 0 ? 'dish' : 'desc' });
                });
                gangLines.push(lines);
            });

            // Split gangen into 2 columns
            const mid = Math.ceil(gangen.length / 2);
            const leftGangen = gangLines.slice(0, mid);
            const rightGangen = gangLines.slice(mid);

            const dishNameH = 4;  // height for dish name (bold)
            const dishDescH = 3;  // height for description (subtle)
            const dishPairGap = 1.5; // extra gap between dish pairs

            // Calculate height per column
            function calcColH(col: { text: string; role: 'title' | 'dish' | 'desc' }[][]) {
                let h = 0;
                col.forEach(function (lines, gi) {
                    lines.forEach(function (line, li) {
                        if (line.role === 'title') h += titleH;
                        else if (line.role === 'dish') h += dishNameH;
                        else { h += dishDescH; h += dishPairGap; } // add gap after each desc (end of pair)
                    });
                    if (gi < col.length - 1) h += gangGap;
                });
                return h;
            }
            const menuH = Math.max(calcColH(leftGangen), calcColH(rightGangen)) + 14;

            // Background panel
            doc.setFillColor(...DARK_PANEL);
            doc.roundedRect(mL, menuStartY, contentW, menuH, 2, 2, 'F');
            doc.setDrawColor(...GOLD);
            doc.setLineWidth(0.15);
            doc.roundedRect(mL, menuStartY, contentW, menuH, 2, 2, 'S');

            // Header
            doc.setFontSize(5.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GOLD);
            doc.text('M E N U', mL + 5, y + 1.5);

            // Render column helper
            function renderColumn(colGangen: { text: string; role: 'title' | 'dish' | 'desc' }[][], startX: number) {
                let cy = y + 6;
                colGangen.forEach(function (lines, gi) {
                    lines.forEach(function (line) {
                        if (line.role === 'title') {
                            // Course title — bold, gold, with underline accent
                            doc.setFontSize(9.5);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(...DARK_GOLD);
                            doc.text(line.text, startX, cy);
                            doc.setDrawColor(...GOLD);
                            doc.setLineWidth(0.2);
                            doc.line(startX, cy + 1, startX + 20, cy + 1);
                            cy += titleH;
                        } else if (line.role === 'dish') {
                            // Dish name — bold, dark
                            doc.setFontSize(8);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(...BLACK);
                            doc.text(line.text, startX + 3, cy);
                            cy += dishNameH;
                        } else {
                            // Description — italic, subtle, smaller
                            doc.setFontSize(6.5);
                            doc.setFont('helvetica', 'italic');
                            doc.setTextColor(...MID_GRAY);
                            doc.text(line.text, startX + 3, cy);
                            cy += dishDescH + dishPairGap;
                        }
                    });
                    if (gi < colGangen.length - 1) cy += gangGap;
                });
            }

            renderColumn(leftGangen, col1X);
            renderColumn(rightGangen, col2X);

            // Vertical divider between columns
            doc.setDrawColor(...GOLD);
            doc.setLineWidth(0.1);
            doc.line(mL + colW + 3, menuStartY + 4, mL + colW + 3, menuStartY + menuH - 4);

            y = menuStartY + menuH + 6;
        }

        // ── Items table ──
        const tableHead = [['Omschrijving', 'Aantal', 'Prijs', 'BTW%', 'Totaal']];
        const tableBody = (form.items || []).map(function (item: any) {
            const lineTotal = (item.qty || 0) * (item.prijs || 0);
            return [
                item.desc || item.omschrijving || '',
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
                lineColor: [210, 205, 195],
                lineWidth: 0.2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: DARK_PANEL,
                textColor: DARK_GOLD,
                fontStyle: 'bold',
                fontSize: 7.5,
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
            bodyStyles: { fillColor: [252, 250, 247] },
            theme: 'grid',
            tableLineColor: [210, 205, 195],
            tableLineWidth: 0.2
        });

        y = doc.lastAutoTable.finalY + 8;

        // ── Totals section ──
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

        // Gold divider
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.6);
        doc.line(totBoxX, y, totValX, y);
        y += 6;

        // Total amount bar
        const totBarW = 81;
        doc.setFillColor(...GOLD);
        doc.roundedRect(totBoxX - 3, y - 5, totBarW, 10, 1.5, 1.5, 'F');

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...WHITE);
        doc.text('TOTAAL', totBoxX, y + 1.5);
        doc.text(eur(totals.totaal), totValX, y + 1.5, { align: 'right' });
        y += 18;

        // ── Payment details (factuur only) ──
        if (isFactuur) {
            const payH = 20;
            doc.setFillColor(...DARK_PANEL);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'F');
            doc.setDrawColor(...GOLD);
            doc.setLineWidth(0.25);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'S');

            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...GOLD);
            doc.text('B E T A L I N G S G E G E V E N S', mL + 5, y + 3);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...DARK_GRAY);

            if ((s as any).betaalvoorwaarden) {
                const betLines = doc.splitTextToSize((s as any).betaalvoorwaarden, contentW - 14);
                doc.text(betLines, mL + 5, y + 8);
            } else {
                doc.text('Gelieve ' + eur(totals.totaal) + ' over te maken voor ' + nlDate(form.vervaldatum) + ' op:', mL + 5, y + 8);
            }

            if (s.iban) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...BLACK);
                doc.text(s.iban + ' t.n.v. ' + (s.bedrijfsnaam || 'Hop & Bites') + ' o.v.v. "' + (form.nummer || '') + '"', mL + 5, y + 13);
            }

            y += payH + 6;
        }

        // ── Footer ──
        // Bottom gold bar
        doc.setFillColor(...GOLD);
        doc.rect(0, pageH - 2.5, pageW, 2.5, 'F');

        // Footer divider
        doc.setDrawColor(...GOLD);
        doc.setLineWidth(0.3);
        doc.line(mL + 25, pageH - 16, pageW - mR - 25, pageH - 16);

        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...MID_GRAY);

        const footItems: string[] = [];
        if (s.bedrijfsnaam) footItems.push(s.bedrijfsnaam);
        if (s.email) footItems.push(s.email);
        if (s.telefoon) footItems.push(s.telefoon);
        if ((s as any).website) footItems.push((s as any).website);
        if (footItems.length > 0) {
            doc.text(footItems.join('    \u2022    '), pageW / 2, pageH - 11, { align: 'center' });
        }

        const prefix = isFactuur ? 'Factuur' : 'Offerte';
        doc.save(prefix + '_' + (form.nummer || 'document') + '.pdf');

    } catch (err: any) {
        console.error('PDF generatie fout:', err);
        alert('PDF kon niet gegenereerd worden: ' + (err.message || 'Onbekende fout') + '\n\nProbeer de pagina te vernieuwen.');
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
