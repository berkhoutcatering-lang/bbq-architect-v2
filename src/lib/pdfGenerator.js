/**
 * PDF Generator for BBQ Architect
 * Uses jsPDF + autoTable loaded via CDN
 * Generates professional A4 PDFs for Facturen & Offertes
 */

var jsPDFLoaded = null;

function loadJsPDF() {
    if (jsPDFLoaded) return jsPDFLoaded;
    jsPDFLoaded = new Promise(function (resolve, reject) {
        // Scripts are loaded globally via layout.js <Script> tags
        // Just wait for them to be available
        var attempts = 0;
        function check() {
            if (window.jspdf) {
                resolve(window.jspdf);
                return;
            }
            attempts++;
            if (attempts > 50) { // 5 seconds max
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
            // Crop to top 45% — the actual logo is in the upper portion
            var cropH = Math.floor(img.naturalHeight * 0.45);
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = cropH;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, img.naturalWidth, cropH, 0, 0, img.naturalWidth, cropH);
            console.log('[PDF] Logo geladen:', img.naturalWidth + 'x' + img.naturalHeight, '→ cropped to', canvas.width + 'x' + canvas.height);
            resolve({ data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
        };
        img.onerror = function () { console.warn('[PDF] Logo kon niet geladen worden'); resolve(null); };
        img.src = '/logo.png';
    });
}

function fmtPdf(n) {
    if (n == null || isNaN(n)) return '€ 0,00';
    return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateNl(d) {
    if (!d) return '';
    var parts = d.split('-');
    if (parts.length !== 3) return d;
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

/**
 * Generate a professional PDF
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
        var settings = opts.settings || {};
        var totals = opts.totals;

        var jspdf = await loadJsPDF();
        var doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        var pageW = 210;
        var margin = 20;
        var contentW = pageW - margin * 2;
        var brandColor = [255, 140, 0]; // BBQ Orange
        var darkColor = [30, 30, 30];
        var grayColor = [120, 120, 120];
        var lightGray = [245, 245, 245];

        // ── LOGO ──
        var logoResult = await loadLogoAsBase64();
        var y = 20;
        if (logoResult && logoResult.data) {
            var logoW = 50;
            var logoH = logoW * (logoResult.h / logoResult.w);
            if (logoH > 35) logoH = 35;
            doc.addImage(logoResult.data, 'PNG', margin, y, logoW, logoH);
            y = 20 + logoH + 5;
        } else {
            // Fallback: text logo
            doc.setFontSize(22);
            doc.setTextColor.apply(doc, brandColor);
            doc.setFont('helvetica', 'bold');
            doc.text(settings.bedrijfsnaam || 'Hop & Bites', margin, y + 8);
            doc.setFontSize(10);
            doc.setTextColor.apply(doc, grayColor);
            doc.text(settings.ondertitel || '', margin, y + 14);
            y = 42;
        }

        // ── DOCUMENT TYPE HEADER (right-aligned) ──
        var headerText = type === 'factuur' ? 'FACTUUR' : 'OFFERTE';
        doc.setFontSize(28);
        doc.setTextColor.apply(doc, brandColor);
        doc.setFont('helvetica', 'bold');
        doc.text(headerText, pageW - margin, 30, { align: 'right' });

        doc.setFontSize(11);
        doc.setTextColor.apply(doc, darkColor);
        doc.setFont('helvetica', 'normal');
        doc.text(form.nummer || '', pageW - margin, 38, { align: 'right' });

        // ── HORIZONTAL LINE ──
        doc.setDrawColor.apply(doc, brandColor);
        doc.setLineWidth(0.8);
        doc.line(margin, y, pageW - margin, y);
        y += 10;

        // ── LEFT: Client info | RIGHT: Document details ──
        doc.setFontSize(9);
        doc.setTextColor.apply(doc, grayColor);
        doc.setFont('helvetica', 'bold');
        doc.text('AAN', margin, y);
        doc.text('DETAILS', pageW - margin - 60, y);
        y += 5;

        doc.setFontSize(11);
        doc.setTextColor.apply(doc, darkColor);
        doc.setFont('helvetica', 'bold');
        doc.text(form.client_naam || '', margin, y);
        doc.setFont('helvetica', 'normal');
        if (form.client_adres) {
            var adresLines = doc.splitTextToSize(form.client_adres, 80);
            doc.text(adresLines, margin, y + 6);
        }

        // Right side: details
        var detailY = y;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        doc.setTextColor.apply(doc, grayColor);
        doc.text('Datum:', pageW - margin - 60, detailY);
        doc.setTextColor.apply(doc, darkColor);
        doc.text(fmtDateNl(form.datum), pageW - margin, detailY, { align: 'right' });
        detailY += 6;

        if (type === 'factuur') {
            doc.setTextColor.apply(doc, grayColor);
            doc.text('Vervaldatum:', pageW - margin - 60, detailY);
            doc.setTextColor.apply(doc, darkColor);
            doc.text(fmtDateNl(form.vervaldatum), pageW - margin, detailY, { align: 'right' });
            detailY += 6;
        } else {
            doc.setTextColor.apply(doc, grayColor);
            doc.text('Geldig tot:', pageW - margin - 60, detailY);
            doc.setTextColor.apply(doc, darkColor);
            doc.text(fmtDateNl(form.geldig_tot), pageW - margin, detailY, { align: 'right' });
            detailY += 6;
        }

        doc.setTextColor.apply(doc, grayColor);
        doc.text('Status:', pageW - margin - 60, detailY);
        doc.setTextColor.apply(doc, darkColor);
        doc.text((form.status || 'concept').toUpperCase(), pageW - margin, detailY, { align: 'right' });

        y = Math.max(y + 20, detailY + 10);

        // ── NOTITIE (offerte only) ──
        if (type === 'offerte' && form.notitie) {
            doc.setFontSize(10);
            doc.setTextColor.apply(doc, grayColor);
            doc.setFont('helvetica', 'italic');
            var notitieLines = doc.splitTextToSize(form.notitie, contentW);
            doc.text(notitieLines, margin, y);
            y += notitieLines.length * 5 + 5;
        }

        // ── ITEMS TABLE ──
        var tableHead = [['Omschrijving', 'Aantal', 'Prijs', 'BTW', 'Totaal']];
        var tableBody = (form.items || []).map(function (item) {
            var lineTotal = (item.qty || 0) * (item.prijs || 0);
            return [
                item.desc || '',
                String(item.qty || 0),
                fmtPdf(item.prijs),
                (item.btw || 0) + '%',
                fmtPdf(lineTotal)
            ];
        });

        doc.autoTable({
            startY: y,
            head: tableHead,
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: {
                fontSize: 10,
                cellPadding: 4,
                textColor: [30, 30, 30],
                lineColor: [220, 220, 220],
                lineWidth: 0.3
            },
            headStyles: {
                fillColor: [40, 40, 40],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            columnStyles: {
                0: { cellWidth: 'auto' },
                1: { halign: 'right', cellWidth: 22 },
                2: { halign: 'right', cellWidth: 28 },
                3: { halign: 'right', cellWidth: 20 },
                4: { halign: 'right', cellWidth: 30 }
            },
            alternateRowStyles: {
                fillColor: [250, 250, 250]
            },
            didDrawPage: function () { }
        });

        y = doc.lastAutoTable.finalY + 10;

        // ── TOTALS (right-aligned box) ──
        var totalsX = pageW - margin - 70;
        var totalsW = 70;

        // Subtotaal
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor.apply(doc, grayColor);
        doc.text('Subtotaal:', totalsX, y);
        doc.setTextColor.apply(doc, darkColor);
        doc.text(fmtPdf(totals.subtotaal), pageW - margin, y, { align: 'right' });
        y += 6;

        // BTW
        doc.setTextColor.apply(doc, grayColor);
        doc.text('BTW:', totalsX, y);
        doc.setTextColor.apply(doc, darkColor);
        doc.text(fmtPdf(totals.btw), pageW - margin, y, { align: 'right' });
        y += 2;

        // Divider line
        doc.setDrawColor.apply(doc, brandColor);
        doc.setLineWidth(0.5);
        doc.line(totalsX, y, pageW - margin, y);
        y += 6;

        // Total
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor.apply(doc, brandColor);
        doc.text('Totaal:', totalsX, y);
        doc.text(fmtPdf(totals.totaal), pageW - margin, y, { align: 'right' });
        y += 12;

        // ── BETAALVOORWAARDEN ──
        if (settings.betaalvoorwaarden) {
            doc.setFontSize(9);
            doc.setTextColor.apply(doc, grayColor);
            doc.setFont('helvetica', 'normal');
            var voorwaardenLines = doc.splitTextToSize(settings.betaalvoorwaarden, contentW);
            doc.text(voorwaardenLines, margin, y);
            y += voorwaardenLines.length * 4 + 5;
        }

        // ── FOOTER ──
        var footerY = 280;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, footerY - 3, pageW - margin, footerY - 3);

        doc.setFontSize(8);
        doc.setTextColor.apply(doc, grayColor);
        doc.setFont('helvetica', 'normal');

        var footerParts = [];
        if (settings.bedrijfsnaam) footerParts.push(settings.bedrijfsnaam);
        if (settings.adres) footerParts.push(settings.adres);
        var footerLine1 = footerParts.join('  |  ');

        var footerParts2 = [];
        if (settings.email) footerParts2.push('Email: ' + settings.email);
        if (settings.telefoon) footerParts2.push('Tel: ' + settings.telefoon);
        if (settings.website) footerParts2.push('Web: ' + settings.website);
        var footerLine2 = footerParts2.join('  |  ');

        var footerParts3 = [];
        if (settings.kvk) footerParts3.push('KVK: ' + settings.kvk);
        if (settings.btw_nummer || settings.btw) footerParts3.push('BTW: ' + (settings.btw_nummer || settings.btw));
        if (settings.iban) footerParts3.push('IBAN: ' + settings.iban);
        var footerLine3 = footerParts3.join('  |  ');

        doc.text(footerLine1, pageW / 2, footerY, { align: 'center' });
        doc.text(footerLine2, pageW / 2, footerY + 4, { align: 'center' });
        doc.text(footerLine3, pageW / 2, footerY + 8, { align: 'center' });

        // ── SAVE ──
        var prefix = type === 'factuur' ? 'Factuur' : 'Offerte';
        doc.save(prefix + '_' + (form.nummer || 'document') + '.pdf');
    } catch (err) {
        console.error('PDF generatie fout:', err);
        alert('PDF kon niet gegenereerd worden: ' + (err.message || 'Onbekende fout') + '\n\nProbeer de pagina te vernieuwen.');
    }
}
