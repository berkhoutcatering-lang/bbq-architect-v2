/**
 * De sticker tekenen. Canvas, geen ZPL.
 * Plan: docs/bestelstroom-bouwplan.md §8.
 *
 * Waarom canvas: er is nog geen printer gekocht, dit werkt op elke printer, de
 * kronkelweg met de haltes tekent zichzelf net als in de app, en Cinzel en
 * accenten werken gewoon — `^CI28` is niet nodig.
 *
 * Vier regels, en ze zijn geen van alle vrijblijvend:
 *
 *   1. **Dpi is een parameter.** Renderen op een vaste maat en daarna schalen
 *      geeft rafelige letters. Altijd op de eigen resolutie van de doelprinter.
 *   2. **Lijnen en letters, geen gevulde vlakken.** Een thermische printer print
 *      één bit per punt; een grijsvlak wordt een rasterpatroon. (De witte
 *      ondergrond is de uitzondering die de regel bevestigt: wit is geen inkt.)
 *   3. **Lettertype eerst laden.** Anders valt canvas zonder foutmelding terug
 *      op een standaardletter en zie je het pas op papier.
 *   4. **Nooit afkappen.** Het passend maken zit in boxLabel.ts en heeft daar
 *      een test die letter voor letter controleert.
 *
 * Alles wat hier getekend wordt komt uit `bestellingen.doos_snapshot`. Deze
 * module doet geen enkel netwerkverzoek: op 22 december, honderd stickers, mag
 * een haperende Experience-app niet betekenen dat er niets uit de printer komt.
 */

import { stickerGegevens, pasNaamIn, isVolledig, mmNaarPx, type StickerInvoer, type StickerGegevens } from './boxLabel';
import { formatteerDatum } from './bestelstroom';

export interface LabelFormaat {
    breedte_mm: number;
    hoogte_mm: number;
    dpi: number;
}

/** 4 × 6 inch op 203 dpi — de maat waar de meeste thermische labelprinters mee
    beginnen. Verandert er een printer, dan verandert alléén dit object. */
export const STANDAARD_FORMAAT: LabelFormaat = { breedte_mm: 101.6, hoogte_mm: 152.4, dpi: 203 };

const KOP = 'Cinzel, "Playfair Display", Georgia, serif';
const TEKST = 'Archivo, system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

/**
 * Wacht tot de letters er echt zijn. Zonder dit tekent canvas met een
 * standaardletter, zonder foutmelding, en merk je het pas op papier.
 */
async function wachtOpLetters(): Promise<void> {
    if (typeof document === 'undefined' || !document.fonts) return;
    try {
        await Promise.all([
            document.fonts.load(`600 48px ${KOP}`),
            document.fonts.load(`400 16px ${TEKST}`),
            document.fonts.load(`400 14px ${MONO}`),
        ]);
        await document.fonts.ready;
    } catch {
        /* Lukt het laden niet, dan tekenen we met de terugvalletters. Beter een
           leesbare sticker in Georgia dan geen sticker. */
    }
}

/** Tekent een horizontale scheidingslijn. */
function lijn(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number, dikte: number) {
    ctx.beginPath();
    ctx.lineWidth = dikte;
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
}

/**
 * De kronkelweg met de haltes, zoals in de app. Puur lijnwerk: een slingerend
 * pad met een open cirkel op elke halte.
 */
function tekenRoute(ctx: CanvasRenderingContext2D, x: number, y: number, breedte: number, hoogte: number, haltes: number) {
    if (haltes < 2) return;
    const stap = breedte / (haltes - 1);
    const punten = Array.from({ length: haltes }, (_, i) => ({
        x: x + i * stap,
        y: y + (i % 2 === 0 ? 0 : hoogte),
    }));

    ctx.beginPath();
    ctx.lineWidth = Math.max(1, hoogte * 0.05);
    ctx.moveTo(punten[0].x, punten[0].y);
    for (let i = 1; i < punten.length; i++) {
        const vorige = punten[i - 1];
        const nu = punten[i];
        const midX = (vorige.x + nu.x) / 2;
        ctx.bezierCurveTo(midX, vorige.y, midX, nu.y, nu.x, nu.y);
    }
    ctx.stroke();

    const straal = Math.max(2, hoogte * 0.12);
    for (const p of punten) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, straal, 0, Math.PI * 2);
        ctx.stroke();
    }
}

export interface RenderInvoer extends StickerInvoer {
    formaat?: LabelFormaat;
}

