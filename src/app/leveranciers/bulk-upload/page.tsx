'use client';
/**
 * /leveranciers/bulk-upload
 *
 * Bulk PDF-upload (tot 25 tegelijk). 1e PDF realtime (<30s), rest via Batch API.
 *
 * Pillar #2: hybride realtime + batch. Pillar #1: cut-classify gebeurt
 * server-side, hier alleen drop-and-watch.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { RequireTier } from '@/components/PaywallPrompt';
import Link from 'next/link';
import {
    Upload, FileText, Loader2, CheckCircle2, AlertTriangle, ArrowRight, X, FileCheck2, RefreshCw,
} from 'lucide-react';

const GOLD = '#c4a35a';
const MAX_FILES = 25;
const MAX_BYTES = 32 * 1024 * 1024;

interface Leverancier { id: number; naam: string; portal_hint: string | null }

type UploadStatus = 'pending' | 'uploading' | 'parsing' | 'done' | 'failed' | 'duplicate';

interface PdfQueueItem {
    file: File;
    status: UploadStatus;
    uploadId?: string;
    errorMsg?: string;
    lineCount?: number;
    newCount?: number;
    updatedCount?: number;
    costCents?: number;
}

export default function BulkUploadPage() {
    const showToast = useToast();
    const [queue, setQueue] = useState<PdfQueueItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [leveranciers, setLeveranciers] = useState<Leverancier[]>([]);
    const [selectedLevId, setSelectedLevId] = useState<number | null>(null);
    const [polling, setPolling] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    /* Load leverancier-lijst voor optionele binding */
    useEffect(() => {
        fetch('/api/leveranciers').then(r => r.json()).then(d => {
            setLeveranciers((d.data || []) as Leverancier[]);
        }).catch(() => { /* niet kritisch */ });
    }, []);

    const addFiles = useCallback((files: FileList | File[]) => {
        const valid: PdfQueueItem[] = [];
        Array.from(files).forEach(f => {
            if (f.type !== 'application/pdf') {
                showToast(`${f.name}: alleen PDF`, 'error');
                return;
            }
            if (f.size > MAX_BYTES) {
                showToast(`${f.name}: te groot (>32MB)`, 'error');
                return;
            }
            valid.push({ file: f, status: 'pending' });
        });
        setQueue(q => [...q, ...valid].slice(0, MAX_FILES));
    }, [showToast]);

    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragActive(false);
        if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const removeItem = (idx: number) => {
        setQueue(q => q.filter((_, i) => i !== idx));
    };

    async function pollBatchesNow() {
        if (polling) return;
        setPolling(true);
        try {
            const r = await fetch('/api/pricelists/batch/poll-mine', { method: 'POST' });
            const d = await r.json();
            if (!r.ok) {
                showToast(d?.error || 'refresh mislukt', 'error');
                return;
            }
            if (d.processed > 0) {
                /* Mark de queue items als done — naam zou via uploadId refetcht moeten,
                   maar voor v1: simpel laat user op "Naar review queue" klikken */
                setQueue(q => q.map(item => {
                    if (item.status === 'parsing') return { ...item, status: 'done' as UploadStatus };
                    return item;
                }));
                showToast(`${d.processed} PDFs verwerkt — open review queue`, 'success');
            } else if (d.pendingBatches > 0) {
                showToast(`${d.pendingBatches} batches nog bezig — probeer over 5-10 min`, 'info');
            } else {
                showToast('Niks om te refreshen', 'info');
            }
        } finally {
            setPolling(false);
        }
    }

    async function startProcessing() {
        if (queue.length === 0 || processing) return;
        setProcessing(true);

        try {
            const levId = selectedLevId ?? 0;

            /* 1e PDF realtime */
            const first = queue[0];
            setQueue(q => q.map((x, i) => i === 0 ? { ...x, status: 'uploading' } : x));

            const fd1 = new FormData();
            fd1.append('file', first.file);
            const r1 = await fetch(`/api/leveranciers/${levId}/prijslijst/upload`, {
                method: 'POST', body: fd1,
            });
            const d1 = await r1.json();

            if (!r1.ok) {
                setQueue(q => q.map((x, i) => i === 0
                    ? { ...x, status: 'failed', errorMsg: d1?.detail || d1?.error || 'mislukt' }
                    : x));
                showToast(d1?.error || 'eerste PDF mislukt', 'error');
                setProcessing(false);
                return;
            }
            if (d1.deduped) {
                setQueue(q => q.map((x, i) => i === 0
                    ? { ...x, status: 'duplicate', uploadId: d1.uploadId,
                        errorMsg: d1.message }
                    : x));
                if (d1.reassigned) {
                    showToast(d1.message || 'Gekoppeld aan deze leverancier', 'success');
                }
            } else {
                setQueue(q => q.map((x, i) => i === 0 ? {
                    ...x, status: 'done',
                    uploadId: d1.uploadId, lineCount: d1.lineCount,
                    newCount: d1.newCount, updatedCount: d1.updatedCount,
                    costCents: d1.costCents,
                } : x));
            }

            /* PDFs 2..N naar batch */
            const rest = queue.slice(1);
            if (rest.length > 0) {
                setQueue(q => q.map((x, i) => i > 0 ? { ...x, status: 'uploading' } : x));

                const fd2 = new FormData();
                rest.forEach(item => fd2.append('files', item.file));
                if (selectedLevId != null) {
                    fd2.append('meta', JSON.stringify({ leverancierId: selectedLevId }));
                }
                const r2 = await fetch('/api/pricelists/batch', { method: 'POST', body: fd2 });
                const d2 = await r2.json();

                if (!r2.ok) {
                    setQueue(q => q.map((x, i) => i > 0
                        ? { ...x, status: 'failed', errorMsg: d2?.detail || d2?.error || 'batch mislukt' }
                        : x));
                    showToast(d2?.error || 'batch enqueue mislukt', 'error');
                } else {
                    /* Mark all queued/parsing */
                    setQueue(q => q.map((x, i) => {
                        if (i === 0) return x;
                        const idx = i - 1;
                        const uploadId = d2.uploadIds?.[idx];
                        return { ...x, status: 'parsing' as UploadStatus, uploadId };
                    }));
                    showToast(
                        `1 klaar, ${d2.enqueuedCount ?? rest.length} in batch — refresh over 10-30 min`,
                        'success',
                    );
                }
            } else {
                showToast(`1 PDF klaar — ${d1.lineCount ?? 0} regels`, 'success');
            }
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setProcessing(false);
        }
    }

    const totalEstimateCents = queue.length * 20; /* €0.20 per PDF heuristic */
    const allDone = queue.length > 0 && queue.every(q => q.status === 'done' || q.status === 'failed' || q.status === 'duplicate');

    return (
        <RequireTier feature="price_intelligence">
            <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ marginBottom: 22 }}>
                    <Link
                        href="/leveranciers"
                        style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
                    >
                        ← Leveranciers
                    </Link>
                    <h1 style={{
                        fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200,
                        fontSize: 34, letterSpacing: '-.015em', margin: '8px 0 4px 0',
                    }}>
                        Bulk prijslijsten uploaden
                    </h1>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                        Tot 25 PDFs. 1e binnen 30s, rest via batch (~10-30 min).
                        AI herkent vlees-cuts (spiering, kippendij, brisket, …) en plaatst alles in de review-queue.
                    </div>
                </div>

                {/* Optionele leverancier-binding */}
                <div style={{
                    marginBottom: 16, padding: 14,
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                        Koppel aan leverancier (optioneel):
                    </div>
                    <select
                        value={selectedLevId ?? ''}
                        onChange={e => setSelectedLevId(e.target.value ? Number(e.target.value) : null)}
                        style={{
                            padding: '7px 10px', borderRadius: 8,
                            background: 'var(--bg)', border: '1px solid var(--border)',
                            color: 'var(--text)', fontSize: 13, minWidth: 200,
                        }}
                    >
                        <option value="">— laat AI detecteren —</option>
                        {leveranciers.map(l => (
                            <option key={l.id} value={l.id}>{l.naam}</option>
                        ))}
                    </select>
                </div>

                {/* Dropzone */}
                <div
                    onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
                    style={{
                        padding: 44, borderRadius: 14,
                        border: `2px dashed ${dragActive ? GOLD : 'var(--border)'}`,
                        background: dragActive ? `${GOLD}10` : 'var(--card)',
                        textAlign: 'center', cursor: 'pointer', transition: 'all .12s',
                        outline: 'none',
                    }}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(e) => {
                            if (e.target.files) addFiles(e.target.files);
                            e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                    />
                    <Upload size={30} style={{ color: GOLD, marginBottom: 10 }} />
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        {dragActive ? 'Drop hier' : 'Sleep prijslijst-PDFs hier'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                        Max {MAX_FILES} stuks · 32MB per PDF · Sligro · Hanos · Vuur & Rook · je slager — alles werkt
                    </div>
                </div>

                {/* Queue */}
                {queue.length > 0 && (
                    <>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 12, marginTop: 22,
                        }}>
                            {queue.map((q, i) => (
                                <UploadCard
                                    key={`${q.file.name}-${i}`}
                                    item={q}
                                    onRemove={!processing && q.status === 'pending'
                                        ? () => removeItem(i) : undefined}
                                />
                            ))}
                        </div>

                        {/* Sticky action bar */}
                        <div style={{
                            position: 'sticky', bottom: 0, marginTop: 22, padding: 16, zIndex: 5,
                            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexWrap: 'wrap', gap: 10,
                            backdropFilter: 'blur(8px)',
                        }}>
                            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                                <strong style={{ color: 'var(--text)' }}>{queue.length}</strong> PDFs ·
                                geschat <strong style={{ color: 'var(--text)' }}>€{(totalEstimateCents / 100).toFixed(2)}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {queue.some(q => q.status === 'parsing') && (
                                    <button
                                        onClick={pollBatchesNow}
                                        disabled={polling}
                                        title="Check Anthropic batch-status nu"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '11px 14px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                                            background: 'transparent', color: 'var(--text)',
                                            border: '1px solid var(--border)',
                                            cursor: polling ? 'wait' : 'pointer', opacity: polling ? 0.6 : 1,
                                        }}
                                    >
                                        {polling
                                            ? <><Loader2 size={13} className="animate-spin" /> Checken…</>
                                            : <><RefreshCw size={13} /> Refresh batches</>
                                        }
                                    </button>
                                )}
                                {allDone ? (
                                    <Link
                                        href="/leveranciers"
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                            padding: '11px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                                            background: GOLD, color: '#0a0a0c',
                                            textDecoration: 'none',
                                        }}
                                    >
                                        Naar review queue <ArrowRight size={14} />
                                    </Link>
                                ) : (
                                    <button
                                        onClick={startProcessing}
                                        disabled={processing}
                                        style={{
                                            padding: '11px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                                            background: GOLD, color: '#0a0a0c', border: 'none',
                                            cursor: processing ? 'wait' : 'pointer', opacity: processing ? 0.6 : 1,
                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                        }}
                                    >
                                        {processing
                                            ? <><Loader2 size={14} className="animate-spin" /> Bezig…</>
                                            : <>Start verwerking</>
                                        }
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </RequireTier>
    );
}

