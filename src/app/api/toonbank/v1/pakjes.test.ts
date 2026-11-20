/**
 * Tests voor de Toonbank-API v1, contract 1.4 (additief): POST pakjes en POST pakjes/{stuk_id}/weg.
 * De geheugen-opslag doet wat winkel_stuk_binnen_prijscode en winkel_stuk_weg doen (de echte
 * worden getest in supabase/tests/winkel_prijscode.sql); hier gaat het om de route: sleutel en
 * medewerker, de vorm van het contract, idempotent op pakje_id, en de HTTP-status van elke fout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FoutAntwoord, PakjeBinnenAntwoord, PakjeWegAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, STANDAARD_STAND, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';
import { eanControlecijfer, leesPrijscode, prijsControlecijfer } from '@/lib/winkel/prijscode';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { POST as pakjesPOST } from './pakjes/route';
import { POST as wegPOST } from './pakjes/[stuk_id]/weg/route';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const ANDERE_ORG = '00000000-0000-4000-8000-0000000000bb';
const T1 = '00000000-0000-4000-8000-000000000001';
const JAN = '10000000-0000-4000-8000-000000000001';
const HAAS = '40000000-0000-4000-8000-000000000001';
const KOGEL = '40000000-0000-4000-8000-000000000002';
const GEHAKT = '40000000-0000-4000-8000-000000000003';
const VREEMD = '40000000-0000-4000-8000-000000000009';
const sleutel = genereerSleutel();
const sessie = genereerSessieToken();

/* Echte stickers van Veerbeek: haasbiefstuk krat (PLU 0101), gekruid gehakt (PLU 0000). */
const HAAS_KRAT = '2101012076774';
const GEHAKT_CODE = '2100007066967';

let store: ToonbankGeheugenStore;
let ip = 0;
let n = 0;
const nieuwPakje = () => `5a000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

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
        winkelProducten: [
            { id: HAAS, organization_id: ORG, naam: 'Haasbiefstuk', prijscode_nr: '0101' },
            { id: KOGEL, organization_id: ORG, naam: 'Kogelbiefstuk', prijscode_nr: null },
            { id: GEHAKT, organization_id: ORG, naam: 'Gekruid gehakt', prijscode_nr: null },
            { id: VREEMD, organization_id: ANDERE_ORG, naam: 'Van een ander', prijscode_nr: null },
        ],
    });
    houder.store = store;
});

function verzoek(pad: string, o: { body?: unknown; medewerker?: string | null } = {}): NextRequest {
    const headers = new Headers({
        'content-type': 'application/json', 'x-forwarded-for': `10.4.0.${++ip % 250}`,
        'x-toonbank-contract': '1.4.0', 'x-toonbank-sleutel': sleutel.sleutel, 'x-toonbank-app': '0.2.0',
    });
    if (o.medewerker !== null) headers.set('x-toonbank-medewerker', o.medewerker ?? sessie.token);
    return new NextRequest(`http://localhost:3000/api/toonbank/v1/${pad}`, {
        method: 'POST', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
}
const geen = { params: Promise.resolve({}) };
const stuk = (stuk_id: string) => ({ params: Promise.resolve({ stuk_id }) });

async function fout(res: Response, status: number, code: string): Promise<{ fout: { melding: string } }> {
    expect(res.status).toBe(status);
    const b = await res.json();
    expect(FoutAntwoord.parse(b).fout.code).toBe(code);
    return b;
}

