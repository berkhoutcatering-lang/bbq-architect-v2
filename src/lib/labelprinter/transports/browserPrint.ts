/**
 * BrowserPrintTransport — praat met Zebra Browser Print op hetzelfde apparaat.
 *
 * Zebra Browser Print is een app (Android, Windows, macOS) die lokaal een
 * klein webservertje draait op http://127.0.0.1:9100 en zelf de Bluetooth-
 * of netwerkverbinding met de printer onderhoudt. Onze pagina praat dus nooit
 * rechtstreeks met Bluetooth; de app doet dat. Dit is Zebra's officiële route
 * voor webapps.
 *
 * De endpoints zijn dezelfde die Zebra's eigen BrowserPrint.js gebruikt:
 *   GET  /available            → { printer: [ { name, uid, connection, ... } ] }
 *   GET  /default?type=printer → het standaardapparaat uit de app
 *   POST /write                → { device, data }   ZPL naar de printer
 *   POST /read                 → { device }         antwoord van de printer
 *
 * We versturen als text/plain: dan doet de browser geen CORS-preflight, en
 * daar is de Browser Print-server niet altijd even goed in. 127.0.0.1 geldt
 * voor de browser als vertrouwd, dus een https-pagina mag ernaartoe.
 *
 * Twee lessen uit Zebra's eigen forum voor de ZQ630 op Android: stuur geen
 * losse jobs kort na elkaar (buffers lopen vol), en vraag de status vóór en
 * ná het versturen. Dat regelt service.ts; hier zit alleen de verbinding.
 */

import {
    PrinterFout, STATUS_OFFLINE,
    type GevondenPrinter, type PrinterConfig, type PrinterStatus, type PrinterTransport,
} from '../types';
import { HQES, parseHqes } from '../zpl';

const BASIS = 'http://127.0.0.1:9100/';

interface BrowserPrintDevice {
    name: string;
    uid: string;
    connection: string;
    deviceType: string;
    version?: number;
    provider?: string;
    manufacturer?: string;
}

async function metTimeout<T>(p: Promise<T>, ms: number, code: 'timeout' | 'app_niet_actief' = 'timeout'): Promise<T> {
    let t: ReturnType<typeof setTimeout> | undefined;
    const klok = new Promise<never>((_, reject) => {
        t = setTimeout(() => reject(new PrinterFout(code, code === 'timeout' ? 'De printer reageert niet' : 'Browser Print reageert niet')), ms);
    });
    try {
        return await Promise.race([p, klok]);
    } finally {
        if (t) clearTimeout(t);
    }
}

async function haal(pad: string, init?: RequestInit, ms = 4000): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(BASIS + pad, { ...init, signal: ctrl.signal, cache: 'no-store' });
    } catch (e) {
        /* fetch faalt hard als er niets luistert op 9100: de app draait niet. */
        const naam = e instanceof Error ? e.name : '';
        if (naam === 'AbortError') throw new PrinterFout('timeout', 'Browser Print reageert niet');
        throw new PrinterFout('app_niet_actief', 'Browser Print-app draait niet op dit apparaat');
    } finally {
        clearTimeout(t);
    }
}

function vertaalHttpFout(res: Response, tekst: string): PrinterFout {
    const t = tekst.toLowerCase();
    if (res.status === 403 || t.includes('not allowed') || t.includes('denied') || t.includes('blocked')) {
        return new PrinterFout('geweigerd', 'Deze website is niet toegestaan in Browser Print');
    }
    if (t.includes('not connected') || t.includes('could not connect') || t.includes('connection')) {
        return new PrinterFout('niet_verbonden', 'Geen verbinding met de printer');
    }
    return new PrinterFout('onbekend', tekst || `Browser Print antwoordde ${res.status}`);
}

export class BrowserPrintTransport implements PrinterTransport {
    readonly soort = 'browser_print' as const;
    private device: BrowserPrintDevice | null = null;

    async beschikbaar(): Promise<boolean> {
        try {
            const res = await haal('available', undefined, 2500);
            return res.ok;
        } catch {
            return false;
        }
    }

