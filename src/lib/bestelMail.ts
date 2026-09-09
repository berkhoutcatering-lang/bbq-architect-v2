/**
 * De bevestigingsmail — tekst en opmaak.
 * Briefing §4. Plan: docs/bestelstroom-bouwplan.md §9.
 *
 * De platte tekst is HANDGESCHREVEN en woordelijk overgenomen uit de briefing,
 * niet afgeleid uit de HTML. Dat is een eis: een automatisch gestripte
 * HTML-mail leest als een formulier, en dit is de mail die iemand bewaart voor
 * als het deksel wegraakt.
 *
 * Wat er niet in staat:
 *   • geen prijs — die hoort in een ander bericht dan de link
 *   • geen tijden bij bereiding — signaal in plaats van tijd
 *   • geen weekdag als opgeslagen tekst; die wordt gerekend uit de datum
 *   • geen verzonnen adres — ontbreekt het, dan valt die regel weg
 */

import { formatteerAfhaalmoment, samenstellingsZin, type DoosOnderdeel } from './bestelstroom';

export interface BestelMailGegevens {
    voornaam: string;
    titel: string;
    personen: number;
    /** YYYY-MM-DD */
    afhaaldatum: string;
    startTijd?: string | null;
    /** Uit settings.adres. Leeg = de regel valt weg. */
    adres?: string | null;
    /** Uit de Experience-app; zonder deze gaat de mail niet uit. */
    url: string;
    onderdelen?: DoosOnderdeel[] | null;
    /** Ondertekening — per tenant, niet hardcoded. */
    afzender: string;
    bedrijfsregel: string;
}

export const ONDERWERP = (titel: string) => `Je bestelling staat genoteerd — ${titel}`;

/**
 * "Vijf gerechten, van elk twee stuks per persoon."
 *
 * Alleen als álle proteïne-onderdelen hetzelfde aantal per persoon hebben —
 * anders is "van elk twee stuks" gewoon niet waar en valt de zin weg.
 */
export function gerechtenZin(onderdelen: DoosOnderdeel[] | null | undefined): string | null {
    const eiwit = (onderdelen ?? []).filter((o) => o.soort === 'proteïne' || o.soort === 'proteine');
    if (eiwit.length < 1) return null;

    const aantallen = new Set(eiwit.map((o) => o.aantal_per_persoon ?? 0));
    if (aantallen.size !== 1) return null;
    const perPersoon = [...aantallen][0];
    if (!perPersoon || perPersoon < 1) return null;

    return `${telwoordHoofd(eiwit.length)} gerechten, van elk ${TELWOORD[perPersoon] ?? perPersoon} stuks per persoon.`;
}

const TELWOORD: Record<number, string> = {
    1: 'één', 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 6: 'zes',
    7: 'zeven', 8: 'acht', 9: 'negen', 10: 'tien',
};
function telwoordHoofd(n: number): string {
    const w = TELWOORD[n] ?? String(n);
    return w.charAt(0).toUpperCase() + w.slice(1);
}

/** "Tot de 22e," — het dagnummer uit de afhaaldatum. */
function totDe(isoDatum: string): string | null {
    const m = /^\d{4}-\d{2}-(\d{2})$/.exec(isoDatum ?? '');
    if (!m) return null;
    return `Tot de ${Number(m[1])}e,`;
}

/**
 * De platte-tekstversie. Woordelijk de briefing; alles tussen blokhaken komt
 * uit de bestelling.
 */
export function bestelMailTekst(g: BestelMailGegevens): string {
    const moment = formatteerAfhaalmoment(g.afhaaldatum, g.startTijd);
    const zin1 = gerechtenZin(g.onderdelen);
    const zin2 = samenstellingsZin(g.onderdelen, g.personen);
    const samenstelling = [zin1, zin2].filter(Boolean).join(' ');
    const groet = totDe(g.afhaaldatum);

    const regels: string[] = [
        `Hoi ${g.voornaam},`,
        '',
        'Je gourmetbox is genoteerd. Hieronder staat wat erin gaat en wanneer je',
        'hem ophaalt.',
        '',
        'WAT JE KRIJGT',
        `${g.titel} · ${g.personen} ${g.personen === 1 ? 'persoon' : 'personen'}`,
    ];

    /* Valt weg als de samenstelling niet bekend is — nooit een half getal. */
    if (samenstelling) regels.push(samenstelling);

    regels.push('', 'OPHALEN');
    if (moment) regels.push(hoofdletter(moment));
    /* Geen adres bekend? Dan geen lege regel en geen plaatshouder. */
    if (g.adres) regels.push(g.adres);

    regels.push(
        '',
        'Zet hem thuis meteen in de koeling. Op de sticker onderop de doos staat',
        'per onderdeel tot wanneer het goed is.',
        '',
        'JE EIGEN ROUTE',
        'Op het deksel zit een QR-code. Scan hem op de avond zelf: je krijgt dan',
        'je eigen kaart met vijf dorpen, en bij elk kies je zelf welke kant je op',
        'gaat. Iedereen aan tafel scant op zijn eigen telefoon en loopt zijn eigen',
        'route.',
        '',
        `Jouw persoonlijke link: ${g.url}`,
        '',
        'Bewaar deze mail. Raakt het deksel weg, dan kom je er hiermee ook.',
        '',
        'ALLERGENEN',
        'Die staan op het etiket van elk bakje, en samengevat op de sticker',
        'onderop de doos. Twijfel je ergens over, bel ons even — we zoeken het na',
        'en verzinnen niets.',
        '',
    );

    if (groet) regels.push(groet);
    regels.push(g.afzender, g.bedrijfsregel);

    return regels.join('\n');
}

