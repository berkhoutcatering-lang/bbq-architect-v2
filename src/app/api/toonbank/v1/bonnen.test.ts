/**
 * Tests voor POST /api/toonbank/v1/bonnen (BA-9). De geheugen-opslag doet
 * wat toonbank_journaal_opslaan en toonbank_verwerk_wachtrij doen (die zelf
 * getest worden in supabase/tests/toonbank_journaal.sql en
 * toonbank_boek_bon.sql); hier gaat het om de route: eerst opslaan, dan
 * streng per melding, dan verwerken; nooit weigeren op inhoud; 400/413/426.
 * De voorbeeldberichten van het contract gaan er ongewijzigd doorheen.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BonnenAntwoord, FoutAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSleutel } from '@/lib/toonbank/sleutel';

const houder = vi.hoisted(() => ({ store: null as unknown, na: [] as { orgId: string; productIds: string[] }[] }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));
vi.mock('@/lib/toonbank/naAfloop', () => ({ naToonbankBoekingen: (orgId: string, productIds: string[]) => { houder.na.push({ orgId, productIds }); } }));

import { POST as bonnenPOST } from './bonnen/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const T1 = '00000000-0000-4000-8000-000000000001';
const NAOBER = '8e8f4864-9729-43e2-830e-98bd8eb188b4';
const sleutel = genereerSleutel();
const MAP = path.join(__dirname, '..', '..', '..', '..', 'lib', 'toonbank', 'contract', 'voorbeelden');
const voorbeeld = (naam: string) => JSON.parse(readFileSync(path.join(MAP, naam), 'utf8')) as Record<string, unknown>;

let store: ToonbankGeheugenStore;
let ip = 0;

beforeEach(() => {
    houder.na = [];
    store = maakToonbankGeheugenStore({
        apparaten: [{
            id: T1, organization_id: ORG, naam: 'Toonbank winkel', code: 'T1', locatie: 'winkel', ingetrokken_at: null,
            hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 1202, sleutel_hash: sleutel.hash, sleutel_prefix: sleutel.prefix,
            koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
        }],
        verwerkMelding: (m) => (m.soort === 'bon' ? { status: 'verwerkt', product_ids: [NAOBER] } : m.soort === 'pinpoging' ? { status: 'niet_nodig' } : { status: 'conflict', fout_code: 'goedkeuring_nodig' }),
    });
    houder.store = store;
});

function verzoek(body: unknown, o: { contract?: string; sleutel?: string | null; ruw?: string } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.2.0.${++ip % 250}`,
        'x-toonbank-contract': o.contract ?? '1.1.0', 'x-toonbank-app': '0.1.0',
    });
    if (o.sleutel !== null) headers.set('x-toonbank-sleutel', o.sleutel ?? sleutel.sleutel);
    return new NextRequest('http://localhost:3000/api/toonbank/v1/bonnen', { method: 'POST', headers, body: o.ruw ?? JSON.stringify(body) });
}

const geen = { params: Promise.resolve({} as Record<string, never>) };

async function fout(res: Response, status: number, code: string): Promise<{ fout: { details: Record<string, unknown> } }> {
    expect(res.status).toBe(status);
    const b = await res.json();
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return b;
}

describe('POST bonnen', () => {
    it('slaat de voorbeeldmeldingen ongewijzigd op, verwerkt ze en antwoordt volgens het contract', async () => {
        const body = voorbeeld('bon-vrij-overschreden.json');
        const res = await bonnenPOST(verzoek(body), geen);
        expect(res.status).toBe(200);
        const b = BonnenAntwoord.parse(await res.json());
        expect(b.resultaten.map((r) => [r.journaal, r.verwerking])).toEqual([['nieuw', 'conflict'], ['nieuw', 'niet_nodig'], ['nieuw', 'verwerkt']]);
        expect(b.bevestigd_tot_volgnummer).toBe(1202);   // 1203 ontbreekt: het gat blijft zichtbaar
        const meldingen = (body.meldingen as Record<string, unknown>[]);
        for (const m of meldingen) expect(store.g.meldingen.find((x) => x.gebeurtenis_id === m.gebeurtenis_id)!.payload).toEqual(m);
        expect(store.g.meldingen.find((x) => x.volgnummer === 1204)!.gat_voor).toBe(true);
        expect(houder.na).toEqual([{ orgId: ORG, productIds: [NAOBER] }]);
    });

    it('twee keer hetzelfde: bestond, niets dubbel verwerkt', async () => {
        const body = { meldingen: [voorbeeld('bon-los.json'), voorbeeld('bon-pakket-statiegeld-alcohol.json')] };
        await bonnenPOST(verzoek(body), geen);
        const res = await bonnenPOST(verzoek(body), geen);
        const b = BonnenAntwoord.parse(await res.json());
        expect(b.resultaten.map((r) => r.journaal)).toEqual(['bestond', 'bestond']);
        expect(b.resultaten.map((r) => r.verwerking)).toEqual(['verwerkt', 'verwerkt']);
        expect(store.g.meldingen).toHaveLength(2);
        expect(b.bevestigd_tot_volgnummer).toBe(1203);
    });

    it('weigert nooit op inhoud: een melding die niet aan het contract voldoet wordt fout, de rest gaat door', async () => {
        const kapot = { ...voorbeeld('bon-los.json'), regels: 'geen lijst' };
        const res = await bonnenPOST(verzoek({ meldingen: [kapot, voorbeeld('tegenbon.json'), { ...voorbeeld('bon-pakket-statiegeld-alcohol.json') }] }), geen);
        expect(res.status).toBe(200);
        const b = BonnenAntwoord.parse(await res.json());
        expect(b.resultaten.map((r) => r.verwerking)).toEqual(['fout', 'conflict', 'verwerkt']);
        const m = store.g.meldingen.find((x) => x.volgnummer === 1203)!;
        expect(m.verwerk_status).toBe('fout');
        expect(m.fout_code).toBe('schema');
    });

    it('een onbekende soort met een nette envelop: opgeslagen, fout', async () => {
        const res = await bonnenPOST(verzoek({ meldingen: [{ gebeurtenis_id: crypto.randomUUID(), volgnummer: 1, soort: 'iets_nieuws', moment: '2027-03-06T10:00:00+01:00' }] }), geen);
        const b = BonnenAntwoord.parse(await res.json());
        expect(b.resultaten[0]!.verwerking).toBe('fout');
        expect(store.g.meldingen).toHaveLength(1);
    });

    it('een kapotte envelop: 400 met de plek, en niets opgeslagen', async () => {
        const b = await fout(await bonnenPOST(verzoek({ meldingen: [voorbeeld('bon-los.json'), { soort: 'bon', volgnummer: 7, moment: 'x' }] }), geen), 400, 'ongeldig_verzoek');
        expect(b.fout.details.index).toBe(1);
        expect(store.g.meldingen).toHaveLength(0);
        await fout(await bonnenPOST(verzoek(null, { ruw: '{kapot' }), geen), 400, 'ongeldig_verzoek');
        await fout(await bonnenPOST(verzoek({ meldingen: [] }), geen), 400, 'ongeldig_verzoek');
    });

    it('meer dan 50: 413 te_groot', async () => {
        const meldingen = Array.from({ length: 51 }, (_, i) => ({ gebeurtenis_id: crypto.randomUUID(), volgnummer: i + 1, soort: 'inloggen', moment: '2027-03-06T10:00:00+01:00' }));
        await fout(await bonnenPOST(verzoek({ meldingen }), geen), 413, 'te_groot');
        expect(store.g.meldingen).toHaveLength(0);
    });

    it('een te oude app: eerst opslaan (fout contract_verouderd), dan 426; na de update verwerkt', async () => {
        const body = { meldingen: [voorbeeld('bon-los.json')] };
        await fout(await bonnenPOST(verzoek(body, { contract: '0.9.0' }), geen), 426, 'contract_verouderd');
        expect(store.g.meldingen[0]!.verwerk_status).toBe('fout');
        expect(store.g.meldingen[0]!.fout_code).toBe('contract_verouderd');
        expect(store.g.wachtrijGedraaid).toBe(0);
        const res = await bonnenPOST(verzoek(body), geen);
        const b = BonnenAntwoord.parse(await res.json());
        expect(b.resultaten[0]).toMatchObject({ journaal: 'bestond', verwerking: 'verwerkt' });
    });

    it('lukt verwerken niet, dan is het toch opgeslagen: 200 met wacht', async () => {
        store.verwerkWachtrij = async () => { throw new Error('storing'); };
        const fouten = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await bonnenPOST(verzoek({ meldingen: [voorbeeld('bon-los.json')] }), geen);
        fouten.mockRestore();
        expect(res.status).toBe(200);
        expect(BonnenAntwoord.parse(await res.json()).resultaten[0]!.verwerking).toBe('wacht');
        expect(store.g.meldingen).toHaveLength(1);
    });

    it('zonder sleutel 401; een medewerker is niet nodig (die staat per melding in de body)', async () => {
        await fout(await bonnenPOST(verzoek({ meldingen: [voorbeeld('bon-los.json')] }, { sleutel: null }), geen), 401, 'sleutel_onbekend');
        expect((await bonnenPOST(verzoek({ meldingen: [voorbeeld('bon-los.json')] }), geen)).status).toBe(200);
    });
});
