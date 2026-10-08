/**
 * De drie Kerst-Box-mails aan de klant:
 *
 *   ontvangen    meteen na de bestelling — dit ís de bevestiging
 *   navraag      bij "weet ik nog niet precies", vijf dagen vóór het afhalen
 *   herinnering  de dag vóór het afhalen, om 10:00
 *
 * De eerste en de laatste zijn de sjablonen van de site (kerstMailSjablonen.ts,
 * woorden niet aanpassen). De navraag is hetzelfde sjabloon met een eigen kop
 * en alinea. Bier- en wijnproeverijen en de bubbels (crémant, champagne)
 * krijgen een eigen rij in de bon, in de stijl van de rij "Waarvan vegetarisch".
 *
 * Afzender: KERST_MAIL_FROM (bijv. "Hop & Bites <info@hopbites.nl>", domein
 * geverifieerd in Resend), anders RESEND_FROM_EMAIL. Antwoorden gaan naar het
 * mailadres uit de instellingen.
 */
import { sendServerMail } from '@/lib/serverMail';
import type { KerstMail } from './kerst';
import { KERSTBOX_HERINNERING, KERSTBOX_ONTVANGEN } from './kerstMailSjablonen';
import { WIJN_VOOR_PERSONEN, afhaaldagVoluit, euroKerst, veldenUitOrder, type KerstMailVelden } from './kerstTellen';

export { afhaaldagVoluit, euroKerst, veldenUitOrder, voornaamVan, type KerstMailVelden } from './kerstTellen';

export type KerstMailSoort = 'ontvangen' | 'navraag' | 'herinnering';

