'use client';

/**
 * De browserkant van de printerlaag. Dit is het enige bestand dat schermen
 * importeren: `printLabels(verzoek)` en klaar.
 *
 * Stroom: POST /api/labels/jobs (server rendert ZPL, maakt de job) → hier het
 * transport kiezen en de labels sturen → PATCH /api/labels/jobs/[id] met de
 * uitkomst. De server is de waarheid over wat er geprint is; deze module is
 * de pomp.
 */

import { useCallback, useEffect, useState } from 'react';
import { BrowserPrintTransport } from './transports/browserPrint';
import { MockTransport, type MockOpties } from './transports/mock';
import { voerPrintJobUit, type PrintOpties } from './service';
import {
    FOUT_TEKST, PrinterFout,
    type LabelBlok, type PrinterConfig, type PrinterStatus, type PrinterTransport, type PrintUitkomst, type TransportSoort,
} from './types';

const OPSLAG_SLEUTEL = 'bbq_label_printer_id';

/* ── Werkstation-keuze (per apparaat, in localStorage) ───────────────────── */

export function gekozenPrinterId(): string | null {
    try { return localStorage.getItem(OPSLAG_SLEUTEL); } catch { return null; }
}

export function kiesPrinterVoorDitApparaat(id: string | null): void {
    try {
        if (id) localStorage.setItem(OPSLAG_SLEUTEL, id);
        else localStorage.removeItem(OPSLAG_SLEUTEL);
    } catch { /* privémodus: dan elke keer kiezen */ }
}

/* ── Transport ───────────────────────────────────────────────────────────── */

let mockOpties: MockOpties = {};
/** Alleen voor /dev/labels en tests: laat de mock falen zoals jij wilt. */
export function zetMockOpties(o: MockOpties): void { mockOpties = o; }

export function maakTransport(soort: TransportSoort): PrinterTransport {
    switch (soort) {
        case 'browser_print': return new BrowserPrintTransport();
        case 'mock': return new MockTransport(mockOpties);
        case 'web_bluetooth':
            throw new PrinterFout('onbekend', 'Web Bluetooth-transport is nog niet beschikbaar (fase 5)');
    }
}

/* ── Printers ophalen ────────────────────────────────────────────────────── */

export function usePrinters() {
    const [printers, setPrinters] = useState<PrinterConfig[]>([]);
    const [laden, setLaden] = useState(true);
    const [fout, setFout] = useState<string | null>(null);

    const herlaad = useCallback(async () => {
        setLaden(true);
        setFout(null);
        try {
            const res = await fetch('/api/labels/printers', { cache: 'no-store' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? 'Printers ophalen mislukt');
            setPrinters((json.printers ?? []) as PrinterConfig[]);
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'Printers ophalen mislukt');
        } finally {
            setLaden(false);
        }
    }, []);

    useEffect(() => { void herlaad(); }, [herlaad]);
    return { printers, laden, fout, herlaad };
}

/** De printer voor dit werkstation: de gekozen, anders de enige actieve. */
export function werkstationPrinter(printers: PrinterConfig[]): PrinterConfig | null {
    const actief = printers.filter((p) => p.actief);
    const gekozen = gekozenPrinterId();
    const match = gekozen ? actief.find((p) => p.id === gekozen) : null;
    if (match) return match;
    return actief.length === 1 ? actief[0] : null;
}

/* ── Printen ─────────────────────────────────────────────────────────────── */

export type PrintVerzoek =
    | { soort: 'testlabel'; printerId: string }
    | { soort: 'los_label'; printerId: string; naam: string; datum?: string; tht?: string | null; notitie?: string | null; aantal: number }
    | { soort: 'partij_labels'; printerId: string; partijId: string }
    | { soort: 'herprint'; printerId: string; eenheidIds: string[] };

export interface PrintJobRij {
    id: string;
    soort: string;
    status: string;
    aantal_labels: number;
    geprint_aantal: number;
    [k: string]: unknown;
}

export interface PrintResultaat {
    job: PrintJobRij;
    uitkomst: PrintUitkomst;
    waarschuwingen: string[];
    /** Leesbare fouttekst voor de keuken, of null bij succes. */
    tekst: string | null;
}

/**
 * Eén aanroep voor alles: job maken, printen, uitkomst melden. Gooit alleen
 * als de server de job niet kon maken; printerfouten komen terug in
 * `uitkomst` (want die zijn geen uitzondering maar een toestand).
 */
export async function printLabels(verzoek: PrintVerzoek, opties: PrintOpties & { transport?: PrinterTransport } = {}): Promise<PrintResultaat> {
    const res = await fetch('/api/labels/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verzoek),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Printjob aanmaken mislukt (${res.status})`);

    const job = json.job as PrintJobRij;
    const labels = json.labels as LabelBlok[];
    const printer = json.printer as PrinterConfig;
    const waarschuwingen = (json.waarschuwingen ?? []) as string[];

    let uitkomst: PrintUitkomst;
    try {
        const transport = opties.transport ?? maakTransport(printer.transport);
        uitkomst = await voerPrintJobUit(labels, transport, printer, {
            ...opties,
            /* De mock heeft geen echte read; de check werkt wel. Browser Print ook. */
            statusChecks: opties.statusChecks ?? true,
        });
    } catch (e) {
        uitkomst = {
            status: 'failed', geprintAantal: 0, geprintEenheidIds: [], onzekerEenheidIds: labels.map((l) => l.eenheidId).filter((x): x is string => !!x),
            foutmelding: e instanceof Error ? e.message : 'Printen mislukt',
            foutCode: e instanceof PrinterFout ? e.code : 'onbekend',
            printerStatus: null,
        };
    }

    const bijgewerkt = await meldUitkomst(job.id, uitkomst);
    const tekst = uitkomst.status === 'success'
        ? null
        : foutTekst(uitkomst);

    return { job: bijgewerkt ?? { ...job, status: uitkomst.status, geprint_aantal: uitkomst.geprintAantal }, uitkomst, waarschuwingen, tekst };
}

export function foutTekst(u: PrintUitkomst): string {
    if (u.foutCode && u.foutCode !== 'onbekend') return FOUT_TEKST[u.foutCode];
    return u.foutmelding ?? FOUT_TEKST.onbekend;
}

async function meldUitkomst(jobId: string, u: PrintUitkomst): Promise<PrintJobRij | null> {
    try {
        const res = await fetch(`/api/labels/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: u.status,
                geprintAantal: u.geprintAantal,
                geprintEenheidIds: u.geprintEenheidIds,
                onzekerEenheidIds: u.onzekerEenheidIds,
                foutmelding: u.foutmelding,
                printerStatus: u.printerStatus,
                deviceNaam: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : null,
            }),
        });
        const json = await res.json().catch(() => ({}));
        return res.ok ? (json.job as PrintJobRij) : null;
    } catch {
        /* Offline of pagina weg: de job blijft 'pending' en is straks
           zichtbaar als "onbekend — controleer" in de lijst. */
        return null;
    }
}

/** Status van een printer opvragen (voor Instellingen → Printers). */
export async function vraagStatus(printer: PrinterConfig): Promise<PrinterStatus> {
    const transport = maakTransport(printer.transport);
    try {
        await transport.verbind(printer);
        return await transport.status();
    } catch (e) {
        return {
            online: false, papierOp: false, klepOpen: false, pauze: false, fout: true, waarschuwing: false,
            omschrijving: e instanceof PrinterFout ? FOUT_TEKST[e.code] : (e instanceof Error ? e.message : 'Onbekende fout'),
        };
    } finally {
        await transport.sluit().catch(() => undefined);
    }
}
