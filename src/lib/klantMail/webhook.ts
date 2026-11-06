/**
 * Helpers voor de ontvangst van klantmail via Resend.
 *
 * Resend ondertekent webhooks volgens de Svix-standaard: HMAC-SHA256 over
 * `id.tijdstip.body`, met de base64-sleutel achter `whsec_`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_LEEFTIJD_SECONDEN = 5 * 60;

export interface WebhookKoppen {
    id: string | null;
    tijdstip: string | null;
    handtekening: string | null;
}

export function klopWebhookHandtekening(
    body: string,
    koppen: WebhookKoppen,
    geheim: string | undefined,
    nuSeconden: number = Math.floor(Date.now() / 1000),
): boolean {
    if (!geheim || !koppen.id || !koppen.tijdstip || !koppen.handtekening) return false;
    const tijdstip = Number(koppen.tijdstip);
    if (!Number.isFinite(tijdstip) || Math.abs(nuSeconden - tijdstip) > MAX_LEEFTIJD_SECONDEN) return false;

    const sleutel = Buffer.from(geheim.replace(/^whsec_/, ''), 'base64');
    const verwacht = createHmac('sha256', sleutel)
        .update(`${koppen.id}.${koppen.tijdstip}.${body}`)
        .digest();

    return koppen.handtekening.split(' ').some((deel) => {
        const [versie, waarde] = deel.split(',');
        if (versie !== 'v1' || !waarde) return false;
        const gekregen = Buffer.from(waarde, 'base64');
        return gekregen.length === verwacht.length && timingSafeEqual(gekregen, verwacht);
    });
}

/** Het bedrijf uit het ontvangstadres: `mail-{slug}@…` wordt `{slug}`. */
export function slugUitAdressen(adressen: readonly string[]): string | null {
    for (const adres of adressen) {
        const m = /(?:^|<)mail-([a-z0-9-]+)@/i.exec(adres.trim());
        if (m) return m[1].toLowerCase();
    }
    return null;
}

/** `Naam <a@b.nl>` wordt { naam, email }. */
export function leesAfzender(kop: string | null | undefined): { naam: string | null; email: string | null } {
    const tekst = (kop ?? '').trim();
    const m = /^(.*?)<([^<>\s]+@[^<>\s]+)>\s*$/.exec(tekst);
    if (m) return { naam: m[1].replace(/^["'\s]+|["'\s]+$/g, '') || null, email: m[2].toLowerCase() };
    return /^[^\s<>]+@[^\s<>]+$/.test(tekst) ? { naam: null, email: tekst.toLowerCase() } : { naam: null, email: null };
}

/** Automatische mail krijgt nooit een antwoord: dat geeft mail-lussen. */
export function isAutomatisch(email: string | null, koppen: Record<string, unknown>): boolean {
    const k = Object.fromEntries(Object.entries(koppen).map(([s, w]) => [s.toLowerCase(), String(w ?? '').toLowerCase()]));
    if (k['auto-submitted'] && k['auto-submitted'] !== 'no') return true;
    if (k['list-unsubscribe'] || k['list-id']) return true;
    if (['bulk', 'junk', 'list', 'auto_reply'].includes(k['precedence'] ?? '')) return true;
    return /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)[+@.]/i.test(email ?? '');
}

export function htmlNaarTekst(html: string): string {
    return html
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
}
