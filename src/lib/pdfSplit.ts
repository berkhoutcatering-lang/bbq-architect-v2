/**
 * Client-side PDF splitter: splits een PDF in chunks van max N pagina's.
 * Werkt met pdf-lib (kleine bundle, runs in browser).
 * Gebruikt als fallback wanneer pdfjs text-extract faalt EN de PDF
 * boven Anthropic's 100-page vision-limiet zit.
 */

import { PDFDocument } from 'pdf-lib';

export interface SplitChunk {
    blob: Blob;
    pageStart: number; /* 1-based */
    pageEnd: number;   /* 1-based inclusive */
    index: number;     /* 0-based chunk index */
    totalChunks: number;
}

export async function splitPdfIntoChunks(file: File, pagesPerChunk = 90): Promise<SplitChunk[]> {
    const arrayBuf = await file.arrayBuffer();
    const srcDoc = await PDFDocument.load(arrayBuf);
    const totalPages = srcDoc.getPageCount();

    if (totalPages <= pagesPerChunk) {
        /* Geen split nodig */
        return [{
            blob: new Blob([arrayBuf], { type: 'application/pdf' }),
            pageStart: 1,
            pageEnd: totalPages,
            index: 0,
            totalChunks: 1,
        }];
    }

    const chunks: SplitChunk[] = [];
    const totalChunks = Math.ceil(totalPages / pagesPerChunk);

    for (let i = 0; i < totalChunks; i++) {
        const startPage = i * pagesPerChunk;
        const endPage = Math.min(startPage + pagesPerChunk, totalPages);
        const pageIndexes: number[] = [];
        for (let p = startPage; p < endPage; p++) pageIndexes.push(p);

        const newDoc = await PDFDocument.create();
        const copiedPages = await newDoc.copyPages(srcDoc, pageIndexes);
        for (const page of copiedPages) newDoc.addPage(page);
        const bytes = await newDoc.save();
        /* Wrap in ArrayBuffer view om type-strict te zijn met Blob constructor */
        const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        chunks.push({
            blob: new Blob([ab], { type: 'application/pdf' }),
            pageStart: startPage + 1,
            pageEnd: endPage,
            index: i,
            totalChunks,
        });
    }

    return chunks;
}

export async function getPdfPageCount(file: File): Promise<number> {
    try {
        const arrayBuf = await file.arrayBuffer();
        const doc = await PDFDocument.load(arrayBuf);
        return doc.getPageCount();
    } catch {
        return 0;
    }
}
