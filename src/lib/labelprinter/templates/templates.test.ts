import { describe, expect, it } from 'vitest';
import { STANDAARD_LABEL } from '../types';
import { productielabel, unitTekst, type ProductielabelData } from './productielabel';
import { loslabel } from './loslabel';
import { testlabel } from './testlabel';
import { datumKort, pastOp, schaalVoor } from './index';
import { renderVerzoek } from '../render';

const PP: ProductielabelData = {
    naam: 'Pulled pork',
    inhoud: '1,00 kg',
    productiedatum: '2026-09-16',
    tht: '2026-12-16',
    partijnummer: 'PP-20260916-01',
    unitNr: 7,
    unitTotaal: 12,
    bewaaradvies: '≤ -18 °C',
    allergenen: ['gluten', 'soja'],
    qrUrl: 'https://app.example.nl/scan/8f3a1c2e-1111-2222-3333-444455556666',
    eenheidCode: 'PP-20260916-01-007',
};

describe('productielabel', () => {
    it('zet alles uit de partij op het label, niets verzonnen', () => {
        const { zpl, waarschuwingen } = productielabel.render(PP, STANDAARD_LABEL);
        expect(waarschuwingen).toEqual([]);
        expect(zpl).toContain('PULLED PORK');
        expect(zpl).toContain('1,00 kg');
        expect(zpl).toContain('Gemaakt 16-09-2026');
        expect(zpl).toContain('THT 16-12-2026');
        expect(zpl).toContain('Batch PP-20260916-01 · 07/12');
        expect(zpl).toContain('Bewaren: max. -18 °C');
        expect(zpl).toContain('Allergenen: gluten, soja');
        expect(zpl).toContain('^BQN,2,');
        expect(zpl).toContain(PP.qrUrl);
        expect(zpl.startsWith('^XA^CI28^PW480^LL320')).toBe(true);
    });
    it('laat regels weg die er niet zijn', () => {
        const { zpl } = productielabel.render({ ...PP, tht: null, bewaaradvies: null, allergenen: [] }, STANDAARD_LABEL);
        expect(zpl).not.toContain('THT');
        expect(zpl).not.toContain('Bewaren');
        expect(zpl).not.toContain('Allergenen');
    });
    it('unit-nummers krijgen evenveel cijfers als het totaal', () => {
        expect(unitTekst(7, 12)).toBe('07/12');
        expect(unitTekst(7, 120)).toBe('007/120');
        expect(unitTekst(3, 9)).toBe('3/9');
    });
    it('waarschuwt bij een naam die ook op twee regels niet past, maar print wel', () => {
        const { zpl, waarschuwingen } = productielabel.render({ ...PP, naam: 'Wolfeschlegelsteinhausenbergerdorff-buikspek' }, STANDAARD_LABEL);
        expect(waarschuwingen.some((w) => w.includes('past niet'))).toBe(true);
        expect(zpl).toContain('^XZ');
    });
    it('schaalt mee naar een groter label', () => {
        const groot = productielabel.render(PP, { breedte_mm: 102, hoogte_mm: 76, dpi: 203 });
        expect(groot.zpl).toContain('^PW815^LL607');
        expect(groot.waarschuwingen).toEqual([]);
    });
});

describe('los label en testlabel', () => {
    it('los label: naam, datum, THT en notitie; geen QR', () => {
        const { zpl } = loslabel.render({ naam: 'Suiker', datum: '2026-09-16', tht: '2027-03-01', notitie: 'doos 2', wie: 'Mathijs' }, STANDAARD_LABEL);
        expect(zpl).toContain('Suiker');
        expect(zpl).toContain('16-09-2026');
        expect(zpl).toContain('THT 01-03-2027');
        expect(zpl).toContain('doos 2');
        expect(zpl).toContain('Mathijs');
        expect(zpl).not.toContain('^BQ');
    });
    it('testlabel: kader op de rand en accenten', () => {
        const { zpl } = testlabel.render({ printerNaam: 'Keuken', moment: '16-09-2026 14:03' }, STANDAARD_LABEL);
        expect(zpl).toContain('^GB472,312,2');
        expect(zpl).toContain('Renée · Björn · Ø');
        expect(zpl).toContain('60 × 40 mm · 203 dpi');
    });
});

describe('render-verzoek', () => {
    it('los label × 3 = drie identieke blokken zonder eenheid', () => {
        const r = renderVerzoek({ soort: 'los_label', aantal: 3, data: { naam: 'Suiker', datum: '2026-09-16', tht: null, notitie: null, wie: null } }, STANDAARD_LABEL);
        expect(r.labels).toHaveLength(3);
        expect(r.labels.every((l) => l.eenheidId === null)).toBe(true);
        expect(r.templateCode).toBe('los');
        expect(r.labelData).toMatchObject({ naam: 'Suiker', aantal: 3 });
    });
    it('los label is begrensd op 50', () => {
        const r = renderVerzoek({ soort: 'los_label', aantal: 999, data: { naam: 'x', datum: '2026-09-16', tht: null, notitie: null, wie: null } }, STANDAARD_LABEL);
        expect(r.labels).toHaveLength(50);
    });
    it('partij-labels: één blok per eenheid, elk met eigen id en unit', () => {
        const r = renderVerzoek({
            soort: 'partij_labels',
            labels: [1, 2, 3].map((n) => ({ eenheidId: `id-${n}`, data: { ...PP, unitNr: n, unitTotaal: 3, eenheidCode: `PP-${n}` } })),
        }, STANDAARD_LABEL);
        expect(r.labels.map((l) => l.eenheidId)).toEqual(['id-1', 'id-2', 'id-3']);
        expect(r.labels[1].zpl).toContain('2/3');
        expect(r.templateCode).toBe('productie');
        expect(r.templateVersie).toBe(1);
    });
});

describe('hulpjes', () => {
    it('datumKort', () => {
        expect(datumKort('2026-09-16')).toBe('16-09-2026');
        expect(datumKort('2026-09-16T10:00:00Z')).toBe('16-09-2026');
        expect(datumKort(null)).toBeNull();
    });
    it('pastOp respecteert het minimum van een template', () => {
        expect(pastOp(productielabel, STANDAARD_LABEL)).toBe(true);
        expect(pastOp(productielabel, { breedte_mm: 40, hoogte_mm: 20, dpi: 203 })).toBe(false);
    });
    it('schaal is 1 op het standaardlabel', () => {
        const s = schaalVoor(STANDAARD_LABEL);
        expect(s.s).toBe(1);
        expect(s.x(14)).toBe(14);
    });
});
