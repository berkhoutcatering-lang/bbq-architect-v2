/**
 * Client-side PDF tekst-extractie via pdfjs-dist.
 * Werkt voor text-based PDFs (Makro, Sligro, Hanos, Bidfood etc).
 * Voor ingescande/image-based PDFs: return '' zodat caller kan fallbacken
 * naar vision-based parsing.
 */

export async function extractPdfText(file: File): Promise<string> {
    if (typeof window === 'undefined') return '';
    try {
        /* Dynamic import om bundle niet te belasten */
        const pdfjs = await import('pdfjs-dist');
        /* Worker pakken uit CDN zodat bundler niet lastig doet */
        const version = (pdfjs as any).version || '5.6.205';
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

        const arrayBuf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;

        const pageTexts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items
                .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (pageText) pageTexts.push(`[Page ${i}]\n${pageText}`);
        }

        return pageTexts.join('\n\n');
    } catch (e) {
        /* eslint-disable-next-line no-console */
        console.warn('[pdf-text-extract] failed:', e);
        return '';
    }
}

/** Ruwe schatting of de tekst bruikbaar is (niet leeg, niet onleesbare bytes) */
export function isUsableText(text: string): boolean {
    if (!text || text.length < 100) return false;
    /* Percentage alfabetische chars — ingescande PDFs geven vaak alleen rommel */
    const alpha = text.replace(/[^a-zA-Z]/g, '').length;
    return alpha / text.length > 0.2;
}
