/**
 * Client-side image normalization voor bon-scanner.
 *
 * Pipeline (alle stappen falen safe — bij fout val terug op vorig stadium):
 *   1. HEIC/HEIF → JPEG (heic2any WASM, dynamic import)
 *   2. EXIF Orientation respecteren via canvas-rotate
 *   3. Contrast-stretch — voor vervaagde thermische bonnen (Makro/Hanos)
 *   4. Auto-crop — detecteer bon-rand via brightness-gradient, crop met 5% padding
 *   5. Resolution-boost voor lange bonnen — aspect > 2.5:1 krijgt 3200px ipv 2400px
 *   6. JPEG-compress naar ≤2MB via browser-image-compression
 *
 * Doel: betere AI-extractie voor de moeilijke gevallen (Sligro multi-koloms,
 * Makro vervaagde thermische bonnen, lange kassabonnen).
 */

const HEIC_MIMES = new Set([
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
]);

function isHeic(file: File): boolean {
    const mime = (file.type || '').toLowerCase();
    if (HEIC_MIMES.has(mime)) return true;
    const name = (file.name || '').toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
}

export interface CompressOptions {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
    quality?: number;
    /** Skip preprocessing (canvas-rotate, contrast, crop). Voor tests / opt-out. */
    skipPreprocessing?: boolean;
}

/* ── Pure canvas-2D preprocessing helpers ─────────────────────────── */

/**
 * Detecteer of het histogram smal is — typisch bij vervaagde thermische
 * bonnen (Makro). Pixels concentreren tussen 100-200 ipv 0-255.
 * Returnt {min, max} grijswaarden waar de meeste pixels liggen.
 */
function analyzeHistogram(imageData: ImageData): { min: number; max: number; isNarrow: boolean } {
    const data = imageData.data;
    const histogram = new Uint32Array(256);
    /* Sample elke 4e pixel voor snelheid (10MP = 2.5M samples, ruim genoeg). */
    const step = 4 * 4;
    for (let i = 0; i < data.length; i += step) {
        const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
        histogram[gray]++;
    }

    /* Trim 1% van elke staart om outliers (stempels, glans) te negeren. */
    const totalSamples = data.length / step;
    const trim = Math.floor(totalSamples * 0.01);
    let cumulative = 0;
    let min = 0;
    let max = 255;
    for (let i = 0; i < 256; i++) {
        cumulative += histogram[i];
        if (cumulative >= trim) { min = i; break; }
    }
    cumulative = 0;
    for (let i = 255; i >= 0; i--) {
        cumulative += histogram[i];
        if (cumulative >= trim) { max = i; break; }
    }

    /* "Smal" = bruikbaar bereik < 60% van full range. */
    const isNarrow = max - min < 153;
    return { min, max, isNarrow };
}

/**
 * Stretch contrast: map [min..max] grijswaarden naar [0..255].
 * Lift = donker scherper, knee = licht scherper. Werkt per RGB-kanaal.
 */
function stretchContrast(imageData: ImageData, min: number, max: number): void {
    const data = imageData.data;
    const range = max - min;
    if (range < 1) return;
    const scale = 255 / range;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, (data[i] - min) * scale));
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - min) * scale));
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - min) * scale));
        /* alpha (data[i+3]) onaangeraakt */
    }
}

/**
 * Detecteer bon-randen door rijen/kolommen te scannen naar witte/licht-grijze
 * achtergrond. Returnt crop-box of null als detectie onbetrouwbaar is.
 *
 * Heuristiek: een rij waar 80%+ pixels brightness > 200 (wit/papier) = waarschijnlijk
 * marge. Eerste rij vanaf rand die NIET aan die criterium voldoet = bon-grens.
 *
 * Conservatief: alleen crop als gedetecteerde marges < 25% per kant.
 */
function detectBonBox(imageData: ImageData): { x: number; y: number; w: number; h: number } | null {
    const { width, height, data } = imageData;
    const isMarginRow = (y: number): boolean => {
        const rowStart = y * width * 4;
        let whitePixels = 0;
        const samples = Math.min(width, 200);
        const step = Math.max(1, Math.floor(width / samples));
        let total = 0;
        for (let x = 0; x < width; x += step) {
            const i = rowStart + x * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness > 220) whitePixels++;
            total++;
        }
        return whitePixels / total > 0.85;
    };
    const isMarginCol = (x: number): boolean => {
        let whitePixels = 0;
        const samples = Math.min(height, 200);
        const step = Math.max(1, Math.floor(height / samples));
        let total = 0;
        for (let y = 0; y < height; y += step) {
            const i = (y * width + x) * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness > 220) whitePixels++;
            total++;
        }
        return whitePixels / total > 0.85;
    };

    /* Scan vanaf elke rand naar binnen. */
    let top = 0;
    while (top < height * 0.25 && isMarginRow(top)) top++;
    let bottom = height - 1;
    while (bottom > height * 0.75 && isMarginRow(bottom)) bottom--;
    let left = 0;
    while (left < width * 0.25 && isMarginCol(left)) left++;
    let right = width - 1;
    while (right > width * 0.75 && isMarginCol(right)) right--;

    /* Geef het op als de detectie aan een rand maximaal toesloeg (waarschijnlijk
       hele rand wit, geen duidelijke grens) of crop te klein is. */
    if (top >= height * 0.25 || bottom <= height * 0.75) return null;
    if (left >= width * 0.25 || right <= width * 0.75) return null;

    /* Padding van 2% terug zodat we de bon-rand niet over-croppen. */
    const padX = Math.round(width * 0.02);
    const padY = Math.round(height * 0.02);
    const x = Math.max(0, left - padX);
    const y = Math.max(0, top - padY);
    const w = Math.min(width - x, right - left + 2 * padX);
    const h = Math.min(height - y, bottom - top + 2 * padY);

    /* Alleen toepassen als crop ≥75% van de originele oppervlakte behoudt. */
    const originalArea = width * height;
    const newArea = w * h;
    if (newArea / originalArea < 0.4) return null;  // te aggressief
    if (newArea / originalArea > 0.95) return null; // zinloze crop

    return { x, y, w, h };
}

