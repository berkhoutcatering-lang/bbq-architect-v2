/**
 * Cadeaubonnen op de Toonbank (contract toonbank/v1 1.2). Met de geheugen-opslag, die doet wat de
 * functies uit 20261029120000 doen (supabase/tests/toonbank_cadeaubonnen.sql bewaakt de echte):
 * opzoeken, reserveren (genoeg, te weinig, verlopen, geblokkeerd, onbekend, idempotent),
 * vrijgeven, en afschrijven als de bon binnenkomt: ook na een verlopen reservering, nooit
 * geweigerd, en een saldo onder nul wordt Te controleren. Plus GET status cadeaubon_aan.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ontvangBonnen } from './bonnen';
import {
    cadeauboncodeUit, CODE_TEKENS, geefCadeaubonVrij, leesEuro, maakCadeauboncode, naarCadeaubonRijen, reserveerCadeaubon, zoekCadeaubon,
} from './cadeaubonnen';
import { CadeaubonAntwoord, CadeaubonReserveerAntwoord, CadeaubonVrijgevenAntwoord, FOUT_STATUS, StatusAntwoord } from './contract';
import { maakToonbankGeheugenStore, STANDAARD_STAND, type GeheugenCadeaubon, type ToonbankGeheugenStore } from './geheugenStore';
import { controleLabel } from './overzicht';
import { statusAntwoord } from './status';
import type { ToonbankStore } from './store';
import type { Uitkomst } from './uitkomst';
import { naarCadeaubonStand, naarReserveerRuw } from './supabaseStore';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const ANDER = '00000000-0000-4000-8000-0000000000bb';
const T1 = '00000000-0000-4000-8000-000000000001';
const T2 = '00000000-0000-4000-8000-000000000002';
const JAN = 'fe71fc3c-aaa1-436a-ae15-684b8b3e4de7';
const CTX = { orgId: ORG, apparaatId: T1, medewerkerId: JAN };
const GEEN_PIN = { config: null, client: null };

const MAP = path.join(__dirname, 'contract', 'voorbeelden');
const voorbeeld = (naam: string) => JSON.parse(readFileSync(path.join(MAP, naam), 'utf8')) as Record<string, unknown>;
/** bon-cadeaubon.json: 1415 ct, waarvan 1000 met HB-CB-1001 (reservering 5b6d1f0e…), de rest pin. */
const BON = voorbeeld('bon-cadeaubon.json');
const RES = voorbeeld('cadeaubon-reserveren.json') as { reservering_id: string; bon_id: string; bedrag_cents: number };

const apparaat = (id: string, code: string, org = ORG) => ({
    id, organization_id: org, naam: `Toonbank ${code}`, code, locatie: 'winkel' as const, ingetrokken_at: null,
    hoogste_volgnummer_gemeld: 0, bevestigd_tot_volgnummer: 0, sleutel_hash: code, sleutel_prefix: code, koppelcode_hash: null, koppelcode_geldig_tot: null, koppelpogingen: 0,
});
const cadeaubon = (code: string, saldo: number, extra: Partial<GeheugenCadeaubon> = {}): GeheugenCadeaubon => ({
    id: crypto.randomUUID(), organization_id: ORG, code, waarde_cents: 2500, saldo_cents: saldo, geldig_tot: null, geblokkeerd: false, ...extra,
});
const uuid = () => crypto.randomUUID();
/** De fout uit een uitkomst ('in': de tsconfig staat niet op strict, dan vernauwt !u.ok niet). */
const foutVan = <T>(u: Uitkomst<T>) => ('code' in u ? u : null);
let volgnummer = 0;
/** Een bon zoals bon-cadeaubon.json, met een eigen id, volgnummer en cadeaubonregel. */
function bonMet(cadeaubonRegel: Record<string, unknown>, soort: 'bon' | 'tegenbon' = 'bon'): Record<string, unknown> {
    const id = uuid();
    volgnummer += 1;
    const regels = (BON.regels as Record<string, unknown>[]).map((r) => (r.betaalmethode === 'cadeaubon' ? { ...r, ...cadeaubonRegel } : r));
    const pin = 1415 - Number(cadeaubonRegel.bedrag_cents ?? 1000);
    const bon: Record<string, unknown> = {
        ...BON, gebeurtenis_id: id, bon_id: id, volgnummer: 1215 + volgnummer, bonnummer: `T1-${String(418 + volgnummer).padStart(6, '0')}`, bon_volgnummer: 418 + volgnummer,
        regels: regels.map((r) => (r.betaalmethode === 'pin' ? { ...r, bedrag_cents: pin } : r)),
    };
    if (soort === 'tegenbon') Object.assign(bon, { soort: 'tegenbon', verwijst_naar_bon_id: BON.bon_id, reden: 'retour' });
    return bon;
}
const stuur = (store: ToonbankStore, ...meldingen: Record<string, unknown>[]) =>
    ontvangBonnen(store, { orgId: ORG, apparaatId: T1, contract: '1.2.0', verouderd: false }, { meldingen });

