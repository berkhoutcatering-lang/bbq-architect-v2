'use client';
/**
 * MultiFormatDropZone — Bucket E P0-1 hoofd-UI.
 *
 * Doel: één component die foto's, PDFs, screenshots, clipboard-paste én UBL-XML
 * accepteert. Drie input-modi:
 *   - File-picker          (click op de drop-zone)
 *   - Drag & drop          (overal in viewport — een volledig-overlay verschijnt)
 *   - Cmd+V paste          (global window-listener)
 *   - Camera               (mobile capture="environment")
 *
 * Eenmaal geupload:
 *   1. compressBonImage (HEIC→JPG, EXIF-rotate, ≤2MB)
 *   2. extractPdfText voor PDFs (client-side, scheelt €0.05 als usable)
 *   3. POST /api/bonnen/extract met source_type + file_data_url (+ pdf_text)
 *   4. props.onExtracted(result) — parent beslist wat te doen met de preview
 *
 * Bestand-limiet 14 in batch (server doet 1-per-1; we throttlen client-side
 * tot er 1 in-flight is om backend niet te overspoelen).
 *
 * A11y:
 *   - <input type="file"> is gewone keyboard-accessible focus-target
 *   - Drop-zone heeft role="button" tabIndex={0} en Enter/Space triggert picker
 *   - aria-live region announces "PDF herkend — uitlezen via tekst" etc
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, Loader2, Upload, X, Sparkles, FileCode, Monitor } from 'lucide-react';
import { compressBonImage, blobToDataUrl } from '@/lib/compressBonImage';
import { extractPdfText } from '@/lib/pdfTextExtract';

export type SourceType = 'photo' | 'pdf' | 'screenshot' | 'clipboard' | 'ubl_xml' | 'camera';

export interface ExtractResult {
    ok: boolean;
    source_type: SourceType;
    bon_preview: {
        leverancier_naam: string | null;
        leverancier_id: number | null;
        datum: string | null;
        totaal_bedrag: number;
        netto_bedrag: number;
        btw_laag_bedrag: number;
        btw_hoog_bedrag: number;
    };
    items_with_suggestions: Array<{
        naam: string;
        aantal: number;
        unit: string;
        prijs: number;
        btw_pct: number;
        totaal: number;
        inventory_id: number | null;
        inventory_naam: string | null;
        match_confidence: 'high' | 'medium' | 'low' | 'none';
    }>;
    image_hash: string;
    ocr_engine: string;
    mime_type: string;
    confidence: number;
    ai_cost_eur_cents: number;
    processing_status: string;
    /* Leverancier-approval state — bepaalt welke UI Sam te zien krijgt
       voor de leverancier-stap voordat 'ie bevestigt naar archief. */
    leverancier_state?: 'auto_matched' | 'needs_approval' | 'new_suggested' | 'no_leverancier';
    leverancier_candidates?: Array<{ id: number; naam: string; score: number }>;
}

interface DuplicateError {
    error: 'duplicate';
    duplicate_bon_id: string;
    duplicate_winkel: string | null;
    duplicate_datum: string | null;
    duplicate_totaal: number;
}

export interface DropZoneProps {
    onExtracted: (result: ExtractResult, originalFile: File) => void;
    onDuplicate?: (dup: DuplicateError, originalFile: File) => void;
    onError?: (message: string) => void;
    /** Max files in one batch (server processes serial). Default 14. */
    maxBatch?: number;
    /** UX-mode: 'page' = full-page hero; 'sheet' = compact inside sheet. */
    variant?: 'page' | 'sheet';
}

interface QueueItem {
    id: string;
    file: File;
    status: 'pending' | 'compressing' | 'extracting' | 'done' | 'error' | 'duplicate';
    error?: string;
    /** Preview src voor thumbnail (object-url voor images, icon voor PDF/XML). */
    previewUrl?: string;
}

const ACCEPT_MIME =
    'image/*,application/pdf,application/xml,text/xml,application/ubl+xml,.xml,.heic,.heif';

const SOURCE_BY_MIME = (mime: string, file: File): SourceType => {
    const lower = (mime || '').toLowerCase();
    if (lower === 'application/pdf') return 'pdf';
    if (
        lower === 'application/xml' ||
        lower === 'text/xml' ||
        lower === 'application/ubl+xml' ||
        file.name.toLowerCase().endsWith('.xml')
    )
        return 'ubl_xml';
    if (lower.startsWith('image/')) return 'photo';
    return 'photo';
};