function escH(s: string): string {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── Het sjabloon invullen ─────────────────────────────────────────────────── */

const VEGA_RIJ = /<tr>\s*<td[^>]*>Waarvan vegetarisch<\/td>\s*<td[^>]*>\{\{vegetarisch\}\}<\/td>\s*<\/tr>\s*/;
const WAT_RIJ = /(<tr>\s*<td[^>]*>Wat<\/td>[\s\S]*?<\/tr>\s*)/;

function rijZoalsVega(sjabloon: string, label: string, waarde: string): string {
    const m = VEGA_RIJ.exec(sjabloon);
    if (!m) return '';
    return m[0].replace('>Waarvan vegetarisch<', `>${escH(label)}<`).replace('{{vegetarisch}}', escH(waarde));
}

/** "6 × (voor 6 personen)" bij bier; "2 × (voor 8 personen)" bij wijn, één proeverij voor vier. */
function proeverijTekst(n: number, soort: 'bier' | 'wijn'): string {
    const personen = soort === 'bier' ? n : n * WIJN_VOOR_PERSONEN;
    return `${n} × (voor ${personen} ${personen === 1 ? 'persoon' : 'personen'})`;
}

/** "1 fles", "2 flessen". */
function flessenTekst(n: number): string {
    return `${n} ${n === 1 ? 'fles' : 'flessen'}`;
}

/** De extra rijen in de bon, in de volgorde van de site: de bubbel eerst. */
function extraRijen(v: KerstMailVelden): [string, string][] {
    return [
        ...(v.cremant > 0 ? [['Crémant', flessenTekst(v.cremant)] as [string, string]] : []),
        ...(v.champagne > 0 ? [['Champagne', flessenTekst(v.champagne)] as [string, string]] : []),
        ...(v.bier > 0 ? [['Bierproeverij', proeverijTekst(v.bier, 'bier')] as [string, string]] : []),
        ...(v.wijn > 0 ? [['Wijnproeverij', proeverijTekst(v.wijn, 'wijn')] as [string, string]] : []),
    ];
}

/** De navraag: het bevestigingssjabloon met een eigen kop, alinea en onderwerp. */
function navraagSjabloon(): string {
    const vervang: [string, string][] = [
        ['<title>Je Kerst-Box-bestelling staat vast</title>', '<title>Hoeveel worden jullie?</title>'],
        ['Hop & Bites · mail 1 van 2: de bevestiging, meteen na het formulier. Er komt geen tweede bevestiging.', 'Hop & Bites · navraag: de klant wist het aantal nog niet precies. Vijf dagen voor het afhalen.'],
        ['Kerst-Box voor {{personen}} personen, afhalen {{afhaaldag}}. Je betaalt bij het afhalen.', 'Geef het aantal voor je Kerst-Box door. Afhalen {{afhaaldag}}.'],
        ['Kerst-Box 2026 · bestelling {{nummer}}', 'Kerst-Box 2026 · aantal doorgeven · {{nummer}}'],
        ['Je bestelling is binnen, {{voornaam}}.', 'Hoeveel worden jullie, {{voornaam}}?'],
        [
            'Dank je. Je bestelling staat vast: we zien je {{afhaaldag}} in onze winkel.',
            'Toen je bestelde wist je het aantal nog niet precies. Over een paar dagen gaan we koken: weet je het nu? Antwoord op deze mail of bel ons, dan zetten we het goed. Horen we niets, dan maken we hem voor {{personen}} personen.',
        ],
    ];
    let s = KERSTBOX_ONTVANGEN;
    for (const [oud, nieuw] of vervang) {
        if (!s.includes(oud)) throw new Error(`navraagsjabloon: "${oud.slice(0, 40)}…" niet gevonden`);
        s = s.replace(oud, nieuw);
    }
    return s;
}

const ONDERWERP: Record<KerstMailSoort, string> = {
    ontvangen: 'Je Kerst-Box-bestelling staat vast',
    navraag: 'Hoeveel worden jullie? Geef het aantal voor je Kerst-Box door',
    herinnering: 'Morgen staat je Kerst-Box klaar',
};

export function vulKerstSjabloon(sjabloon: string, v: KerstMailVelden): string {
    let s = sjabloon;
    /* Proeverijen eerst, zolang de vega-rij er nog als voorbeeld staat. */
    const extra = extraRijen(v).map(([label, waarde]) => rijZoalsVega(s, label, waarde)).join('');
    if (v.vegetarisch === 0) s = s.replace(VEGA_RIJ, '');
    if (extra) {
        /* Na "Waarvan vegetarisch" als die er staat, anders na "Wat". */
        const vega = VEGA_RIJ.exec(s);
        s = vega ? s.replace(vega[0], vega[0] + extra) : s.replace(WAT_RIJ, `$1${extra}`);
    }
    const velden: Record<string, string> = {
        voornaam: v.voornaam,
        nummer: v.nummer,
        personen: String(v.personen),
        vegetarisch: String(v.vegetarisch),
        afhaaldag: afhaaldagVoluit(v.afhaaldag),
        totaal: euroKerst(v.totaalCenten),
    };
    return s.replace(/\{\{(\w+)\}\}/g, (heel, naam: string) => (naam in velden ? escH(velden[naam]!) : heel));
}

function tekstVersie(soort: KerstMailSoort, v: KerstMailVelden, telefoon: string, email: string): string {
    const dag = afhaaldagVoluit(v.afhaaldag);
    const kop: Record<KerstMailSoort, string[]> = {
        ontvangen: [`Je bestelling is binnen, ${v.voornaam}.`, '', `Dank je. Je bestelling staat vast: we zien je ${dag} in onze winkel.`],
        navraag: [
            `Hoeveel worden jullie, ${v.voornaam}?`, '',
            `Toen je bestelde wist je het aantal nog niet precies. Over een paar dagen gaan we koken: weet je het nu? Antwoord op deze mail of bel ons, dan zetten we het goed. Horen we niets, dan maken we hem voor ${v.personen} personen.`,
        ],
        herinnering: [`Morgen staat hij klaar, ${v.voornaam}.`, '', `Je haalt je Kerst-Box ${dag} op in onze winkel, tussen 10:00 en 18:00. Betalen kan met pin of contant.`],
    };
    const bon = [
        `Bestelling ........ ${v.nummer}`,
        `Wat ............... Kerst-Box voor ${v.personen} personen`,
        ...(v.vegetarisch > 0 ? [`Waarvan vegetarisch  ${v.vegetarisch}`] : []),
        ...extraRijen(v).map(([label, waarde]) => `${`${label} `.padEnd(19, '.')} ${waarde}`),
        `Afhalen ........... ${dag}, tussen 10:00 en 18:00`,
        'Waar .............. Tramstraat 13, Schoonoord',
        `Totaal ............ ${euroKerst(v.totaalCenten)}`,
        'Betalen ........... bij het afhalen, met pin of contant',
    ];
    const slot = soort === 'herinnering'
        ? `Lukt het morgen niet? Bel ${telefoon} of mail ${email}, dan zoeken we samen een oplossing.`
        : `Iets wijzigen of annuleren? Bel ${telefoon} of mail ${email}.`;
    return [...kop[soort], '', ...bon, '', slot, '', '—— Mathijs Berkhout · chef en eigenaar', '', 'Hop & Bites · Ambacht voor thuis', 'Tramstraat 13 · 7848 BG Schoonoord'].join('\n');
}

export function kerstMailInhoud(soort: KerstMailSoort, v: KerstMailVelden): { subject: string; html: string; text: string } {
    const sjabloon = soort === 'ontvangen' ? KERSTBOX_ONTVANGEN : soort === 'herinnering' ? KERSTBOX_HERINNERING : navraagSjabloon();
    return {
        subject: ONDERWERP[soort],
        html: vulKerstSjabloon(sjabloon, v),
        /* Telefoon en mail staan vast in de sjablonen; de tekstversie zegt hetzelfde. */
        text: tekstVersie(soort, v, '06 13 73 44 53', 'info@hopbites.nl'),
    };
}

export async function stuurKerstMail(soort: KerstMailSoort, to: string, v: KerstMailVelden, replyTo: string | null): Promise<{ success: boolean; error?: string }> {
    const { subject, html, text } = kerstMailInhoud(soort, v);
    return sendServerMail({
        to,
        subject,
        html,
        text,
        replyTo: replyTo ?? undefined,
        from: process.env.KERST_MAIL_FROM || undefined,
    });
}

/** De bevestiging voor plaatsKerstBestelling. */
export const stuurKerstBevestiging: KerstMail = async ({ tenant, order, regels }) =>
    stuurKerstMail('ontvangen', order.contact_email, veldenUitOrder(order, regels), tenant.email);
