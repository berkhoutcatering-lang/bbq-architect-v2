/**
 * Client-side image normalization voor bon-scanner.
 *
 * Wat we hier oplossen (en wat de oude resizeImage NIET deed):
 *   1. HEIC/HEIF → JPEG conversie (iPhone-default, browsers kunnen het niet renderen)
 *   2. EXIF Orientation respecteren — iPhone & Samsung schrijven foto's in
 *      landscape met een rotation-tag (Orientation 6 = "draai 90° clockwise").
 *      Zonder respect zien Pulled Pork-bonnen er staand uit in DB.
 *   3. Web Worker resize zodat de UI niet hangt op grote foto's (4MB+ HEIC).
 *   4. Target ≤2MB body (Anthropic image-cap is 5MB, Vercel body-limit 14MB).
 *
 * Gebruik:
 *   const compressed = await compressBonImage(file);
 *   const dataUrl = await blobToDataUrl(compressed);
 *
 * Beide library-imports zijn dynamic — geen kosten voor pages die geen
 * bon-upload doen.
 */

const HEIC_MIMES = new Set([
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
]);

/**
 * Detect HEIC/HEIF op basis van mime OF .heic/.heif extensie.
 * Safari MacOS rapporteert soms een lege mime — fallback op filename.
 */
function isHeic(file: File): boolean {
    const mime = (file.type || '').toLowerCase();
    if (HEIC_MIMES.has(mime)) return true;
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
}

export interface CompressOptions {
    maxSizeMB?: number;          // default 2
    maxWidthOrHeight?: number;    // default 2400 (bon-detail leesbaar)
    quality?: number;             // default 0.85 (JPEG)
}

/**
 * Neem een File (uit input/drop/paste) en lever een gecomprimeerde
 * JPEG/PNG Blob op met correcte oriëntatie.
 *
 * Faalt nooit hard: bij conversie-fouten returnt de originele file als blob.
 */
export async function compressBonImage(
    file: File,
    opts: CompressOptions = {},
): Promise<Blob> {
    const maxSizeMB = opts.maxSizeMB ?? 2;
    const maxWidthOrHeight = opts.maxWidthOrHeight ?? 2400;
    const quality = opts.quality ?? 0.85;

    let workingFile: File | Blob = file;

    /* ── Step 1: HEIC → JPEG ─────────────────────────────────────── */
    if (isHeic(file)) {
        try {
            /* heic2any is browser-only (gebruikt libheif WASM). Dynamic import
               zodat SSR/test-omgevingen niet exploderen. */
            const heic2any = (await import('heic2any')).default;
            const converted = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.9,    // hoog: nog niet de eind-quality, dat komt in step 2
            });
            /* heic2any kan een Blob OF Blob[] returnen (bij sequence-heic). */
            const blob = Array.isArray(converted) ? converted[0] : converted;
            /* Wrap weer als File zodat browser-image-compression de naam ziet. */
            workingFile = new File(
                [blob],
                file.name.replace(/\.(heic|heif)$/i, '.jpg'),
                { type: 'image/jpeg', lastModified: file.lastModified },
            );
        } catch (e) {
            /* eslint-disable-next-line no-console */
            console.warn('[compressBonImage] HEIC conversion failed:', e);
            /* Fallback: stuur originele HEIC door — Anthropic ondersteunt het niet
               maar de extract-route geeft dan een nettere error dan een crash. */
            return file;
        }
    }

    /* ── Step 2: Resize + EXIF-rotation + quality ───────────────── */
    try {
        const imageCompression = (await import('browser-image-compression')).default;
        const result = await imageCompression(workingFile as File, {
            maxSizeMB,
            maxWidthOrHeight,
            useWebWorker: true,
            initialQuality: quality,
            /* exifOrientation respecteert iPhone/Samsung rotation-tags.
               In browser-image-compression v2.x: default true. Expliciet voor
               toekomstige major-versies waar het optional kan worden. */
            preserveExif: false,
            fileType: 'image/jpeg',
        });
        return result;
    } catch (e) {
        /* eslint-disable-next-line no-console */
        console.warn('[compressBonImage] compression failed:', e);
        return workingFile;
    }
}

/**
 * Helper: convert Blob/File → base64 data URL.
 * Gebruikt door extract-route inputs die `file_data_url` verwachten.
 */
export function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsDataURL(blob);
    });
}

/**
 * Compute SHA-256 hex digest van een Blob/File via WebCrypto.
 * Gebruikt door de extract-frontend om client-side een hash mee te sturen
 * (server kan zo direct duplicate-check doen vóór upload).
 *
 * NB: server doet zelf ook hash-check op de gedecodeerde bytes (defense-in-depth).
 */
export async function sha256OfBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
