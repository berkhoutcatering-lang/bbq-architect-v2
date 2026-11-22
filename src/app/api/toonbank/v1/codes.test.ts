/**
 * Tests voor de Toonbank-API v1, contract 1.4 (additief): POST codes en POST codes/{artikel_id}/weghalen.
 * De geheugen-opslag doet wat winkel_producten met de unieke index op (organisatie, ean) en de
 * catalogustrigger doen; de controle en het opslaan zijn dezelfde als op de pagina Streepjescodes
 * koppelen (lib/winkel/ean.ts, eanKoppelen.ts). Hier gaat het om de route: sleutel en medewerker,
 * de vorm van het contract, welke artikelen een code mogen krijgen, en de catalogusversie.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CodeKoppelAntwoord, CodeWeghalenAntwoord, FoutAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, STANDAARD_STAND, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { POST as codesPOST } from './codes/route';
import { POST as weghalenPOST } from './codes/[artikel_id]/weghalen/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const ANDERE_ORG = '00000000-0000-4000-8000-0000000000bb';
const T1 = '00000000-0000-4000-8000-000000000001';
const JAN = '10000000-0000-4000-8000-000000000001';
const sleutel = genereerSleutel();
const sessie = genereerSessieToken();

const p = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const a = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BIER = p(1), WIJN = p(2), HAAS = p(3), KAAS = p(4), UIT = p(5), VREEMD = p(6), US = p(7);
const A_BIER = a(1), A_WIJN = a(2), A_HAAS = a(3), A_KAAS = a(4), A_UIT = a(5), A_VREEMD = a(6), A_PAKKET = a(7), A_SIX = a(8), A_US = a(9);
const product = (id: string, naam: string, o: Partial<{ ean: string | null; actief: boolean; eenheid: string; prijscode_nr: string | null; org: string }> = {}) => ({
    id, organization_id: o.org ?? ORG, naam, ean: o.ean ?? null, actief: o.actief ?? true, eenheid: o.eenheid ?? 'stuk', binnen_per_sticker: false, prijscode_nr: o.prijscode_nr ?? null,
});
const artikel = (id: string, onderdelen: { product_id: string; hoeveelheid: number }[], o: Partial<{ verkoop_per: string; org: string }> = {}) => ({
    id, organization_id: o.org ?? ORG, verkoop_per: o.verkoop_per ?? 'stuk', onderdelen,
});

let store: ToonbankGeheugenStore;
let ip = 0;

beforeEach(() => {
    store = maakToonbankGeheugenStore({
        apparaten: [{
            id: T1, organization_id: ORG, naam: 'Toonbank winkel', code: 'T1', locatie: 'winkel', ingetrokken_at: null,
            hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 0, sleutel_hash: sleutel.hash, sleutel_prefix: sleutel.prefix,
            koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
        }],
        medewerkers: [{ id: JAN, organization_id: ORG, naam: 'Jan', actief: true, toonbank_rol: 'medewerker', kds_pin_hash: null, kds_pin_lockout_until: null }],
        sessies: [{
            id: '20000000-0000-4000-8000-000000000001', organization_id: ORG, apparaat_id: T1, medewerker_id: JAN, rol: 'medewerker', doel: 'dienst',
            geldig_tot: new Date(Date.now() + 3_600_000).toISOString(), beeindigd_at: null, token_hash: sessie.hash, aangemaakt_at: new Date().toISOString(),
        }],
        stand: { [ORG]: STANDAARD_STAND },
        catalogus: { [ORG]: { versie: 620, volledig: true, artikelen: [], producten: [], codes: [], groepen: [] } },
        codeProducten: [
            product(BIER, 'Hertog Jan 0,30'),
            product(WIJN, 'Chablis BIO', { ean: '8712345678906' }),
            product(HAAS, 'Haasbiefstuk', { eenheid: 'gram', prijscode_nr: '0101' }),
            product(KAAS, 'Spaanse schapenkaas', { eenheid: 'gram' }),
            product(UIT, 'Oud bier', { actief: false }),
            product(VREEMD, 'Van een ander', { org: ANDERE_ORG }),
            product(US, 'Amerikaanse rub', { ean: '036000291452' }),
        ],
        codeArtikelen: [
            artikel(A_BIER, [{ product_id: BIER, hoeveelheid: 1 }]),
            artikel(A_WIJN, [{ product_id: WIJN, hoeveelheid: 1 }]),
            artikel(A_HAAS, [{ product_id: HAAS, hoeveelheid: 100 }]),
            artikel(A_KAAS, [{ product_id: KAAS, hoeveelheid: 1 }], { verkoop_per: 'kg' }),
            artikel(A_UIT, [{ product_id: UIT, hoeveelheid: 1 }]),
            artikel(A_VREEMD, [{ product_id: VREEMD, hoeveelheid: 1 }], { org: ANDERE_ORG }),
            artikel(A_PAKKET, [{ product_id: BIER, hoeveelheid: 1 }, { product_id: WIJN, hoeveelheid: 1 }]),
            artikel(A_SIX, [{ product_id: BIER, hoeveelheid: 6 }]),
            artikel(A_US, [{ product_id: US, hoeveelheid: 1 }]),
        ],
    });
    houder.store = store;
});

function verzoek(pad: string, o: { body?: unknown; medewerker?: string | null } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.5.0.${++ip % 250}`,
        'x-toonbank-contract': '1.4.0', 'x-toonbank-sleutel': sleutel.sleutel, 'x-toonbank-app': '0.2.0',
    });
    if (o.medewerker !== null) headers.set('x-toonbank-medewerker', o.medewerker ?? sessie.token);
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: 'POST', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
}
const geen = { params: Promise.resolve({}) };
const art = (artikel_id: string) => ({ params: Promise.resolve({ artikel_id }) });
const koppel = async (artikel_id: string, code: string) => {
    const res = await codesPOST(verzoek('codes', { body: { artikel_id, code } }), geen);
    expect(res.status).toBe(200);
    return CodeKoppelAntwoord.parse(await res.json());
};
const ean = (id: string) => store.g.codeProducten.find((x) => x.id === id)!.ean;

describe('POST codes', () => {
    it('een los product: gekoppeld, op het product, en de catalogusversie gaat omhoog', async () => {
        expect(await koppel(A_BIER, '96385074')).toEqual({ uitkomst: 'gekoppeld', artikel_id: A_BIER, product_id: BIER, code: '96385074', catalogus_versie: 621 });
        expect(ean(BIER)).toBe('96385074');
    });

    it('dezelfde code nog eens: weer gekoppeld, zonder dat er iets verandert', async () => {
        expect(await koppel(A_WIJN, '8712345678906')).toMatchObject({ uitkomst: 'gekoppeld', catalogus_versie: 620 });
    });

    it('een andere code op een product dat al een code had: vervangen', async () => {
        expect(await koppel(A_WIJN, '96385074')).toMatchObject({ uitkomst: 'gekoppeld', code: '96385074' });
        expect(ean(WIJN)).toBe('96385074');
    });

    it('de code hoort al bij een ander product: al_gekoppeld met die naam, niets gekoppeld', async () => {
        expect(await koppel(A_BIER, '8712345678906')).toEqual({ uitkomst: 'al_gekoppeld', naam: 'Chablis BIO' });
        expect(ean(BIER)).toBeNull();
    });

    it('UPC-A en dezelfde code als EAN-13 met een 0 ervoor tellen als één code', async () => {
        expect(await koppel(A_BIER, '0036000291452')).toEqual({ uitkomst: 'al_gekoppeld', naam: 'Amerikaanse rub' });
    });

    it('een verkeerd controlecijfer: ongeldig, met de reden in gewone taal', async () => {
        const r = await koppel(A_BIER, '8712345678907');
        expect(r.uitkomst).toBe('ongeldig');
        if (r.uitkomst === 'ongeldig') expect(r.reden).toMatch(/laatste cijfer/);
        expect(ean(BIER)).toBeNull();
    });

    it('kan_niet: pakket, zes stuks, op gewicht, prijscode van de slager, uit, onbekend, andere organisatie', async () => {
        const gevallen: [string, RegExp][] = [
            [A_PAKKET, /pakket/], [A_SIX, /meer dan één stuk/], [A_KAAS, /gewicht/], [A_HAAS, /gewicht|slager/],
            [A_UIT, /staat uit/], [a(99), /bestaat niet/], [A_VREEMD, /bestaat niet/],
        ];
        for (const [id, reden] of gevallen) {
            const r = await koppel(id, '96385074');
            expect(r.uitkomst).toBe('kan_niet');
            if (r.uitkomst === 'kan_niet') expect(r.reden).toMatch(reden);
        }
        expect(store.g.codeProducten.filter((x) => x.ean === '96385074')).toHaveLength(0);
    });

    it('zonder medewerker 403; een code van de verkeerde lengte 400', async () => {
        const f = await codesPOST(verzoek('codes', { body: { artikel_id: A_BIER, code: '96385074' }, medewerker: null }), geen);
        expect(f.status).toBe(403);
        expect(FoutAntwoord.parse(await f.json()).fout.code).toBe('medewerker_sessie_verlopen');
        const g = await codesPOST(verzoek('codes', { body: { artikel_id: A_BIER, code: '12345' } }), geen);
        expect(g.status).toBe(400);
        expect(FoutAntwoord.parse(await g.json()).fout.code).toBe('ongeldig_verzoek');
    });
});

describe('POST codes/{artikel_id}/weghalen', () => {
    it('ongedaan maken: de code is weg en de catalogusversie gaat omhoog; de tweede keer weg = false', async () => {
        await koppel(A_BIER, '96385074');
        const r1 = await weghalenPOST(verzoek(`codes/${A_BIER}/weghalen`), art(A_BIER));
        expect(r1.status).toBe(200);
        expect(CodeWeghalenAntwoord.parse(await r1.json())).toEqual({ weg: true, catalogus_versie: 622 });
        expect(ean(BIER)).toBeNull();
        expect(CodeWeghalenAntwoord.parse(await (await weghalenPOST(verzoek(`codes/${A_BIER}/weghalen`), art(A_BIER))).json())).toEqual({ weg: false, catalogus_versie: 622 });
    });

    it('andere organisatie, pakket of geen uuid: weg = false en er verandert niets', async () => {
        for (const id of [A_VREEMD, A_PAKKET, 'geen-id']) {
            expect(CodeWeghalenAntwoord.parse(await (await weghalenPOST(verzoek(`codes/${id}/weghalen`), art(id))).json())).toMatchObject({ weg: false });
        }
        expect(ean(WIJN)).toBe('8712345678906');
    });

    it('zonder medewerker 403', async () => {
        const f = await weghalenPOST(verzoek(`codes/${A_BIER}/weghalen`, { medewerker: null }), art(A_BIER));
        expect(f.status).toBe(403);
    });
});