let store: ToonbankGeheugenStore;
beforeEach(() => {
    store = maakToonbankGeheugenStore({
        apparaten: [apparaat(T1, 'T1'), apparaat(T2, 'T2'), apparaat('00000000-0000-4000-8000-000000000009', 'T9', ANDER)],
        cadeaubonnen: [cadeaubon('HB-CB-1001', 1850, { geldig_tot: '2028-12-31' })],
        stand: { [ORG]: STANDAARD_STAND },
        nu: new Date('2027-03-06T12:30:00Z'),
    });
});

describe('opzoeken', () => {
    it('geeft het saldo volgens het contract, ook met kleine letters, spaties of als adres', async () => {
        for (const invoer of ['HB-CB-1001', ' hb-cb-1001 ', 'hb-cb- 1001', 'https://hopenbites.nl/cadeaubon/HB-CB-1001', encodeURIComponent('hb-cb-1001 ')]) {
            const u = await zoekCadeaubon(store, CTX, invoer);
            expect(u.ok && CadeaubonAntwoord.parse(u.body), invoer).toEqual(voorbeeld('cadeaubon.json'));
        }
    });

    it('onbekend, ongeldig of van een andere organisatie: 404 cadeaubon_onbekend', async () => {
        for (const invoer of ['HB-CB-9999', 'x', '', '../etc']) {
            const u = await zoekCadeaubon(store, CTX, invoer);
            expect(foutVan(u)?.code, invoer).toBe('cadeaubon_onbekend');
        }
        const u = await zoekCadeaubon(store, { ...CTX, orgId: ANDER }, 'HB-CB-1001');
        expect(foutVan(u)?.code).toBe('cadeaubon_onbekend');
        expect(FOUT_STATUS.cadeaubon_onbekend).toBe(404);
    });

    it('niet actief: beschikbaar 0; een saldo onder nul is in het antwoord 0', async () => {
        store.g.cadeaubonnen.push(cadeaubon('HB-LEEG-1', -300), cadeaubon('HB-OUD-1', 900, { geldig_tot: '2027-03-05' }), cadeaubon('HB-BLOK-1', 900, { geblokkeerd: true }));
        const leeg = await zoekCadeaubon(store, CTX, 'HB-LEEG-1');
        expect(leeg.ok && CadeaubonAntwoord.parse(leeg.body)).toMatchObject({ status: 'leeg', saldo_cents: 0, beschikbaar_cents: 0 });
        const oud = await zoekCadeaubon(store, CTX, 'HB-OUD-1');
        expect(oud.ok && oud.body).toMatchObject({ status: 'verlopen', saldo_cents: 900, beschikbaar_cents: 0 });
        const blok = await zoekCadeaubon(store, CTX, 'HB-BLOK-1');
        expect(blok.ok && blok.body).toMatchObject({ status: 'geblokkeerd', beschikbaar_cents: 0 });
    });

    it('geldig tot en met de dag zelf (Europe/Amsterdam)', async () => {
        store.g.cadeaubonnen.push(cadeaubon('HB-VANDAAG-1', 900, { geldig_tot: '2027-03-06' }));
        store.g.nu = new Date('2027-03-06T22:59:00Z');
        expect((await zoekCadeaubon(store, CTX, 'HB-VANDAAG-1')).ok && (await store.cadeaubon(ORG, 'HB-VANDAAG-1'))!.status).toBe('actief');
        store.g.nu = new Date('2027-03-06T23:01:00Z');
        expect((await store.cadeaubon(ORG, 'HB-VANDAAG-1'))!.status).toBe('verlopen');
    });
});