/** Geeft de sticker als canvas terug, plus wat er opviel tijdens het tekenen. */
export async function renderBoxLabel(
    inv: RenderInvoer,
): Promise<{ canvas: HTMLCanvasElement; gegevens: StickerGegevens; waarschuwingen: string[] }> {
    const formaat = inv.formaat ?? STANDAARD_FORMAAT;
    const waarschuwingen: string[] = [];
    await wachtOpLetters();

    const B = mmNaarPx(formaat.breedte_mm, formaat.dpi);
    const H = mmNaarPx(formaat.hoogte_mm, formaat.dpi);
    const marge = Math.round(B * 0.07);
    const binnen = B - marge * 2;

    const canvas = document.createElement('canvas');
    canvas.width = B;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    /* Wit is geen inkt: dit is de ondergrond, geen gevuld vlak in de zin van
       regel 2 hierboven. */
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, B, H);
    ctx.fillStyle = '#000000';
    ctx.strokeStyle = '#000000';
    ctx.textBaseline = 'top';

    const g = stickerGegevens(inv);
    let y = marge;

    /* ── Bovenschrift ─────────────────────────────────────────────────────── */
    const kleinPt = Math.round(B * 0.026);
    ctx.font = `400 ${kleinPt}px ${MONO}`;
    ctx.fillText('HOP & BITES', marge, y);
    y += kleinPt * 2.2;

    /* ── De naam. Krimpt, breekt af, kapt nooit af. ───────────────────────── */
    const pas = pasNaamIn(g.naam, {
        maxBreedte: binnen,
        maxPt: Math.round(B * 0.11),
        minPt: Math.round(B * 0.045),
        meet: (tekst, pt) => { ctx.font = `600 ${pt}px ${KOP}`; return ctx.measureText(tekst).width; },
    });
    if (pas.krap) waarschuwingen.push('De naam is erg lang en staat klein op de sticker — even nakijken vóór het printen.');
    /* Laatste zekering: er mag geen letter verdwenen zijn. */
    if (!isVolledig(g.naam, pas.regels)) {
        throw new Error('printBoxLabel: de naam past niet zonder afkappen — niet printen, dit geeft de verkeerde doos.');
    }
    ctx.font = `600 ${pas.pt}px ${KOP}`;
    for (const regel of pas.regels) {
        ctx.fillText(regel, marge, y);
        y += pas.pt * 1.12;
    }

    /* ── Aantal en moment ─────────────────────────────────────────────────── */
    y += kleinPt * 0.6;
    const tekstPt = Math.round(B * 0.034);
    ctx.font = `400 ${tekstPt}px ${TEKST}`;
    ctx.fillText(g.aantal, marge, y);
    y += tekstPt * 1.4;
    if (g.moment) {
        ctx.fillText(`Ophalen: ${g.moment}`, marge, y);
        y += tekstPt * 1.4;
    }

    y += kleinPt * 0.5;
    lijn(ctx, marge, y, B - marge, Math.max(1, Math.round(B * 0.004)));
    y += kleinPt * 1.2;

    /* ── Per onderdeel tot wanneer het goed is ────────────────────────────── */
    if (g.onderdelen.length) {
        ctx.font = `400 ${kleinPt}px ${MONO}`;
        ctx.fillText('HOUDBAAR TOT', marge, y);
        y += kleinPt * 1.8;

        const regelPt = Math.round(B * 0.028);
        ctx.font = `400 ${regelPt}px ${TEKST}`;
        for (const o of g.onderdelen) {
            /* Onbekende houdbaarheid: streepje, geen geraden datum. */
            const rechts = o.houdbaarTot ? (formatteerDatum(o.houdbaarTot) ?? o.houdbaarTot) : '—';
            ctx.textAlign = 'left';
            ctx.fillText(o.naam, marge, y);
            ctx.textAlign = 'right';
            ctx.fillText(rechts, B - marge, y);
            ctx.textAlign = 'left';
            y += regelPt * 1.5;
        }
        y += kleinPt * 0.5;
        lijn(ctx, marge, y, B - marge, 1);
        y += kleinPt * 1.2;
    }

    /* ── Allergenen ───────────────────────────────────────────────────────── */
    ctx.font = `400 ${kleinPt}px ${MONO}`;
    ctx.fillText('ALLERGENEN', marge, y);
    y += kleinPt * 1.8;

    const aPt = Math.round(B * 0.03);
    ctx.font = `400 ${aPt}px ${TEKST}`;
    if (g.allergenen.lijst.length) {
        y = tekstOverRegels(ctx, g.allergenen.lijst.join(' · '), marge, y, binnen, aPt);
    } else if (!g.allergenen.onbekendVoor.length && g.onderdelen.length) {
        ctx.fillText('Geen van de veertien wettelijke allergenen.', marge, y);
        y += aPt * 1.5;
    }
    /* "Wij weten het niet" mag nooit als "er zit niets in" lezen. */
    if (g.allergenen.onbekendVoor.length) {
        y = tekstOverRegels(ctx,
            `Niet vastgelegd voor: ${g.allergenen.onbekendVoor.join(', ')}. Bel ons — we zoeken het na en verzinnen niets.`,
            marge, y, binnen, aPt);
        waarschuwingen.push(`Van ${g.allergenen.onbekendVoor.length} onderdeel/onderdelen zijn de allergenen niet vastgelegd.`);
    }
    if (!g.onderdelen.length) {
        y = tekstOverRegels(ctx, 'Zie het etiket op elk bakje.', marge, y, binnen, aPt);
        waarschuwingen.push('Nog geen koppeling: deze sticker mist de inhoud van de doos.');
    }

    /* ── De kronkelweg onderaan ───────────────────────────────────────────── */
    if (g.haltes.length >= 2) {
        const routeY = H - marge - Math.round(H * 0.06);
        tekenRoute(ctx, marge + Math.round(B * 0.03), routeY, binnen - Math.round(B * 0.06), Math.round(H * 0.035), g.haltes.length);
    }

    return { canvas, gegevens: g, waarschuwingen };
}