export default function MultiFormatDropZone(props: DropZoneProps) {
    const { onExtracted, onDuplicate, onError, maxBatch = 14, variant = 'page' } = props;

    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [announce, setAnnounce] = useState('');
    const dragCount = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const cameraInput = useRef<HTMLInputElement>(null);
    const processingRef = useRef(false);

    /* ── Helpers ─────────────────────────────────────────────────── */

    const announceFmt = useCallback((msg: string) => {
        setAnnounce(msg);
        /* Clear na 4s zodat screen-reader het opnieuw aankondigt bij volgend event. */
        setTimeout(() => setAnnounce(''), 4000);
    }, []);

    const enqueue = useCallback(
        (files: File[]) => {
            if (files.length === 0) return;
            if (files.length > maxBatch) {
                onError?.(
                    `Maximaal ${maxBatch} bestanden tegelijk. ${files.length - maxBatch} overgeslagen.`,
                );
                files = files.slice(0, maxBatch);
            }
            const items: QueueItem[] = files.map(f => ({
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                file: f,
                status: 'pending',
                previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
            }));
            setQueue(q => [...q, ...items]);
            announceFmt(
                `${files.length} bestand${files.length === 1 ? '' : 'en'} toegevoegd aan wachtrij.`,
            );
        },
        [maxBatch, onError, announceFmt],
    );

    /* ── Drag handlers (op window niveau zodat hele viewport reageert) ─ */

    useEffect(() => {
        const onDragEnter = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            e.preventDefault();
            dragCount.current++;
            setIsDragging(true);
        };
        const onDragLeave = (e: DragEvent) => {
            e.preventDefault();
            dragCount.current--;
            if (dragCount.current <= 0) {
                dragCount.current = 0;
                setIsDragging(false);
            }
        };
        const onDragOver = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            e.preventDefault();
            /* visueel feedback geven dat dit een drop-target is */
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        };
        const onDrop = (e: DragEvent) => {
            e.preventDefault();
            dragCount.current = 0;
            setIsDragging(false);
            const files = Array.from(e.dataTransfer?.files ?? []);
            enqueue(files);
        };

        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('drop', onDrop);
        };
    }, [enqueue]);

    /* ── Cmd+V paste handler ──────────────────────────────────────── */

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (const it of items) {
                if (it.kind === 'file') {
                    const f = it.getAsFile();
                    if (f) files.push(f);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                /* Markeer als screenshot/clipboard zodat extract-route source_type kent. */
                const renamed = files.map(
                    f =>
                        new File([f], f.name || `clipboard-${Date.now()}.png`, {
                            type: f.type || 'image/png',
                        }),
                );
                enqueue(renamed);
                announceFmt(`${files.length} afbeelding${files.length === 1 ? '' : 'en'} geplakt.`);
            }
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [enqueue, announceFmt]);

    /* ── Queue processor — één-in-flight, serial ─────────────────── */

    useEffect(() => {
        if (processingRef.current) return;
        const next = queue.find(q => q.status === 'pending');
        if (!next) return;

        processingRef.current = true;
        (async () => {
            try {
                /* Step 1: compress (HEIC→JPG, EXIF-rotate, ≤2MB). PDFs/XMLs blijven
                   onaangeraakt — die gaan direct als data-url door. */
                setQueue(q => q.map(it => (it.id === next.id ? { ...it, status: 'compressing' } : it)));
                announceFmt(`Bestand ${next.file.name} voorbereiden…`);

                const isImage = next.file.type.startsWith('image/');
                let blob: Blob;
                let pdfText: string | undefined;

                if (isImage) {
                    blob = await compressBonImage(next.file);
                } else if (next.file.type === 'application/pdf') {
                    /* Client-side text-extract: scheelt €0.05 per bon als usable. */
                    pdfText = await extractPdfText(next.file).catch(() => '');
                    blob = next.file;
                } else {
                    blob = next.file;
                }
                const fileDataUrl = await blobToDataUrl(blob);

                /* Step 2: extract */
                setQueue(q => q.map(it => (it.id === next.id ? { ...it, status: 'extracting' } : it)));
                announceFmt(`AI leest ${next.file.name} uit…`);

                const source_type = SOURCE_BY_MIME(blob.type || next.file.type, next.file);
                const res = await fetch('/api/bonnen/extract', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source_type,
                        file_data_url: fileDataUrl,
                        filename: next.file.name,
                        pdf_text: pdfText,
                    }),
                });

                if (res.status === 409) {
                    const dup = (await res.json()) as DuplicateError;
                    setQueue(q => q.map(it => (it.id === next.id ? { ...it, status: 'duplicate' } : it)));
                    onDuplicate?.(dup, next.file);
                    announceFmt(`${next.file.name} staat al in archief.`);
                    return;
                }

                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    const msg = errJson.message || errJson.error || `Status ${res.status}`;
                    setQueue(q =>
                        q.map(it =>
                            it.id === next.id ? { ...it, status: 'error', error: msg } : it,
                        ),
                    );
                    onError?.(msg);
                    return;
                }

                const result = (await res.json()) as ExtractResult;
                setQueue(q => q.map(it => (it.id === next.id ? { ...it, status: 'done' } : it)));
                announceFmt(`${next.file.name} klaar — preview opent.`);
                onExtracted(result, next.file);
            } catch (e) {
                const msg = (e as Error).message || 'Onbekende fout';
                setQueue(q =>
                    q.map(it => (it.id === next.id ? { ...it, status: 'error', error: msg } : it)),
                );
                onError?.(msg);
            } finally {
                processingRef.current = false;
                /* Trigger re-render om volgende pending op te pakken. */
                setQueue(q => [...q]);
            }
        })();
    }, [queue, onExtracted, onDuplicate, onError, announceFmt]);

    /* ── Cleanup object-urls ────────────────────────────────────── */
    useEffect(() => {
        return () => {
            queue.forEach(it => {
                if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        enqueue(files);
        /* Reset zodat zelfde file opnieuw gepicked kan worden. */
        e.target.value = '';
    };

    const removeFromQueue = (id: string) => {
        setQueue(q => {
            const item = q.find(x => x.id === id);
            if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return q.filter(x => x.id !== id);
        });
    };

    /* ── Render ─────────────────────────────────────────────────── */

    const compact = variant === 'sheet';

    return (
        <div style={{ position: 'relative' }}>
            {/* Hidden inputs */}
            <input
                ref={fileInput}
                type="file"
                accept={ACCEPT_MIME}
                multiple
                onChange={onPickerChange}
                style={{ display: 'none' }}
                aria-hidden="true"
            />
            <input
                ref={cameraInput}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPickerChange}
                style={{ display: 'none' }}
                aria-hidden="true"
            />

            {/* Hoofd drop-zone ── click of keyboard-Enter opent picker */}
            <div
                role="button"
                tabIndex={0}
                aria-label="Bon uploaden — foto, PDF, screenshot, of plak met Cmd+V"
                onClick={() => fileInput.current?.click()}
                onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        fileInput.current?.click();
                    }
                }}
                style={{
                    width: '100%',
                    minHeight: compact ? 200 : 360,
                    border: '2px dashed rgba(255,191,0,.3)',
                    borderRadius: 20,
                    padding: compact ? '24px 20px' : '48px 32px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    background:
                        'radial-gradient(ellipse at center, rgba(255,191,0,.03) 0%, transparent 70%)',
                    transition: 'border-color .2s, background .2s, transform .15s',
                    cursor: 'pointer',
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                        'rgba(255,191,0,.6)';
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                        'rgba(255,191,0,.3)';
                }}
            >
                <div
                    style={{
                        width: 72,
                        height: 72,
                        borderRadius: 18,
                        marginBottom: 20,
                        background: 'rgba(255,191,0,.08)',
                        border: '1px solid rgba(255,191,0,.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    aria-hidden="true"
                >
                    <Sparkles size={32} color="var(--brand)" strokeWidth={1.5} />
                </div>

                <div
                    style={{
                        fontSize: compact ? 18 : 22,
                        fontWeight: 300,
                        marginBottom: 6,
                        color: 'var(--text)',
                    }}
                >
                    Drop foto, PDF, screenshot of plak met{' '}
                    <kbd
                        style={{
                            fontSize: 12,
                            padding: '2px 8px',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            fontFamily: 'var(--font-mono, ui-monospace)',
                            background: 'rgba(130,130,130,.08)',
                        }}
                    >
                        ⌘V
                    </kbd>
                </div>
                <div
                    style={{
                        fontSize: 13,
                        color: 'var(--muted)',
                        marginBottom: 24,
                        maxWidth: 480,
                    }}
                >
                    Drop wat je hebt — wij regelen de rest
                </div>

                {/* Actie-knoppen */}
                <div
                    style={{
                        display: 'flex',
                        gap: 10,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        marginBottom: 24,
                    }}
                >
                    <DzButton
                        icon={<Camera size={18} />}
                        label="Camera"
                        onClick={e => {
                            e.stopPropagation();
                            cameraInput.current?.click();
                        }}
                    />
                    <DzButton
                        icon={<Upload size={18} />}
                        label="Upload"
                        onClick={e => {
                            e.stopPropagation();
                            fileInput.current?.click();
                        }}
                    />
                </div>

                {/* Format-rij */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    <span style={{ fontSize: 11, color: 'var(--muted-light, var(--muted))' }}>
                        Werkt op
                    </span>
                    <FormatPill icon={<FileText size={13} />} label="PDF" color="var(--blue)" />
                    <FormatPill icon={<ImageIcon size={13} />} label="JPG/PNG" color="var(--orange)" />
                    <FormatPill icon={<ImageIcon size={13} />} label="HEIC" color="var(--green)" />
                    <FormatPill icon={<FileCode size={13} />} label="UBL-XML" color="var(--purple, #a78bfa)" />
                    <FormatPill icon={<Monitor size={13} />} label="Screenshot" color="var(--cyan, #4ECDC4)" />
                </div>
            </div>

            {/* Queue lijst */}
            {queue.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div
                        style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--muted)',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                            letterSpacing: '.05em',
                        }}
                    >
                        Wachtrij ({queue.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {queue.map(it => (
                            <QueueRow key={it.id} item={it} onRemove={() => removeFromQueue(it.id)} />
                        ))}
                    </div>
                </div>
            )}

            {/* Full-page drag overlay */}
            {isDragging && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(0,0,0,.55)',
                        backdropFilter: 'blur(6px)',
                        pointerEvents: 'none',
                    }}
                    aria-hidden="true"
                >
                    <div
                        style={{
                            width: 560,
                            maxWidth: '88vw',
                            padding: '56px 40px',
                            border: '2px dashed rgba(255,191,0,.6)',
                            borderRadius: 20,
                            textAlign: 'center',
                            background: 'rgba(30,30,34,.85)',
                            boxShadow: '0 24px 60px rgba(0,0,0,.4)',
                        }}
                    >
                        <Upload size={48} color="var(--brand)" style={{ marginBottom: 12 }} />
                        <div style={{ fontSize: 24, fontWeight: 300, color: 'var(--text)' }}>
                            Laat los om te uploaden
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
                            PDF · JPG · PNG · HEIC · UBL-XML · Screenshot
                        </div>
                    </div>
                </div>
            )}

            {/* a11y live region */}
            <div
                role="status"
                aria-live="polite"
                style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                    clip: 'rect(0 0 0 0)',
                }}
            >
                {announce}
            </div>
        </div>
    );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function DzButton(props: {
    icon: React.ReactNode;
    label: string;
    onClick: (e: React.MouseEvent) => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                padding: '10px 16px',
                borderRadius: 12,
                background: 'rgba(130,130,130,.06)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,191,0,.08)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,191,0,.25)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(130,130,130,.06)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            }}
        >
            {props.icon}
            <span>{props.label}</span>
        </button>
    );
}

