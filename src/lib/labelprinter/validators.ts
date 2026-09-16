/**
 * Validators voor /api/labels/*. Zelfde vorm als src/lib/prep/validators.ts:
 * `{ ok: true, data } | { ok: false, error }`, geen Zod.
 */

import type { PrintJobStatus, TransportSoort } from './types';
import { MAX_LOSSE_LABELS } from './render';

export type ValidatorResult<T> = { ok: true; data: T } | { ok: false; error: string };

const TRANSPORTS: readonly TransportSoort[] = ['browser_print', 'web_bluetooth', 'mock'];
const EINDSTATUSSEN: readonly PrintJobStatus[] = ['sent', 'success', 'failed', 'cancelled', 'connecting', 'preparing'];

export function isUuid(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function isIsoDatum(v: unknown): v is string {
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function tekst(v: unknown, max: number): string | null {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length === 0 || t.length > max ? null : t;
}

function optioneleTekst(v: unknown, max: number): string | null | undefined {
    if (v == null || v === '') return null;
    const t = tekst(v, max);
    return t === null ? undefined : t;
}

/* ─── printers ───────────────────────────────────────────────── */

export interface PrinterInput {
    naam: string;
    transport: TransportSoort;
    device_uid: string | null;
    model: string | null;
    dpi: 203 | 300;
    label_breedte_mm: number;
    label_hoogte_mm: number;
    actief: boolean;
}

export function validatePrinter(body: unknown, partieel = false): ValidatorResult<Partial<PrinterInput>> {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    const uit: Partial<PrinterInput> = {};

    if (b.naam !== undefined || !partieel) {
        const naam = tekst(b.naam, 80);
        if (!naam) return { ok: false, error: 'Naam is verplicht (max 80 tekens)' };
        uit.naam = naam;
    }
    if (b.transport !== undefined || !partieel) {
        const t = b.transport ?? 'browser_print';
        if (!TRANSPORTS.includes(t as TransportSoort)) return { ok: false, error: 'Onbekend transport' };
        uit.transport = t as TransportSoort;
    }
    if (b.device_uid !== undefined) {
        const d = optioneleTekst(b.device_uid, 200);
        if (d === undefined) return { ok: false, error: 'device_uid ongeldig' };
        uit.device_uid = d;
    }
    if (b.model !== undefined) {
        const m = optioneleTekst(b.model, 80);
        if (m === undefined) return { ok: false, error: 'model ongeldig' };
        uit.model = m;
    }
    if (b.dpi !== undefined || !partieel) {
        const dpi = b.dpi ?? 203;
        if (dpi !== 203 && dpi !== 300) return { ok: false, error: 'dpi moet 203 of 300 zijn' };
        uit.dpi = dpi;
    }
    if (b.label_breedte_mm !== undefined || !partieel) {
        const w = Number(b.label_breedte_mm ?? 60);
        if (!Number.isFinite(w) || w < 20 || w > 120) return { ok: false, error: 'Labelbreedte moet tussen 20 en 120 mm liggen' };
        uit.label_breedte_mm = Math.round(w * 10) / 10;
    }
    if (b.label_hoogte_mm !== undefined || !partieel) {
        const h = Number(b.label_hoogte_mm ?? 40);
        if (!Number.isFinite(h) || h < 10 || h > 300) return { ok: false, error: 'Labelhoogte moet tussen 10 en 300 mm liggen' };
        uit.label_hoogte_mm = Math.round(h * 10) / 10;
    }
    if (b.actief !== undefined) {
        if (typeof b.actief !== 'boolean') return { ok: false, error: 'actief moet true/false zijn' };
        uit.actief = b.actief;
    }
    return { ok: true, data: uit };
}

/* ─── jobs (aanmaken) ─────────────────────────────────────────── */

export type PrintJobVerzoek =
    | { soort: 'testlabel'; printerId: string }
    | { soort: 'los_label'; printerId: string; naam: string; datum: string; tht: string | null; notitie: string | null; aantal: number }
    | { soort: 'partij_labels'; printerId: string; partijId: string; eenheidIds: string[] | null }
    | { soort: 'herprint'; printerId: string; eenheidIds: string[] };

export function validatePrintJob(body: unknown): ValidatorResult<PrintJobVerzoek> {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!isUuid(b.printerId)) return { ok: false, error: 'printerId (uuid) is verplicht' };
    const printerId = b.printerId;

    switch (b.soort) {
        case 'testlabel':
            return { ok: true, data: { soort: 'testlabel', printerId } };

        case 'los_label': {
            const naam = tekst(b.naam, 60);
            if (!naam) return { ok: false, error: 'Naam is verplicht (max 60 tekens)' };
            const datum: string | null = b.datum == null || b.datum === '' ? null : (isIsoDatum(b.datum) ? b.datum : '');
            if (datum === '') return { ok: false, error: 'datum moet JJJJ-MM-DD zijn' };
            const tht: string | null = b.tht == null || b.tht === '' ? null : (isIsoDatum(b.tht) ? b.tht : '');
            if (tht === '') return { ok: false, error: 'tht moet JJJJ-MM-DD zijn' };
            const notitie = optioneleTekst(b.notitie, 120);
            if (notitie === undefined) return { ok: false, error: 'Notitie te lang (max 120)' };
            const aantalRuw = b.aantal ?? 1;
            if (typeof aantalRuw !== 'number' || !Number.isInteger(aantalRuw) || aantalRuw < 1 || aantalRuw > MAX_LOSSE_LABELS) {
                return { ok: false, error: `Aantal moet tussen 1 en ${MAX_LOSSE_LABELS} liggen` };
            }
            return {
                ok: true,
                data: { soort: 'los_label', printerId, naam, datum: datum ?? vandaagIso(), tht, notitie, aantal: aantalRuw },
            };
        }

        case 'partij_labels': {
            if (!isUuid(b.partijId)) return { ok: false, error: 'partijId (uuid) is verplicht' };
            /* Optioneel: alleen deze eenheden ("print ontbrekende N"). */
            let eenheidIds: string[] | null = null;
            if (Array.isArray(b.eenheidIds) && b.eenheidIds.length > 0) {
                if (b.eenheidIds.length > 500 || !b.eenheidIds.every(isUuid)) return { ok: false, error: 'eenheidIds moeten uuid’s zijn' };
                eenheidIds = b.eenheidIds as string[];
            }
            return { ok: true, data: { soort: 'partij_labels', printerId, partijId: b.partijId, eenheidIds } };
        }

        case 'herprint': {
            const ids = Array.isArray(b.eenheidIds) ? b.eenheidIds : [];
            if (ids.length === 0 || ids.length > 200 || !ids.every(isUuid)) {
                return { ok: false, error: 'eenheidIds: 1–200 uuid’s verplicht' };
            }
            return { ok: true, data: { soort: 'herprint', printerId, eenheidIds: ids as string[] } };
        }

        default:
            return { ok: false, error: 'Onbekende soort' };
    }
}

/* ─── jobs (bijwerken) ────────────────────────────────────────── */

export interface PrintJobUpdate {
    status: PrintJobStatus;
    geprintAantal: number | null;
    geprintEenheidIds: string[];
    onzekerEenheidIds: string[];
    foutmelding: string | null;
    printerStatus: Record<string, unknown> | null;
    deviceNaam: string | null;
}

export function validatePrintJobUpdate(body: unknown): ValidatorResult<PrintJobUpdate> {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (!EINDSTATUSSEN.includes(b.status as PrintJobStatus)) return { ok: false, error: 'Ongeldige status' };

    const geprint = Array.isArray(b.geprintEenheidIds) ? b.geprintEenheidIds : [];
    const onzeker = Array.isArray(b.onzekerEenheidIds) ? b.onzekerEenheidIds : [];
    if (!geprint.every(isUuid) || !onzeker.every(isUuid)) return { ok: false, error: 'Eenheid-ids moeten uuid’s zijn' };

    let geprintAantal: number | null = null;
    if (b.geprintAantal != null) {
        if (typeof b.geprintAantal !== 'number' || !Number.isInteger(b.geprintAantal) || b.geprintAantal < 0) {
            return { ok: false, error: 'geprintAantal ongeldig' };
        }
        geprintAantal = b.geprintAantal;
    }
    const foutmelding = optioneleTekst(b.foutmelding, 500);
    if (foutmelding === undefined) return { ok: false, error: 'Foutmelding te lang' };
    const deviceNaam = optioneleTekst(b.deviceNaam, 120);
    if (deviceNaam === undefined) return { ok: false, error: 'deviceNaam te lang' };
    const printerStatus = typeof b.printerStatus === 'object' && b.printerStatus !== null
        ? (b.printerStatus as Record<string, unknown>) : null;

    return {
        ok: true,
        data: {
            status: b.status as PrintJobStatus, geprintAantal,
            geprintEenheidIds: geprint as string[], onzekerEenheidIds: onzeker as string[],
            foutmelding, printerStatus, deviceNaam,
        },
    };
}

export function vandaagIso(): string {
    /* Lokale datum van de server in Europe/Amsterdam — een label van 23:30
       moet de datum van vandaag dragen, niet die van UTC. */
    const nu = new Date();
    const delen = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
    return delen;
}
