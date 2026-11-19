import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { centenUitInvoer, KAS_MAX_CENTS, KasRegelSchema } from './kasInvoer';

describe('centenUitInvoer', () => {
    it('leest bedragen in Nederlandse notatie', () => {
        expect(centenUitInvoer('9')).toBe(900);
        expect(centenUitInvoer('9,5')).toBe(950);
        expect(centenUitInvoer(' € 12,34 ')).toBe(1234);
        expect(centenUitInvoer('1.250,00')).toBe(125000);
        expect(centenUitInvoer('1.250')).toBe(125000);
    });
    it('weigert leeg, nul, negatief, onzin en meer dan twee decimalen', () => {
        for (const t of ['', '0', '0,00', '-3', 'abc', '1,234', '12,3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
    it('gokt niet bij een punt als decimaalteken', () => {
        for (const t of ['9.50', '9.5', '12.3,4']) expect(centenUitInvoer(t)).toBeNull();
    });
});

describe('KasRegelSchema', () => {
    const goed = { datum: '2026-11-27', richting: 'uit', bedrag: '9,00', reden: 'uitgave', omschrijving: 'Schoonmaakmiddel', moment: 'tijdens' };
    it('keurt een gewone regel goed', () => {
        expect(KasRegelSchema.safeParse(goed).success).toBe(true);
    });
    it('weigert een kapotte datum, een leeg bedrag en een te korte omschrijving', () => {
        expect(KasRegelSchema.safeParse({ ...goed, datum: '27-11-2026' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, bedrag: '0' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, omschrijving: 'x' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, reden: 'anders' }).success).toBe(false);
        expect(KasRegelSchema.safeParse({ ...goed, moment: 'later' }).success).toBe(false);
    });
    it('weigert een bedrag boven de € 100.000: dat is een tikfout, geen kasregel', () => {
        expect(KAS_MAX_CENTS).toBe(10_000_000);
        expect(KasRegelSchema.safeParse({ ...goed, bedrag: '100.000' }).success).toBe(true);
        const uit = KasRegelSchema.safeParse({ ...goed, bedrag: '100.000,01' });
        expect(uit.success).toBe(false);
        expect(uit.success === false && uit.error.issues[0].message).toBe('Een kasregel kan hoogstens € 100.000 zijn.');
        expect(KasRegelSchema.safeParse({ ...goed, bedrag: '99.999.999.999' }).success).toBe(false);
    });
});

/* De tabel bewaakt zelf wat de app ook bewaakt: iemand die de app omzeilt komt er niet langs. */
describe('de migratie winkel_kas_mutaties', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261116120000_winkel_kas_mutaties.sql'), 'utf8');
    const beleid = (naam: string) => sql.slice(sql.indexOf(`CREATE POLICY ${naam}`), sql.indexOf(';', sql.indexOf(`CREATE POLICY ${naam}`)));

    it('kent dezelfde bovengrens als het formulier', () => {
        expect(sql).toContain(`bedrag_cents BETWEEN -${KAS_MAX_CENTS} AND ${KAS_MAX_CENTS}`);
    });
    it('laat alleen een regel toe op je eigen naam', () => {
        expect(beleid('winkel_kas_mutaties_insert')).toContain('created_by = (SELECT auth.uid())');
    });
    it('houdt een afgesloten maand dicht bij toevoegen en bij weghalen', () => {
        expect(beleid('winkel_kas_mutaties_insert')).toContain('private.winkel_kas_maand_open(organization_id, datum)');
        expect(beleid('winkel_kas_mutaties_delete')).toContain('private.winkel_kas_maand_open(organization_id, datum)');
    });
});
