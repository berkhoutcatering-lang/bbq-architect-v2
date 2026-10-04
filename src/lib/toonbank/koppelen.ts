/**
 * POST /api/toonbank/v1/koppelen (BA-7b): een tablet koppelen met de code van
 * 6 cijfers uit Instellingen → Toonbank. Contract §3.3.
 *
 * Geen sleutel nodig (die komt hier pas). De organisatie volgt uit de code:
 * de API vergelijkt hem met elke open code (scrypt) en rondt het af in de
 * database, alleen als die code dan nog open is. Altijd 403
 * koppelcode_ongeldig bij een fout: nooit 401, want er is nog geen sleutel
 * om te ontkoppelen.
 *
 * Review M2 (klein 7): een foute code wordt per bron bijgehouden (SHA-256 van
 * het IP-adres; het adres zelf wordt niet bewaard). Een bron mag 5 foute codes
 * per 15 minuten; daarna 429 te_snel zonder dat er iets geprobeerd wordt.
 * Alleen die 5 tellen mee bij de open codes, en een code vervalt pas na 25:
 * één adres kan het koppelen niet meer voor iedereen blokkeren.
 */
import { createHash } from 'node:crypto';
import type { KoppelAntwoord } from './contract';
import { KOPPEL_BRON_MINUTEN, zoekKoppeling } from './koppelcode';
import { genereerSleutel } from './sleutel';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

const ONGELDIG = 'Deze koppelcode klopt niet, is al gebruikt of is verlopen. Vraag in BBQ Architect (Instellingen → Toonbank) een nieuwe.';

/** De bron van een poging: SHA-256 (hex) van het IP-adres. */
export function koppelBron(ip: string): string {
    return createHash('sha256').update(`toonbank-koppelen:${ip}`).digest('hex');
}

export async function koppel(store: ToonbankStore, verzoek: { koppelcode: string }, bron: string): Promise<Uitkomst<KoppelAntwoord>> {
    if (await store.koppelGeblokkeerd(bron)) {
        return mislukt('te_snel', `Te veel foute koppelcodes. Probeer het over ${KOPPEL_BRON_MINUTEN} minuten opnieuw.`, { retry_after: KOPPEL_BRON_MINUTEN * 60 });
    }
    const kandidaten = await store.koppelKandidaten();
    const gevonden = await zoekKoppeling(kandidaten, verzoek.koppelcode);
    if (!gevonden) {
        await store.koppelMislukt(bron);
        return mislukt('koppelcode_ongeldig', ONGELDIG);
    }
    const { sleutel, hash, prefix } = genereerSleutel();
    const k = await store.koppelAf(gevonden.apparaat_id, hash, prefix);
    if (!k) return mislukt('koppelcode_ongeldig', ONGELDIG);
    /* De sleutel gaat maar één keer over de lijn; daarna kent BBQ Architect alleen de hash. */
    return gelukt({ apparaat_id: k.apparaat_id, code: k.code, naam: k.naam, sleutel });
}
