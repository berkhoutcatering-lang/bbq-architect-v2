/* eslint-disable @typescript-eslint/no-explicit-any */
// Email helper — stuurt via Resend API (gratis 100/dag)
// Fallback naar mailto: als Resend niet geconfigureerd is

import { fmt } from './utils';

function escH(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

// ── Core send function ──
async function sendEmail(opts: {
  to: string; subject: string; html?: string; text?: string;
  replyTo?: string; attachments?: any[];
}): Promise<{ success: boolean; fallback?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    });
    const data = await res.json();
    if (data.success) return { success: true };
    // Fallback naar mailto als Resend niet geconfigureerd
    if (data.error?.includes('niet geconfigureerd')) {
      openMailtoFallback(opts.to, opts.subject, opts.text || '');
      return { success: true, fallback: true };
    }
    return { success: false, error: data.error };
  } catch (err: any) {
    // Network error → fallback naar mailto
    openMailtoFallback(opts.to, opts.subject, opts.text || '');
    return { success: true, fallback: true };
  }
}

function openMailtoFallback(to: string, subject: string, body: string) {
  const params = new URLSearchParams();
  params.set('subject', subject);
  params.set('body', body);
  window.open('mailto:' + encodeURIComponent(to) + '?' + params.toString(), '_blank');
}