/** Tekst die over meerdere regels mag lopen. Breekt op woorden, kapt niet af. */
function tekstOverRegels(
    ctx: CanvasRenderingContext2D, tekst: string, x: number, y: number, maxBreedte: number, pt: number,
): number {
    let regel = '';
    for (const woord of tekst.split(' ')) {
        const kandidaat = regel ? `${regel} ${woord}` : woord;
        if (ctx.measureText(kandidaat).width > maxBreedte && regel) {
            ctx.fillText(regel, x, y);
            y += pt * 1.35;
            regel = woord;
        } else {
            regel = kandidaat;
        }
    }
    if (regel) { ctx.fillText(regel, x, y); y += pt * 1.35; }
    return y;
}

/**
 * Het QR-label voor op het deksel. Apart van de sticker onderop, want dit kan
 * pas ná een geslaagde koppeling: de link zit erin.
 *
 * De QR zelf wordt door de aanroeper aangeleverd als canvas (qrcode.react
 * tekent hem), zodat deze module niets van React hoeft te weten.
 */
export async function renderQrLabel(
    naam: string,
    qr: HTMLCanvasElement,
    formaat: LabelFormaat = STANDAARD_FORMAAT,
): Promise<HTMLCanvasElement> {
    await wachtOpLetters();
    const B = mmNaarPx(formaat.breedte_mm, formaat.dpi);
    const H = mmNaarPx(formaat.hoogte_mm, formaat.dpi);
    const marge = Math.round(B * 0.07);

    const canvas = document.createElement('canvas');
    canvas.width = B;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, B, H);
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    const kleinPt = Math.round(B * 0.026);
    ctx.font = `400 ${kleinPt}px ${MONO}`;
    ctx.fillText('SCAN OP DE AVOND ZELF', B / 2, marge);

    /* De QR zo groot mogelijk en op hele pixels: een geschaalde QR met halve
       pixels leest slecht onder een telefooncamera. */
    const qrMaat = Math.min(binnenMaat(B, marge), Math.round(H * 0.55));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(qr, Math.round((B - qrMaat) / 2), marge + kleinPt * 3, qrMaat, qrMaat);

    let y = marge + kleinPt * 3 + qrMaat + kleinPt * 1.5;
    const naamPt = Math.round(B * 0.05);
    ctx.font = `600 ${naamPt}px ${KOP}`;
    ctx.fillText(naam, B / 2, y);
    y += naamPt * 1.4;

    ctx.font = `400 ${Math.round(B * 0.028)}px ${TEKST}`;
    ctx.fillText('Iedereen scant op zijn eigen telefoon.', B / 2, y);

    return canvas;
}

function binnenMaat(B: number, marge: number): number {
    return B - marge * 2;
}

/**
 * Zet het label voor de gebruiker klaar: delen op een telefoon, downloaden op
 * een computer. Zelfde patroon als printLabel.ts.
 */
export function deelOfDownload(canvas: HTMLCanvasElement, bestandsnaam: string): void {
    canvas.toBlob(function (blob) {
        if (!blob) return;
        const bestand = new File([blob], bestandsnaam, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
        if (nav.share && nav.canShare && nav.canShare({ files: [bestand] })) {
            nav.share({ title: bestandsnaam, files: [bestand] }).catch(function () { /* afgebroken */ });
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = bestandsnaam;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}
