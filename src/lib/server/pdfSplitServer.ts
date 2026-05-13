/**
 * Server-side PDF splitter — gebruikt door pricelist chunked-batch flow.
 *
 * Werkt op Buffers (Node runtime) ipv Files (browser). pdf-lib runt prima
 * in serverless Node-functions; peak memory ~80MB voor een 100p PDF.
 *
 * Splits in chunks van N pagina's; default 25 (sweet spot voor output-token
 * headroom + cache-hit-rate). Override via env: PRICELIST_CHUNK_SIZE.
 */
import 'server-only';
import { PDFDocument } from 'pdf-lib';

export interface ServerPdfChunk {
    buffer: Buffer;
    pageStart: number;   /* 1-based inclusive */
    pageEnd: number;     /* 1-based inclusive */
    chunkIndex: number;  /* 0-based */
    chunkTotal: number;
}

/* P0 audit-fix: 25p chunks waren te groot voor dichte groothandel-catalogi
   (Van Engelandt: ~75 producten/pagina × 25p = 1875 producten/chunk, ver
   boven MAX_LINES_PER_CHUNK + max_tokens). Default 10p: 750 producten worst-
   case, past binnen output-token budget + LLM01-guard. */
export const DEFAULT_PAGES_PER_CHUNK = Number(process.env.PRICELIST_CHUNK_SIZE ?? 10);
export const MAX_PAGES_PER_PDF = 100;
export const SYNC_PAGE_THRESHOLD = Number(process.env.PRICELIST_SYNC_PAGE_THRESHOLD ?? 8);

/**
 * Tel pagina's in een PDF-buffer met twee strategieën:
 * 1. pdf-lib parser (werkt voor 99% van PDFs)
 * 2. Regex-fallback op de raw bytes — sommige PDF-generators (oudere ERP/POS
 *    systemen zoals FOODMASTER, Van Engelandt) maken PDFs die niet 100%
 *    spec-compliant zijn en die pdf-lib niet kan laden, maar wel een geldig
 *    `/Type /Pages /Count N` object hebben dat we direct kunnen lezen.
 *
 * Returnt 0 alleen als BEIDE strategieën falen (dan is de PDF echt corrupt
 * of encrypted).
 */
export async function getPdfPageCountFromBuffer(buf: Buffer): Promise<number> {
    /* Strategy 1: pdf-lib (strict spec parser) */
    try {
        const doc = await PDFDocument.load(buf, { ignoreEncryption: false });
        const n = doc.getPageCount();
        if (n > 0) return n;
    } catch {
        /* fall through naar regex */
    }

    /* Strategy 2: regex fallback. PDF-structuur encodeert pagina-count in
       het root /Pages object: `<< /Type /Pages /Kids [...] /Count N >>`.
       We scannen de bytes als latin1 (PDF-structuur is ASCII; binary streams
       interfereren niet met de /Count vondst). */
    try {
        const text = buf.toString('latin1');
        /* Match in order: /Type /Pages ... /Count N (meest betrouwbaar) */
        const m1 = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
        if (m1) {
            const n = parseInt(m1[1], 10);
            if (n > 0 && n < 10_000) return n;
        }
        /* Alt order: /Count N ... /Type /Pages */
        const m2 = text.match(/\/Count\s+(\d+)[\s\S]*?\/Type\s*\/Pages/);
        if (m2) {
            const n = parseInt(m2[1], 10);
            if (n > 0 && n < 10_000) return n;
        }
        /* Last resort: count individual /Type /Page objects (NOT /Pages) */
        const pageMatches = text.match(/\/Type\s*\/Page(?:[^s]|\s|>)/g);
        if (pageMatches && pageMatches.length > 0 && pageMatches.length < 10_000) {
            return pageMatches.length;
        }
    } catch {
        /* fall through naar 0 */
    }

    return 0;
}

/**
 * Bereken chunk-ranges voor een PDF zonder de PDF zelf te splitten.
 *
 * P0 audit-fix: pdf-lib's copyPages produceert voor sommige PDF-generators
 * (FOODMASTER, Van Engelandt) technisch geldige output-PDFs zonder zichtbare
 * content (content-streams worden niet correct gekopieerd). Anthropic vision
 * zag dan "lege pagina's" → returnde [].
 *
 * Nieuwe strategie: stuur per chunk de ORIGINELE PDF + page-range instructie
 * in de user prompt. Anthropic ziet alle pagina's maar focused op de range.
 * Met prompt-cache (1h) wordt de PDF input maar 1× duur betaald — alle
 * volgende chunks lezen 'm uit cache (90% korting).
 *
 * Returnt page-ranges + de ORIGINELE buffer (gedeeld door alle chunks).
 */
export async function splitPdfBufferIntoChunks(
    buf: Buffer,
    pagesPerChunk: number = DEFAULT_PAGES_PER_CHUNK,
): Promise<ServerPdfChunk[]> {
    /* Permissieve page-count via pdf-lib of regex-fallback */
    const totalPages = await getPdfPageCountFromBuffer(buf);

    if (totalPages === 0) {
        throw new Error('PDF_UNPARSEABLE');
    }
    if (totalPages > MAX_PAGES_PER_PDF) {
        throw new Error(`PDF_TOO_LARGE:${totalPages}`);
    }

    if (totalPages <= pagesPerChunk) {
        return [{
            buffer: buf,
            pageStart: 1,
            pageEnd: totalPages,
            chunkIndex: 0,
            chunkTotal: 1,
        }];
    }

    const chunkTotal = Math.ceil(totalPages / pagesPerChunk);
    const chunks: ServerPdfChunk[] = [];

    for (let i = 0; i < chunkTotal; i++) {
        const pageStart = i * pagesPerChunk + 1;
        const pageEnd = Math.min((i + 1) * pagesPerChunk, totalPages);

        /* Alle chunks delen dezelfde buffer — Anthropic gebruikt prompt-cache
           zodat de PDF maar 1× duur als input wordt betaald. */
        chunks.push({
            buffer: buf,
            pageStart,
            pageEnd,
            chunkIndex: i,
            chunkTotal,
        });
    }

    return chunks;
}
