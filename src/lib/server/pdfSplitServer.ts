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

export const DEFAULT_PAGES_PER_CHUNK = Number(process.env.PRICELIST_CHUNK_SIZE ?? 25);
export const MAX_PAGES_PER_PDF = 100;
export const SYNC_PAGE_THRESHOLD = Number(process.env.PRICELIST_SYNC_PAGE_THRESHOLD ?? 8);

/**
 * Tel pagina's in een PDF-buffer. Returnt 0 bij parse-fail (caller behandelt
 * als "kan niet splitten — laat sync flow nl behandelen").
 */
export async function getPdfPageCountFromBuffer(buf: Buffer): Promise<number> {
    try {
        const doc = await PDFDocument.load(buf);
        return doc.getPageCount();
    } catch {
        return 0;
    }
}

/**
 * Splits een PDF in chunks van pagesPerChunk pagina's. Bij ≤pagesPerChunk
 * pagina's: returnt 1 chunk met de hele PDF. Boven MAX_PAGES_PER_PDF: throws.
 */
export async function splitPdfBufferIntoChunks(
    buf: Buffer,
    pagesPerChunk: number = DEFAULT_PAGES_PER_CHUNK,
): Promise<ServerPdfChunk[]> {
    const srcDoc = await PDFDocument.load(buf);
    const totalPages = srcDoc.getPageCount();

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
        const startIdx = i * pagesPerChunk;
        const endIdx = Math.min(startIdx + pagesPerChunk, totalPages);
        const pageIndexes: number[] = [];
        for (let p = startIdx; p < endIdx; p++) pageIndexes.push(p);

        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(srcDoc, pageIndexes);
        for (const page of copiedPages) newDoc.addPage(page);
        const bytes = await newDoc.save();

        chunks.push({
            buffer: Buffer.from(bytes),
            pageStart: startIdx + 1,
            pageEnd: endIdx,
            chunkIndex: i,
            chunkTotal,
        });
    }

    return chunks;
}