describe('reserveren', () => {
    it('genoeg: houdt vast tot 15 minuten later; opzoeken ziet het als gereserveerd', async () => {
        const u = await reserveerCadeaubon(store, CTX, 'hb-cb-1001', RES);
        expect(u.ok && CadeaubonReserveerAntwoord.parse(u.body)).toEqual({
            reservering_id: RES.reservering_id, code: 'HB-CB-1001', bedrag_cents: 1000, beschikbaar_na_cents: 850, verloopt_at: '2027-03-06T12:45:00.000Z',
        });
        const z = await zoekCadeaubon(store, CTX, 'HB-CB-1001');
        expect(z.ok && z.body).toMatchObject({ saldo_cents: 1850, gereserveerd_cents: 1000, beschikbaar_cents: 850 });
        expect(store.g.cadeaubonReserveringen[0]).toMatchObject({ apparaat_id: T1, medewerker_id: JAN, bon_id: RES.bon_id, status: 'vast' });
    });

    it('dezelfde reservering_id twee keer: hetzelfde antwoord, één reservering; anders: 400', async () => {
        const een = await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        const twee = await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        expect(twee).toEqual(een);
        expect(store.g.cadeaubonReserveringen).toHaveLength(1);
        expect(store.g.cadeaubonMutaties.filter((m) => m.soort === 'reservering')).toHaveLength(1);
        const anders = await reserveerCadeaubon(store, CTX, 'HB-CB-1001', { ...RES, bedrag_cents: 900 });
        expect(foutVan(anders)?.code).toBe('ongeldig_verzoek');
    });

    it('te weinig: 422 met wat er nog kan; er is niets vastgehouden', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        const u = await reserveerCadeaubon(store, CTX, 'HB-CB-1001', { reservering_id: uuid(), bon_id: uuid(), bedrag_cents: 900 });
        const f = foutVan(u)!;
        expect(f.code).toBe('cadeaubon_saldo_te_laag');
        expect(FOUT_STATUS[f.code]).toBe(422);
        expect(f.details).toEqual({ code: 'HB-CB-1001', beschikbaar_cents: 850 });
        expect(f.melding).toBe('Er staat nog € 8,50 op deze cadeaubon. Reken dat af met de cadeaubon en de rest op een andere manier.');
        expect(f.melding).not.toContain('!');
        expect(store.g.cadeaubonReserveringen).toHaveLength(1);
    });

    it('verlopen, geblokkeerd of onbekend: de juiste fout, niets vastgehouden', async () => {
        store.g.cadeaubonnen.push(cadeaubon('HB-OUD-1', 900, { geldig_tot: '2027-03-05' }), cadeaubon('HB-BLOK-1', 900, { geblokkeerd: true }));
        const v = { reservering_id: uuid(), bon_id: uuid(), bedrag_cents: 100 };
        const oud = await reserveerCadeaubon(store, CTX, 'HB-OUD-1', v);
        expect([foutVan(oud)?.code, foutVan(oud)?.details]).toEqual(['cadeaubon_verlopen', { code: 'HB-OUD-1', geldig_tot: '2027-03-05' }]);
        const blok = await reserveerCadeaubon(store, CTX, 'HB-BLOK-1', v);
        expect(foutVan(blok)?.code).toBe('cadeaubon_geblokkeerd');
        const weg = await reserveerCadeaubon(store, CTX, 'HB-WEG-1', v);
        expect(foutVan(weg)?.code).toBe('cadeaubon_onbekend');
        expect(store.g.cadeaubonReserveringen).toHaveLength(0);
    });

    it('een verlopen reservering telt niet meer mee', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', { ...RES, bedrag_cents: 1850 });
        store.g.nu = new Date('2027-03-06T12:46:00Z');
        const u = await reserveerCadeaubon(store, CTX, 'HB-CB-1001', { reservering_id: uuid(), bon_id: uuid(), bedrag_cents: 1850 });
        expect(u.ok && u.body.beschikbaar_na_cents).toBe(0);
    });
});

