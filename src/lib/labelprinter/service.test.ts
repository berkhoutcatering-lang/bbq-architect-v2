import { describe, expect, it } from 'vitest';
import { voerPrintJobUit } from './service';
import { MockTransport } from './transports/mock';
import { label } from './zpl';
import type { LabelBlok, PrinterConfig } from './types';

const PRINTER: PrinterConfig = {
    id: 'p1', naam: 'Mock', transport: 'mock', device_uid: 'mock-zq630', model: null,
    dpi: 203, label_breedte_mm: 60, label_hoogte_mm: 40, actief: true,
};

function labels(n: number): LabelBlok[] {
    return Array.from({ length: n }, (_, i) => ({ eenheidId: `e${i + 1}`, zpl: label({ breedte: 480, hoogte: 320 }, [`^FO1,1^FD${i + 1}^FS`]) }));
}

describe('voerPrintJobUit', () => {
    it('twaalf labels in bundels van vier: drie keer sturen, status vóór en na elke bundel', async () => {
        const t = new MockTransport();
        const u = await voerPrintJobUit(labels(12), t, PRINTER, { bundelGrootte: 4 });
        expect(u.status).toBe('success');
        expect(u.geprintAantal).toBe(12);
        expect(u.geprintEenheidIds).toHaveLength(12);
        expect(u.onzekerEenheidIds).toEqual([]);
        expect(t.verstuurd).toHaveLength(3);
        expect(t.statusAanroepen).toHaveLength(4);
        expect(t.verbonden).toBeNull(); // netjes gesloten
    });

    it('papier op na 7: eerste bundel zeker, tweede onzeker, rest niet verstuurd', async () => {
        const t = new MockTransport({ papierOpNa: 7 });
        const voortgang: number[] = [];
        const u = await voerPrintJobUit(labels(12), t, PRINTER, {
            bundelGrootte: 4, onVoortgang: (i) => voortgang.push(i.verstuurd),
        });
        expect(u.status).toBe('failed');
        expect(u.foutCode).toBe('papier_op');
        expect(u.geprintEenheidIds).toEqual(['e1', 'e2', 'e3', 'e4']);
        expect(u.onzekerEenheidIds).toEqual(['e5', 'e6', 'e7', 'e8']);
        expect(u.geprintAantal).toBe(4);
        expect(t.verstuurd).toHaveLength(2);
        expect(u.foutmelding).toContain('na 4 van 12');
    });

    it('printer al leeg vóór het begin: niets verstuurd, niets geprint', async () => {
        const t = new MockTransport({ beginStatus: { papierOp: true } });
        const u = await voerPrintJobUit(labels(12), t, PRINTER);
        expect(u.status).toBe('failed');
        expect(u.foutCode).toBe('papier_op');
        expect(t.verstuurd).toHaveLength(0);
        expect(u.geprintEenheidIds).toEqual([]);
    });

    it('app niet actief: verbinden faalt met een duidelijke code', async () => {
        const t = new MockTransport({ onbereikbaar: true });
        const u = await voerPrintJobUit(labels(3), t, PRINTER);
        expect(u.status).toBe('failed');
        expect(u.foutCode).toBe('app_niet_actief');
        expect(u.geprintAantal).toBe(0);
    });

    it('zonder statuschecks wordt alles blind verstuurd', async () => {
        const t = new MockTransport();
        const u = await voerPrintJobUit(labels(5), t, PRINTER, { bundelGrootte: 2, statusChecks: false });
        expect(u.status).toBe('success');
        expect(t.statusAanroepen).toHaveLength(0);
        expect(t.verstuurd).toHaveLength(3);
    });

    it('een los label heeft geen eenheid-id en telt alleen mee in het aantal', async () => {
        const t = new MockTransport();
        const los: LabelBlok[] = [{ eenheidId: null, zpl: label({ breedte: 480, hoogte: 320 }, []) }];
        const u = await voerPrintJobUit(los, t, PRINTER);
        expect(u.geprintAantal).toBe(1);
        expect(u.geprintEenheidIds).toEqual([]);
    });
});
