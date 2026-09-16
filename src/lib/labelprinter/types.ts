/**
 * Labelprinter — de gedeelde taal van de printerlaag.
 *
 * De rest van de app hoeft alleen dit te kennen: een label heeft data, een
 * template maakt daar ZPL van, een transport brengt ZPL naar een printer, en
 * een printjob is het bewijs. Bluetooth, poorten en Zebra-commando's blijven
 * binnen `src/lib/labelprinter/`.
 *
 * Plan: ~/.claude/plans/glistening-brewing-heron.md (fase 0).
 */

import type { LabelFormaat } from '../printBoxLabel';

export type { LabelFormaat };

/** 60 × 40 mm op 203 dpi — de rol die nu in de ZQ630 Plus zit. */
export const STANDAARD_LABEL: LabelFormaat = { breedte_mm: 60, hoogte_mm: 40, dpi: 203 };

export type TransportSoort = 'browser_print' | 'web_bluetooth' | 'mock';

export type PrintJobSoort =
    | 'partij_labels'
    | 'herprint'
    | 'los_label'
    | 'testlabel'
    | 'doos_sticker'
    | 'haccp_sticker';

export type PrintJobStatus =
    | 'pending'
    | 'preparing'
    | 'connecting'
    | 'sent'
    | 'success'
    | 'failed'
    | 'cancelled';

/** Een rij uit `label_printers`, zoals de app hem gebruikt. */
export interface PrinterConfig {
    id: string;
    naam: string;
    transport: TransportSoort;
    device_uid: string | null;
    model: string | null;
    dpi: number;
    label_breedte_mm: number;
    label_hoogte_mm: number;
    actief: boolean;
}

export function formaatVan(printer: Pick<PrinterConfig, 'dpi' | 'label_breedte_mm' | 'label_hoogte_mm'>): LabelFormaat {
    return { breedte_mm: Number(printer.label_breedte_mm), hoogte_mm: Number(printer.label_hoogte_mm), dpi: Number(printer.dpi) };
}

/** Wat een transport bij het zoeken teruggeeft. */
export interface GevondenPrinter {
    uid: string;
    naam: string;
    verbinding: string;      // 'bluetooth' | 'network' | 'usb' | ...
    fabrikant?: string;
    model?: string;
}

/**
 * Printerstatus, vertaald uit `~HQES`. `online=false` betekent: niet bereikt.
 * `ruw` is het letterlijke antwoord, voor als de vertaling tekortschiet.
 */
export interface PrinterStatus {
    online: boolean;
    papierOp: boolean;
    klepOpen: boolean;
    pauze: boolean;
    fout: boolean;
    waarschuwing: boolean;
    omschrijving: string;
    ruw?: string;
}

export const STATUS_OFFLINE: PrinterStatus = {
    online: false, papierOp: false, klepOpen: false, pauze: false,
    fout: true, waarschuwing: false, omschrijving: 'Printer niet bereikt',
};

/** Één label zoals het naar de printer gaat; `eenheidId` is er alleen bij partij-labels. */
export interface LabelBlok {
    eenheidId: string | null;
    zpl: string;
}

export interface PrinterTransport {
    readonly soort: TransportSoort;
    /** Is de weg naar dit transport er überhaupt (app draait, API bestaat)? */
    beschikbaar(): Promise<boolean>;
    zoek(): Promise<GevondenPrinter[]>;
    verbind(printer: PrinterConfig): Promise<void>;
    status(): Promise<PrinterStatus>;
    stuur(zpl: string): Promise<void>;
    sluit(): Promise<void>;
}

/** Fout uit de printerlaag met een code die de UI kan vertalen. */
export type PrinterFoutCode =
    | 'app_niet_actief'
    | 'geen_printer'
    | 'niet_verbonden'
    | 'papier_op'
    | 'klep_open'
    | 'printer_fout'
    | 'timeout'
    | 'geweigerd'
    | 'onbekend';

export class PrinterFout extends Error {
    readonly code: PrinterFoutCode;
    constructor(code: PrinterFoutCode, bericht: string) {
        super(bericht);
        this.name = 'PrinterFout';
        this.code = code;
    }
}

export const FOUT_TEKST: Record<PrinterFoutCode, string> = {
    app_niet_actief: 'De Zebra Browser Print-app draait niet op dit apparaat.',
    geen_printer: 'Geen printer gekoppeld of gevonden.',
    niet_verbonden: 'De printer is niet verbonden (Bluetooth uit, printer uit of buiten bereik).',
    papier_op: 'Labels op — vul de rol bij.',
    klep_open: 'De klep van de printer staat open.',
    printer_fout: 'De printer meldt een fout.',
    timeout: 'De printer reageert niet.',
    geweigerd: 'Deze website mag de printer niet gebruiken — sta de host toe in de Browser Print-app.',
    onbekend: 'Printen is mislukt.',
};

/** Uitkomst van één printjob-uitvoering (zie service.ts). */
export interface PrintUitkomst {
    status: 'success' | 'failed';
    geprintAantal: number;
    geprintEenheidIds: string[];
    onzekerEenheidIds: string[];
    foutmelding: string | null;
    foutCode: PrinterFoutCode | null;
    printerStatus: PrinterStatus | null;
}
