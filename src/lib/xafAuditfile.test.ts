import { describe, it, expect } from 'vitest';
import { buildXafAuditfile } from './xafAuditfile';

const company = { name: 'Hop & Bites', kvk: '12345678', btw: 'NL001234567B01' };
const createdDate = '2026-07-01';

describe('buildXafAuditfile', () => {
    it('produceert welgevormde XAF 4.0 met juiste namespace', () => {
        const xml = buildXafAuditfile({ company, facturen: [], bonnen: [], year: 2026, createdDate });
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(xml).toContain('xmlns="http://www.auditfiles.nl/XAF/4.0"');
        expect(xml).toContain('<fiscalYear>2026</fiscalYear>');
        expect(xml).toContain('</auditfile>');
    });

    it('verkoopfactuur: debiteur (D) = omzet + BTW (C), sluitend', () => {
        const xml = buildXafAuditfile({
            company,
            facturen: [{ nummer: 'F2026-012', client_naam: 'Bussemaker', datum: '2026-04-13', status: 'betaald', items: [{ qty: 22, prijs: 32.11, btw: 9 }] }],
            bonnen: [],
            year: 2026,
            createdDate,
        });
        // net 706.42, btw 63.58, totaal 770.00
        expect(xml).toContain('<totalDebit>770.00</totalDebit>');
        expect(xml).toContain('<totalCredit>770.00</totalCredit>');
        expect(xml).toContain('<jrnID>VK</jrnID>');
        expect(xml).toContain('<docRef>F2026-012</docRef>');
    });

    it('inkoopbon: kosten + voorbelasting (D) = crediteur (C), sluitend', () => {
        const xml = buildXafAuditfile({
            company,
            facturen: [],
            bonnen: [{ id: 29, datum: '2026-06-24', winkel: 'Sligro', netto_bedrag: 174.57, btw_laag_bedrag: 15.71, btw_hoog_bedrag: 0, rgs_code: 'WKprIng', rgs_category_label: 'Inkoop vlees' }],
            year: 2026,
            createdDate,
        });
        // netto 174.57 + btw 15.71 = 190.28
        expect(xml).toContain('<totalDebit>190.28</totalDebit>');
        expect(xml).toContain('<totalCredit>190.28</totalCredit>');
        expect(xml).toContain('<jrnID>IN</jrnID>');
        expect(xml).toContain('<RGScode>WKprIng</RGScode>');
    });

    it('totalDebit == totalCredit over gemengde set', () => {
        const xml = buildXafAuditfile({
            company,
            facturen: [
                { nummer: 'F1', client_naam: 'A', datum: '2026-04-13', status: 'betaald', items: [{ qty: 10, prijs: 100, btw: 9 }] },
                { nummer: 'F2', client_naam: 'B', datum: '2026-05-01', status: 'verzonden', items: [{ qty: 2, prijs: 50, btw: 21 }] },
                { nummer: 'F3', client_naam: 'C', datum: '2026-05-02', status: 'concept', items: [{ qty: 9, prijs: 99, btw: 9 }] }, // concept telt niet mee
            ],
            bonnen: [
                { id: 1, datum: '2026-04-02', winkel: 'X', netto_bedrag: 300, btw_laag_bedrag: 27, rgs_code: 'WKprIng', rgs_category_label: 'Vlees' },
                { id: 2, datum: '2026-04-20', winkel: 'Y', netto_bedrag: 100, btw_hoog_bedrag: 21, rgs_code: 'WBedBrand', rgs_category_label: 'Brandstof' },
            ],
            year: 2026,
            createdDate,
        });
        const d = Number(/<totalDebit>([\d.]+)<\/totalDebit>/.exec(xml)![1]);
        const c = Number(/<totalCredit>([\d.]+)<\/totalCredit>/.exec(xml)![1]);
        expect(d).toBeCloseTo(c, 2);
        expect(xml).not.toContain('<docRef>F3</docRef>'); // concept uitgesloten
    });

    it('filtert op boekjaar', () => {
        const xml = buildXafAuditfile({
            company,
            facturen: [{ nummer: 'OLD', client_naam: 'A', datum: '2025-12-31', status: 'betaald', items: [{ qty: 1, prijs: 500, btw: 9 }] }],
            bonnen: [],
            year: 2026,
            createdDate,
        });
        expect(xml).toContain('<totalDebit>0.00</totalDebit>');
        expect(xml).not.toContain('OLD');
    });
});