/**
 * Run de canvas-pipeline. Returns ge-preprocesseerde JPEG-Blob + aspect-ratio
 * info zodat de caller `maxWidthOrHeight` kan tunen voor lange bonnen.
 */
async function preprocessOnCanvas(file: File): Promise<{ blob: Blob; isLongReceipt: boolean }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
            try {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                if (!w || !h) {
                    URL.revokeObjectURL(objUrl);
                    reject(new Error('Image-dimensies onbekend'));
                    return;
                }
                const aspect = Math.max(w, h) / Math.min(w, h);
                const isLong = aspect > 2.5;

                let canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    URL.revokeObjectURL(objUrl);
                    reject(new Error('canvas-2d niet beschikbaar'));
                    return;
                }
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(objUrl);

                /* Step: histogram + optionele contrast-stretch */
                let imageData = ctx.getImageData(0, 0, w, h);
                const hist = analyzeHistogram(imageData);
                if (hist.isNarrow && hist.min < 100) {
                    /* Alleen stretchen als histogram echt smal en niet al donker. */
                    stretchContrast(imageData, hist.min, hist.max);
                    ctx.putImageData(imageData, 0, 0);
                }

                /* Step: auto-crop. Re-read na contrast-stretch zodat detectie
                   op gestrekt beeld werkt. */
                imageData = ctx.getImageData(0, 0, w, h);
                const cropBox = detectBonBox(imageData);
                if (cropBox) {
                    const cropped = document.createElement('canvas');
                    cropped.width = cropBox.w;
                    cropped.height = cropBox.h;
                    const cropCtx = cropped.getContext('2d');
                    if (cropCtx) {
                        cropCtx.drawImage(
                            canvas,
                            cropBox.x, cropBox.y, cropBox.w, cropBox.h,
                            0, 0, cropBox.w, cropBox.h,
                        );
                        canvas = cropped;
                    }
                }

                canvas.toBlob(
                    blob => {
                        if (!blob) return reject(new Error('toBlob faalde'));
                        resolve({ blob, isLongReceipt: isLong });
                    },
                    'image/jpeg',
                    0.92,
                );
            } catch (e) {
                URL.revokeObjectURL(objUrl);
                reject(e instanceof Error ? e : new Error('preprocess-onbekend'));
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            reject(new Error('Image kon niet geladen worden'));
        };
        img.src = objUrl;
    });
}

/* ── Hoofdfunctie ──────────────────────────────────────────────────── */

export async function compressBonImage(
    file: File,
    opts: CompressOptions = {},
): Promise<Blob> {
    const maxSizeMB = opts.maxSizeMB ?? 2;
    const baseMaxDimension = opts.maxWidthOrHeight ?? 2400;
    const quality = opts.quality ?? 0.85;

    let workingFile: File | Blob = file;
    let isLongReceipt = false;

    /* ── Step 1: HEIC → JPEG ───────────────────────────────────────── */
    if (isHeic(file)) {
        try {
            const heic2any = (await import('heic2any')).default;
            const converted = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.9,
            });
            const blob = Array.isArray(converted) ? converted[0] : converted;
            workingFile = new File(
                [blob],
                file.name.replace(/\.(heic|heif)$/i, '.jpg'),
                { type: 'image/jpeg', lastModified: file.lastModified },
            );
        } catch (e) {
            console.warn('[compressBonImage] HEIC conversion failed:', e);
            return file;
        }
    }

    /* ── Step 2-4: Canvas preprocessing (contrast + auto-crop) ─────── */
    if (!opts.skipPreprocessing && typeof document !== 'undefined') {
        try {
            const pre = await preprocessOnCanvas(workingFile as File);
            workingFile = new File(
                [pre.blob],
                (workingFile as File).name?.replace(/\.[^.]+$/, '.jpg') ?? 'bon.jpg',
                { type: 'image/jpeg' },
            );
            isLongReceipt = pre.isLongReceipt;
        } catch (e) {
            console.warn('[compressBonImage] preprocessing skipped:', e);
            /* fall through — werken met de niet-preprocessed file */
        }
    }

    /* ── Step 5: resize + JPEG compress ──────────────────────────── */
    /* Lange kassabon → meer pixels behouden zodat regel-tekst leesbaar blijft. */
    const maxDim = isLongReceipt ? Math.max(baseMaxDimension, 3200) : baseMaxDimension;

    try {
        const imageCompression = (await import('browser-image-compression')).default;
        const result = await imageCompression(workingFile as File, {
            maxSizeMB,
            maxWidthOrHeight: maxDim,
            useWebWorker: true,
            initialQuality: quality,
            preserveExif: false,
            fileType: 'image/jpeg',
        });
        return result;
    } catch (e) {
        console.warn('[compressBonImage] compression failed:', e);
        return workingFile;
    }
}

/**
 * Helper: convert Blob/File → base64 data URL.
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
 */
export async function sha256OfBlob(blob: Blob): Promise<string> {
    const buf = await blob.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
