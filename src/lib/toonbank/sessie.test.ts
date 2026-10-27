import { beforeAll, describe, expect, it } from 'vitest';
import { hashPin } from '@/lib/prep/deviceAuth';
import { maakToonbankGeheugenStore, type ToonbankGeheugenStore } from './geheugenStore';
import { controleerSessie, DIENST_UREN, inloggen, RECHTEN } from './sessie';
import { hashSessieToken } from './sleutel';
import type { Medewerker } from './store';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const ANDER = '00000000-0000-4000-8000-0000000000bb';
const T1 = '00000000-0000-4000-8000-000000000001';
const T2 = '00000000-0000-4000-8000-000000000002';
const JAN = '10000000-0000-4000-8000-000000000001';
const EIG = '10000000-0000-4000-8000-000000000002';
const GEEN_ROL = '10000000-0000-4000-8000-000000000003';
const ZONDER_CODE = '10000000-0000-4000-8000-000000000004';
const VREEMD = '10000000-0000-4000-8000-000000000005';

let pin1234: string;
let pin9999: string;

beforeAll(async () => {
    pin1234 = await hashPin('1234');
    pin9999 = await hashPin('999999');
});

function store(nu = new Date('2027-03-06T10:00:00Z')): ToonbankGeheugenStore {
    const m = (id: string, naam: string, extra: Partial<Medewerker> = {}): Medewerker => ({
        id, organization_id: ORG, naam, actief: true, toonbank_rol: 'medewerker', kds_pin_hash: pin1234, kds_pin_lockout_until: null, ...extra,
    });
    return maakToonbankGeheugenStore({
        nu,
        medewerkers: [
            m(JAN, 'Jan'),
            m(EIG, 'Mathijs', { toonbank_rol: 'eigenaar', kds_pin_hash: pin9999 }),
            m(GEEN_ROL, 'Piet', { toonbank_rol: null }),
            m(ZONDER_CODE, 'Kees', { kds_pin_hash: null }),
            { ...m(VREEMD, 'Vreemd'), organization_id: ANDER },
        ],
    });
}

const ctx = { orgId: ORG, apparaatId: T1 };

describe('inloggen voor een dienst', () => {
    it('juiste code: een sessie van 12 uur, token alleen als hash bewaard', async () => {
        const s = store();
        const nu = s.g.nu;
        const r = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'sessie' }, nu);
        expect(r.ok).toBe(true);
        if (!r.ok || r.doel !== 'dienst') throw new Error('verwacht dienst');
        expect(r.antwoord.naam).toBe('Jan');
        expect(r.antwoord.rechten).toEqual(RECHTEN.medewerker);
        expect(new Date(r.antwoord.geldig_tot).getTime() - nu.getTime()).toBe(DIENST_UREN * 3_600_000);
        expect(s.g.sessies).toHaveLength(1);
        expect(s.g.sessies[0]!.token_hash).toBe(hashSessieToken(r.antwoord.sessie));
        expect(JSON.stringify(s.g)).not.toContain(r.antwoord.sessie);
        expect(s.g.sessies[0]!.doel).toBe('dienst');
    });

    it('doel dienst is hetzelfde als sessie', async () => {
        const s = store();
        const r = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'dienst' }, s.g.nu);
        expect(r.ok && r.doel).toBe('dienst');
    });

    it('foute code: 403 inlogcode_onjuist met pogingen over; de 5e blokkeert, ook de goede code', async () => {
        const s = store();
        for (let i = 1; i <= 4; i++) {
            const r = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '0000', doel: 'sessie' }, s.g.nu);
            expect(r).toMatchObject({ ok: false, code: 'inlogcode_onjuist', details: { pogingen_over: 5 - i } });
        }
        const vijfde = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '0000', doel: 'sessie' }, s.g.nu);
        expect(vijfde).toMatchObject({ ok: false, code: 'medewerker_geblokkeerd' });
        const goed = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'sessie' }, s.g.nu);
        expect(goed).toMatchObject({ ok: false, code: 'medewerker_geblokkeerd' });
        /* Na 5 minuten weer. */
        s.g.nu = new Date(s.g.nu.getTime() + 5 * 60_000 + 1000);
        const later = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'sessie' }, s.g.nu);
        expect(later.ok).toBe(true);
    });

    it('geen rol, onbekend of andere organisatie: geen_recht; geen code: inlogcode_onjuist met reden', async () => {
        const s = store();
        expect(await inloggen(s, ctx, { medewerker_id: GEEN_ROL, inlogcode: '1234', doel: 'sessie' }, s.g.nu)).toMatchObject({ ok: false, code: 'geen_recht' });
        expect(await inloggen(s, ctx, { medewerker_id: VREEMD, inlogcode: '1234', doel: 'sessie' }, s.g.nu)).toMatchObject({ ok: false, code: 'geen_recht' });
        expect(await inloggen(s, ctx, { medewerker_id: '10000000-0000-4000-8000-0000000000ff', inlogcode: '1234', doel: 'sessie' }, s.g.nu)).toMatchObject({ ok: false, code: 'geen_recht' });
        expect(await inloggen(s, ctx, { medewerker_id: ZONDER_CODE, inlogcode: '1234', doel: 'sessie' }, s.g.nu)).toMatchObject({ ok: false, code: 'inlogcode_onjuist', details: { reden: 'geen_code' } });
        expect(s.g.sessies).toHaveLength(0);
    });
});

