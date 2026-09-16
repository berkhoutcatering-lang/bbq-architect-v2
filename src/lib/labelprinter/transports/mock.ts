/**
 * MockTransport — de printer die er niet is.
 *
 * Bewaart alles wat "geprint" wordt, en kan op commando falen: na N labels,
 * met papier op, met klep open, of helemaal onbereikbaar. Daarmee zijn de
 * scenario's uit het plan (print mislukt na 7 van 12) zonder Zebra te
 * testen, in vitest én op /dev/labels.
 */

import {
    PrinterFout, STATUS_OFFLINE,
    type GevondenPrinter, type PrinterConfig, type PrinterStatus, type PrinterTransport,
} from '../types';

export interface MockOpties {
    /** Na zoveel verstuurde labels (^XA-blokken) meldt de status "papier op". */
    papierOpNa?: number | null;
    /** Alsof de app niet draait. */
    onbereikbaar?: boolean;
    /** Status bij aanvang. */
    beginStatus?: Partial<PrinterStatus>;
    /** Kunstmatige vertraging per stuur() in ms (voor de UI-voortgang). */
    vertragingMs?: number;
}

const GEREED: PrinterStatus = {
    online: true, papierOp: false, klepOpen: false, pauze: false,
    fout: false, waarschuwing: false, omschrijving: 'Gereed (mock)',
};

export class MockTransport implements PrinterTransport {
    readonly soort = 'mock' as const;
    readonly verstuurd: string[] = [];
    readonly statusAanroepen: number[] = [];
    labelsGeteld = 0;
    verbonden: PrinterConfig | null = null;
    private opties: MockOpties;

    constructor(opties: MockOpties = {}) {
        this.opties = opties;
    }

    async beschikbaar(): Promise<boolean> {
        return !this.opties.onbereikbaar;
    }

    async zoek(): Promise<GevondenPrinter[]> {
        if (this.opties.onbereikbaar) return [];
        return [{ uid: 'mock-zq630', naam: 'Mock ZQ630 Plus', verbinding: 'mock', fabrikant: 'Zebra', model: 'ZQ630 Plus' }];
    }

    async verbind(printer: PrinterConfig): Promise<void> {
        if (this.opties.onbereikbaar) throw new PrinterFout('app_niet_actief', 'Mock: onbereikbaar');
        this.verbonden = printer;
    }

    async status(): Promise<PrinterStatus> {
        this.statusAanroepen.push(this.labelsGeteld);
        if (this.opties.onbereikbaar) return STATUS_OFFLINE;
        const basis: PrinterStatus = { ...GEREED, ...(this.opties.beginStatus ?? {}) };
        const na = this.opties.papierOpNa;
        if (na != null && this.labelsGeteld >= na) {
            return { ...basis, papierOp: true, fout: true, omschrijving: 'Labels op (mock)' };
        }
        if (basis.papierOp || basis.klepOpen) return { ...basis, fout: true };
        return basis;
    }

    async stuur(zpl: string): Promise<void> {
        if (this.opties.onbereikbaar) throw new PrinterFout('app_niet_actief', 'Mock: onbereikbaar');
        if (!this.verbonden) throw new PrinterFout('niet_verbonden', 'Mock: niet verbonden');
        if (this.opties.vertragingMs) await new Promise((r) => setTimeout(r, this.opties.vertragingMs));
        this.verstuurd.push(zpl);
        /* Tel labels zoals de printer ze zou tellen: per ^XA-blok. Als het
           papier onderweg opraakt, printen de labels na de grens niet meer. */
        const blokken = (zpl.match(/\^XA/g) ?? []).length;
        const na = this.opties.papierOpNa;
        if (na != null) {
            this.labelsGeteld = Math.min(na, this.labelsGeteld + blokken);
        } else {
            this.labelsGeteld += blokken;
        }
    }

    async sluit(): Promise<void> {
        this.verbonden = null;
    }

    /** Voor tests en de dev-pagina: alle ZPL als één tekst. */
    allesAlsTekst(): string {
        return this.verstuurd.join('\n\n');
    }
}
