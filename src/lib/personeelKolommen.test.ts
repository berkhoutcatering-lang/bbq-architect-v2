import { describe, expect, it } from 'vitest';
import type { Personeel } from '@/types';
import { PERSONEEL_BEWERKBAAR, PERSONEEL_KOLOMMEN, personeelWijzigingen } from './personeelKolommen';

const rij: Personeel = {
    id: '11111111-1111-4111-8111-111111111111',
    organization_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    naam: 'Sanne',
    email: null,
    telefoon: '0612345678',
    functie: 'Crew',
    uurtarief: 24,
    contract_type: 'oproep',
    actief: true,
    notitie: null,
    kds_pin_lockout_until: '2026-10-05T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
};

describe('personeelWijzigingen (hercontrole M2, N4a)', () => {
    it('stuurt alleen wat in het scherm veranderde, nooit de rest van de rij', () => {
        // Het formulier is een kopie van de rij van toen het scherm openging, met één wijziging.
        const formulier = { ...rij, uurtarief: 26 };
        expect(personeelWijzigingen(rij, formulier)).toEqual({ uurtarief: 26 });
    });

    it('stuurt een oude blokkade, user_id, id of organisatie nooit mee', () => {
        // Intussen zette een tablet een nieuwe blokkade; het formulier heeft nog de oude.
        const nu = { ...rij, kds_pin_lockout_until: '2026-10-05T12:00:00Z' };
        const formulier = { ...rij, naam: 'Sanne de Vries', user_id: null, kds_pin_hash: 'x', organization_id: 'ander' } as Partial<Personeel>;
        const uit = personeelWijzigingen(nu, formulier);
        expect(uit).toEqual({ naam: 'Sanne de Vries' });
        for (const veld of ['id', 'organization_id', 'user_id', 'kds_pin_hash', 'kds_pin_lockout_until', 'created_at', 'toonbank_rol']) {
            expect(uit).not.toHaveProperty(veld);
        }
    });

    it('niets veranderd = niets te bewaren; leeg en null zijn gelijk', () => {
        expect(personeelWijzigingen(rij, { ...rij })).toEqual({});
        expect(personeelWijzigingen(rij, { ...rij, email: '', notitie: '' })).toEqual({});
    });

    it('een veld leegmaken, op inactief zetten en andere functie tellen wel', () => {
        expect(personeelWijzigingen(rij, { ...rij, telefoon: '', actief: false, functie: 'Grill' })).toEqual({ telefoon: '', actief: false, functie: 'Grill' });
    });

    it('een veld dat niet in het formulier staat, blijft buiten beschouwing', () => {
        expect(personeelWijzigingen(rij, { naam: 'Sanne' })).toEqual({});
    });

    it('de bewerkbare velden zijn geen Toonbank-kolommen', () => {
        for (const veld of ['toonbank_rol', 'kds_pin_hash', 'kds_pin_lockout_until', 'user_id', 'organization_id']) {
            expect(PERSONEEL_BEWERKBAAR as readonly string[]).not.toContain(veld);
        }
    });

    it('usePersoneel leest geen Toonbank-kolommen meer (dus ook niet in het formulier)', () => {
        const kolommen = PERSONEEL_KOLOMMEN.split(',').map((k) => k.trim());
        expect(kolommen).not.toContain('kds_pin_hash');
        expect(kolommen).not.toContain('kds_pin_lockout_until');
        expect(kolommen).not.toContain('toonbank_rol');
        expect(kolommen).not.toContain('*');
        for (const veld of PERSONEEL_BEWERKBAAR) expect(kolommen).toContain(veld);
    });
});