// ── HTML email template ──
function wrapHtml(content: string, bedrijfsnaam: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<div style="border-bottom:3px solid #c4a35a;padding-bottom:16px;margin-bottom:24px;">
  <h2 style="margin:0;color:#1a1a1a;font-weight:400;">${escH(bedrijfsnaam)}</h2>
  <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">BBQ Catering</p>
</div>
${content}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">
  <p>${escH(bedrijfsnaam)} — Ambachtelijke BBQ Catering</p>
</div>
</body></html>`;
}

// ── Offerte email ──
export async function mailOfferte(offerte: any, bedrijfsnaam: string) {
  if (!isValidEmail(offerte.client_email)) return { success: false, error: 'Geen geldig emailadres bij deze klant' };
  const items: any[] = Array.isArray(offerte.items) ? offerte.items : [];
  let subtotaal = 0;
  items.forEach(function (item: any) { subtotaal += (item.qty || 0) * (item.prijs || 0); });

  const acceptUrl = typeof window !== 'undefined' ? window.location.origin + '/q/' + offerte.id : '';

  const html = wrapHtml(`
    <p>Beste ${escH(offerte.client_naam || 'klant')},</p>
    <p>Hierbij ontvangt u onze offerte voor uw aankomende event.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Offertenummer</td><td style="padding:8px 12px;font-weight:600;">${offerte.nummer || ''}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#888;">Datum</td><td style="padding:8px 12px;">${offerte.datum || ''}</td></tr>
      <tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Aantal gasten</td><td style="padding:8px 12px;">${offerte.aantal_gasten || ''}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#888;">Geldig tot</td><td style="padding:8px 12px;">${offerte.geldig_tot || ''}</td></tr>
      <tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Totaal excl. BTW</td><td style="padding:8px 12px;font-weight:700;color:#c4a35a;font-size:18px;">${fmt(subtotaal)}</td></tr>
    </table>
    ${acceptUrl ? `<p><a href="${acceptUrl}" style="display:inline-block;padding:12px 28px;background:#c4a35a;color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Offerte Bekijken & Accepteren</a></p>` : ''}
    <p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${bedrijfsnaam}</strong></p>
  `, bedrijfsnaam);

  const text = `Beste ${offerte.client_naam},\n\nHierbij de offerte ${offerte.nummer} voor ${offerte.aantal_gasten || ''} gasten.\nTotaal: ${fmt(subtotaal)}\n\nBekijk en accepteer: ${acceptUrl}\n\nMvg, ${bedrijfsnaam}`;

  return sendEmail({
    to: offerte.client_email || '',
    subject: `Offerte ${offerte.nummer || ''} — ${bedrijfsnaam}`,
    html, text,
  });
}

// ── Factuur email ──
export async function mailFactuur(factuur: any, bedrijfsnaam: string) {
  if (!isValidEmail(factuur.client_email)) return { success: false, error: 'Geen geldig emailadres bij deze klant' };
  const items: any[] = Array.isArray(factuur.items) ? factuur.items : [];
  let subtotaal = 0; let totalBtw = 0;
  items.forEach(function (item: any) {
    const line = (item.qty || 0) * (item.prijs || 0);
    subtotaal += line; totalBtw += line * ((item.btw || 21) / 100);
  });

  const html = wrapHtml(`
    <p>Beste ${escH(factuur.client_naam || 'klant')},</p>
    <p>Hierbij ontvangt u de factuur voor de geleverde diensten.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Factuurnummer</td><td style="padding:8px 12px;font-weight:600;">${factuur.nummer || factuur.factuur_nummer || ''}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#888;">Datum</td><td style="padding:8px 12px;">${factuur.datum || ''}</td></tr>
      <tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Vervaldatum</td><td style="padding:8px 12px;">${factuur.vervaldatum || ''}</td></tr>
      ${items.map(function (item: any) { return `<tr><td style="padding:8px 12px;font-size:13px;">${item.desc || item.omschrijving || 'Item'}</td><td style="padding:8px 12px;">${item.qty || 1}× ${fmt(item.prijs || 0)}</td></tr>`; }).join('')}
      <tr style="border-top:2px solid #c4a35a;"><td style="padding:12px;font-weight:700;">Totaal incl. BTW</td><td style="padding:12px;font-weight:700;color:#c4a35a;font-size:18px;">${fmt(subtotaal + totalBtw)}</td></tr>
    </table>
    <p style="color:#888;font-size:13px;">Wij verzoeken u het bedrag binnen de betalingstermijn over te maken.</p>
    <p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${bedrijfsnaam}</strong></p>
  `, bedrijfsnaam);

  const text = `Factuur ${factuur.nummer}\nTotaal: ${fmt(subtotaal + totalBtw)}\nVervaldatum: ${factuur.vervaldatum}\n\nMvg, ${bedrijfsnaam}`;

  return sendEmail({
    to: factuur.client_email || '',
    subject: `Factuur ${factuur.nummer || factuur.factuur_nummer || ''} — ${bedrijfsnaam}`,
    html, text,
  });
}

// ── Betalingsherinnering ──
export async function mailBetaalherinnering(factuur: any, bedrijfsnaam: string) {
  if (!isValidEmail(factuur.client_email)) return { success: false, error: 'Geen geldig emailadres bij deze klant' };
  const items: any[] = Array.isArray(factuur.items) ? factuur.items : [];
  let totaal = 0;
  items.forEach(function (item: any) {
    const line = (item.qty || 0) * (item.prijs || 0);
    totaal += line + line * ((item.btw || 21) / 100);
  });

  const html = wrapHtml(`
    <p>Beste ${escH(factuur.client_naam || 'klant')},</p>
    <p>Wij constateren dat de betaling van onderstaande factuur nog niet is ontvangen.</p>
    <div style="background:#fff3f3;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">
      <p style="margin:0;"><strong>Factuurnummer:</strong> ${factuur.nummer || factuur.factuur_nummer || ''}</p>
      <p style="margin:4px 0 0;"><strong>Vervaldatum:</strong> ${factuur.vervaldatum || ''}</p>
      <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ef4444;">Openstaand: ${fmt(totaal)}</p>
    </div>
    <p>Wij verzoeken u vriendelijk het bedrag zo spoedig mogelijk over te maken.</p>
    <p style="color:#888;font-size:12px;">Mocht de betaling reeds onderweg zijn, dan kunt u dit bericht als niet verzonden beschouwen.</p>
    <p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${bedrijfsnaam}</strong></p>
  `, bedrijfsnaam);

  return sendEmail({
    to: factuur.client_email || '',
    subject: `Betalingsherinnering — Factuur ${factuur.nummer || factuur.factuur_nummer || ''} — ${bedrijfsnaam}`,
    html,
  });
}

// ── Eventbevestiging ──
export async function mailEventBevestiging(event: any, bedrijfsnaam: string) {
  if (!isValidEmail(event.client_email)) return { success: false, error: 'Geen geldig emailadres bij deze klant' };
  const html = wrapHtml(`
    <p>Beste ${escH(event.client_naam || 'klant')},</p>
    <p>Hierbij bevestigen wij uw reservering:</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#f0fdf4;"><td style="padding:8px 12px;font-size:13px;color:#888;">Event</td><td style="padding:8px 12px;font-weight:600;">${event.name || ''}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#888;">Datum</td><td style="padding:8px 12px;">${event.date || ''}</td></tr>
      <tr style="background:#f0fdf4;"><td style="padding:8px 12px;font-size:13px;color:#888;">Locatie</td><td style="padding:8px 12px;">${event.location || ''}</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px;color:#888;">Gasten</td><td style="padding:8px 12px;">${event.guests || ''}</td></tr>
    </table>
    <p>Wij kijken ernaar uit om uw event te verzorgen!</p>
    <p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${bedrijfsnaam}</strong></p>
  `, bedrijfsnaam);

  return sendEmail({
    to: event.client_email || '',
    subject: `Bevestiging: ${event.name || 'Event'} — ${event.date || ''} — ${bedrijfsnaam}`,
    html,
  });
}
