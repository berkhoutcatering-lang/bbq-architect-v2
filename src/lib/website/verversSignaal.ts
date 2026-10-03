/**
 * Het ververs-signaal naar de website (plan v5, BA-5c).
 *
 * Na iets dat de beschikbaarheid kan veranderen (een betaling, inpakken, een
 * telling of andere voorraadmutatie) laat BBQ Architect de website weten dat
 * hij zijn cache voor die tags moet weggooien (revalidateTag aan de
 * websitekant, WEB-2b). De website haalt daarna zelf
 * GET /api/public-winkel/{slug}/beschikbaarheid op; er gaan geen getallen mee.
 *
 *   POST {WEBSITE_VERVERS_URL}
 *   content-type        application/json
 *   x-hb-tijd           seconden sinds 1970 (de website weigert buiten ±300 s)
 *   x-hb-handtekening   'sha256=' + hex(HMAC-SHA256(WEBSITE_VERVERS_GEHEIM, `${tijd}.${body}`))
 *   body                {"tags":["beschikbaarheid"]}
 *
 * Gedeelde testvector (dezelfde test staat aan de websitekant):
 *   geheim 'testgeheim-hop-en-bites', tijd '1791000000',
 *   body '{"tags":["beschikbaarheid"]}'
 *   → 'sha256=67c7c403fe3d7c60339cc7983cd93326dffd55f06331fd025f644590b3a2455a'
 *
 * Regels: hooguit 2 seconden, gooit nooit, en doet niets zonder beide
 * variabelen (WEBSITE_VERVERS_URL en WEBSITE_VERVERS_GEHEIM). Het geheim komt
 * nooit in een log. Een gemist signaal is niet erg: de website ververst ook
 * op tijd en op vrij_verloopt_at, en BBQ Architect blijft de poort bij de order.
 */
import { createHmac } from 'node:crypto';
import { after } from 'next/server';

/** Langer wacht BBQ Architect niet op de website. */
export const VERVERS_TIMEOUT_MS = 2000;

/** De tag voor de beschikbaarheid (WEB-2a/2b). */
export const TAG_BESCHIKBAARHEID = 'beschikbaarheid';

/** 'sha256=' + hex(HMAC-SHA256(geheim, `${tijd}.${body}`)). Puur. */
export function maakHandtekening(geheim: string, tijd: string, body: string): string {
    return 'sha256=' + createHmac('sha256', geheim).update(`${tijd}.${body}`).digest('hex');
}

export interface SignaalOpties {
    /** Voor tests: de klok en fetch. */
    nu?: () => Date;
    fetch?: typeof fetch;
}

/**
 * Stuurt het signaal en wacht hooguit 2 s. true = de website zei 2xx.
 * Gooit nooit; zonder WEBSITE_VERVERS_URL of WEBSITE_VERVERS_GEHEIM gebeurt er niets (false).
 */
export async function stuurVerversSignaal(tags: string[], opties: SignaalOpties = {}): Promise<boolean> {
    const url = process.env.WEBSITE_VERVERS_URL;
    const geheim = process.env.WEBSITE_VERVERS_GEHEIM;
    if (!url || !geheim) return false;
    try {
        const body = JSON.stringify({ tags });
        const tijd = String(Math.floor((opties.nu?.() ?? new Date()).getTime() / 1000));
        const antwoord = await (opties.fetch ?? fetch)(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hb-tijd': tijd,
                'x-hb-handtekening': maakHandtekening(geheim, tijd, body),
            },
            body,
            signal: AbortSignal.timeout(VERVERS_TIMEOUT_MS),
            cache: 'no-store',
        });
        if (!antwoord.ok) console.warn('[website-signaal] de website antwoordde', antwoord.status);
        return antwoord.ok;
    } catch (e) {
        console.warn('[website-signaal] niet verstuurd:', e instanceof Error ? e.name + ': ' + e.message : 'onbekend');
        return false;
    }
}

/**
 * Fire-and-forget: het signaal gaat na het antwoord (next/server `after`), zodat
 * een betaalbericht of een klik er nooit op wacht. Buiten een verzoek (een
 * script of test) gaat het los, zonder te wachten. Gooit nooit.
 */
export function verversNaAfloop(tags: string[] = [TAG_BESCHIKBAARHEID]): void {
    if (!process.env.WEBSITE_VERVERS_URL || !process.env.WEBSITE_VERVERS_GEHEIM) return;
    try {
        after(() => stuurVerversSignaal(tags));
    } catch {
        void stuurVerversSignaal(tags);
    }
}