describe('POST pakjes', () => {
    it('een bekend product: binnen, met de PLU van vier cijfers en de prijs uit de code', async () => {
        const id = nieuwPakje();
        const res = await pakjesPOST(verzoek('pakjes', { body: { pakje_id: id, code: HAAS_KRAT, tht: '2026-11-26' } }), geen);
        expect(res.status).toBe(200);
        expect(PakjeBinnenAntwoord.parse(await res.json())).toEqual({
            uitkomst: 'binnen', stuk_id: id, product_id: HAAS, naam: 'Haasbiefstuk', plu: '0101', prijs_cents: 7677, tht: '2026-11-26',
        });
        expect(store.g.pakjes).toHaveLength(1);
    });

    it('hetzelfde pakje_id nog eens: hetzelfde antwoord, geen tweede pakje', async () => {
        const id = nieuwPakje();
        const body = { pakje_id: id, code: HAAS_KRAT, tht: '2026-11-26' };
        const a = await (await pakjesPOST(verzoek('pakjes', { body }), geen)).json();
        const b = await (await pakjesPOST(verzoek('pakjes', { body }), geen)).json();
        expect(b).toEqual(a);
        expect(store.g.pakjes).toHaveLength(1);
    });

    it('een onbekende PLU: onbekend; daarna met product_id binnen en onthouden', async () => {
        // Een pakje kogelbiefstuk van € 42,50 met PLU 0102 (zoals de slager hem zou drukken).
        const zonder = `210102${prijsControlecijfer('04250')}04250`;
        const kogel = zonder + eanControlecijfer(zonder);
        expect(leesPrijscode(kogel).ok).toBe(true);
        const r1 = PakjeBinnenAntwoord.parse(await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: kogel, tht: '2026-11-26' } }), geen)).json());
        expect(r1).toEqual({ uitkomst: 'onbekend', plu: '0102', prijs_cents: 4250 });
        const r2 = PakjeBinnenAntwoord.parse(await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: kogel, tht: '2026-11-26', product_id: KOGEL } }), geen)).json());
        expect(r2).toMatchObject({ uitkomst: 'binnen', product_id: KOGEL, plu: '0102' });
        expect(store.g.winkelProducten.find((p) => p.id === KOGEL)!.prijscode_nr).toBe('0102');
    });

    it('PLU 0000: altijd onbekend zonder product_id, en nooit onthouden', async () => {
        const r1 = PakjeBinnenAntwoord.parse(await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: GEHAKT_CODE, tht: '2026-11-26' } }), geen)).json());
        expect(r1).toEqual({ uitkomst: 'onbekend', plu: '0000', prijs_cents: 6696 });
        const r2 = PakjeBinnenAntwoord.parse(await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: GEHAKT_CODE, tht: '2026-11-26', product_id: GEHAKT } }), geen)).json());
        expect(r2).toMatchObject({ uitkomst: 'binnen', product_id: GEHAKT, plu: '0000' });
        expect(store.g.winkelProducten.find((p) => p.id === GEHAKT)!.prijscode_nr).toBeNull();
        const r3 = PakjeBinnenAntwoord.parse(await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: GEHAKT_CODE, tht: '2026-11-26' } }), geen)).json());
        expect(r3.uitkomst).toBe('onbekend');
    });

    it('controlecijfer en geen_prijscode zijn gewone antwoorden', async () => {
        const r1 = await (await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: '2101012076770', tht: '2026-11-26' } }), geen)).json();
        expect(PakjeBinnenAntwoord.parse(r1)).toEqual({ uitkomst: 'controlecijfer' });
        expect(store.g.pakjes).toHaveLength(0);
    });

    it('een PLU die al bij een ander product hoort: 409 nummer_bezet, niets binnen', async () => {
        const b = await fout(await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: HAAS_KRAT, tht: '2026-11-26', product_id: KOGEL } }), geen), 409, 'nummer_bezet');
        expect(b.fout.melding).toBe('Nummer 0101 hoort al bij Haasbiefstuk');
        expect(store.g.pakjes).toHaveLength(0);
    });

    it('een product van een andere organisatie: 404 niet_gevonden', async () => {
        await fout(await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: HAAS_KRAT, tht: '2026-11-26', product_id: VREEMD } }), geen), 404, 'niet_gevonden');
    });

    it('zonder medewerker 403; een verzoek buiten het contract 400', async () => {
        await fout(await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: HAAS_KRAT, tht: '2026-11-26' }, medewerker: null }), geen), 403, 'medewerker_sessie_verlopen');
        await fout(await pakjesPOST(verzoek('pakjes', { body: { pakje_id: 'geen-uuid', code: HAAS_KRAT, tht: '2026-11-26' } }), geen), 400, 'ongeldig_verzoek');
        await fout(await pakjesPOST(verzoek('pakjes', { body: { pakje_id: nieuwPakje(), code: '8712345678906', tht: '2026-11-26' } }), geen), 400, 'ongeldig_verzoek');
    });
});

describe('POST pakjes/{stuk_id}/weg', () => {
    it('een pakje dat nog ligt: weg; de tweede keer niet meer', async () => {
        const id = nieuwPakje();
        await pakjesPOST(verzoek('pakjes', { body: { pakje_id: id, code: HAAS_KRAT, tht: '2026-11-26' } }), geen);
        const r1 = await wegPOST(verzoek(`pakjes/${id}/weg`), stuk(id));
        expect(r1.status).toBe(200);
        expect(PakjeWegAntwoord.parse(await r1.json())).toEqual({ weg: true });
        expect(PakjeWegAntwoord.parse(await (await wegPOST(verzoek(`pakjes/${id}/weg`), stuk(id))).json())).toEqual({ weg: false });
        expect(store.g.pakjes).toHaveLength(0);
    });

    it('verkocht, van een andere organisatie of geen uuid: weg = false', async () => {
        const id = nieuwPakje();
        store.g.pakjes.push({ id, organization_id: ORG, product_id: HAAS, code: HAAS_KRAT, prijs_cents: 7677, tht: '2026-11-26', status: 'verkocht' });
        const vreemd = nieuwPakje();
        store.g.pakjes.push({ id: vreemd, organization_id: ANDERE_ORG, product_id: VREEMD, code: HAAS_KRAT, prijs_cents: 7677, tht: '2026-11-26', status: 'op_voorraad' });
        for (const s of [id, vreemd, 'niet-een-id']) {
            expect(PakjeWegAntwoord.parse(await (await wegPOST(verzoek(`pakjes/${s}/weg`), stuk(s))).json())).toEqual({ weg: false });
        }
        expect(store.g.pakjes).toHaveLength(2);
    });

    it('zonder medewerker 403', async () => {
        const id = nieuwPakje();
        await fout(await wegPOST(verzoek(`pakjes/${id}/weg`, { medewerker: null }), stuk(id)), 403, 'medewerker_sessie_verlopen');
    });
});
