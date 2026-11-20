/**
 * Contracttest toonbank/v1 (BA-7b, plan v5): dezelfde voorbeeldberichten en
 * hashes als de Toonbank.
 *
 * De voorbeelden in ./contract/voorbeelden zijn een kopie van
 * hopbites-toonbank/contract/v1/voorbeelden (branch feat/tb-skelet, commit
 * 9660062 voor contract/v1; de cadeaubonnen van 1.2 uit feat/tb-pin-koppeling,
 * commit c99912b), met MANIFEST.sha256. Verandert een voorbeeld
 * daar, dan verandert de manifesthash: kopieer de nieuwe bestanden, pas
 * MANIFEST_HASH hieronder aan en laat deze test (en de schema's in
 * contract.ts) weer slagen. Zo breekt het contract nooit pas aan de toonbank.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { kassaPil } from '@/lib/winkel/vrij';
import { catalogusAntwoord, partijenAntwoord } from './vragen';
import {
    BONNEN_SOORTEN, CONTRACT_HUIDIG, CONTRACT_MINIMAAL, FOUT_STATUS, Melding, PakjeBinnenAntwoord, PakjeBinnenVerzoek, PakjeWegAntwoord, PilGevallen, SCHEMAS, StatusAntwoord, VOORBEELDEN,
    leesVersie, versieMinstens,
} from './contract';

const MAP = path.join(__dirname, 'contract', 'voorbeelden');
/** SHA-256 van MANIFEST.sha256 zelf: vastgepind, zodat een stille wijziging opvalt. */
const MANIFEST_HASH = '4ff09a2349b1896254a9394d3936331aa3ed3027c7209cd8a2dbfb9e40320497';

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
    it('huidig 1.4.0 (1.2 cadeaubonnen, 1.3 de koppeling met de myPOS, 1.4 stickers), minimaal 1.1.0: 1.2 tot en met 1.4 voegen alleen toe', () => {
        expect(CONTRACT_HUIDIG).toBe('1.4.0');
        expect(CONTRACT_MINIMAAL).toBe('1.1.0');
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

describe('contract 1.4: stickers', () => {
    const envelop = { gebeurtenis_id: '7d0c8a8e-3b44-4f63-9d7e-2f1f5b7f2c11', volgnummer: 12, moment: '2026-11-18T09:00:00+01:00', medewerker_id: null };
    const code = '2900624001160599026112000013';
    it('een stickermelding, met of zonder partij', () => {
        const m = {
            soort: 'sticker', ...envelop, artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', plu: 624, code,
            gewicht_g: 116, kiloprijs_cents: 5990, prijs_cents: 695, tht: '2026-11-20', tht_hele_kaas: '2026-11-20', kopie: false,
        };
        expect(SCHEMAS.StickerMelding.safeParse(m).success).toBe(true);
        expect(SCHEMAS.StickerMelding.safeParse({ ...m, partij_id: '0da446be-613f-4a74-9791-704b065a1f74' }).success).toBe(true);
        expect(SCHEMAS.StickerMelding.safeParse({ ...m, code: '2106241006950' }).success).toBe(false);
        expect(Melding.safeParse(m).success).toBe(true);
        expect(BONNEN_SOORTEN).toContain('sticker');
    });
    it('een bonregel met prijs_bron sticker, gewicht en kiloprijs', () => {
        const bon = {
            soort: 'bon', ...envelop, bon_id: envelop.gebeurtenis_id, bonnummer: 'T1-000001', bon_volgnummer: 1, status: 'afgerond',
            kanaal: 'winkel', catalogus_versie: 3, leeftijd: null, totaal_cents: 695,
            regels: [
                { regelnr: 1, soort: 'verkoop', artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Nagelhout', aantal: 1, stuk_cents: 695,
                  korting_cents: 0, bedrag_cents: 695, btw: [{ pct: 9, incl_cents: 695 }], alcohol: false,
                  onderdelen: [{ product_id: '0da446be-613f-4a74-9791-704b065a1f74', hoeveelheid: 116, eenheid: 'gram' }],
                  scan_code: code, prijs_bron: 'sticker', gewicht_g: 116, kiloprijs_cents: 5990 },
                { regelnr: 2, soort: 'betaling', betaalmethode: 'pin', betaal_bevestiging: 'handmatig', bedrag_cents: 695 },
            ],
        };
        expect(SCHEMAS.BonMelding.safeParse(bon).success).toBe(true);
    });
    it('catalogus: alleen een artikel op gewicht krijgt verkoop_per, kiloprijs en etiket', () => {
        const basis = {
            artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Nagelhout', prijs_cents: 5990, btw_pct: 9, btw_verdeling: null, alcohol: false,
            groep: 'vlees', volgorde: 0, favoriet: false, foto: null, foto_url_ruw: null,
            onderdelen: [{ product_id: '0da446be-613f-4a74-9791-704b065a1f74', hoeveelheid: 1, eenheid: 'gram' }], actief: true, kanalen: ['toonbank'],
        };
        const uit = catalogusAntwoord({
            versie: 3, volledig: true, producten: [], codes: [], groepen: [],
            artikelen: [
                { ...basis, verkoop_per: 'kg', kiloprijs_cents: 5990,
                  etiket: { plu: 624, ingredienten: null, allergenen: [], houdbaar_dagen: 0, bewaren: 'gekoeld (max. 7 °C)', rauwe_melk: false, beschermende_atmosfeer: true, tht_uit_partij: true } },
                { ...basis, artikel_id: '6c2d3e4f-5061-4b72-8c83-9d8e7f6a5b52', naam: 'Pindas', verkoop_per: 'stuk', kiloprijs_cents: null, etiket: null },
            ],
        }, null);
        expect(SCHEMAS.CatalogusAntwoord.safeParse(uit).success).toBe(true);
        expect(uit.artikelen[0]).toMatchObject({ verkoop_per: 'kg', kiloprijs_cents: 5990, etiket: { plu: 624, tht_uit_partij: true, beschermende_atmosfeer: true } });
        expect(uit.artikelen[1]).not.toHaveProperty('verkoop_per');
        expect(uit.artikelen[1]).not.toHaveProperty('etiket');
    });
    it('catalogus: wegen bij het afrekenen en de tarra, alleen bij een artikel op gewicht', () => {
        const basis = {
            artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Groene olijven', prijs_cents: 2250, btw_pct: 9, btw_verdeling: null, alcohol: false,
            groep: 'olijven', volgorde: 0, favoriet: false, foto: null, foto_url_ruw: null,
            onderdelen: [{ product_id: '0da446be-613f-4a74-9791-704b065a1f74', hoeveelheid: 1, eenheid: 'gram' }], actief: true, kanalen: ['toonbank'],
            verkoop_per: 'kg', kiloprijs_cents: 2250, etiket: null,
        };
        const uit = catalogusAntwoord({
            versie: 5, volledig: true, producten: [], codes: [], groepen: [],
            artikelen: [
                { ...basis, wegen_bij_afrekenen: true, tarra_g: null },
                { ...basis, artikel_id: '6c2d3e4f-5061-4b72-8c83-9d8e7f6a5b52', naam: 'Tapenade', wegen_bij_afrekenen: true, tarra_g: 18 },
                { ...basis, artikel_id: '7d3e4f50-6172-4c83-9d94-0e9f8a7b6c63', naam: 'Stickerkaas', wegen_bij_afrekenen: false, tarra_g: null },
                { ...basis, artikel_id: '8e4f5061-7283-4d94-8ea5-1f0a9b8c7d74', naam: 'Pindas', verkoop_per: 'stuk', kiloprijs_cents: null, wegen_bij_afrekenen: true, tarra_g: 5 },
            ],
        }, null);
        expect(SCHEMAS.CatalogusAntwoord.safeParse(uit).success).toBe(true);
        expect(uit.artikelen[0]).toMatchObject({ verkoop_per: 'kg', kiloprijs_cents: 2250, wegen_bij_afrekenen: true, tarra_g: null });
        expect(uit.artikelen[1]).toMatchObject({ wegen_bij_afrekenen: true, tarra_g: 18 });
        expect(uit.artikelen[2]).not.toHaveProperty('wegen_bij_afrekenen');
        expect(uit.artikelen[3]).not.toHaveProperty('wegen_bij_afrekenen');
        expect(uit.artikelen[3]).not.toHaveProperty('tarra_g');
    });

    it('bon: een gewogen bakje is prijs_bron catalogus met gewicht en kiloprijs, zonder scan_code', () => {
        const regel = {
            regelnr: 1, soort: 'verkoop', artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Groene olijven', aantal: 1,
            stuk_cents: 342, korting_cents: 0, bedrag_cents: 342, btw: [{ pct: 9, incl_cents: 342 }], alcohol: false,
            onderdelen: [{ product_id: '0da446be-613f-4a74-9791-704b065a1f74', hoeveelheid: 152, eenheid: 'gram' }],
            prijs_bron: 'catalogus', gewicht_g: 152, kiloprijs_cents: 2250,
        };
        const bon = {
            soort: 'bon', gebeurtenis_id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d', bon_id: '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
            volgnummer: 1, moment: '2026-11-20T10:00:00+01:00', medewerker_id: null, bonnummer: 'T1-000001', bon_volgnummer: 1,
            status: 'afgerond', kanaal: 'winkel', catalogus_versie: 5, leeftijd: null, totaal_cents: 342,
            regels: [regel, { regelnr: 2, soort: 'betaling', betaalmethode: 'pin', betaal_bevestiging: 'handmatig', bedrag_cents: 342 }],
        };
        const r = SCHEMAS.BonMelding.safeParse(bon);
        expect(r.success, JSON.stringify(r.error?.issues?.slice(0, 3))).toBe(true);
    });

    it('catalogus: prijscode_nr alleen als het er is en 4 (PLU) of 5 cijfers heeft', () => {
        const basis = {
            artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Haasbiefstuk', prijs_cents: 899, btw_pct: 9, btw_verdeling: null, alcohol: false,
            groep: 'Vers vlees', volgorde: 0, favoriet: false, foto: null, foto_url_ruw: null,
            onderdelen: [{ product_id: '0da446be-613f-4a74-9791-704b065a1f74', hoeveelheid: 100, eenheid: 'gram' }], actief: true, kanalen: ['toonbank'],
        };
        const uit = catalogusAntwoord({
            versie: 4, volledig: true, producten: [], codes: [], groepen: [],
            artikelen: [
                { ...basis, verkoop_per: 'stuk', prijscode_nr: '01015' },
                { ...basis, artikel_id: '6c2d3e4f-5061-4b72-8c83-9d8e7f6a5b52', naam: 'Pindas', verkoop_per: 'stuk', prijscode_nr: null },
                { ...basis, artikel_id: '7d3e4f50-6172-4c83-9d94-0e9f8a7b6c63', naam: 'Raar', verkoop_per: 'stuk', prijscode_nr: '101' },
                { ...basis, artikel_id: '8e4f5061-7283-4d94-8ea5-1f0a9b8c7d74', naam: 'Kogelbiefstuk', verkoop_per: 'stuk', prijscode_nr: '0102' },
            ],
        }, null);
        expect(SCHEMAS.CatalogusAntwoord.safeParse(uit).success).toBe(true);
        expect(uit.artikelen[0]).toMatchObject({ prijscode_nr: '01015' });
        expect(uit.artikelen[1]).not.toHaveProperty('prijscode_nr');
        expect(uit.artikelen[2]).not.toHaveProperty('prijscode_nr');
        expect(uit.artikelen[3]).toMatchObject({ prijscode_nr: '0102' });
    });
    it('een bonregel met prijs_bron prijscode (pakje van de slager)', () => {
        const regel = {
            regelnr: 1, soort: 'verkoop', artikel_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', naam: 'Haasbiefstuk', aantal: 1,
            stuk_cents: 2823, korting_cents: 0, bedrag_cents: 2823, btw: [{ pct: 9, incl_cents: 2823 }], alcohol: false,
            onderdelen: [], scan_code: '2101015028237', prijs_bron: 'prijscode',
        };
        const bon = SCHEMAS.BonMelding.safeParse({
            soort: 'bon', gebeurtenis_id: '9b2f6c1e-4d7a-4e3b-8f21-6a0c5d9e7b14', volgnummer: 7, moment: '2026-11-21T10:02:10+01:00',
            medewerker_id: 'fe71fc3c-aaa1-436a-ae15-684b8b3e4de7', bon_id: '9b2f6c1e-4d7a-4e3b-8f21-6a0c5d9e7b14', bonnummer: 'T1-000007',
            bon_volgnummer: 7, status: 'afgerond', kanaal: 'winkel', catalogus_versie: 616, voorraad_versie: 1, leeftijd: null,
            regels: [regel, { regelnr: 2, soort: 'betaling', betaalmethode: 'pin', betaal_bevestiging: 'handmatig', bedrag_cents: 2823 }],
            totaal_cents: 2823, afronding_cents: 0,
        });
        expect(bon.success, JSON.stringify(bon.error?.issues)).toBe(true);
    });
    it('partijen: datums als JJJJ-MM-DD', () => {
        const uit = partijenAntwoord([{
            partij_id: '0da446be-613f-4a74-9791-704b065a1f74', product_id: '5b1c2d3e-4f50-4a61-8b72-9c8d7e6f5a41', artikel_ids: ['6c2d3e4f-5061-4b72-8c83-9d8e7f6a5b52'],
            leverancier: 'Veerbeek', geleverd_op: '2026-11-17', productiedatum: null, tht: '2026-11-24', gestickerd: 3,
        }]);
        expect(SCHEMAS.PartijenAntwoord.safeParse(uit).success).toBe(true);
        expect(uit.partijen[0]).toMatchObject({ tht: '2026-11-24', productiedatum: null, gestickerd: 3 });
    });
});

describe('pakjes van de slager binnenmelden (contract 1.4, additief)', () => {
    const PAKJE = '3a7c9e1b-2d4f-4a6b-8c0d-1e2f3a4b5c6d';
    const PRODUCT = '0da446be-613f-4a74-9791-704b065a1f74';
    it('verzoek: pakje_id, een 21-code van 13 cijfers, een THT; product_id alleen na de keuze', () => {
        expect(PakjeBinnenVerzoek.safeParse({ pakje_id: PAKJE, code: '2101015028237', tht: '2026-11-26' }).success).toBe(true);
        expect(PakjeBinnenVerzoek.safeParse({ pakje_id: PAKJE, code: '2100007066967', tht: '2026-11-26', product_id: PRODUCT }).success).toBe(true);
        expect(PakjeBinnenVerzoek.safeParse({ pakje_id: PAKJE, code: '2100007066967', tht: '2026-11-26', product_id: null }).success).toBe(true);
        expect(PakjeBinnenVerzoek.safeParse({ pakje_id: PAKJE, code: '8712345678906', tht: '2026-11-26' }).success).toBe(false);
        expect(PakjeBinnenVerzoek.safeParse({ pakje_id: PAKJE, code: '2101015028237', tht: '26-11-2026' }).success).toBe(false);
        expect(PakjeBinnenVerzoek.safeParse({ code: '2101015028237', tht: '2026-11-26' }).success).toBe(false);
    });
    it('antwoord: binnen, onbekend (PLU van vier cijfers), controlecijfer, geen_prijscode', () => {
        expect(PakjeBinnenAntwoord.safeParse({ uitkomst: 'binnen', stuk_id: PAKJE, product_id: PRODUCT, naam: 'Haasbiefstuk', plu: '0101', prijs_cents: 7677, tht: '2026-11-26' }).success).toBe(true);
        expect(PakjeBinnenAntwoord.safeParse({ uitkomst: 'onbekend', plu: '0000', prijs_cents: 6696 }).success).toBe(true);
        expect(PakjeBinnenAntwoord.safeParse({ uitkomst: 'onbekend', plu: '01015', prijs_cents: 6696 }).success).toBe(false);
        expect(PakjeBinnenAntwoord.safeParse({ uitkomst: 'controlecijfer' }).success).toBe(true);
        expect(PakjeBinnenAntwoord.safeParse({ uitkomst: 'geen_prijscode' }).success).toBe(true);
        expect(PakjeWegAntwoord.safeParse({ weg: false }).success).toBe(true);
        expect(SCHEMAS.PakjeBinnenAntwoord).toBe(PakjeBinnenAntwoord);
    });
    it('een PLU die al bij een ander product hoort is 409 nummer_bezet', () => {
        expect(FOUT_STATUS.nummer_bezet).toBe(409);
    });
});