describe('vrijgeven', () => {
    it('vrijgeven: weer beschikbaar; twee keer kan geen kwaad', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        const een = await geefCadeaubonVrij(store, CTX, 'HB-CB-1001', { reservering_id: RES.reservering_id });
        expect(een.ok && CadeaubonVrijgevenAntwoord.parse(een.body)).toEqual({ reservering_id: RES.reservering_id, vrijgegeven: true, beschikbaar_cents: 1850 });
        const twee = await geefCadeaubonVrij(store, CTX, 'HB-CB-1001', { reservering_id: RES.reservering_id });
        expect(twee.ok && twee.body).toEqual({ reservering_id: RES.reservering_id, vrijgegeven: false, beschikbaar_cents: 1850 });
    });

    it('niet als hij verlopen is, van een andere tablet of onbekend; een onbekende code is 404', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        const ander = await geefCadeaubonVrij(store, { ...CTX, apparaatId: T2 }, 'HB-CB-1001', { reservering_id: RES.reservering_id });
        expect(ander.ok && ander.body.vrijgegeven).toBe(false);
        expect(store.g.cadeaubonReserveringen[0]!.status).toBe('vast');
        store.g.nu = new Date('2027-03-06T13:00:00Z');
        const laat = await geefCadeaubonVrij(store, CTX, 'HB-CB-1001', { reservering_id: RES.reservering_id });
        expect(laat.ok && laat.body).toEqual({ reservering_id: RES.reservering_id, vrijgegeven: false, beschikbaar_cents: 1850 });
        const weg = await geefCadeaubonVrij(store, CTX, 'HB-WEG-1', { reservering_id: RES.reservering_id });
        expect(foutVan(weg)?.code).toBe('cadeaubon_onbekend');
    });
});

