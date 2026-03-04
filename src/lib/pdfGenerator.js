/**
 * PDF Generator for BBQ Architect
 * Uses jsPDF + autoTable loaded via CDN
 * Generates professional A4 PDFs styled like Rompslomp
 */

var jsPDFLoaded = null;

function loadJsPDF() {
    if (jsPDFLoaded) return jsPDFLoaded;
    jsPDFLoaded = new Promise(function (resolve, reject) {
        var attempts = 0;
        function check() {
            if (window.jspdf) {
                resolve(window.jspdf);
                return;
            }
            attempts++;
            if (attempts > 50) {
                reject(new Error('jsPDF kon niet geladen worden. Probeer de pagina te vernieuwen.'));
                return;
            }
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
            // Crop to top 45% — actual logo is in the upper portion of the image
            var cropH = Math.floor(img.naturalHeight * 0.45);
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = cropH;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, img.naturalWidth, cropH, 0, 0, img.naturalWidth, cropH);
            console.log('[PDF] Logo geladen:', img.naturalWidth + 'x' + img.naturalHeight, '→ cropped to', canvas.width + 'x' + canvas.height);
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
        };
        img.onerror = function () {
            console.warn('[PDF] Logo kon niet geladen worden');
            resolve(null);
        };
        img.src = '/logo.png';
    });
}

