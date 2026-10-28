/**
 * Pinnen via de koppeling met de myPOS (contract toonbank/v1 1.3). Met de geheugen-opslag en een
 * nep-myPOS: per poging_id hooguit één betaling op de terminal, de vertaling van de myPOS-status,
 * afbreken, en dat de koppeling uit staat zonder sleutels, voor een andere organisatie of zonder
 * terminal.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PinbetalingAntwoord } from './contract';
import { maakToonbankGeheugenStore, type ToonbankGeheugenStore } from './geheugenStore';
import type { MyposBetaling, MyposClient, MyposConfig } from './mypos';
import { MyposFout } from './mypos';
import { annuleerPinbetaling, pinbetalingStand, standVan, startPinbetaling, type PinAfhankelijk } from './pinkoppeling';
import { statusAntwoord } from './status';
import { STANDAARD_STAND } from './geheugenStore';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const T1 = '00000000-0000-4000-8000-000000000001';
const T2 = '00000000-0000-4000-8000-000000000002';
const CTX = { orgId: ORG, apparaatId: T1 };
const POGING = '30000000-0000-4000-8000-000000000001';
const BON = '40000000-0000-4000-8000-000000000001';
const VERZOEK = { poging_id: POGING, bon_id: BON, bonnummer: 'T1-000412', bedrag_cents: 2350 };
const CFG = { organisatieId: ORG } as MyposConfig;

function nepClient(standen: MyposBetaling['status'][]) {
    const betalingen: { terminal_id: string; bedrag_cents: number; referentie: string }[] = [];
    const geannuleerd: string[] = [];
    let i = 0;
    const b = (status: string): MyposBetaling => ({ payment_id: 'pay-1', status, bedrag_cents: 2350, rrn: status === 'Success' ? '629012345678' : null, auth_code: null, status_message: null, response_code: null });
    const client: MyposClient = {
        async terminals() {
            return [{ terminal_id: '12345678', serial_number: null, model: 'N96' }];
        },
        async betaling(v) {
            betalingen.push(v);
            return b('InProgress');
        },
        async stand() {
            return b(standen[Math.min(i++, standen.length - 1)]!);
        },
        async annuleer(id) {
            geannuleerd.push(id);
            standen.splice(0, standen.length, 'Canceled');
            i = 0;
            return b('InProgress');
        },
    };
    return { client, betalingen, geannuleerd };
}

let store: ToonbankGeheugenStore;
const apparaat = (id: string, code: string) => ({
    id, organization_id: ORG, naam: `Toonbank ${code}`, code, locatie: 'winkel' as const, ingetrokken_at: null,
    hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 0, sleutel_hash: code, sleutel_prefix: code, koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
});

beforeEach(() => {
    store = maakToonbankGeheugenStore({ apparaten: [apparaat(T1, 'T1'), apparaat(T2, 'T2')], myposTerminals: { [T1]: '12345678' }, stand: { [ORG]: STANDAARD_STAND } });
});

describe('startPinbetaling', () => {
    it('stuurt de betaling naar de terminal van deze tablet, met het bonnummer als referentie', async () => {
        const n = nepClient(['InProgress']);
        const u = await startPinbetaling(store, CTX, VERZOEK, { config: CFG, client: n.client });
        expect(u.ok && PinbetalingAntwoord.parse(u.body)).toEqual({ poging_id: POGING, stand: 'wacht', bedrag_cents: 2350, melding: null, mypos_referentie: null, terminal: 'myPOS 5678' });
        expect(n.betalingen).toEqual([{ terminal_id: '12345678', bedrag_cents: 2350, referentie: 'T1-000412', omschrijving: 'Hop & Bites T1-000412' }]);
        expect(store.g.pinbetalingen[0]).toMatchObject({ mypos_payment_id: 'pay-1', stand: 'wacht', mypos_status: 'InProgress' });
    });

    it('hetzelfde poging_id twee keer: nooit een tweede betaling op de terminal', async () => {
        const n = nepClient(['InProgress', 'Success']);
        const dep: PinAfhankelijk = { config: CFG, client: n.client };
        await startPinbetaling(store, CTX, VERZOEK, dep);
        const tweede = await startPinbetaling(store, CTX, VERZOEK, dep);
        expect(n.betalingen).toHaveLength(1);
        expect(tweede.ok && tweede.body.poging_id).toBe(POGING);
    });

    it('uit zonder sleutels, voor een andere organisatie, of voor een tablet zonder terminal', async () => {
        const n = nepClient(['InProgress']);
        expect(await startPinbetaling(store, CTX, VERZOEK, { config: null, client: null })).toMatchObject({ ok: false, code: 'pin_koppeling_uit' });
        expect(await startPinbetaling(store, CTX, VERZOEK, { config: { organisatieId: 'andere' } as MyposConfig, client: n.client })).toMatchObject({ ok: false, code: 'pin_koppeling_uit' });
        expect(await startPinbetaling(store, { orgId: ORG, apparaatId: T2 }, VERZOEK, { config: CFG, client: n.client })).toMatchObject({ ok: false, code: 'pin_koppeling_uit' });
        expect(n.betalingen).toHaveLength(0);
    });

    it('myPOS weigert vooraf (4xx): terminal_bezet; geen antwoord: mypos_onbereikbaar. De tablet pint dan met de hand', async () => {
        const weigert: MyposClient = { ...nepClient([]).client, betaling: async () => { throw new MyposFout(400, 'Terminal not available'); } };
        expect(await startPinbetaling(store, CTX, VERZOEK, { config: CFG, client: weigert })).toMatchObject({ ok: false, code: 'terminal_bezet' });
        const weg: MyposClient = { ...nepClient([]).client, betaling: async () => { throw new MyposFout(0, 'fetch failed'); } };
        expect(await startPinbetaling(store, CTX, { ...VERZOEK, poging_id: '30000000-0000-4000-8000-000000000002' }, { config: CFG, client: weg })).toMatchObject({ ok: false, code: 'mypos_onbereikbaar' });
    });
});

describe('pinbetalingStand en annuleren', () => {
    it('vraagt myPOS zolang hij wacht; Success wordt gelukt met de RRN als referentie', async () => {
        const n = nepClient(['InProgress', 'Success']);
        const dep = { config: CFG, client: n.client };
        await startPinbetaling(store, CTX, VERZOEK, dep);
        expect(await pinbetalingStand(store, CTX, POGING, dep)).toMatchObject({ ok: true, body: { stand: 'wacht' } });
        expect(await pinbetalingStand(store, CTX, POGING, dep)).toMatchObject({ ok: true, body: { stand: 'gelukt', mypos_referentie: '629012345678' } });
        // Klaar: daarna vraagt BBQ Architect myPOS niet meer.
        expect(await pinbetalingStand(store, CTX, POGING, { config: CFG, client: null })).toMatchObject({ ok: true, body: { stand: 'gelukt' } });
    });

    it('afbreken: DELETE bij myPOS, daarna Canceled is geannuleerd', async () => {
        const n = nepClient(['InProgress']);
        const dep = { config: CFG, client: n.client };
        await startPinbetaling(store, CTX, VERZOEK, dep);
        const u = await annuleerPinbetaling(store, CTX, POGING, dep);
        expect(n.geannuleerd).toEqual(['pay-1']);
        expect(u).toMatchObject({ ok: true, body: { stand: 'geannuleerd', melding: 'Afgebroken op de myPOS.' } });
    });

    it('een andere tablet ziet de pinbetaling niet', async () => {
        await startPinbetaling(store, CTX, VERZOEK, { config: CFG, client: nepClient(['InProgress']).client });
        expect(await pinbetalingStand(store, { orgId: ORG, apparaatId: T2 }, POGING, { config: CFG, client: null })).toMatchObject({ ok: false, code: 'niet_gevonden' });
    });

    it('de myPOS-status naar het contract', () => {
        expect(['InProgress', 'Success', 'Rejected', 'Failed', 'Canceled', 'Reversed', 'Iets'].map(standVan)).toEqual(['wacht', 'gelukt', 'mislukt', 'mislukt', 'geannuleerd', 'geannuleerd', 'wacht']);
    });
});

describe('GET status meldt de koppeling', () => {
    it('pin_koppeling alleen voor een tablet met terminal en met sleutels', async () => {
        const dep = { config: CFG, client: nepClient([]).client };
        const gezien = { volgnummer: null, app_versie: null, contract_versie: null };
        expect((await statusAntwoord(store, CTX, gezien, dep)).instellingen.pin_koppeling).toBe(true);
        expect((await statusAntwoord(store, { orgId: ORG, apparaatId: T2 }, gezien, dep)).instellingen.pin_koppeling).toBeUndefined();
        expect((await statusAntwoord(store, CTX, gezien, { config: null, client: null })).instellingen.pin_koppeling).toBeUndefined();
    });
});

describe('sleutels geweigerd of de rem erop', () => {
    it('dan pin_koppeling_uit (met de hand verder), niet terminal_bezet', async () => {
        const { MyposFout: Fout } = await import('./mypos');
        const fout = new Fout(423, 'myPOS weigerde de sleutels net.');
        fout.sleutels = true;
        const client: MyposClient = { ...nepClient([]).client, betaling: async () => { throw fout; } };
        const u = await startPinbetaling(store, CTX, VERZOEK, { config: CFG, client });
        expect(u).toMatchObject({ ok: false, code: 'pin_koppeling_uit' });
        expect(store.g.pinbetalingen[0]).toMatchObject({ stand: 'mislukt' });
    });
});
