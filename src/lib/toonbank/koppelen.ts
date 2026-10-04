/**
 * POST /api/toonbank/v1/koppelen (BA-7b): een tablet koppelen met de code van
 * 6 cijfers uit Instellingen → Toonbank. Contract §3.3.
 *
 * Geen sleutel nodig (die komt hier pas). De organisatie volgt uit de code:
 * de API vergelijkt hem met elke open code (scrypt) en rondt het af in de
 * database, alleen als die code dan nog open is. Een foute code telt mee bij
 * alle open codes (5 pogingen, in de database). Altijd 403
 * koppelcode_ongeldig bij een fout: nooit 401, want er is nog geen sleutel
 * om te ontkoppelen.
 */
import type { KoppelAntwoord } from './contract';
import { zoekKoppeling } from './koppelcode';
import { genereerSleutel } from './sleutel';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

const ONGELDIG = 'Deze koppelcode klopt niet, is al gebruikt of is verlopen. Vraag in BBQ Architect (Instellingen → Toonbank) een nieuwe.';

export async function koppel(store: ToonbankStore, verzoek: { koppelcode: string }): Promise<Uitkomst<KoppelAntwoord>> {
    const kandidaten = await store.koppelKandidaten();
    const gevonden = await zoekKoppeling(kandidaten, verzoek.koppelcode);
    if (!gevonden) {
        await store.koppelMislukt();
        return mislukt('koppelcode_ongeldig', ONGELDIG);
    }
    const { sleutel, hash, prefix } = genereerSleutel();
    const k = await store.koppelAf(gevonden.apparaat_id, hash, prefix);
    if (!k) return mislukt('koppelcode_ongeldig', ONGELDIG);
    /* De sleutel gaat maar één keer over de lijn; daarna kent BBQ Architect alleen de hash. */
    return gelukt({ apparaat_id: k.apparaat_id, code: k.code, naam: k.naam, sleutel });
}
