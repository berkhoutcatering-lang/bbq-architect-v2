/* Server-side email helpers — direct Resend SDK, zonder window/fetch.
   Gebruikt vanuit API-routes en Server Actions waar de client-side
   emailHelper.ts (die fetch('/api/send-email') doet) niet werkt. */

import { Resend } from 'resend';

function escH(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

function fmtEuro(n: number): string {
  return '€' + (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

interface SendArgs {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export async function sendServerMail(args: SendArgs): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY niet geconfigureerd' };
  }
  if (!isValidEmail(args.to)) {
    return { success: false, error: 'Ongeldig e-mailadres' };
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'BBQ Architect <noreply@resend.dev>',
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo,
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Onbekende fout' };
  }
}

function wrapHtml(content: string, bedrijfsnaam: string, brandColor?: string, ondertitel?: string): string {
  const bc = brandColor || '#c4a35a';
  const sub = ondertitel || '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
    + '<body style="font-family:\'Segoe UI\',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
    + '<div style="border-bottom:3px solid ' + bc + ';padding-bottom:16px;margin-bottom:24px;">'
    + '<h2 style="margin:0;color:#1a1a1a;font-weight:400;">' + escH(bedrijfsnaam) + '</h2>'
    + (sub ? '<p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">' + escH(sub) + '</p>' : '')
    + '</div>'
    + content
    + '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;">'
    + '<p>' + escH(bedrijfsnaam) + '</p>'
    + '</div></body></html>';
}

interface OfferteAcceptedArgs {
  clientEmail: string;
  clientNaam: string;
  offerteNummer: string;
  eventNaam?: string;
  eventDatum?: string;
  totaalIncBtw?: number;
  bedrijfsnaam: string;
  brandColor?: string;
  ondertitel?: string;
}

export async function mailOfferteGeaccepteerd(args: OfferteAcceptedArgs) {
  const greeting = '<p>Beste ' + escH(args.clientNaam || 'klant') + ',</p>';
  const intro = '<p>Bedankt voor het accepteren van offerte <strong>' + escH(args.offerteNummer) + '</strong>. '
    + 'Wij hebben uw bevestiging ontvangen en gaan voor u aan de slag.</p>';
  const details = '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
    + (args.eventNaam ? '<tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Event</td><td style="padding:8px 12px;font-weight:600;">' + escH(args.eventNaam) + '</td></tr>' : '')
    + (args.eventDatum ? '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Datum</td><td style="padding:8px 12px;">' + escH(args.eventDatum) + '</td></tr>' : '')
    + '<tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Offertenummer</td><td style="padding:8px 12px;font-weight:600;">' + escH(args.offerteNummer) + '</td></tr>'
    + (args.totaalIncBtw ? '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Totaal incl. BTW</td><td style="padding:8px 12px;font-weight:700;color:' + (args.brandColor || '#c4a35a') + ';font-size:18px;">' + fmtEuro(args.totaalIncBtw) + '</td></tr>' : '')
    + '</table>';
  const nextSteps = '<p>U ontvangt binnenkort de factuur per e-mail. Mocht u nog vragen hebben, dan kunt u eenvoudig reageren op deze e-mail.</p>';
  const footer = '<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>' + escH(args.bedrijfsnaam) + '</strong></p>';

  const html = wrapHtml(greeting + intro + details + nextSteps + footer, args.bedrijfsnaam, args.brandColor, args.ondertitel);
  const text = 'Beste ' + (args.clientNaam || 'klant') + ',\n\n'
    + 'Bedankt voor het accepteren van offerte ' + args.offerteNummer + '.\n'
    + (args.eventNaam ? 'Event: ' + args.eventNaam + '\n' : '')
    + (args.eventDatum ? 'Datum: ' + args.eventDatum + '\n' : '')
    + (args.totaalIncBtw ? 'Totaal: ' + fmtEuro(args.totaalIncBtw) + '\n' : '')
    + '\nU ontvangt binnenkort de factuur per e-mail.\n\nMvg, ' + args.bedrijfsnaam;

  return sendServerMail({
    to: args.clientEmail,
    subject: 'Bevestiging — offerte ' + args.offerteNummer + ' geaccepteerd',
    html,
    text,
  });
}

interface PaymentReceivedArgs {
  clientEmail: string;
  clientNaam: string;
  factuurNummer: string;
  bedrag: number;
  betalingsmethode?: string;
  bedrijfsnaam: string;
  brandColor?: string;
  ondertitel?: string;
}

export async function mailPaymentOntvangen(args: PaymentReceivedArgs) {
  const greeting = '<p>Beste ' + escH(args.clientNaam || 'klant') + ',</p>';
  const intro = '<p>Wij hebben uw betaling ontvangen. Hartelijk dank!</p>';
  const details = '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
    + '<tr style="background:#f0fdf4;"><td style="padding:8px 12px;font-size:13px;color:#888;">Factuur</td><td style="padding:8px 12px;font-weight:600;">' + escH(args.factuurNummer) + '</td></tr>'
    + '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Bedrag</td><td style="padding:8px 12px;font-weight:700;color:#10b981;font-size:18px;">' + fmtEuro(args.bedrag) + '</td></tr>'
    + (args.betalingsmethode ? '<tr style="background:#f0fdf4;"><td style="padding:8px 12px;font-size:13px;color:#888;">Methode</td><td style="padding:8px 12px;">' + escH(args.betalingsmethode) + '</td></tr>' : '')
    + '</table>';
  const footer = '<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>' + escH(args.bedrijfsnaam) + '</strong></p>';

  const html = wrapHtml(greeting + intro + details + footer, args.bedrijfsnaam, args.brandColor, args.ondertitel);
  const text = 'Beste ' + (args.clientNaam || 'klant') + ',\n\n'
    + 'Wij hebben uw betaling van ' + fmtEuro(args.bedrag) + ' voor factuur ' + args.factuurNummer + ' ontvangen. Hartelijk dank!\n\n'
    + 'Mvg, ' + args.bedrijfsnaam;

  return sendServerMail({
    to: args.clientEmail,
    subject: 'Betaling ontvangen — factuur ' + args.factuurNummer,
    html,
    text,
  });
}

interface FactuurMailArgs {
  clientEmail: string;
  clientNaam: string;
  factuurNummer: string;
  factuurDatum?: string;
  vervaldatum?: string;
  totaalIncBtw: number;
  bedrijfsnaam: string;
  brandColor?: string;
  ondertitel?: string;
  paymentLink?: string;
}

export async function mailFactuurServer(args: FactuurMailArgs) {
  const greeting = '<p>Beste ' + escH(args.clientNaam || 'klant') + ',</p>';
  const intro = '<p>Hierbij ontvangt u de factuur voor de geleverde diensten.</p>';
  const details = '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
    + '<tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Factuurnummer</td><td style="padding:8px 12px;font-weight:600;">' + escH(args.factuurNummer) + '</td></tr>'
    + (args.factuurDatum ? '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Factuurdatum</td><td style="padding:8px 12px;">' + escH(args.factuurDatum) + '</td></tr>' : '')
    + (args.vervaldatum ? '<tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Vervaldatum</td><td style="padding:8px 12px;">' + escH(args.vervaldatum) + '</td></tr>' : '')
    + '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Totaal incl. BTW</td><td style="padding:8px 12px;font-weight:700;color:' + (args.brandColor || '#c4a35a') + ';font-size:18px;">' + fmtEuro(args.totaalIncBtw) + '</td></tr>'
    + '</table>';
  const payCta = args.paymentLink
    ? '<p><a href="' + args.paymentLink + '" style="display:inline-block;padding:12px 28px;background:' + (args.brandColor || '#c4a35a') + ';color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">Direct online betalen</a></p>'
    : '';
  const askToPay = '<p style="color:#888;font-size:13px;">Wij verzoeken u het bedrag binnen de betalingstermijn over te maken.</p>';
  const footer = '<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>' + escH(args.bedrijfsnaam) + '</strong></p>';

  const html = wrapHtml(greeting + intro + details + payCta + askToPay + footer, args.bedrijfsnaam, args.brandColor, args.ondertitel);
  const text = 'Beste ' + (args.clientNaam || 'klant') + ',\n\n'
    + 'Factuur ' + args.factuurNummer + '\n'
    + 'Totaal: ' + fmtEuro(args.totaalIncBtw) + '\n'
    + (args.vervaldatum ? 'Vervaldatum: ' + args.vervaldatum + '\n' : '')
    + (args.paymentLink ? '\nDirect online betalen: ' + args.paymentLink + '\n' : '')
    + '\nMvg, ' + args.bedrijfsnaam;

  return sendServerMail({
    to: args.clientEmail,
    subject: 'Factuur ' + args.factuurNummer + ' — ' + args.bedrijfsnaam,
    html,
    text,
  });
}

/* ── Lead Funnel — bevestiging naar klant + notificatie naar operator ─────── */

interface LeadConfirmArgs {
  clientEmail: string;
  clientNaam: string;
  eventDatum?: string;
  eventType?: string;
  bedrijfsnaam: string;
  brandColor?: string;
  ondertitel?: string;
}

/** Bevestiging naar de aanvrager: "we hebben je aanvraag ontvangen". White-label. */
export async function mailLeadBevestiging(args: LeadConfirmArgs) {
  const greeting = '<p>Beste ' + escH(args.clientNaam || 'klant') + ',</p>';
  const intro = '<p>Bedankt voor je aanvraag bij <strong>' + escH(args.bedrijfsnaam) + '</strong>. '
    + 'We hebben je bericht goed ontvangen en nemen zo snel mogelijk contact met je op'
    + (args.eventDatum ? ' over je event op <strong>' + escH(args.eventDatum) + '</strong>' : '')
    + '.</p>';
  const details = (args.eventType || args.eventDatum)
    ? '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
      + (args.eventType ? '<tr style="background:#f8f8f8;"><td style="padding:8px 12px;font-size:13px;color:#888;">Type</td><td style="padding:8px 12px;font-weight:600;">' + escH(args.eventType) + '</td></tr>' : '')
      + (args.eventDatum ? '<tr><td style="padding:8px 12px;font-size:13px;color:#888;">Datum</td><td style="padding:8px 12px;">' + escH(args.eventDatum) + '</td></tr>' : '')
      + '</table>'
    : '';
  const footer = '<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>' + escH(args.bedrijfsnaam) + '</strong></p>';

  const html = wrapHtml(greeting + intro + details + footer, args.bedrijfsnaam, args.brandColor, args.ondertitel);
  const text = 'Beste ' + (args.clientNaam || 'klant') + ',\n\n'
    + 'Bedankt voor je aanvraag bij ' + args.bedrijfsnaam + '. We nemen zo snel mogelijk contact met je op'
    + (args.eventDatum ? ' over je event op ' + args.eventDatum : '') + '.\n\nMvg, ' + args.bedrijfsnaam;

  return sendServerMail({
    to: args.clientEmail,
    subject: 'Aanvraag ontvangen — ' + args.bedrijfsnaam,
    html,
    text,
  });
}

interface LeadNotifyArgs {
  operatorEmail: string;
  naam: string;
  email?: string;
  telefoon?: string;
  eventDatum?: string;
  eventType?: string;
  gasten?: number | null;
  locatie?: string;
  budget?: string;
  bericht?: string;
  bedrijfsnaam: string;
  brandColor?: string;
}

/** Notificatie naar de caterer: "nieuwe aanvraag binnen". replyTo = klant. */
export async function mailLeadNotificatie(args: LeadNotifyArgs) {
  const rij = (label: string, val?: string | number | null, alt = false) =>
    (val !== undefined && val !== null && val !== '')
      ? '<tr' + (alt ? ' style="background:#f8f8f8;"' : '') + '><td style="padding:8px 12px;font-size:13px;color:#888;">' + escH(label) + '</td><td style="padding:8px 12px;font-weight:600;">' + escH(String(val)) + '</td></tr>'
      : '';
  const intro = '<p>Er is een nieuwe aanvraag binnengekomen via je aanvraagformulier.</p>';
  const tabel = '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
    + rij('Naam', args.naam, true)
    + rij('E-mail', args.email)
    + rij('Telefoon', args.telefoon, true)
    + rij('Type event', args.eventType)
    + rij('Datum', args.eventDatum, true)
    + rij('Aantal gasten', args.gasten ?? undefined)
    + rij('Locatie', args.locatie, true)
    + rij('Budget-indicatie', args.budget)
    + '</table>';
  const bericht = args.bericht
    ? '<p style="font-size:13px;color:#888;margin-bottom:4px;">Bericht:</p><p style="white-space:pre-wrap;background:#f8f8f8;padding:12px;border-radius:8px;">' + escH(args.bericht) + '</p>'
    : '';
  const cta = '<p style="color:#888;font-size:13px;">Open BBQ Architect → Verkoop → Aanvragen om de lead op te volgen en een concept-offerte te maken.</p>';

  const html = wrapHtml(intro + tabel + bericht + cta, args.bedrijfsnaam, args.brandColor, 'Nieuwe aanvraag');
  const text = 'Nieuwe aanvraag via je aanvraagformulier:\n\n'
    + 'Naam: ' + args.naam + '\n'
    + (args.email ? 'E-mail: ' + args.email + '\n' : '')
    + (args.telefoon ? 'Telefoon: ' + args.telefoon + '\n' : '')
    + (args.eventType ? 'Type: ' + args.eventType + '\n' : '')
    + (args.eventDatum ? 'Datum: ' + args.eventDatum + '\n' : '')
    + (args.gasten ? 'Gasten: ' + args.gasten + '\n' : '')
    + (args.locatie ? 'Locatie: ' + args.locatie + '\n' : '')
    + (args.budget ? 'Budget: ' + args.budget + '\n' : '')
    + (args.bericht ? '\nBericht:\n' + args.bericht + '\n' : '');

  return sendServerMail({
    to: args.operatorEmail,
    subject: 'Nieuwe aanvraag van ' + args.naam + (args.eventDatum ? ' — ' + args.eventDatum : ''),
    html,
    text,
    replyTo: args.email && isValidEmail(args.email) ? args.email : undefined,
  });
}
