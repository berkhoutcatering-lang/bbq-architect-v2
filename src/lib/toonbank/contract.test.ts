/**
 * Contracttest toonbank/v1 (BA-7b, plan v5): dezelfde voorbeeldberichten en
 * hashes als de Toonbank.
 *
 * De voorbeelden in ./contract/voorbeelden zijn een kopie van
 * hopbites-toonbank/contract/v1/voorbeelden (branch feat/tb-skelet, commit
 * 9660062 voor contract/v1), met MANIFEST.sha256. Verandert een voorbeeld
 * daar, dan verandert de manifesthash: kopieer de nieuwe bestanden, pas
 * MANIFEST_HASH hieronder aan en laat deze test (en de schema's in
 * contract.ts) weer slagen. Zo breekt het contract nooit pas aan de toonbank.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kassaPil } from '@/lib/winkel/vrij';
import {
    CONTRACT_HUIDIG, CONTRACT_MINIMAAL, FOUT_STATUS, PilGevallen, SCHEMAS, StatusAntwoord, VOORBEELDEN,
    leesVersie, versieMinstens,
} from './contract';

const MAP = path.join(__dirname, 'contract', 'voorbeelden');
/** SHA-256 van MANIFEST.sha256 zelf: vastgepind, zodat een stille wijziging opvalt. */
const MANIFEST_HASH = '8d10759dd4b9d4b033e108c41d003574b4280adb450bdc57ffeff86490571eaa';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const lees = (naam: string): unknown => JSON.parse(readFileSync(path.join(MAP, naam), 'utf8'));

describe('MANIFEST.sha256', () => {
    const manifest = readFileSync(path.join(MAP, 'MANIFEST.sha256'));

    it('is het vastgepinde manifest van de Toonbank', () => {
        expect(sha(manifest)).toBe(MANIFEST_HASH);
    });

    it('elke hash in het manifest klopt met het bestand hier', () => {
        const regels = manifest.toString('utf8').trim().split('\n');
        expect(regels.length).toBe(Object.keys(VOORBEELDEN).length);
        for (const regel of regels) {
            const [hash, naam] = regel.split(/\s+/);
            expect(sha(readFileSync(path.join(MAP, naam!))), naam).toBe(hash);
        }
    });

    it('elk JSON-bestand in de map staat in VOORBEELDEN, en andersom', () => {
        const inMap = readdirSync(MAP).filter((n) => n.endsWith('.json')).sort();
        expect(inMap).toEqual(Object.keys(VOORBEELDEN).sort());
    });
});

describe('de voorbeeldberichten parse\'n tegen de schema\'s van BBQ Architect', () => {
    it.each(Object.entries(VOORBEELDEN))('%s → %s, zonder onbekende velden', (naam, schemaNaam) => {
        const json = lees(naam);
        const uitkomst = SCHEMAS[schemaNaam].safeParse(json);
        expect(uitkomst.error?.issues ?? []).toEqual([]);
        /* zod laat onbekende velden stil weg: zo valt een veld op dat BA niet kent. */
        expect(uitkomst.data).toEqual(json);
    });
});

describe('kassaPil zegt precies wat pil-gevallen.json zegt', () => {
    const { gevallen } = PilGevallen.parse(lees('pil-gevallen.json'));
    it.each(gevallen.map((g) => [`${g.ligt_er}/${g.gereserveerd}/${g.grens}`, g] as const))('%s', (_n, g) => {
        expect(kassaPil(g.ligt_er, g.gereserveerd, g.grens)).toEqual({ soort: g.soort, tekst: g.tekst, aria: g.aria });
    });
});

describe('versies', () => {
    it('huidig 1.1.0, minimaal 1.0.0', () => {
        expect(CONTRACT_HUIDIG).toBe('1.1.0');
        expect(versieMinstens(CONTRACT_HUIDIG, CONTRACT_MINIMAAL)).toBe(true);
        expect(StatusAntwoord.shape.contract.parse({ huidig: CONTRACT_HUIDIG, minimaal: CONTRACT_MINIMAAL })).toBeTruthy();
    });
    it('vergelijkt per deel, niet als tekst', () => {
        expect(versieMinstens('1.10.0', '1.9.0')).toBe(true);
        expect(versieMinstens('1.0.9', '1.1.0')).toBe(false);
        expect(versieMinstens('1.1.0-ontwerp', '1.1.0')).toBe(true);
        expect(versieMinstens('2.0.0', '1.0.0')).toBe(true);
        expect(versieMinstens(null, '1.0.0')).toBe(false);
        expect(versieMinstens('een', '1.0.0')).toBe(false);
        expect(leesVersie('1.2.3')).toEqual([1, 2, 3]);
    });
});

describe('foutstatussen', () => {
    it('401 alleen voor de apparaatsleutel; een foute code is 403', () => {
        const vier01 = Object.entries(FOUT_STATUS).filter(([, s]) => s === 401).map(([c]) => c).sort();
        expect(vier01).toEqual(['sleutel_ingetrokken', 'sleutel_onbekend']);
        expect(FOUT_STATUS.inlogcode_onjuist).toBe(403);
        expect(FOUT_STATUS.koppelcode_ongeldig).toBe(403);
        expect(FOUT_STATUS.contract_verouderd).toBe(426);
    });
});
