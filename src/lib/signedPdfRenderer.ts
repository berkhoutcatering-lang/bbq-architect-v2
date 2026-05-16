/**
 * Server-side renderer voor het handtekening-certificaat dat wordt
 * opgeslagen als signed_pdf_url in offertes en als attachment naar
 * Moneybird gestuurd.
 *
 * Pillar #2 — Audit-trail voor B2B-events: B2B-klanten met €4k+ budget
 * verlangen een juridisch hard signature-bewijs (signer + IP + UA +
 * timestamp). De brand-styling van de offerte komt uit de browser-PDF;
 * dit certificaat is bewust 1-pagina en vendor-onafhankelijk leesbaar.
 */
/* pdf-lib heeft een grote CJS-graph; lazy-import binnen de render-functie
   voorkomt dat webpack hem tijdens production-build in een client-chunk
   probeert te treeshaken (zie commit 32ec2b3 voor identieke fix in pdfSplit.ts). */

export interface SignedPdfInput {
    offerteNummer: string;
    offerteDatum?: string | null;
    clientNaam?: string | null;
    bedragIncl: number;
    signedBy: string;
    signedAt: string; // ISO timestamp
    signedIp?: string | null;
    signedUserAgent?: string | null;
    signatureDataUrl?: string | null; // data:image/png;base64,...
    organizationName?: string | null;
    organizationKvk?: string | null;
}

function fmtEur(n: number): string {
    return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export async function renderSignedCertificate(input: SignedPdfInput): Promise<Uint8Array> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4 portrait, points
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const black = rgb(0.05, 0.05, 0.05);
    const muted = rgb(0.4, 0.4, 0.4);
    const brand = rgb(0.62, 0.47, 0.11); // BBQ Architect goudtint

    const margin = 48;
    let y = 842 - margin;

    // Header
    page.drawText('ACCEPTATIE-CERTIFICAAT', { x: margin, y, size: 18, font: helvBold, color: brand });
    y -= 8;
    page.drawLine({
        start: { x: margin, y: y - 2 },
        end: { x: 595 - margin, y: y - 2 },
        thickness: 1,
        color: brand,
    });
    y -= 28;

    page.drawText('Deze digitale handtekening bevestigt de akkoordverklaring op de offerte.', {
        x: margin, y, size: 10, font: helv, color: muted,
    });
    y -= 28;

    // Offerte-block
    const labelW = 150;
    const rows: Array<[string, string]> = [
        ['Offerte', input.offerteNummer],
        ['Datum offerte', input.offerteDatum ? input.offerteDatum : '—'],
        ['Klant', truncate(input.clientNaam || '—', 60)],
        ['Bedrag (incl. BTW)', fmtEur(input.bedragIncl)],
    ];
    for (const [label, val] of rows) {
        page.drawText(label, { x: margin, y, size: 10, font: helv, color: muted });
        page.drawText(val, { x: margin + labelW, y, size: 11, font: helvBold, color: black });
        y -= 18;
    }
    y -= 14;

    // Signature image — embed if data-URL present
    if (input.signatureDataUrl && input.signatureDataUrl.startsWith('data:image/')) {
        try {
            const mimeMatch = /^data:(image\/png|image\/jpeg|image\/jpg);base64,(.+)$/i.exec(input.signatureDataUrl);
            if (mimeMatch) {
                const mime = mimeMatch[1].toLowerCase();
                const base64 = mimeMatch[2];
                const bytes = Uint8Array.from(Buffer.from(base64, 'base64'));
                const img = mime.includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
                const maxW = 200;
                const ratio = img.width / img.height;
                const drawW = Math.min(maxW, img.width);
                const drawH = drawW / ratio;
                page.drawText('Handtekening', { x: margin, y, size: 10, font: helv, color: muted });
                y -= 6 + drawH;
                page.drawImage(img, { x: margin, y, width: drawW, height: drawH });
                y -= 14;
            }
        } catch (e) {
            console.error('[signedPdfRenderer] embed signature failed:', e);
        }
    }

    // Ondertekenaar-block
    const sigRows: Array<[string, string]> = [
        ['Ondertekend door', truncate(input.signedBy, 60)],
        ['Tijdstip', fmtDate(input.signedAt)],
        ['IP-adres', input.signedIp || '—'],
        ['Browser', truncate(input.signedUserAgent || '—', 80)],
    ];
    for (const [label, val] of sigRows) {
        page.drawText(label, { x: margin, y, size: 10, font: helv, color: muted });
        page.drawText(val, { x: margin + labelW, y, size: 10, font: helvBold, color: black });
        y -= 16;
    }

    // Footer
    y = margin + 30;
    page.drawLine({
        start: { x: margin, y },
        end: { x: 595 - margin, y },
        thickness: 0.5,
        color: muted,
    });
    y -= 14;
    const footer = (input.organizationName ? input.organizationName : 'BBQ Architect') +
        (input.organizationKvk ? '  ·  KvK ' + input.organizationKvk : '') +
        '  ·  Gegenereerd op ' + fmtDate(new Date().toISOString());
    page.drawText(footer, { x: margin, y, size: 8, font: helv, color: muted });

    return await pdf.save();
}
