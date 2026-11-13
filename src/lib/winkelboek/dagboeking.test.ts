import { describe, expect, it } from 'vitest';
import { kasVerschilTekst, maakDagboeking, pinVerschilTekst, type BonMin, type DagstaatKort } from './dagboeking';

const bon = (b: Partial<BonMin>): BonMin => ({
    status: 'afgerond', dagstaat_id: 'd1', totaal_cents: 0, afronding_cents: 0, btw: {}, statiegeld_cents: 0,
    order_rest_cents: 0, pin_cents: 0, contant_cents: 0, cadeaubon_cents: 0, ...b,
});
const staat = (s: Partial<DagstaatKort>): DagstaatKort => ({
    id: 'd1', apparaat_id: 'kassa-1',
    bedrijfsdag: '2026-11-28', status: 'definitief', gesloten_at: '2026-11-28T17:07:00Z', aantal_bonnen: 1,
    pin_toonbank_cents: 0, pin_mypos_app_cents: 0, pin_verschil_cents: 0, contant_begin_cents: 15000,
    contant_verwacht_cents: 15000, contant_geteld_cents: 15000, contant_verschil_cents: 0,
    afgeroomd_cents: 0, verschillen: [], goedgekeurd_at: null, ...s,
});
const dag = bon({
    totaal_cents: 179198, afronding_cents: -2, statiegeld_cents: 1200, order_rest_cents: 8500,
    btw: { '9': { incl_cents: 109000, btw_cents: 9000 }, '21': { incl_cents: 60500, btw_cents: 10500 } },
    pin_cents: 140250, contant_cents: 33948, cadeaubon_cents: 5000,
});
const cents = (d: ReturnType<typeof maakDagboeking>) => Object.fromEntries(d.hokjes.map((h) => [h.sleutel, h.cents]));

describe('maakDagboeking', () => {
    it('zet de dag in hokjes en sluit op de cent', () => {
        const d = maakDagboeking('2026-11-28', [dag], [staat({})]);
        expect(d.binnen).toEqual({ pin: 140250, contant: 33948, cadeaubon: 5000, totaal: 179198 });
        expect(d.hokjes.map((h) => h.sleutel)).toEqual(['omzet_9', 'btw_9', 'omzet_21', 'btw_21', 'statiegeld', 'webshop_afgehaald', 'afronding']);
        expect(cents(d)).toEqual({ omzet_9: 100000, btw_9: 9000, omzet_21: 50000, btw_21: 10500, statiegeld: 1200, webshop_afgehaald: 8500, afronding: -2 });
        expect(d).toMatchObject({ totaal_hokjes: 179198, sluit: true, stand: 'geboekt', aantal_bonnen: 1, punten: [] });
    });
    it('een tegenbon telt negatief en de dag sluit nog steeds', () => {
        const terug = bon({ totaal_cents: -1090, btw: { '9': { incl_cents: -1090, btw_cents: -90 } }, pin_cents: -1090 });
        const d = maakDagboeking('2026-11-28', [dag, terug], [staat({})]);
        expect(cents(d)).toMatchObject({ omzet_9: 99000, btw_9: 8910 });
        expect(d).toMatchObject({ sluit: true, aantal_bonnen: 2 });
        expect(d.binnen.pin).toBe(139160);
    });
    it('een geannuleerde bon telt niet mee', () => {
        const d = maakDagboeking('2026-11-28', [dag, bon({ status: 'geannuleerd', totaal_cents: 500, pin_cents: 500 })], [staat({})]);
        expect(d.binnen.totaal).toBe(179198);
        expect(d.aantal_bonnen).toBe(1);
    });
    it('een bon buiten elke dagafsluiting is te controleren', () => {
        const d = maakDagboeking('2026-11-28', [dag, bon({ ...dag, dagstaat_id: null })], [staat({})]);
        expect(d.stand).toBe('te_controleren');
        expect(d.punten.join(' ')).toContain('geen dagafsluiting');
    });
    it('bonnen zonder dagstaat: de dag staat open en krijgt geen vinkje', () => {
        const d = maakDagboeking('2026-11-28', [{ ...dag, dagstaat_id: null }], []);
        expect(d.stand).toBe('open');
        expect(d.gesloten_at).toBeNull();
        expect(d.punten.join(' ')).toContain('niet afgesloten');
        expect(d.binnen.totaal).toBe(179198);
    });
    it('geen bonnen en geen dagstaat: geen verkoop', () => {
        expect(maakDagboeking('2026-11-28', [], [])).toMatchObject({ stand: 'geen_verkoop', hokjes: [], sluit: true, punten: [] });
    });
    it('een kasverschil blijft te controleren tot het is goedgekeurd', () => {
        const open = maakDagboeking('2026-11-28', [dag], [staat({ contant_verschil_cents: -200 })]);
        expect(open.stand).toBe('te_controleren');
        expect(open.punten.join(' ')).toContain('2,00');
        const klaar = maakDagboeking('2026-11-28', [dag], [staat({ contant_verschil_cents: -200, goedgekeurd_at: '2026-11-29T08:00:00Z' })]);
        expect(klaar.stand).toBe('geboekt');
    });
    it('een kasverschil dat je eigen kasregel verklaart blijft te controleren, met de reden erbij', () => {
        const d = maakDagboeking('2026-11-28', [dag], [staat({ contant_verschil_cents: -900 })], -900);
        expect(d.stand).toBe('te_controleren');
        expect(d.punten).toHaveLength(1);
        expect(d.punten[0]).toContain('verklaard door je eigen kasregel');
        expect(d.punten[0]).toContain('9,00');
    });
    it('een voorlopige dagstaat of een narekenverschil is te controleren', () => {
        expect(maakDagboeking('2026-11-28', [dag], [staat({ status: 'voorlopig' })]).stand).toBe('te_controleren');
        expect(maakDagboeking('2026-11-28', [dag], [staat({ verschillen: [{ veld: 'pin', tablet_cents: 1, ba_cents: 2 }] })]).stand).toBe('te_controleren');
        expect(maakDagboeking('2026-11-28', [dag], [staat({ status: 'goedgekeurd', verschillen: [{ veld: 'pin', tablet_cents: 1, ba_cents: 2 }] })]).stand).toBe('geboekt');
    });
    it('hokjes die niet sluiten zijn te controleren', () => {
        const d = maakDagboeking('2026-11-28', [bon({ ...dag, pin_cents: 140000 })], [staat({})]);
        expect(d).toMatchObject({ sluit: false, stand: 'te_controleren' });
        expect(d.punten.join(' ')).toContain('2,50');
    });
    it('twee tablets op één dag tellen samen', () => {
        const d = maakDagboeking('2026-11-28', [dag, dag], [staat({}), staat({ gesloten_at: '2026-11-28T17:30:00Z' })]);
        expect(d.binnen.totaal).toBe(358396);
        expect(d.gesloten_at).toBe('2026-11-28T17:30:00Z');
        expect(d.stand).toBe('geboekt');
    });
});