function UploadCard({ item, onRemove }: {
    item: PdfQueueItem;
    onRemove?: () => void;
}) {
    const StatusIcon =
        item.status === 'done' ? CheckCircle2 :
        item.status === 'failed' ? AlertTriangle :
        item.status === 'duplicate' ? FileCheck2 :
        item.status === 'pending' ? FileText : Loader2;

    const statusColor =
        item.status === 'done' ? '#5cb85c' :
        item.status === 'failed' ? '#e57373' :
        item.status === 'duplicate' ? '#7a9ec4' :
        GOLD;

    const borderColor =
        item.status === 'done' ? '#5cb85c55' :
        item.status === 'failed' ? '#e5737355' :
        item.status === 'duplicate' ? '#7a9ec455' :
        item.status === 'parsing' || item.status === 'uploading' ? `${GOLD}55` :
        'var(--border)';

    const spin = item.status === 'parsing' || item.status === 'uploading';

    return (
        <div style={{
            padding: 14, borderRadius: 12, background: 'var(--card)',
            border: `1px solid ${borderColor}`,
            position: 'relative',
        }}>
            {onRemove && (
                <button
                    onClick={onRemove}
                    aria-label="Verwijder uit queue"
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 22, height: 22, borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--border)',
                        cursor: 'pointer', color: 'var(--muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                ><X size={12} /></button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingRight: onRemove ? 28 : 0 }}>
                <StatusIcon
                    size={18}
                    className={spin ? 'animate-spin' : ''}
                    style={{ color: statusColor, flexShrink: 0 }}
                />
                <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    flex: 1, minWidth: 0,
                }}>
                    {item.file.name}
                </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span>{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
                <span>·</span>
                {item.status === 'pending' && <span>wachtend</span>}
                {item.status === 'uploading' && <span>uploaden…</span>}
                {item.status === 'parsing' && <span>AI verwerkt (batch)</span>}
                {item.status === 'duplicate' && <span>al eerder verwerkt</span>}
                {item.status === 'done' && (
                    <span style={{ color: 'var(--text)' }}>
                        {item.lineCount ?? 0} regels
                        {item.newCount != null && ` · ${item.newCount} nieuw`}
                        {item.updatedCount != null && ` · ${item.updatedCount} updates`}
                    </span>
                )}
                {item.status === 'failed' && (
                    <span style={{ color: '#e57373' }}>{item.errorMsg ?? 'mislukt'}</span>
                )}
            </div>
        </div>
    );
}
