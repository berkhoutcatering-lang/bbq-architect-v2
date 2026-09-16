/**
 * Het printen zelf: labels in bundels naar een transport, met een statuscheck
 * vóór de eerste en ná elke bundel. Puur genoeg om te testen met de mock.
 *
 * Waarom bundels en niet alles ineens: Zebra's advies voor de ZQ630 over
 * Bluetooth op Android is "open → status → data → status → dicht". Sturen we
 * twaalf labels als één blok en valt de printer bij het zevende stil, dan
 * weten we niets. Sturen we per vier en vragen we daarna de status, dan weten
 * we welke bundels zeker goed waren en welke bundel "onzeker" is.
 *
 * Onzeker betekent: mogelijk deels geprint. De keuken kijkt, en print alleen
 * wat ontbreekt opnieuw. Een label te veel kost een label; een label te
 * weinig kost een zak zonder naam. Voorraad raakt dit nooit.
 */

import {
    PrinterFout,
    type LabelBlok, type PrinterConfig, type PrinterStatus, type PrinterTransport, type PrintUitkomst, type PrinterFoutCode,
} from './types';
import { stroom } from './zpl';

export interface PrintOpties {
    bundelGrootte?: number;
    /** Status opvragen vóór en na elke bundel (uit bij transports zonder read). */
    statusChecks?: boolean;
    onVoortgang?: (info: { verstuurd: number; totaal: number; status: PrinterStatus | null }) => void;
}

function foutUitStatus(s: PrinterStatus): { code: PrinterFoutCode; bericht: string } | null {
    if (!s.online) return { code: 'niet_verbonden', bericht: s.omschrijving };
    if (s.papierOp) return { code: 'papier_op', bericht: 'Labels op' };
    if (s.klepOpen) return { code: 'klep_open', bericht: 'Klep open' };
    if (s.fout) return { code: 'printer_fout', bericht: s.omschrijving };
    return null;
}

export async function voerPrintJobUit(
    labels: LabelBlok[],
    transport: PrinterTransport,
    printer: PrinterConfig,
    opties: PrintOpties = {},
): Promise<PrintUitkomst> {
    const bundel = Math.max(1, opties.bundelGrootte ?? 4);
    const checks = opties.statusChecks ?? true;
    const geprint: string[] = [];
    const onzeker: string[] = [];
    let geprintAantal = 0;
    let laatsteStatus: PrinterStatus | null = null;

    const klaar = (status: 'success' | 'failed', code: PrinterFoutCode | null, bericht: string | null): PrintUitkomst => ({
        status, geprintAantal,
        geprintEenheidIds: geprint, onzekerEenheidIds: onzeker,
        foutmelding: bericht, foutCode: code, printerStatus: laatsteStatus,
    });

    try {
        await transport.verbind(printer);
    } catch (e) {
        const code = e instanceof PrinterFout ? e.code : 'onbekend';
        return klaar('failed', code, e instanceof Error ? e.message : 'Verbinden mislukt');
    }

    try {
        if (checks) {
            laatsteStatus = await transport.status();
            const f = foutUitStatus(laatsteStatus);
            if (f) return klaar('failed', f.code, f.bericht);
        }

        for (let i = 0; i < labels.length; i += bundel) {
            const deel = labels.slice(i, i + bundel);
            try {
                await transport.stuur(stroom(deel.map((l) => l.zpl)));
            } catch (e) {
                /* Verzenden zelf mislukt: deze bundel is onzeker (de printer kan
                   een deel ontvangen hebben), alles erna is zeker niet geprint. */
                for (const l of deel) if (l.eenheidId) onzeker.push(l.eenheidId);
                const code = e instanceof PrinterFout ? e.code : 'onbekend';
                return klaar('failed', code, e instanceof Error ? e.message : 'Versturen mislukt');
            }

            if (checks) {
                laatsteStatus = await transport.status();
                const f = foutUitStatus(laatsteStatus);
                if (f) {
                    for (const l of deel) if (l.eenheidId) onzeker.push(l.eenheidId);
                    opties.onVoortgang?.({ verstuurd: i + deel.length, totaal: labels.length, status: laatsteStatus });
                    return klaar('failed', f.code, `${f.bericht} na ${geprintAantal} van ${labels.length} labels`);
                }
            }

            for (const l of deel) if (l.eenheidId) geprint.push(l.eenheidId);
            geprintAantal += deel.length;
            opties.onVoortgang?.({ verstuurd: geprintAantal, totaal: labels.length, status: laatsteStatus });
        }

        return klaar('success', null, null);
    } finally {
        await transport.sluit().catch(() => undefined);
    }
}