function FormatPill(props: { icon: React.ReactNode; label: string; color: string }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                color: 'var(--muted)',
            }}
        >
            <span style={{ color: props.color, display: 'inline-flex' }}>{props.icon}</span>
            {props.label}
        </span>
    );
}

function QueueRow(props: { item: QueueItem; onRemove: () => void }) {
    const { item } = props;
    const statusLabel: Record<QueueItem['status'], string> = {
        pending: 'In wachtrij',
        compressing: 'Voorbereiden…',
        extracting: 'AI leest uit…',
        done: 'Klaar',
        error: item.error || 'Mislukt',
        duplicate: 'Al in archief',
    };
    const statusColor: Record<QueueItem['status'], string> = {
        pending: 'var(--muted)',
        compressing: 'var(--blue)',
        extracting: 'var(--brand)',
        done: 'var(--green)',
        error: 'var(--red)',
        duplicate: 'var(--amber)',
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 10,
                borderRadius: 12,
                background: 'rgba(130,130,130,.05)',
                border: '1px solid var(--border)',
            }}
        >
            {item.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                    src={item.previewUrl}
                    alt=""
                    style={{
                        width: 44,
                        height: 44,
                        objectFit: 'cover',
                        borderRadius: 8,
                        flexShrink: 0,
                    }}
                />
            ) : (
                <div
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: 'rgba(130,130,130,.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {item.file.type === 'application/pdf' ? (
                        <FileText size={20} color="var(--blue)" />
                    ) : (
                        <FileCode size={20} color="var(--purple, #a78bfa)" />
                    )}
                </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {item.file.name}
                </div>
                <div style={{ fontSize: 11, color: statusColor[item.status] }}>
                    {(item.status === 'compressing' || item.status === 'extracting') && (
                        <Loader2
                            size={11}
                            style={{
                                display: 'inline',
                                marginRight: 4,
                                animation: 'spin 1s linear infinite',
                            }}
                        />
                    )}
                    {statusLabel[item.status]}
                </div>
            </div>
            <button
                type="button"
                onClick={props.onRemove}
                aria-label={`Verwijder ${item.file.name} uit wachtrij`}
                style={{
                    minWidth: 32,
                    minHeight: 32,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    borderRadius: 8,
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
}