describe('eigenaarcode voor verkopen boven vrij', () => {
    it('eigenaar: token van 60 s, goedkeuring_id = de sessie', async () => {
        const s = store();
        const r = await inloggen(s, ctx, { medewerker_id: EIG, inlogcode: '999999', doel: 'vrij_overschrijden' }, s.g.nu);
        if (!r.ok || r.doel !== 'vrij_overschrijden') throw new Error('verwacht goedkeuring');
        expect(new Date(r.antwoord.geldig_tot).getTime() - s.g.nu.getTime()).toBe(60_000);
        expect(s.g.sessies[0]).toMatchObject({ id: r.antwoord.goedkeuring_id, doel: 'vrij_overschrijden', rol: 'eigenaar' });
        expect(r.antwoord.eigenaar_token).toMatch(/^tbs_/);
    });

    it('foute code: eigenaarcode_onjuist; een medewerker met een goede code: geen_recht', async () => {
        const s = store();
        expect(await inloggen(s, ctx, { medewerker_id: EIG, inlogcode: '123456', doel: 'vrij_overschrijden' }, s.g.nu)).toMatchObject({ ok: false, code: 'eigenaarcode_onjuist' });
        expect(await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'vrij_overschrijden' }, s.g.nu)).toMatchObject({ ok: false, code: 'geen_recht' });
        expect(s.g.sessies).toHaveLength(0);
    });
});

describe('controleerSessie', () => {
    it('alleen een geldige dienst van dit apparaat', async () => {
        const s = store();
        const r = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'sessie' }, s.g.nu);
        if (!r.ok || r.doel !== 'dienst') throw new Error('verwacht dienst');
        const token = r.antwoord.sessie;
        expect((await controleerSessie(s, ctx, token, s.g.nu))?.medewerker_id).toBe(JAN);
        expect(await controleerSessie(s, { orgId: ORG, apparaatId: T2 }, token, s.g.nu)).toBeNull();
        expect(await controleerSessie(s, { orgId: ANDER, apparaatId: T1 }, token, s.g.nu)).toBeNull();
        expect(await controleerSessie(s, ctx, 'onzin', s.g.nu)).toBeNull();
        expect(await controleerSessie(s, ctx, null, s.g.nu)).toBeNull();
        expect(await controleerSessie(s, ctx, token, new Date(s.g.nu.getTime() + 13 * 3_600_000))).toBeNull();
        s.g.sessies[0]!.beeindigd_at = s.g.nu.toISOString();
        expect(await controleerSessie(s, ctx, token, s.g.nu)).toBeNull();
    });

    it('een eigenaartoken is geen dienst', async () => {
        const s = store();
        const r = await inloggen(s, ctx, { medewerker_id: EIG, inlogcode: '999999', doel: 'vrij_overschrijden' }, s.g.nu);
        if (!r.ok || r.doel !== 'vrij_overschrijden') throw new Error('verwacht goedkeuring');
        expect(await controleerSessie(s, ctx, r.antwoord.eigenaar_token, s.g.nu)).toBeNull();
    });

    it('een dienst stopt als de rol weg is of de persoon niet meer actief is (review M2 K7)', async () => {
        for (const verander of [(m: Medewerker) => { m.toonbank_rol = null; }, (m: Medewerker) => { m.actief = false; }]) {
            const s = store();
            const r = await inloggen(s, ctx, { medewerker_id: JAN, inlogcode: '1234', doel: 'sessie' }, s.g.nu);
            if (!r.ok || r.doel !== 'dienst') throw new Error('verwacht dienst');
            expect((await controleerSessie(s, ctx, r.antwoord.sessie, s.g.nu))?.medewerker_id).toBe(JAN);
            verander(s.g.medewerkers.find((m) => m.id === JAN)!);
            expect(await controleerSessie(s, ctx, r.antwoord.sessie, s.g.nu)).toBeNull();
        }
    });
});
