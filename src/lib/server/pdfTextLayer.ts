/**
 * Server-side tekstlaag van een PDF — mét regelstructuur.
 *
 * Waarom dit bestaat (2026-07-26): de prijslijst-extractor stuurde de PDF als
 * document/beeld naar het model en liet het alle regels overtypen. Bij dichte
 * groothandel-catalogi laat een model dan regels vallen: Van Engelandt "w20"
 * had 793 prijsregels, er kwamen er 584 uit (~26% weg, inclusief een heel blok
 * hamspecialiteiten). Terwijl die PDF een perfecte tekstlaag heeft.
 *
 * Met de exacte tekst ernaast hoeft het model niets meer te "lezen" — alleen nog
 * structureren. Dat is precies waar een model wél betrouwbaar in is.
 *
 * De bestaande `pdfTextExtract.ts` kan dit niet: die draait client-side (File +
 * window) en plakt alle tekst-items aan elkaar met spaties, waardoor juist de
 * regelstructuur — de kern van een prijstabel — verloren gaat.
 *
 * Gescande PDFs hebben geen tekstlaag; dan geeft dit `null` terug en valt de
 * aanroeper terug op de beeld-route. Nooit een harde fout.
 */
import 'server-only';
import { ensurePdfDomGlobals } from './pdfDomGlobals';

export interface PdfPageLines {
    page: number;      /* 1-based */
    lines: string[];
}

/* Onder dit aantal tekens per pagina gaan we ervan uit dat er geen bruikbare
   tekstlaag is (gescand/afbeelding) en laten we de beeld-route het werk doen. */
const MIN_CHARS_PER_PAGE = 40;

/* Y-coördinaten worden afgerond zodat items van dezelfde regel samenvallen.
   1pt marge vangt sub-pixel verschillen binnen één tekstregel op. */
function roundY(y: number): number {
    return Math.round(y);
}

/**
 * Haal per pagina de tekstregels op, in leesvolgorde (boven→onder, links→rechts).
 *
 * Items worden gegroepeerd op hun y-positie, want een PDF bevat losse
 * tekst-fragmenten zonder besef van "regels". Zonder die groepering krijg je
 * één woordenbrij en is een prijstabel onleesbaar.
 *
 * `pageStart`/`pageEnd` zijn 1-based en inclusief; laat ze weg voor de hele PDF.
 * Geeft `null` als de PDF geen bruikbare tekstlaag heeft of niet te lezen is.
 */
export async function extractPdfPageLines(
    buf: Buffer,
    pageStart?: number,
    pageEnd?: number,
): Promise<PdfPageLines[] | null> {
    try {
        /* pdfjs raakt bij het laden een paar browser-globals aan; op Vercel
           bestaan die niet en klapt de import. Eerst klaarzetten. */
        ensurePdfDomGlobals();

        /* Legacy-build draait in Node zonder DOM. Dynamische import houdt
           pdfjs uit bundels die 'm niet nodig hebben. */
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

        const doc = await pdfjs.getDocument({
            data: new Uint8Array(buf),
            /* Server-hardening: geen eval, geen externe font-fetches, geen
               worker-thread. Voor pure tekst-extractie hebben we niets nodig. */
            isEvalSupported: false,
            disableFontFace: true,
            useSystemFonts: false,
            useWorkerFetch: false,
        }).promise;

        const from = Math.max(1, pageStart ?? 1);
        const to = Math.min(doc.numPages, pageEnd ?? doc.numPages);
        if (from > to) return null;

        const out: PdfPageLines[] = [];
        let totalChars = 0;

        for (let p = from; p <= to; p++) {
            const page = await doc.getPage(p);
            const content = await page.getTextContent();

            /* Groepeer op y, bewaar x om binnen de regel te sorteren. */
            const rows = new Map<number, Array<{ x: number; s: string }>>();
            for (const item of content.items) {
                const it = item as { str?: unknown; transform?: number[] };
                const s = typeof it.str === 'string' ? it.str : '';
                if (!s.trim()) continue;
                const tr = it.transform;
                if (!Array.isArray(tr) || tr.length < 6) continue;
                const y = roundY(tr[5]);
                const bucket = rows.get(y);
                if (bucket) bucket.push({ x: tr[4], s });
                else rows.set(y, [{ x: tr[4], s }]);
            }

            const lines = Array.from(rows.entries())
                .sort((a, b) => b[0] - a[0])                     // hoogste y = bovenste regel
                .map(([, items]) => items
                    .sort((a, b) => a.x - b.x)
                    .map(i => i.s)
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim())
                .filter(Boolean);

            totalChars += lines.reduce((n, l) => n + l.length, 0);
            out.push({ page: p, lines });

            /* pdfjs houdt per pagina interne buffers vast; expliciet vrijgeven
               scheelt geheugen op een serverless function bij 100p PDFs. */
            page.cleanup();
        }

        await doc.destroy();

        const pageCount = to - from + 1;
        if (totalChars < MIN_CHARS_PER_PAGE * pageCount) {
            console.warn(`[pdf-textlayer] geen bruikbare tekstlaag (${totalChars} tekens over ${pageCount} pagina's) — waarschijnlijk gescand`);
            return null;
        }
        return out;
    } catch (e) {
        /* Onleesbaar/encrypted/gescand → de aanroeper doet de beeld-route.
           WEL luid loggen: een stille terugval liet op 2026-07-26 een kapotte
           uitrol er werkend uitzien (de tekstlaag bereikte het model nooit,
           zichtbaar aan input_tokens=94). Nooit meer stil falen. */
        console.error(`[pdf-textlayer] extractie mislukt (${(e as Error)?.name}): ${(e as Error)?.message?.slice(0, 300)}`);
        return null;
    }
}

/** Regels die er als prijsregel uitzien: bevatten een bedrag met decimalen.
 *  Gebruikt als grofmazige verwachting ("hoeveel producten zouden er ~moeten
 *  zijn"), nooit om zelf prijzen uit te lezen. */
export function countPriceLikeLines(pages: PdfPageLines[]): number {
    let n = 0;
    for (const p of pages) {
        for (const l of p.lines) {
            if (/\d+[.,]\d{2,3}(?!\d)/.test(l)) n++;
        }
    }
    return n;
}

/**
 * Zet de tekstlaag om in een compact blok voor de prompt.
 *
 * `maxChars` begrenst de prompt: bij overschrijding kappen we af en zeggen dat
 * er is afgekapt, zodat het model niet denkt dat de lijst compleet is. Een blok
 * van 10 dichte pagina's blijft ruim binnen deze grens.
 */
export function formatPageLinesForPrompt(pages: PdfPageLines[], maxChars = 180_000): string {
    const parts: string[] = [];
    let used = 0;
    let truncated = false;

    for (const p of pages) {
        const header = `--- pagina ${p.page} ---`;
        const body = p.lines.join('\n');
        const block = `${header}\n${body}`;
        if (used + block.length > maxChars) {
            truncated = true;
            break;
        }
        parts.push(block);
        used += block.length + 1;
    }

    if (truncated) {
        parts.push('--- (tekstlaag afgekapt: gebruik voor de resterende pagina\'s de PDF zelf) ---');
    }
    return parts.join('\n');
}