/* De kassa rekent kasverschil = geteld − verwacht en pinverschil = myPOS − kassa. */
describe('de richting van een verschil', () => {
    it('een kasverschil zegt of er te weinig of te veel in de la zat', () => {
        const weinig = maakDagboeking('2026-11-28', [dag], [staat({ contant_geteld_cents: 14800, contant_verschil_cents: -200 })]);
        expect(weinig.punten[0]).toContain('2,00');
        expect(weinig.punten[0]).toContain('te weinig in de la');
        const veel = maakDagboeking('2026-11-28', [dag], [staat({ contant_geteld_cents: 15200, contant_verschil_cents: 200 })]);
        expect(veel.punten[0]).toContain('te veel in de la');
    });
    it('ook een verklaard kasverschil houdt zijn richting', () => {
        const d = maakDagboeking('2026-11-28', [dag], [staat({ contant_geteld_cents: 14100, contant_verschil_cents: -900 })], -900);
        expect(d.punten[0]).toContain('te weinig in de la');
        expect(d.punten[0]).toContain('verklaard door je eigen kasregel');
    });
    it('een pinverschil zegt of myPOS meer of minder toont dan de kassa', () => {
        const meer = maakDagboeking('2026-11-28', [dag], [staat({ pin_toonbank_cents: 140250, pin_mypos_app_cents: 140750, pin_verschil_cents: 500 })]);
        expect(meer.punten[0]).toContain('myPOS toont');
        expect(meer.punten[0]).toContain('5,00');
        expect(meer.punten[0]).toContain('meer dan de kassa');
        const minder = maakDagboeking('2026-11-28', [dag], [staat({ pin_toonbank_cents: 140250, pin_mypos_app_cents: 139750, pin_verschil_cents: -500 })]);
        expect(minder.punten[0]).toContain('minder dan de kassa');
    });
    it('kasVerschilTekst en pinVerschilTekst', () => {
        expect(kasVerschilTekst(-200)).toMatch(/2,00 te weinig$/);
        expect(kasVerschilTekst(200)).toMatch(/2,00 te veel$/);
        expect(pinVerschilTekst(500)).toMatch(/^myPOS toont .*5,00 meer dan de kassa$/);
        expect(pinVerschilTekst(-500)).toMatch(/5,00 minder dan de kassa$/);
    });
});
