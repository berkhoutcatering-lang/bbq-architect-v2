/**
 * Converts a File (PDF or image) to a base64 data URL (JPEG).
 * PDFs are rendered to image via pdfjs-dist, page 1 only.
 * Images are loaded, downscaled to max 1600px, and re-encoded as JPEG.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export async function fileToImageBase64(file: File): Promise<string> {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        return pdfFirstPageToBase64(file);
    }
    if (file.type.startsWith('image/')) {
        return imageFileToBase64(file);
    }
    throw new Error('Alleen PDF en afbeeldingen worden ondersteund (kreeg: ' + file.type + ')');
}

async function imageFileToBase64(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    return drawToJpeg(bitmap);
}

async function pdfFirstPageToBase64(file: File): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    // Next.js dynamic import: set workerSrc to the worker bundled with pdfjs
    // Using CDN worker URL to avoid bundler complexity
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsAny = pdfjs as any;
    if (pdfjsAny.GlobalWorkerOptions && !pdfjsAny.GlobalWorkerOptions.workerSrc) {
        pdfjsAny.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsAny.version}/pdf.worker.min.mjs`;
    }
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

function drawToJpeg(bitmap: ImageBitmap): string {
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale = maxDim > MAX_DIMENSION ? MAX_DIMENSION / maxDim : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // White bg for transparent PNGs
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
