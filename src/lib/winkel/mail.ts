/**
 * De bevestigingsmail na een betaalde webshop-order. Via Resend
 * (src/lib/serverMail.ts). Alleen ná een bevestigde betaling; een mailstoring
 * maakt de order niet onbetaald — de route noteert hem als 'mislukt' en
 * Mathijs ziet dat in de order.
 *
 * Let op RESEND_FROM_EMAIL: zonder die variabele vertrekt de mail vanaf
 * noreply@resend.dev en komt hij alleen op het eigen Resend-account aan.
 */
import { sendServerMail } from '@/lib/serverMail';
import type { Bevestigingsmail } from './kassa';
import { dagInWoorden } from './rekenen';

function escH(s: string): string {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function euro(centen: number): string {
    return '€ ' + (centen / 100).toFixed(2).replace('.', ',');
}

function momentTekst(m: { datum: string; van: string | null; tot: string | null } | null): string | null {
    if (!m) return null;
    const dag = dagInWoorden(m.datum);
    if (!m.van) return dag;
    const tijd = m.tot ? `${m.van.slice(0, 5)}–${m.tot.slice(0, 5)}` : `vanaf ${m.van.slice(0, 5)}`;
    return `${dag}, ${tijd}`;
}

export const stuurBevestigingsmail: Bevestigingsmail = async ({ tenant, order, regels, moment }) => {
    const bc = tenant.brandColor || '#6B7A3F';
    const voornaam = order.contact_naam.trim().split(/\s+/)[0] || order.contact_naam;
    const afhaal = momentTekst(moment);
    const vasteAfspraken = [...new Set(regels.map((r) => r.afhaalmoment_tekst).filter((t): t is string => Boolean(t)))];

    const rijen = regels.map((r, i) =>
        `<tr${i % 2 ? '' : ' style="background:#f8f8f8;"'}>`
        + `<td style="padding:8px 12px;">${escH(r.naam)}${r.afhaalmoment_tekst ? `<br><span style="font-size:12px;color:#888;">${escH(r.afhaalmoment_tekst)}</span>` : ''}</td>`
        + `<td style="padding:8px 12px;text-align:right;white-space:nowrap;">${r.aantal} × ${euro(r.stuk_cents)}</td>`
        + `<td style="padding:8px 12px;text-align:right;white-space:nowrap;">${euro(r.bedrag_cents)}</td></tr>`,
    ).join('');

    const levering = order.leverwijze === 'verzenden'
        ? `<p><strong>Verzenden</strong> naar ${escH(order.adres?.straat ?? '')}, ${escH(order.adres?.postcode ?? '')} ${escH(order.adres?.plaats ?? '')}.</p>`
        : `<p><strong>Afhalen</strong> in Schoonoord${afhaal ? ` op <strong>${escH(afhaal)}</strong>` : ''}.${vasteAfspraken.length ? ` ${escH(vasteAfspraken.join(' · '))}.` : ''}</p>`;

    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head>'
        + '<body style="font-family:\'Segoe UI\',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">'
        + `<div style="border-bottom:3px solid ${bc};padding-bottom:16px;margin-bottom:24px;">`
        + `<h2 style="margin:0;color:#1a1a1a;font-weight:400;">${escH(tenant.bedrijfsnaam)}</h2>`
        + (tenant.ondertitel ? `<p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">${escH(tenant.ondertitel)}</p>` : '')
        + '</div>'
        + `<p>Beste ${escH(voornaam)},</p>`
        + `<p>Bedankt voor je bestelling. Je betaling is ontvangen; dit is je bevestiging. Je bestelnummer is <strong>${escH(order.nummer)}</strong> — noem dat als je ons belt of mailt.</p>`
        + '<table style="width:100%;border-collapse:collapse;margin:20px 0;">' + rijen
        + (order.leverkosten_cents > 0 ? `<tr><td style="padding:8px 12px;">Verzendkosten</td><td></td><td style="padding:8px 12px;text-align:right;">${euro(order.leverkosten_cents)}</td></tr>` : '')
        + `<tr style="border-top:2px solid ${bc};"><td style="padding:8px 12px;font-weight:700;">Totaal (incl. btw)</td><td></td><td style="padding:8px 12px;text-align:right;font-weight:700;font-size:18px;">${euro(order.totaal_cents)}</td></tr>`
        + '</table>'
        + levering
        + (order.opmerking ? `<p style="font-size:13px;color:#888;margin-bottom:4px;">Je opmerking:</p><p style="white-space:pre-wrap;background:#f8f8f8;padding:12px;border-radius:8px;">${escH(order.opmerking)}</p>` : '')
        + (tenant.telefoon ? `<p>Vragen, of iets doorgeven? Bel ons op <strong>${escH(tenant.telefoon)}</strong>${tenant.email ? ` of mail naar ${escH(tenant.email)}` : ''}.</p>` : '')
        + `<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${escH(tenant.bedrijfsnaam)}</strong></p>`
        + '</body></html>';

    const text = `Beste ${voornaam},\n\n`
        + `Bedankt voor je bestelling. Je betaling is ontvangen. Bestelnummer: ${order.nummer}.\n\n`
        + regels.map((r) => `${r.naam} — ${r.aantal} × ${euro(r.stuk_cents)} = ${euro(r.bedrag_cents)}${r.afhaalmoment_tekst ? ` (${r.afhaalmoment_tekst})` : ''}`).join('\n')
        + (order.leverkosten_cents > 0 ? `\nVerzendkosten: ${euro(order.leverkosten_cents)}` : '')
        + `\nTotaal (incl. btw): ${euro(order.totaal_cents)}\n\n`
        + (order.leverwijze === 'verzenden'
            ? `Verzenden naar ${order.adres?.straat ?? ''}, ${order.adres?.postcode ?? ''} ${order.adres?.plaats ?? ''}.\n`
            : `Afhalen in Schoonoord${afhaal ? ` op ${afhaal}` : ''}.${vasteAfspraken.length ? ` ${vasteAfspraken.join(' · ')}.` : ''}\n`)
        + (order.opmerking ? `\nJe opmerking: ${order.opmerking}\n` : '')
        + (tenant.telefoon ? `\nVragen? Bel ${tenant.telefoon}${tenant.email ? ` of mail ${tenant.email}` : ''}.\n` : '')
        + `\nMet vriendelijke groet,\n${tenant.bedrijfsnaam}`;

    return sendServerMail({
        to: order.contact_email,
        subject: `Bevestiging bestelling ${order.nummer} — ${tenant.bedrijfsnaam}`,
        html,
        text,
        replyTo: tenant.email ?? undefined,
    });
};