describe('afschrijven als de bon binnenkomt (POST bonnen)', () => {
    const saldo = () => store.g.cadeaubonnen.find((c) => c.code === 'HB-CB-1001')!.saldo_cents;

    it('bon-cadeaubon.json: schrijft 1000 af, de reservering is gebruikt; twee keer sturen schrijft één keer af', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        const { uitkomst } = await stuur(store, BON);
        expect(uitkomst.ok && uitkomst.body.resultaten).toEqual([{ gebeurtenis_id: BON.gebeurtenis_id, journaal: 'nieuw', verwerking: 'verwerkt' }]);
        expect(saldo()).toBe(850);
        expect(store.g.cadeaubonReserveringen[0]).toMatchObject({ status: 'gebruikt', gebruikt_bon_id: BON.bon_id });
        const nog = await stuur(store, BON);
        expect(nog.uitkomst.ok && nog.uitkomst.body.resultaten[0]!.journaal).toBe('bestond');
        expect(saldo()).toBe(850);
        expect(store.g.cadeaubonMutaties.filter((m) => m.soort === 'afschrijving')).toHaveLength(1);
        expect((await zoekCadeaubon(store, CTX, 'HB-CB-1001')).ok).toBe(true);
    });

    it('na een verlopen reservering: toch afgeschreven, nooit geweigerd; onder nul wordt Te controleren', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        store.g.nu = new Date('2027-03-06T12:50:00Z');
        // Intussen reserveert iemand anders het hele saldo, en die bon komt eerst binnen.
        const ander = { reservering_id: uuid(), bon_id: uuid(), bedrag_cents: 1850 };
        expect((await reserveerCadeaubon(store, { ...CTX, apparaatId: T2 }, 'HB-CB-1001', ander)).ok).toBe(true);
        await stuur(store, bonMet({ bedrag_cents: 1415, cadeaubon_code: 'HB-CB-1001', reservering_id: ander.reservering_id }));
        expect(saldo()).toBe(435);
        // Nu de late bon: 1000 eraf, saldo −565, maar de bon is geboekt.
        const { uitkomst } = await stuur(store, BON);
        expect(uitkomst.ok && uitkomst.body.resultaten[0]).toEqual({ gebeurtenis_id: BON.gebeurtenis_id, journaal: 'nieuw', verwerking: 'conflict' });
        expect(saldo()).toBe(-565);
        const m = store.g.meldingen.find((x) => x.gebeurtenis_id === BON.gebeurtenis_id)!;
        expect(m.fout_code).toBe('cadeaubon_saldo_negatief');
        expect(m.fout_melding).toContain('onder nul');
        expect(controleLabel(m.fout_code)).toBe('Cadeaubon onder nul');
        const z = await zoekCadeaubon(store, CTX, 'HB-CB-1001');
        expect(z.ok && CadeaubonAntwoord.parse(z.body)).toMatchObject({ status: 'leeg', saldo_cents: 0, beschikbaar_cents: 0 });
    });

    it('verlopen maar het saldo is genoeg: gewoon verwerkt', async () => {
        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        store.g.nu = new Date('2027-03-06T14:00:00Z');
        const { uitkomst } = await stuur(store, BON);
        expect(uitkomst.ok && uitkomst.body.resultaten[0]!.verwerking).toBe('verwerkt');
        expect(saldo()).toBe(850);
    });

    it('een onbekende code of geen code: de bon wel, niets afgeschreven, Te controleren', async () => {
        for (const [regel, code] of [
            [{ cadeaubon_code: 'HB-WEG-1', reservering_id: uuid() }, 'cadeaubon_onbekend'],
            [{ cadeaubon_code: undefined, reservering_id: undefined }, 'cadeaubon_zonder_code'],
        ] as const) {
            const bon = bonMet({ bedrag_cents: 500, ...regel });
            const { uitkomst } = await stuur(store, bon);
            expect(uitkomst.ok && uitkomst.body.resultaten[0]!.verwerking, code).toBe('conflict');
            expect(store.g.meldingen.find((x) => x.gebeurtenis_id === bon.gebeurtenis_id)!.fout_code).toBe(code);
        }
        expect(saldo()).toBe(1850);
        expect(store.g.cadeaubonMutaties.filter((m) => m.soort === 'afschrijving')).toHaveLength(0);
    });

    it('geen reservering, een geblokkeerde of een al gebruikte: toch afgeschreven, met een controle', async () => {
        const zonder = bonMet({ bedrag_cents: 300, cadeaubon_code: 'HB-CB-1001', reservering_id: undefined });
        await stuur(store, zonder);
        expect(store.g.meldingen.find((x) => x.gebeurtenis_id === zonder.gebeurtenis_id)!.fout_code).toBe('cadeaubon_zonder_reservering');
        expect(saldo()).toBe(1550);

        await reserveerCadeaubon(store, CTX, 'HB-CB-1001', RES);
        await stuur(store, BON);
        const dubbel = bonMet({ bedrag_cents: 1000, cadeaubon_code: 'HB-CB-1001', reservering_id: RES.reservering_id });
        await stuur(store, dubbel);
        expect(store.g.meldingen.find((x) => x.gebeurtenis_id === dubbel.gebeurtenis_id)!.fout_code).toBe('cadeaubon_reservering_gebruikt');
        expect(saldo()).toBe(-450);

        store.g.cadeaubonnen.push(cadeaubon('HB-BLOK-1', 900, { geblokkeerd: true }));
        const blok = bonMet({ bedrag_cents: 400, cadeaubon_code: 'HB-BLOK-1', reservering_id: undefined });
        await stuur(store, blok);
        expect(store.g.cadeaubonnen.find((c) => c.code === 'HB-BLOK-1')!.saldo_cents).toBe(500);
        expect(store.g.meldingen.find((x) => x.gebeurtenis_id === blok.gebeurtenis_id)!.verwerk_status).toBe('conflict');
    });

    it('een tegenbon met een cadeaubon: niets teruggezet (niet in 1.2), Te controleren', async () => {
        const t = bonMet({ bedrag_cents: -500, cadeaubon_code: 'HB-CB-1001', reservering_id: undefined }, 'tegenbon');
        await stuur(store, t);
        expect(store.g.meldingen.find((x) => x.gebeurtenis_id === t.gebeurtenis_id)!.fout_code).toBe('cadeaubon_terug');
        expect(saldo()).toBe(1850);
    });
});

