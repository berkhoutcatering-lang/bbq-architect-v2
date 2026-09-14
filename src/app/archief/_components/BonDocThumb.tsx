'use client';
/**
 * BonDocThumb — de échte eerste pagina van de factuur als thumbnail.
 *
 * Verving BonReceiptThumb, dat een getekend nep-bonnetje met verzonnen
 * regels toonde. Hier: PDF → pagina 1 via pdf.js naar een klein canvas,
 * foto → gewoon de foto. Lui geladen (pas als de kaart in beeld komt),
 * maximaal drie tegelijk, en per sessie gecached zodat scrollen en
 * filteren niet opnieuw rendert.
 *
 * Signed-URLs komen in bulk via getSignedUrlsAction (één call per
 * zichtbare groep), niet één call per kaart.
 */

import { useEffect, useRef, useState } from 'react';
import { FileText, ImageOff } from 'lucide-react';
import { getSignedUrlsAction } from '../actions';

// Zelfde pdf.js-versie + CDN-worker als PdfViewerInner, zodat er één
// worker-bestand in de cache staat.
const PDFJS_VERSION = '5.6.205';
const WORKER_URL = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
const THUMB_WIDTH = 360; // px, scherp genoeg op een kaart van ~270px (2x op retina is overkill)

type Thumb = { kind: 'image'; src: string } | { kind: 'error' };

// ── Sessie-cache + wachtrij ─────────────────────────────────────────────

const thumbCache = new Map<number, Thumb>();
const inflight = new Map<number, Promise<Thumb>>();
const urlCache = new Map<number, { url: string; mime: string | null }>();

// Signed-URLs batchen: alle aanvragen binnen ~50ms in één server-call.
let urlBatch: { ids: Set<number>; promise: Promise<void> } | null = null;
function requestSignedUrl(bonId: number): Promise<{ url: string; mime: string | null } | null> {
    const cached = urlCache.get(bonId);
    if (cached) return Promise.resolve(cached);
    if (!urlBatch) {
        const ids = new Set<number>();
        const promise = new Promise<void>((resolve) => {
            setTimeout(async () => {
                const batchIds = Array.from(ids);
                urlBatch = null;
                try {
                    const res = await getSignedUrlsAction({ bonIds: batchIds.slice(0, 60) });
                    if (res.ok) {
                        for (const [id, v] of Object.entries(res.urls)) urlCache.set(Number(id), v);
                    }
                } finally {
                    resolve();
                }
            }, 50);
        });
        urlBatch = { ids, promise };
    }
    urlBatch.ids.add(bonId);
    return urlBatch.promise.then(() => urlCache.get(bonId) ?? null);
}

// Max 3 renders tegelijk — pdf.js + fetch van 35 PDFs parallel legt een
// telefoon plat.
let active = 0;
const waiting: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= 3) await new Promise<void>((r) => waiting.push(r));
    active += 1;
    try {
        return await fn();
    } finally {
        active -= 1;
        waiting.shift()?.();
    }
}

async function renderPdfFirstPage(url: string): Promise<string> {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
    const doc = await pdfjs.getDocument({ url }).promise;
    try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('geen canvas');
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.82);
    } finally {
        await doc.destroy();
    }
}

function loadThumb(bonId: number): Promise<Thumb> {
    const cached = thumbCache.get(bonId);
    if (cached) return Promise.resolve(cached);
    const running = inflight.get(bonId);
    if (running) return running;

    const p = (async (): Promise<Thumb> => {
        try {
            const file = await requestSignedUrl(bonId);
            if (!file) return { kind: 'error' };
            const isPdf = (file.mime ?? '').includes('pdf') || /\.pdf($|\?)/i.test(file.url);
            if (!isPdf) return { kind: 'image', src: file.url };
            const src = await withSlot(() => renderPdfFirstPage(file.url));
            return { kind: 'image', src };
        } catch {
            return { kind: 'error' };
        }
    })();
    inflight.set(bonId, p);
    p.then((t) => { thumbCache.set(bonId, t); inflight.delete(bonId); });
    return p;
}

// ── Component ───────────────────────────────────────────────────────────

interface Props {
    bonId: number;
    /** false = geen bestand bewaard → meteen de lege staat, geen fetch */
    hasFile: boolean;
    alt: string;
    className?: string;
}

export function BonDocThumb({ bonId, hasFile, alt, className }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [thumb, setThumb] = useState<Thumb | null>(() => thumbCache.get(bonId) ?? null);
    const [visible, setVisible] = useState(false);

    // Pas laden als de kaart (bijna) in beeld is.
    useEffect(() => {
        if (!hasFile || thumb) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
        }, { rootMargin: '300px' });
        io.observe(el);
        return () => io.disconnect();
    }, [hasFile, thumb]);

    useEffect(() => {
        if (!visible || !hasFile || thumb) return;
        let alive = true;
        loadThumb(bonId).then((t) => { if (alive) setThumb(t); });
        return () => { alive = false; };
    }, [visible, hasFile, thumb, bonId]);

    return (
        <div ref={ref} className={`bk-thumb ${className ?? ''}`} aria-label={alt}>
            {!hasFile ? (
                <div className="bk-thumb__empty"><FileText size={22} /><span>Geen bestand</span></div>
            ) : thumb?.kind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb.src} alt={alt} className="bk-thumb__img" draggable={false} />
            ) : thumb?.kind === 'error' ? (
                <div className="bk-thumb__empty"><ImageOff size={22} /><span>Voorbeeld niet beschikbaar</span></div>
            ) : (
                <div className="bk-thumb__skeleton" aria-hidden="true" />
            )}
        </div>
    );
}
