/**
 * Tests voor de Toonbank-API v1, contract 1.4 (additief): POST pakjes/eruit en
 * POST pakjes/{stuk_id}/terug (weggooien of invriezen). De geheugen-opslag doet wat
 * winkel_stuk_eruit en winkel_stuk_terug doen (de echte worden getest in
 * supabase/tests/winkel_pakje_eruit.sql); hier gaat het om de route: sleutel en medewerker, de vorm
 * van het contract, idempotent op verzoek_id, en 404 zolang de migratie er niet is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FoutAntwoord, PakjeEruitAntwoord, PakjeTerugAntwoord } from '@/lib/toonbank/contract';
import { maakToonbankGeheugenStore, STANDAARD_STAND, type ToonbankGeheugenStore } from '@/lib/toonbank/geheugenStore';
import { genereerSessieToken, genereerSleutel } from '@/lib/toonbank/sleutel';

const houder = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/toonbank/supabaseStore', () => ({ maakToonbankSupabaseStore: () => houder.store }));

import { POST as pakjesPOST } from './pakjes/route';
import { POST as eruitPOST } from './pakjes/eruit/route';
import { POST as terugPOST } from './pakjes/[stuk_id]/terug/route';

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

/* Een echte kaassticker van de Toonbank (28 cijfers). */
const KAAS_STICKER = '2900002003040156226121001089';
const KAAS = '40000000-0000-4000-8000-000000000004';