describe('GET status: instellingen.cadeaubon_aan', () => {
    const gezien = { volgnummer: null, app_versie: null, contract_versie: '1.2.0' };

    it('standaard uit (het veld ontbreekt); aan als de organisatie het aan heeft', async () => {
        const uit = StatusAntwoord.parse(await statusAntwoord(store, { orgId: ORG, apparaatId: T1 }, gezien, GEEN_PIN));
        expect(uit.instellingen.cadeaubon_aan).toBeUndefined();
        store.g.cadeaubonAan[ORG] = true;
        const aan = StatusAntwoord.parse(await statusAntwoord(store, { orgId: ORG, apparaatId: T1 }, gezien, GEEN_PIN));
        expect(aan.instellingen.cadeaubon_aan).toBe(true);
    });

    it('een storing bij het nakijken: uit, en GET status lukt gewoon', async () => {
        store.g.cadeaubonAan[ORG] = true;
        const kapot: ToonbankStore = { ...store, cadeaubonAan: async () => { throw new Error('42P01'); } };
        const s = StatusAntwoord.parse(await statusAntwoord(kapot, { orgId: ORG, apparaatId: T1 }, gezien, GEEN_PIN));
        expect(s.instellingen.cadeaubon_aan).toBeUndefined();
    });
});

describe('de opslag van Supabase vertaalt de databasefuncties', () => {
    it('opzoeken: getallen als tekst, nooit onder nul, niet actief = niets beschikbaar', () => {
        expect(naarCadeaubonStand({ code: 'HB-CB-1001', status: 'leeg', saldo_cents: '-565', gereserveerd_cents: '0', beschikbaar_cents: '5', waarde_cents: 2500, geldig_tot: '2028-12-31' }))
            .toEqual({ code: 'HB-CB-1001', status: 'leeg', saldo_cents: 0, gereserveerd_cents: 0, beschikbaar_cents: 0, waarde_cents: 2500, geldig_tot: '2028-12-31' });
        expect(naarCadeaubonStand({ code: 'X-12', status: 'raar', saldo_cents: 5, geldig_tot: null }).status).toBe('geblokkeerd');
    });

    it('reserveren: de tijd als ISO, een onbekende fout wordt onbekend', () => {
        expect(naarReserveerRuw({ ok: true, reservering_id: RES.reservering_id, code: 'HB-CB-1001', bedrag_cents: 1000, beschikbaar_na_cents: 850, verloopt_at: '2027-03-06T12:45:00.123456+00:00' }))
            .toEqual({ ok: true, reservering_id: RES.reservering_id, code: 'HB-CB-1001', bedrag_cents: 1000, beschikbaar_na_cents: 850, verloopt_at: '2027-03-06T12:45:00.123Z' });
        expect(naarReserveerRuw({ ok: false, fout: 'iets_anders' })).toEqual({ ok: false, fout: 'cadeaubon_onbekend', beschikbaar_cents: 0, geldig_tot: null });
    });
});

describe('beheer', () => {
    it('maakCadeauboncode: HB-XXXX-XXXX zonder tekens die op elkaar lijken, en een geldige code', () => {
        for (let i = 0; i < 200; i++) {
            const c = maakCadeauboncode();
            expect(c).toMatch(/^HB-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
            expect(cadeauboncodeUit(c)).toBe(c);
        }
        expect(CODE_TEKENS).not.toMatch(/[01ILO]/);
        expect(maakCadeauboncode(() => 0)).toBe('HB-2222-2222');
    });

    it('leesEuro: komma, punt voor duizendtallen en het euroteken', () => {
        expect(leesEuro('25')).toBe(2500);
        expect(leesEuro('25,5')).toBe(2550);
        expect(leesEuro('€ 1.250,00')).toBe(125000);
        expect(leesEuro('12.50')).toBe(1250);
        expect(leesEuro('0')).toBeNull();
        expect(leesEuro('vijf')).toBeNull();
        expect(leesEuro('-5')).toBeNull();
    });

    it('naarCadeaubonRijen: ook een saldo onder nul blijft zichtbaar', () => {
        expect(naarCadeaubonRijen([{ id: 'a', code: 'HB-1', waarde_cents: 2500, saldo_cents: -565, gereserveerd_cents: 0, status: 'leeg', geldig_tot: null, uitgegeven_at: '2027-03-01T10:00:00Z' }])[0])
            .toMatchObject({ saldo_cents: -565, status: 'leeg', geldig_tot: null, notitie: null });
        expect(naarCadeaubonRijen(null)).toEqual([]);
    });
});
