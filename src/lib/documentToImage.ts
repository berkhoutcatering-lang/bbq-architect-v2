/**
 * Smart document loader:
 * - PDF → returned as base64 with application/pdf mime (Claude reads PDFs natively)
 * - Image → downscaled to max 1600px, JPEG at 0.85 quality, returned as base64 data URL
 *
 * No pdfjs dependency on the critical path — avoids hangs when the worker
 * can't load in production environments.
 */

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

export type PreparedDocument = {
    kind: 'pdf' | 'image';
    base64: string; // data URL
    mimeType: string;
    sizeBytes: number;
    thumbnailUrl: string; // blob URL for instant preview
};

export async function prepareDocument(file: File): Promise<PreparedDocument> {
    const thumbnailUrl = URL.createObjectURL(file);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const base64 = await fileToDataUrl(file);
        return {
            kind: 'pdf',
            base64,
            mimeType: 'application/pdf',
            sizeBytes: file.size,
            thumbnailUrl,
        };
    }

    if (file.type.startsWith('image/')) {
        const base64 = await imageFileToDownscaledJpeg(file);
        return {
            kind: 'image',
            base64,
            mimeType: 'image/jpeg',
            sizeBytes: file.size,
            thumbnailUrl,
        };
    }

    throw new Error('Alleen PDF en afbeeldingen worden ondersteund (kreeg: ' + (file.type || 'onbekend') + ')');
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
        reader.readAsDataURL(file);
    });
}

async function imageFileToDownscaledJpeg(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const maxDim = Math.max(width, height);
    const scale = maxDim > MAX_DIMENSION ? MAX_DIMENSION / maxDim : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

// Legacy export for backwards compat with existing code paths
export async function fileToImageBase64(file: File): Promise<string> {
    const prepared = await prepareDocument(file);
    return prepared.base64;
}