const nieuwVerzoek = () => `6b000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
async function binnen(tht: string): Promise<string> {
    const id = nieuwPakje();
    await pakjesPOST(verzoek('pakjes', { body: { pakje_id: id, code: HAAS_KRAT, tht } }), geen);
    return id;
}
async function eruit(body: unknown): Promise<PakjeEruitAntwoord> {
    const res = await eruitPOST(verzoek('pakjes/eruit', { body }), geen);
    expect(res.status).toBe(200);
    return PakjeEruitAntwoord.parse(await res.json());
}
async function terug(id: string): Promise<boolean> {
    const res = await terugPOST(verzoek(`pakjes/${id}/terug`), stuk(id));
    expect(res.status).toBe(200);
    return PakjeTerugAntwoord.parse(await res.json()).terug;
}

describe('POST pakjes/eruit', () => {
    it('weggooien: het pakje met de vroegste THT, ook als het later binnenkwam', async () => {
        const laat = await binnen('2026-11-30');
        const vroeg = await binnen('2026-11-24');
        const r = await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' });
        expect(r).toEqual({ uitkomst: 'eruit', stuk_id: vroeg, naam: 'Haasbiefstuk', prijs_cents: 7677, tht: '2026-11-24', wat: 'weggooien', ingevroren_op: null });
        expect(store.g.pakjes.find((p) => p.id === vroeg)!.status).toBe('afgeschreven');
        expect(store.g.pakjes.find((p) => p.id === laat)!.status).toBe('op_voorraad');
        expect(store.g.eruit[0]!.medewerker_id).toBe(JAN);
    });

    it('invriezen: naar de keuken, met de dag van vandaag', async () => {
        store.g.nu = new Date('2026-11-20T23:30:00Z'); // in Nederland al 21 november
        const id = await binnen('2026-11-24');
        const r = await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'invriezen' });
        expect(r).toMatchObject({ uitkomst: 'eruit', stuk_id: id, wat: 'invriezen', ingevroren_op: '2026-11-21' });
        expect(store.g.pakjes.find((p) => p.id === id)!.status).toBe('naar_keuken');
    });

    it('hetzelfde verzoek_id nog eens: hetzelfde antwoord, nooit een tweede pakje eruit', async () => {
        await binnen('2026-11-24');
        await binnen('2026-11-25');
        const body = { verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' };
        const a = await eruit(body);
        const b = await eruit(body);
        expect(b).toEqual(a);
        expect(store.g.pakjes.filter((p) => p.status === 'op_voorraad')).toHaveLength(1);
    });

    it('niets meer op voorraad: niet_op_voorraad met de naam; een onbekende code zonder naam', async () => {
        await binnen('2026-11-24');
        await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' });
        expect(await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' })).toEqual({ uitkomst: 'niet_op_voorraad', naam: 'Haasbiefstuk' });
        expect(await eruit({ verzoek_id: nieuwVerzoek(), code: GEHAKT_CODE, wat: 'invriezen' })).toEqual({ uitkomst: 'niet_op_voorraad', naam: null });
    });

    it('een stuk kaas met een sticker', async () => {
        store.g.winkelProducten.push({ id: KAAS, organization_id: ORG, naam: 'Oude kaas', prijscode_nr: null });
        store.g.pakjes.push({ id: nieuwPakje(), organization_id: ORG, product_id: KAAS, code: KAAS_STICKER, prijs_cents: 624, tht: '2026-12-10', status: 'op_voorraad' });
        expect(await eruit({ verzoek_id: nieuwVerzoek(), code: KAAS_STICKER, wat: 'invriezen' })).toMatchObject({ uitkomst: 'eruit', naam: 'Oude kaas', prijs_cents: 624 });
    });

    it('een fout controlecijfer, bij een prijscode en bij een sticker', async () => {
        expect(await eruit({ verzoek_id: nieuwVerzoek(), code: '2101012076770', wat: 'weggooien' })).toEqual({ uitkomst: 'controlecijfer' });
        expect(await eruit({ verzoek_id: nieuwVerzoek(), code: '2900002003040156226121001088', wat: 'weggooien' })).toEqual({ uitkomst: 'controlecijfer' });
    });

    it('zonder de migratie: 404, zodat de kassa zegt dat het in BBQ Architect moet', async () => {
        store.pakjeEruit = async () => ({ uitkomst: 'niet_gemigreerd' });
        await fout(await eruitPOST(verzoek('pakjes/eruit', { body: { verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' } }), geen), 404, 'niet_gevonden');
    });

    it('zonder medewerker 403; buiten het contract 400', async () => {
        await fout(await eruitPOST(verzoek('pakjes/eruit', { body: { verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' }, medewerker: null }), geen), 403, 'medewerker_sessie_verlopen');
        await fout(await eruitPOST(verzoek('pakjes/eruit', { body: { verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'opeten' } }), geen), 400, 'ongeldig_verzoek');
        await fout(await eruitPOST(verzoek('pakjes/eruit', { body: { verzoek_id: nieuwVerzoek(), code: '8712345678906', wat: 'weggooien' } }), geen), 400, 'ongeldig_verzoek');
    });
});

describe('POST pakjes/{stuk_id}/terug', () => {
    it('weggegooid aan de kassa: terug op voorraad, één keer', async () => {
        const id = await binnen('2026-11-24');
        await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'weggooien' });
        expect(await terug(id)).toBe(true);
        expect(store.g.pakjes.find((p) => p.id === id)!.status).toBe('op_voorraad');
        expect(await terug(id)).toBe(false);
    });

    it('ingevroren en in de vriezerlijst gebruikt: niet meer terug', async () => {
        const id = await binnen('2026-11-24');
        await eruit({ verzoek_id: nieuwVerzoek(), code: HAAS_KRAT, wat: 'invriezen' });
        store.g.pakjes.find((p) => p.id === id)!.opgebruikt = true;
        expect(await terug(id)).toBe(false);
    });

    it('nooit via de kassa eruit, van een andere organisatie of geen uuid: terug = false', async () => {
        const id = await binnen('2026-11-24');
        expect(await terug(id)).toBe(false);
        const vreemd = nieuwPakje();
        store.g.pakjes.push({ id: vreemd, organization_id: ANDERE_ORG, product_id: VREEMD, code: HAAS_KRAT, prijs_cents: 7677, tht: '2026-11-26', status: 'afgeschreven' });
        expect(await terug(vreemd)).toBe(false);
        expect(await terug('niet-een-id')).toBe(false);
    });

    it('zonder medewerker 403', async () => {
        const id = nieuwPakje();
        await fout(await terugPOST(verzoek(`pakjes/${id}/terug`, { medewerker: null }), stuk(id)), 403, 'medewerker_sessie_verlopen');
    });
});