function fmt(n) {
    if (n == null || isNaN(n)) return '€ 0,00';
    return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
    if (!d) return '';
    var parts = d.split('-');
    if (parts.length !== 3) return d;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/**
 * Generate a professional PDF (Rompslomp-style)
 * @param {Object} opts
 * @param {'factuur'|'offerte'} opts.type
 * @param {Object} opts.form - The factuur/offerte form data
 * @param {Object} opts.settings - Company settings
 * @param {Object} opts.totals - { subtotaal, btw, totaal }
 */
export async function generatePDF(opts) {
    try {
        var type = opts.type;
        var form = opts.form;
        var s = opts.settings || {};
        var totals = opts.totals;
        var isFactuur = type === 'factuur';

        var jspdf = await loadJsPDF();
        var doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        var pageW = 210;
        var mL = 20;  // left margin
        var mR = 20;  // right margin
        var rightX = pageW - mR; // right edge for right-aligned text
        var black = [30, 30, 30];
        var gray = [100, 100, 100];
        var lightGray = [160, 160, 160];

        // ═══════════════════════════════════════════════
        // HEADER SECTION: Logo left + Company info right
        // ═══════════════════════════════════════════════

        var logoResult = await loadLogoAsBase64();
        var headerBottomY = 55; // default bottom of header area

        // -- Logo (left side) --
        if (logoResult && logoResult.data) {
            var logoW = 40;
            var logoH = logoW * (logoResult.h / logoResult.w);
            if (logoH > 30) { logoW = logoW * (30 / logoH); logoH = 30; }
            // Center logo horizontally in the left half
            var logoX = mL + 5;
            var logoY = 15;
            doc.addImage(logoResult.data, 'PNG', logoX, logoY, logoW, logoH);
            headerBottomY = Math.max(headerBottomY, logoY + logoH + 10);
        } else {
            // Fallback: text logo
            doc.setFontSize(20);
            doc.setTextColor(180, 120, 0);
            doc.setFont('helvetica', 'bold');
            doc.text('HOP&BITES', mL + 5, 30);
        }

        // -- Company info (right side, right-aligned) --
        var infoY = 15;
        doc.setFontSize(11);
        doc.setTextColor.apply(doc, black);
        doc.setFont('helvetica', 'bold');
        doc.text(s.bedrijfsnaam || 'hop&bites', rightX, infoY, { align: 'right' });
        infoY += 5;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, gray);

        if (s.adres) {
            // Split address on comma for multi-line
            var adresLines = s.adres.split(',').map(function (l) { return l.trim(); });
            for (var ai = 0; ai < adresLines.length; ai++) {
                doc.text(adresLines[ai], rightX, infoY, { align: 'right' });
                infoY += 4;
            }
        }

        infoY += 2;
        doc.setFontSize(8);
        if (s.btw || s.btw_nummer) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text('Btw-nummer: ', rightX - doc.getTextWidth(s.btw || s.btw_nummer), infoY);
            doc.setTextColor.apply(doc, black);
            doc.text(s.btw || s.btw_nummer, rightX, infoY, { align: 'right' });
            infoY += 4;
        }
        if (s.kvk) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text('KVK-nummer: ' + s.kvk, rightX, infoY, { align: 'right' });
            infoY += 4;
        }
        if (s.telefoon) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text('Tel: ' + s.telefoon, rightX, infoY, { align: 'right' });
            infoY += 4;
        }
        if (s.email) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text(s.email, rightX, infoY, { align: 'right' });
            infoY += 4;
        }
        if (s.iban) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text('IBAN: ' + s.iban, rightX, infoY, { align: 'right' });
            infoY += 4;
        }
        if (s.website) {
            doc.setTextColor.apply(doc, lightGray);
            doc.text(s.website, rightX, infoY, { align: 'right' });
            infoY += 4;
        }

        headerBottomY = Math.max(headerBottomY, infoY + 5);

        // ═══════════════════════════════════════════════
        // CLIENT NAME
        // ═══════════════════════════════════════════════
        var y = headerBottomY + 2;
        doc.setFontSize(13);
        doc.setTextColor.apply(doc, black);
        doc.setFont('helvetica', 'bold');
        doc.text(form.client_naam || '', mL, y);
        y += 5;
        if (form.client_adres) {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, gray);
            var clientAdresLines = doc.splitTextToSize(form.client_adres, 90);
            doc.text(clientAdresLines, mL, y);
            y += clientAdresLines.length * 5;
        }

        // ═══════════════════════════════════════════════
        // DOCUMENT TITLE + DATES
        // ═══════════════════════════════════════════════
        y += 10;

        // Left: Document title + number
        doc.setFontSize(12);
        doc.setTextColor.apply(doc, black);
        doc.setFont('helvetica', 'bold');
        var docTitle = isFactuur ? 'Factuur: ' : 'Offerte: ';
        doc.text(docTitle + (form.nummer || ''), mL, y);

        // Right: Dates
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, gray);
        if (isFactuur) {
            doc.text('Factuurdatum: ' + fmtDate(form.datum), rightX, y - 4, { align: 'right' });
            doc.text('Vervaldatum: ' + fmtDate(form.vervaldatum), rightX, y + 1, { align: 'right' });
        } else {
            doc.text('Datum: ' + fmtDate(form.datum), rightX, y - 4, { align: 'right' });
            doc.text('Geldig tot: ' + fmtDate(form.geldig_tot), rightX, y + 1, { align: 'right' });
        }

        y += 8;

        // "Betreft" line (if notitie exists)
        if (form.notitie) {
            doc.setFontSize(10);
            doc.setTextColor.apply(doc, black);
            doc.setFont('helvetica', 'normal');
            doc.text('Betreft: ' + form.notitie, mL, y);
            y += 8;
        }

        // ═══════════════════════════════════════════════
        // ITEMS TABLE
        // ═══════════════════════════════════════════════
        y += 2;

        var tableHead = [['Aantal', 'Beschrijving', 'Bedrag\nexcl. btw', 'Bedrag\nincl. btw']];
        var tableBody = (form.items || []).map(function (item) {
            var lineExcl = (item.qty || 0) * (item.prijs || 0);
            var btwPct = item.btw || 0;
            var lineIncl = lineExcl * (1 + btwPct / 100);
            var descText = item.desc || '';
            if (item.prijs) {
                descText += '\nStuksprijs: ' + fmt(item.prijs);
            }
            var btwLabel = btwPct > 0 ? '' : '\nBtw vrijgesteld';
            return [
                String(item.qty || 0),
                descText,
                fmt(lineExcl) + btwLabel,
                fmt(lineIncl) + btwLabel
            ];
        });

        doc.autoTable({
            startY: y,
            head: tableHead,
            body: tableBody,
            margin: { left: mL, right: mR },
            styles: {
                fontSize: 9,
                cellPadding: 4,
                textColor: [30, 30, 30],
                lineColor: [200, 200, 200],
                lineWidth: 0.2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [245, 245, 245],
                textColor: [80, 80, 80],
                fontStyle: 'bold',
                fontSize: 8,
                lineColor: [200, 200, 200],
                lineWidth: 0.3
            },
            columnStyles: {
                0: { cellWidth: 20, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 35, halign: 'right' },
                3: { cellWidth: 35, halign: 'right' }
            },
            alternateRowStyles: {
                fillColor: [255, 255, 255]
            },
            theme: 'grid'
        });

        y = doc.lastAutoTable.finalY + 6;

        // ═══════════════════════════════════════════════
        // TOTALS (right-aligned, like Rompslomp)
        // ═══════════════════════════════════════════════
        var totColLabel = rightX - 55;
        var totColValue = rightX;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, gray);

        // Totaalbedrag excl. btw
        doc.text('Totaalbedrag excl. btw', totColLabel, y, { align: 'left' });
        doc.setTextColor.apply(doc, black);
        doc.text(fmt(totals.subtotaal), totColValue, y, { align: 'right' });
        y += 6;

        // BTW
        doc.setTextColor.apply(doc, gray);
        doc.text('BTW', totColLabel, y, { align: 'left' });
        doc.setTextColor.apply(doc, black);
        doc.text(fmt(totals.btw), totColValue, y, { align: 'right' });
        y += 3;

        // Thick line
        doc.setDrawColor(30, 30, 30);
        doc.setLineWidth(0.6);
        doc.line(totColLabel, y, totColValue, y);
        y += 6;

        // Totaalbedrag incl. btw (bold, larger)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, black);
        doc.text('Totaalbedrag incl. btw', totColLabel, y, { align: 'left' });
        doc.text(fmt(totals.totaal), totColValue, y, { align: 'right' });
        y += 15;

        // ═══════════════════════════════════════════════
        // PAYMENT INSTRUCTIONS
        // ═══════════════════════════════════════════════
        if (isFactuur) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor.apply(doc, black);

            if (s.betaalvoorwaarden) {
                var betalingLines = doc.splitTextToSize(s.betaalvoorwaarden, pageW - mL - mR);
                doc.text(betalingLines, mL, y);
                y += betalingLines.length * 4 + 4;
            } else {
                var defaultText = 'Gelieve dit bedrag van ' + fmt(totals.totaal) + ' over te maken voor ' + fmtDate(form.vervaldatum) + ' op rekeningnummer:';
                doc.text(defaultText, mL, y);
                y += 5;
            }

            if (s.iban) {
                doc.setFont('helvetica', 'bold');
                doc.text(s.iban + ' t.n.v. ' + (s.bedrijfsnaam || '') + ' o.v.v. "' + (form.nummer || '') + '"', mL, y);
                y += 5;
            }
        }

        // ═══════════════════════════════════════════════
        // FOOTER (subtle, bottom of page)
        // ═══════════════════════════════════════════════
        var footerY = 285;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.2);
        doc.line(mL, footerY - 3, rightX, footerY - 3);

        doc.setFontSize(7);
        doc.setTextColor.apply(doc, lightGray);
        doc.setFont('helvetica', 'normal');

        var footerParts = [];
        if (s.bedrijfsnaam) footerParts.push(s.bedrijfsnaam);
        if (s.email) footerParts.push(s.email);
        if (s.telefoon) footerParts.push(s.telefoon);
        if (s.website) footerParts.push(s.website);
        var footerLine = footerParts.join('  •  ');
        doc.text(footerLine, pageW / 2, footerY, { align: 'center' });

        // ═══════════════════════════════════════════════
        // SAVE
        // ═══════════════════════════════════════════════
        var prefix = isFactuur ? 'Factuur' : 'Offerte';
        doc.save(prefix + '_' + (form.nummer || 'document') + '.pdf');

    } catch (err) {
        console.error('PDF generatie fout:', err);
        alert('PDF kon niet gegenereerd worden: ' + (err.message || 'Onbekende fout') + '\n\nProbeer de pagina te vernieuwen.');
    }
}
