'use client';
/* Browser-side: render een PDF naar een lijst PNG-data-URLs.
   Gebruikt pdfjs-dist (al in package.json voor andere PDF-flows).

   pdfjs-dist v5 vereist een worker. Voor Next.js + Webpack/Turbopack laden we
   de worker via import.meta.url zodat de bundler hem als asset emit. */

import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.min.mjs';

/* Render één page → JPEG data-URL (kleiner dan PNG, prima voor vision). */
async function pageToDataUrl(page: pdfjsLib.PDFPageProxy, maxDim = 2000): Promise<string> {
    const viewport = page.getViewport({ scale: 1 });
    /* Schaal zodat de langste zijde maxDim wordt — Claude vision houdt
       van scherpe scans maar beelden boven 2000px geven amper extra winst. */
    const scale = Math.min(maxDim / viewport.width, maxDim / viewport.height, 2.5);
    const scaled = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(scaled.width);
    canvas.height = Math.ceil(scaled.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context niet beschikbaar');
    await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
}

export async function pdfFileToImages(file: File, opts?: { maxPages?: number; maxDim?: number }): Promise<string[]> {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const maxPages = Math.min(doc.numPages, opts?.maxPages ?? 10);
    const images: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
        const page = await doc.getPage(i);
        images.push(await pageToDataUrl(page, opts?.maxDim ?? 2000));
        page.cleanup();
    }
    await doc.destroy();
    return images;
}