    async zoek(): Promise<GevondenPrinter[]> {
        const res = await haal('available');
        if (!res.ok) throw vertaalHttpFout(res, await res.text().catch(() => ''));
        const json = (await res.json().catch(() => ({}))) as { printer?: BrowserPrintDevice[] };
        const lijst = Array.isArray(json.printer) ? json.printer : [];
        return lijst.map((d) => ({
            uid: d.uid, naam: d.name, verbinding: d.connection,
            fabrikant: d.manufacturer, model: undefined,
        }));
    }

    /** Standaardapparaat zoals ingesteld in de Browser Print-app zelf. */
    async standaard(): Promise<GevondenPrinter | null> {
        const res = await haal('default?type=printer');
        if (!res.ok) throw vertaalHttpFout(res, await res.text().catch(() => ''));
        const tekst = await res.text();
        if (!tekst.trim()) return null;
        try {
            const d = JSON.parse(tekst) as BrowserPrintDevice;
            if (!d?.uid) return null;
            return { uid: d.uid, naam: d.name, verbinding: d.connection, fabrikant: d.manufacturer };
        } catch {
            return null;
        }
    }

    private async vindDevice(uid: string | null): Promise<BrowserPrintDevice> {
        const res = await haal('available');
        if (!res.ok) throw vertaalHttpFout(res, await res.text().catch(() => ''));
        const json = (await res.json().catch(() => ({}))) as { printer?: BrowserPrintDevice[] };
        const lijst = Array.isArray(json.printer) ? json.printer : [];
        if (uid) {
            const d = lijst.find((x) => x.uid === uid);
            if (d) return d;
        }
        /* Niet in de lijst: val terug op het standaardapparaat van de app. */
        const resD = await haal('default?type=printer');
        const tekst = resD.ok ? await resD.text() : '';
        if (tekst.trim()) {
            try {
                const d = JSON.parse(tekst) as BrowserPrintDevice;
                if (d?.uid && (!uid || d.uid === uid)) return d;
            } catch { /* geen geldig apparaat */ }
        }
        throw new PrinterFout('geen_printer', uid
            ? 'De gekoppelde printer is niet gevonden — staat hij aan en is Bluetooth verbonden?'
            : 'Geen standaardprinter ingesteld in de Browser Print-app');
    }

    async verbind(printer: PrinterConfig): Promise<void> {
        this.device = await this.vindDevice(printer.device_uid);
    }

    private async schrijf(data: string, ms: number): Promise<void> {
        if (!this.device) throw new PrinterFout('niet_verbonden', 'Nog niet verbonden met een printer');
        const res = await haal('write', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ device: this.device, data }),
        }, ms);
        if (!res.ok) throw vertaalHttpFout(res, await res.text().catch(() => ''));
    }

    private async lees(ms: number): Promise<string> {
        if (!this.device) throw new PrinterFout('niet_verbonden', 'Nog niet verbonden met een printer');
        const res = await haal('read', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ device: this.device }),
        }, ms);
        if (!res.ok) throw vertaalHttpFout(res, await res.text().catch(() => ''));
        return res.text();
    }

    async status(): Promise<PrinterStatus> {
        try {
            await this.schrijf(HQES, 4000);
            /* Zebra: "meerdere reads kunnen nodig zijn om alles binnen te krijgen". */
            let antwoord = '';
            for (let i = 0; i < 4 && !/WARNINGS/i.test(antwoord); i++) {
                if (i > 0) await new Promise((r) => setTimeout(r, 350));
                antwoord += await this.lees(3000);
            }
            if (!antwoord.trim()) return { ...STATUS_OFFLINE, omschrijving: 'Printer antwoordt niet op statusvraag' };
            return parseHqes(antwoord);
        } catch (e) {
            const bericht = e instanceof Error ? e.message : 'Status onbekend';
            return { ...STATUS_OFFLINE, omschrijving: bericht };
        }
    }

    async stuur(zpl: string): Promise<void> {
        /* Ruim: ~20 kB over Bluetooth kan een paar seconden duren. */
        await metTimeout(this.schrijf(zpl, 20000), 21000);
    }

    async sluit(): Promise<void> {
        this.device = null;
    }
}
