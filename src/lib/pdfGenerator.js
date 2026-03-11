/**
 * PDF Generator for BBQ Architect
 * Premium white-background design with gold accents
 * Styled for maximum visual impact
 */

var jsPDFLoaded = null;

function loadJsPDF() {
    if (jsPDFLoaded) return jsPDFLoaded;
    jsPDFLoaded = new Promise(function (resolve, reject) {
        var attempts = 0;
        function check() {
            if (window.jspdf) { resolve(window.jspdf); return; }
            attempts++;
            if (attempts > 50) { reject(new Error('jsPDF kon niet geladen worden.')); return; }
            setTimeout(check, 100);
        }
        check();
    });
    return jsPDFLoaded;
}

function loadLogoAsBase64() {
    return new Promise(function (resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            // Use full image — white background logo, no cropping needed
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            console.log('[PDF] Logo geladen:', img.naturalWidth + 'x' + img.naturalHeight);
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
        };
        img.onerror = function () { console.warn('[PDF] Logo niet gevonden'); resolve(null); };
        img.src = '/logo.png';
    });
}

// ── Helpers ──
function eur(n) {
    if (n == null || isNaN(n)) return '€ 0,00';
    return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function nlDate(d) {
    if (!d) return '';
    var p = d.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

// ── Brand Colors ──
var GOLD = [180, 140, 20];   // Premium gold
var DARK_GOLD = [140, 105, 10];   // Darker gold for accents
var BLACK = [35, 35, 35];
var DARK_GRAY = [80, 80, 80];
var MID_GRAY = [130, 130, 130];
var LIGHT_BG = [250, 248, 244];  // Warm off-white for table header
var WHITE = [255, 255, 255];

/**
 * Generate a premium PDF invoice or quote
 */
export async function generatePDF(opts) {
    try {
        var type = opts.type;

        // ═══ HACCP RAPPORT PDF ═══
        if (type === 'haccp') {
            var jspdf2 = await loadJsPDF();
            var doc2 = new jspdf2.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            var pageW2 = 210; var mL2 = 18; var mR2 = 18; var contentW2 = pageW2 - mL2 - mR2;

            // Top gold bar
            doc2.setFillColor.apply(doc2, GOLD);
            doc2.rect(0, 0, pageW2, 3, 'F');

            // Logo
            var logo2 = await loadLogoAsBase64();
            var y2 = 10;
            if (logo2 && logo2.data) {
                var lw2 = 50; var lh2 = lw2 * (logo2.h / logo2.w);
                if (lh2 > 30) { lh2 = 30; lw2 = lh2 * (logo2.w / logo2.h); }
                doc2.addImage(logo2.data, 'PNG', (pageW2 - lw2) / 2, y2, lw2, lh2);
                y2 += lh2 + 4;
            } else {
                doc2.setFontSize(20); doc2.setTextColor.apply(doc2, GOLD); doc2.setFont('helvetica', 'bold');
                doc2.text('HOP & BITES', pageW2 / 2, y2 + 8, { align: 'center' });
                y2 += 16;
            }

            // Badge
            var bw2 = 60; var bx2 = (pageW2 - bw2) / 2;
            doc2.setFillColor(200, 50, 50);
            doc2.roundedRect(bx2, y2, bw2, 9, 2, 2, 'F');
            doc2.setFontSize(12); doc2.setFont('helvetica', 'bold'); doc2.setTextColor.apply(doc2, WHITE);
            doc2.text('HACCP RAPPORT', pageW2 / 2, y2 + 6.5, { align: 'center' });
            y2 += 15;

            // Event details
            doc2.setFontSize(10); doc2.setFont('helvetica', 'bold'); doc2.setTextColor.apply(doc2, BLACK);
            doc2.text('Event: ' + (opts.eventName || 'Onbekend'), mL2, y2);
            y2 += 5;
            doc2.setFontSize(9); doc2.setFont('helvetica', 'normal'); doc2.setTextColor.apply(doc2, DARK_GRAY);
            doc2.text('Datum: ' + nlDate(opts.eventDatum || '') + (opts.eventGasten ? '   •   Gasten: ' + opts.eventGasten : ''), mL2, y2);
            y2 += 8;

            // Table
            var haccpHead = [['Tijd', 'Type Check', 'Product', 'Temp', 'Status', 'Chef']];
            var haccpBody = (opts.records || []).map(function (r) {
                var ctLabels = { ontvangst: 'Ontvangst', opslag: 'Opslag/Koeling', bereiding: 'Bereiding', regenereren: 'Regenereren', uitgifte: 'Uitgifte' };
                return [
                    (r.tijd || '') + (r.datum ? ' (' + nlDate(r.datum) + ')' : ''),
                    ctLabels[r.check_type] || r.type || '',
                    r.wat || '',
                    r.temp + '°C',
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
                didParseCell: function (data) {
                    if (data.section === 'body' && data.column.index === 4) {
                        var val = data.cell.raw;
                        if (val === 'AFWIJKING') { data.cell.styles.textColor = [200, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
                        else if (val === 'LET OP') { data.cell.styles.textColor = [200, 150, 0]; data.cell.styles.fontStyle = 'bold'; }
                        else { data.cell.styles.textColor = [34, 150, 80]; }
                    }
                },
                theme: 'grid'
            });

            // Footer
            var fy2 = doc2.lastAutoTable.finalY + 12;
            doc2.setDrawColor.apply(doc2, GOLD); doc2.setLineWidth(0.3);
            doc2.line(mL2, fy2, pageW2 - mR2, fy2);
            fy2 += 5;
            doc2.setFontSize(7); doc2.setFont('helvetica', 'italic'); doc2.setTextColor.apply(doc2, MID_GRAY);
            doc2.text('Digitaal HACCP Dossier — Gegenereerd door BBQ Architect op ' + new Date().toLocaleString('nl-NL'), pageW2 / 2, fy2, { align: 'center' });
            fy2 += 3;
            doc2.text('Dit document dient als bewijs van temperatuurregistratie conform HACCP-normen.', pageW2 / 2, fy2, { align: 'center' });

            // Bottom bar
            doc2.setFillColor.apply(doc2, GOLD);
            doc2.rect(0, 294, pageW2, 3, 'F');

            doc2.save('HACCP_Rapport_' + (opts.eventName || 'event').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf');
            return;
        }

        // ═══ INVOICE / QUOTE PDF ═══
        var form = opts.form;
        var s = opts.settings || {};
        var totals = opts.totals;
        var isFactuur = type === 'factuur';

        var jspdf = await loadJsPDF();
        var doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        var pageW = 210;
        var pageH = 297;
        var mL = 22;
        var mR = 22;
        var rightX = pageW - mR;
        var contentW = pageW - mL - mR;

        // ═══════════════════════════════════════════
        //  TOP GOLD ACCENT BAR
        // ═══════════════════════════════════════════
        doc.setFillColor.apply(doc, GOLD);
        doc.rect(0, 0, pageW, 3, 'F');

        // ═══════════════════════════════════════════
        //  LOGO — Large, centered, prominent
        // ═══════════════════════════════════════════
        var logoResult = await loadLogoAsBase64();
        var logoBottomY = 18;

        if (logoResult && logoResult.data) {
            var logoMaxW = 65;
            var logoMaxH = 40;
            var logoW = logoMaxW;
            var logoH = logoW * (logoResult.h / logoResult.w);
            if (logoH > logoMaxH) {
                logoH = logoMaxH;
                logoW = logoH * (logoResult.w / logoResult.h);
            }
            var logoX = (pageW - logoW) / 2;
            var logoY = 8;
            doc.addImage(logoResult.data, 'PNG', logoX, logoY, logoW, logoH);
            logoBottomY = logoY + logoH + 3;
        } else {
            // Text fallback
            doc.setFontSize(24);
            doc.setTextColor.apply(doc, GOLD);
            doc.setFont('helvetica', 'bold');
            doc.text('HOP & BITES', pageW / 2, 25, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor.apply(doc, MID_GRAY);
            doc.setFont('helvetica', 'normal');
            doc.text(s.ondertitel || 'BBQ Catering', pageW / 2, 32, { align: 'center' });
            logoBottomY = 38;
        }

        // Thin gold line below logo
        doc.setDrawColor.apply(doc, GOLD);
        doc.setLineWidth(0.4);
        doc.line(mL + 30, logoBottomY, pageW - mR - 30, logoBottomY);

        // ═══════════════════════════════════════════
        //  COMPANY DETAILS — centered below logo
        // ═══════════════════════════════════════════
        var compY = logoBottomY + 5;
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, MID_GRAY);

        var compParts = [];
        if (s.adres) compParts.push(s.adres);
        if (s.telefoon) compParts.push('Tel: ' + s.telefoon);
        if (s.email) compParts.push(s.email);
        if (compParts.length > 0) {
            doc.text(compParts.join('   •   '), pageW / 2, compY, { align: 'center' });
            compY += 4;
        }
        var compParts2 = [];
        if (s.kvk) compParts2.push('KVK: ' + s.kvk);
        if (s.btw || s.btw_nummer) compParts2.push('BTW: ' + (s.btw || s.btw_nummer));
        if (s.iban) compParts2.push('IBAN: ' + s.iban);
        if (compParts2.length > 0) {
            doc.text(compParts2.join('   •   '), pageW / 2, compY, { align: 'center' });
            compY += 4;
        }
        if (s.website) {
            doc.text(s.website, pageW / 2, compY, { align: 'center' });
            compY += 4;
        }

        // ═══════════════════════════════════════════
        //  DOCUMENT TYPE BADGE
        // ═══════════════════════════════════════════
        var badgeY = compY + 4;
        var badgeText = isFactuur ? 'FACTUUR' : 'OFFERTE';

        // Gold badge background
        var badgeW = 50;
        var badgeH = 10;
        var badgeX = (pageW - badgeW) / 2;
        doc.setFillColor.apply(doc, GOLD);
        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'F');

        // White text on gold badge
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, WHITE);
        doc.text(badgeText, pageW / 2, badgeY + 7.3, { align: 'center' });

        var y = badgeY + badgeH + 10;

        // ═══════════════════════════════════════════
        //  TWO COLUMNS: Client left | Details right
        // ═══════════════════════════════════════════
        var colLeftX = mL;
        var colRightLabelX = pageW / 2 + 15;
        var colRightValX = rightX;

        // Left column: Client
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, GOLD);
        doc.text('FACTUUR AAN', colLeftX, y);
        y += 5;

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, BLACK);
        doc.text(form.client_naam || '', colLeftX, y);

        // Right column: Document info
        var detY = y - 5;
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, GOLD);
        doc.text('GEGEVENS', colRightLabelX, detY);
        detY += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        // Nummer
        doc.setTextColor.apply(doc, MID_GRAY);
        doc.text('Nummer:', colRightLabelX, detY);
        doc.setTextColor.apply(doc, BLACK);
        doc.setFont('helvetica', 'bold');
        doc.text(form.nummer || '', colRightValX, detY, { align: 'right' });
        detY += 5;

        // Datum
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, MID_GRAY);
        doc.text(isFactuur ? 'Factuurdatum:' : 'Datum:', colRightLabelX, detY);
        doc.setTextColor.apply(doc, BLACK);
        doc.text(nlDate(form.datum), colRightValX, detY, { align: 'right' });
        detY += 5;

        // Vervaldatum / Geldig tot
        doc.setTextColor.apply(doc, MID_GRAY);
        doc.text(isFactuur ? 'Vervaldatum:' : 'Geldig tot:', colRightLabelX, detY);
        doc.setTextColor.apply(doc, BLACK);
        doc.text(nlDate(isFactuur ? form.vervaldatum : form.geldig_tot), colRightValX, detY, { align: 'right' });
        detY += 5;

        y += 5;
        // Client address
        if (form.client_adres) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, DARK_GRAY);
            var adresLines = doc.splitTextToSize(form.client_adres, 80);
            doc.text(adresLines, colLeftX, y);
            y += adresLines.length * 4.5;
        }

        y = Math.max(y + 8, detY + 8);

        // "Betreft" line
        if (form.notitie) {
            doc.setFontSize(9);
            doc.setTextColor.apply(doc, DARK_GRAY);
            doc.setFont('helvetica', 'italic');
            doc.text('Betreft: ' + form.notitie, colLeftX, y);
            y += 7;
        }

        // ═══════════════════════════════════════════
        //  ITEMS TABLE — Clean & elegant
        // ═══════════════════════════════════════════
        var tableHead = [['Omschrijving', 'Aantal', 'Prijs', 'BTW%', 'Totaal']];
        var tableBody = (form.items || []).map(function (item) {
            var lineTotal = (item.qty || 0) * (item.prijs || 0);
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
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            },
            bodyStyles: {
                fillColor: [255, 255, 255]
            },
            theme: 'grid',
            tableLineColor: [220, 215, 205],
            tableLineWidth: 0.2
        });

        y = doc.lastAutoTable.finalY + 8;

        // ═══════════════════════════════════════════
        //  TOTALS — Right-aligned, premium style
        // ═══════════════════════════════════════════
        var totBoxX = rightX - 75;
        var totBoxW = 75;
        var totValX = rightX;

        // Subtotaal
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, MID_GRAY);
        doc.text('Subtotaal', totBoxX, y);
        doc.setTextColor.apply(doc, BLACK);
        doc.text(eur(totals.subtotaal), totValX, y, { align: 'right' });
        y += 5.5;

        // BTW
        doc.setTextColor.apply(doc, MID_GRAY);
        doc.text('BTW', totBoxX, y);
        doc.setTextColor.apply(doc, BLACK);
        doc.text(eur(totals.btw), totValX, y, { align: 'right' });
        y += 3;

        // Gold divider
        doc.setDrawColor.apply(doc, GOLD);
        doc.setLineWidth(0.8);
        doc.line(totBoxX, y, totValX, y);
        y += 6;

        // Total — gold background strip
        doc.setFillColor.apply(doc, GOLD);
        doc.roundedRect(totBoxX - 3, y - 5, totBoxW + 6, 10, 1.5, 1.5, 'F');

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, WHITE);
        doc.text('TOTAAL', totBoxX, y + 1.5);
        doc.text(eur(totals.totaal), totValX, y + 1.5, { align: 'right' });
        y += 18;

        // ═══════════════════════════════════════════
        //  PAYMENT INSTRUCTIONS (factuur only)
        // ═══════════════════════════════════════════
        if (isFactuur) {
            // Light background box for payment info
            var payH = 20;
            doc.setFillColor(252, 250, 245);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'F');
            doc.setDrawColor.apply(doc, GOLD);
            doc.setLineWidth(0.3);
            doc.roundedRect(mL, y - 2, contentW, payH, 2, 2, 'S');

            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor.apply(doc, GOLD);
            doc.text('BETALINGSGEGEVENS', mL + 5, y + 3);

            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, DARK_GRAY);

            if (s.betaalvoorwaarden) {
                var betLines = doc.splitTextToSize(s.betaalvoorwaarden, contentW - 12);
                doc.text(betLines, mL + 5, y + 8);
            } else {
                var defText = 'Gelieve ' + eur(totals.totaal) + ' over te maken voor ' + nlDate(form.vervaldatum) + ' op:';
                doc.text(defText, mL + 5, y + 8);
            }

            if (s.iban) {
                doc.setFont('helvetica', 'bold');
                doc.setTextColor.apply(doc, BLACK);
                doc.text(s.iban + ' t.n.v. ' + (s.bedrijfsnaam || 'Hop & Bites') + ' o.v.v. "' + (form.nummer || '') + '"', mL + 5, y + 13);
            }

            y += payH + 8;
        }

        // ═══════════════════════════════════════════
        //  FOOTER — Elegant gold bar at bottom
        // ═══════════════════════════════════════════
        // Bottom gold accent bar (mirror of top)
        doc.setFillColor.apply(doc, GOLD);
        doc.rect(0, pageH - 3, pageW, 3, 'F');

        // Footer text just above the gold bar
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, MID_GRAY);

        var footItems = [];
        if (s.bedrijfsnaam) footItems.push(s.bedrijfsnaam);
        if (s.email) footItems.push(s.email);
        if (s.telefoon) footItems.push(s.telefoon);
        if (s.website) footItems.push(s.website);
        if (footItems.length > 0) {
            doc.text(footItems.join('   •   '), pageW / 2, pageH - 6, { align: 'center' });
        }

        // ═══════════════════════════════════════════
        //  SAVE
        // ═══════════════════════════════════════════
        var prefix = isFactuur ? 'Factuur' : 'Offerte';
        doc.save(prefix + '_' + (form.nummer || 'document') + '.pdf');

    } catch (err) {
        console.error('PDF generatie fout:', err);
        alert('PDF kon niet gegenereerd worden: ' + (err.message || 'Onbekende fout') + '\n\nProbeer de pagina te vernieuwen.');
    }
}
