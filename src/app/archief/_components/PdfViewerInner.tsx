/**
 * PdfViewerInner — @react-pdf-viewer/core wrapper met search-highlight.
 *
 * Pillar #2 — "highlight-in-PDF op de zoekterm zelf, niet alleen rij".
 *
 * MOET via dynamic import met ssr:false geladen worden (BonPreview doet dat),
 * anders 300kb in main bundle = INP regression op /archief.
 *
 * Pdf.worker.min.mjs moet in /public staan. Bij eerste setup:
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
 *
 * Of dynamic worker-url; voor server-side simplicity gebruik public-served worker.
 */
'use client';

import { Worker, Viewer } from '@react-pdf-viewer/core';
import { searchPlugin } from '@react-pdf-viewer/search';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';

interface Props {
    url: string;
    highlight?: string | null;
}

// Pdf.js v5 is in our package.json. We point Worker at the matching CDN
// versie zodat we niet hoeven te copy-pasten in public/. Bij offline-builds
// of strict-CSP omgevingen later vervangen door self-hosted file.
const PDFJS_VERSION = '5.6.205';
const WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

export default function PdfViewerInner({ url, highlight }: Props) {
    const search = searchPlugin({
        keyword: highlight ? [highlight] : [],
    });

    return (
        <Worker workerUrl={WORKER_URL}>
            <div className="h-full w-full bg-white">
                <Viewer fileUrl={url} plugins={[search]} />
            </div>
        </Worker>
    );
}