function hoofdletter(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── HTML ─────────────────────────────────────────────────────────────────── */

/* Licht, niet donker: Outlook en Gmail keren donkere achtergronden
   onvoorspelbaar om en dan is de mail onleesbaar. Crème ondergrond, zwarte
   tekst, 600 px, tabellen, alles inline. */
const CREME = '#EDE7D8';
const ZWART = '#141311';
const GOUD = '#8D6712';

function esc(s: string): string {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function kopje(tekst: string): string {
    return `<tr><td style="padding:22px 0 6px;font:600 11px/1.4 'IBM Plex Mono',Consolas,monospace;letter-spacing:.16em;color:${GOUD};">${esc(tekst)}</td></tr>`;
}
function alinea(tekst: string): string {
    return `<tr><td style="padding:0 0 12px;font:400 15px/1.6 Archivo,Arial,Helvetica,sans-serif;color:${ZWART};">${tekst}</td></tr>`;
}

export function bestelMailHtml(g: BestelMailGegevens): string {
    const moment = formatteerAfhaalmoment(g.afhaaldatum, g.startTijd);
    const samenstelling = [gerechtenZin(g.onderdelen), samenstellingsZin(g.onderdelen, g.personen)]
        .filter(Boolean).join(' ');
    const groet = totDe(g.afhaaldatum);

    const rijen: string[] = [];
    rijen.push(`<tr><td style="padding:0 0 14px;font:400 15px/1.6 Archivo,Arial,sans-serif;color:${ZWART};">Hoi ${esc(g.voornaam)},</td></tr>`);
    rijen.push(alinea('Je gourmetbox is genoteerd. Hieronder staat wat erin gaat en wanneer je hem ophaalt.'));

    rijen.push(kopje('WAT JE KRIJGT'));
    rijen.push(alinea(`<strong>${esc(g.titel)}</strong> · ${g.personen} ${g.personen === 1 ? 'persoon' : 'personen'}`));
    if (samenstelling) rijen.push(alinea(esc(samenstelling)));

    rijen.push(kopje('OPHALEN'));
    if (moment) rijen.push(alinea(`<strong>${esc(hoofdletter(moment))}</strong>`));
    if (g.adres) rijen.push(alinea(esc(g.adres)));
    rijen.push(alinea('Zet hem thuis meteen in de koeling. Op de sticker onderop de doos staat per onderdeel tot wanneer het goed is.'));

    rijen.push(kopje('JE EIGEN ROUTE'));
    rijen.push(alinea('Op het deksel zit een QR-code. Scan hem op de avond zelf: je krijgt dan je eigen kaart met vijf dorpen, en bij elk kies je zelf welke kant je op gaat. Iedereen aan tafel scant op zijn eigen telefoon en loopt zijn eigen route.'));
    rijen.push(alinea(`Jouw persoonlijke link:<br><a href="${esc(g.url)}" style="color:${GOUD};font-weight:600;word-break:break-all;">${esc(g.url)}</a>`));
    rijen.push(alinea('Bewaar deze mail. Raakt het deksel weg, dan kom je er hiermee ook.'));

    rijen.push(kopje('ALLERGENEN'));
    rijen.push(alinea('Die staan op het etiket van elk bakje, en samengevat op de sticker onderop de doos. Twijfel je ergens over, bel ons even — we zoeken het na en verzinnen niets.'));

    rijen.push(`<tr><td style="padding:22px 0 0;font:400 15px/1.6 Archivo,Arial,sans-serif;color:${ZWART};">
        ${groet ? esc(groet) + '<br>' : ''}${esc(g.afzender)}<br>
        <span style="color:#5a5348;">${esc(g.bedrijfsregel)}</span>
    </td></tr>`);

    return `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ONDERWERP(g.titel))}</title></head>
<body style="margin:0;padding:0;background:${CREME};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
${rijen.join('\n')}
</table>
</td></tr></table></body></html>`;
}
