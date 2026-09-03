'use client';
/**
 * /leveranciers/[id]/prijslijsten
 *
 * Lijst van PDF-uploads voor deze leverancier + drag-drop voor nieuwe.
 * Klik op een PDF die klaar is → opent review-queue via parent /leveranciers.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import { RequireTier } from '@/components/PaywallPrompt';
import { formatEur } from '@/lib/format';

import {
    Upload, FileText, Loader2, CheckCircle2, AlertTriangle, X, FileCheck2, RefreshCw, ArrowRight, Ban, Trash2,
} from 'lucide-react';

const GOLD = '#c4a35a';

interface UploadRow {
    id: string;
    filename: string;
    size_bytes: number;
    page_count: number | null;
    status: string;
    processing_mode: string;
    parsed_product_count: number | null;
    new_count: number | null;
    updated_count: number | null;
    ai_cost_cents: number | null;
    ai_model: string | null;
    parse_error: string | null;
    created_at: string;
    parse_started_at: string | null;
    parse_finished_at: string | null;
    chunk_total: number | null;
    chunks_done: number;
    chunks_failed: number;
    manual_review_required?: boolean | null;
}

interface ChunkRow {
    id: string;
    chunk_index: number;
    chunk_total: number;
    page_start: number;
    page_end: number;
    status: string;
    parsed_product_count: number | null;
    parse_error: string | null;
    retry_count: number;
    ai_cost_cents: number | null;
}

interface LeverancierMini { id: number; naam: string }

export default function PrijslijstenPage() {
    const params = useParams<{ id: string }>();
    const levId = Number(params?.id);
    const showToast = useToast();
    const [uploads, setUploads] = useState<UploadRow[]>([]);
    const [lev, setLev] = useState<LeverancierMini | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [polling, setPolling] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const load = useCallback(async () => {
        if (!Number.isInteger(levId)) return;
        setLoading(true);
        try {
            const r = await fetch(`/api/leveranciers/${levId}/prijslijsten`);
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error || 'kon prijslijsten niet laden');
            setLev(d.leverancier || null);
            setUploads((d.uploads || []) as UploadRow[]);
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setLoading(false);
        }
    }, [levId, showToast]);

    useEffect(() => { load(); }, [load]);

    /* Auto-refresh wanneer er iets parsing/queued is + 1× /min een echte
       batch-poll triggeren zodat Sam niet 24u op de daily cron hoeft te
       wachten (Vercel Hobby tier limit). 'partial' telt ook als nog actief
       voor de eerste paar minuten zodat chunk-retry-knoppen direct werken. */
    useEffect(() => {
        const stillBusy = uploads.some(u =>
            u.status === 'parsing' || u.status === 'queued',
        );
        if (!stillBusy) return;
        let tick = 0;
        const t = setInterval(async () => {
            tick++;
            /* Elke 60s: trigger Anthropic-poll. Elke 15s: lokale refresh. */
            if (tick % 4 === 0) {
                try { await fetch('/api/pricelists/batch/poll-mine', { method: 'POST' }); }
                catch { /* niet kritisch */ }
            }
            load();
        }, 15_000);
        return () => clearInterval(t);
    }, [uploads, load]);

    async function pollBatchesNow() {
        if (polling) return;
        setPolling(true);
        try {
            const r = await fetch('/api/pricelists/batch/poll-mine', { method: 'POST' });
            const d = await r.json();
            if (!r.ok) {
                showToast(d?.error || 'refresh mislukt', 'error');
            } else if (d.processed > 0) {
                showToast(`${d.processed} batches verwerkt`, 'success');
            } else if (d.pendingBatches > 0) {
                showToast(`${d.pendingBatches} batches nog bezig — probeer over 5-10 min`, 'info');
            } else {
                showToast('Niks om te refreshen', 'info');
            }
            await load();
        } finally {
            setPolling(false);
        }
    }

    async function uploadFiles(files: FileList | File[]) {
        const list = Array.from(files).filter(f => f.type === 'application/pdf' && f.size <= 32 * 1024 * 1024);
        if (list.length === 0) {
            showToast('Alleen PDFs onder 32MB', 'error');
            return;
        }
        setUploading(true);
        try {
            /* 1e PDF realtime — kan sync, chunked of reject teruggeven */
            const fd = new FormData();
            fd.append('file', list[0]);
            const r1 = await fetch(`/api/leveranciers/${levId}/prijslijst/upload`, {
                method: 'POST', body: fd,
            });
            const d1 = await r1.json();
            if (!r1.ok) {
                if (d1?.error === 'pdf_too_large') {
                    showToast(d1.detail || 'PDF te groot — splits handmatig', 'error');
                } else {
                    showToast(d1?.detail || d1?.error || 'upload mislukt', 'error');
                }
                setUploading(false);
                return;
            }
            if (d1.deduped) {
                showToast(d1.message || 'Al eerder verwerkt', d1.reassigned ? 'success' : 'info');
            } else if (d1.chunked) {
                showToast(
                    d1.message || `${list[0].name}: wordt in ${d1.chunkTotal} blokken verwerkt`,
                    'info',
                );
            } else {
                showToast(`${list[0].name}: ${d1.lineCount ?? 0} regels in review`, 'success');
            }

            /* Rest naar batch */
            if (list.length > 1) {
                const fd2 = new FormData();
                list.slice(1).forEach(f => fd2.append('files', f));
                fd2.append('meta', JSON.stringify({ leverancierId: levId }));
                const r2 = await fetch('/api/pricelists/batch', { method: 'POST', body: fd2 });
                const d2 = await r2.json();
                if (!r2.ok) {
                    showToast(d2?.error || 'batch mislukt', 'error');
                } else {
                    showToast(`+${d2.enqueuedCount ?? 0} in batch — refresh over ~10-30 min`, 'success');
                }
            }
            await load();
        } finally {
            setUploading(false);
        }
    }

    return (
        <RequireTier feature="price_intelligence">
            <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1100, margin: '0 auto' }}>
                <Link
                    href="/leveranciers"
                    style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}
                >
                    ← Leveranciers
                </Link>
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                    marginBottom: 18, marginTop: 8, flexWrap: 'wrap', gap: 12,
                }}>
                    <div>
                        <h1 style={{
                            fontFamily: 'Outfit, DM Sans, sans-serif', fontWeight: 200,
                            fontSize: 30, letterSpacing: '-.015em', margin: 0, marginBottom: 4,
                        }}>
                            Prijslijsten — {lev?.naam ?? '…'}
                        </h1>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                            PDF-imports. AI extract producten + classificeert vlees-cuts.
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {uploads.some(u => u.status === 'parsing' || u.status === 'queued') && (
                            <button
                                onClick={pollBatchesNow}
                                disabled={polling}
                                title="Check Anthropic batch-status nu (in plaats van wachten op nachtelijke cron)"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '8px 14px', borderRadius: 8,
                                    background: GOLD, color: '#0a0a0c', border: 'none',
                                    cursor: polling ? 'wait' : 'pointer', fontWeight: 700, fontSize: 12,
                                    opacity: polling ? 0.6 : 1,
                                }}
                            >
                                {polling
                                    ? <><Loader2 size={13} className="animate-spin" /> Checken…</>
                                    : <><RefreshCw size={13} /> Refresh batches</>
                                }
                            </button>
                        )}
                        <button
                            onClick={load}
                            title="Refresh lijst"
                            style={{
                                width: 36, height: 36, borderRadius: 8,
                                background: 'transparent', border: '1px solid var(--border)',
                                cursor: 'pointer', color: 'var(--muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {/* Dropzone */}
                <div
                    onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                        e.preventDefault(); setDragActive(false);
                        if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
                    }}
                    onClick={() => !uploading && inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    style={{
                        padding: 26, borderRadius: 12,
                        border: `2px dashed ${dragActive ? GOLD : 'var(--border)'}`,
                        background: dragActive ? `${GOLD}10` : 'var(--card)',
                        textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
                        transition: 'all .12s', marginBottom: 18,
                    }}
                >
                    <input
                        ref={inputRef}
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={(e) => {
                            if (e.target.files) uploadFiles(e.target.files);
                            e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                    />
                    {uploading
                        ? <Loader2 size={22} className="animate-spin" style={{ color: GOLD, marginBottom: 4 }} />
                        : <Upload size={22} style={{ color: GOLD, marginBottom: 4 }} />
                    }
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        {uploading ? 'Bezig…' : (dragActive ? 'Drop hier' : 'Sleep PDF(s) hier of klik')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        Max 25 stuks · 32MB per PDF
                    </div>
                </div>

                {/* Uploads-lijst */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                height: 58, borderRadius: 10,
                                background: 'linear-gradient(90deg, var(--card), rgba(255,255,255,0.04), var(--card))',
                                backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite',
                                border: '1px solid var(--border)',
                            }} />
                        ))}
                        <style jsx>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                    </div>
                ) : uploads.length === 0 ? (
                    <div style={{
                        background: 'var(--card)', border: '1px dashed var(--border)',
                        borderRadius: 12, padding: 28, textAlign: 'center',
                    }}>
                        <FileText size={26} style={{ color: GOLD, marginBottom: 8 }} />
                        <div style={{ fontSize: 14, color: 'var(--muted)' }}>
                            Nog geen PDF-uploads voor deze leverancier
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {uploads.map(u => (
                            <UploadRowItem
                                key={u.id}
                                u={u}
                                levId={levId}
                                onRetry={async () => {
                                    try {
                                        const r = await fetch(
                                            `/api/leveranciers/${levId}/prijslijst/${u.id}/retry`,
                                            { method: 'POST' },
                                        );
                                        const d = await r.json();
                                        if (!r.ok) {
                                            showToast(d?.detail || d?.error || 'retry mislukt', 'error');
                                        } else {
                                            showToast(`Klaar — ${d.lineCount ?? 0} regels in review`, 'success');
                                        }
                                        await load();
                                    } catch (e) {
                                        showToast((e as Error).message, 'error');
                                    }
                                }}
                                onCancel={async () => {
                                    try {
                                        const r = await fetch(
                                            `/api/leveranciers/${levId}/prijslijst/${u.id}/cancel`,
                                            { method: 'POST' },
                                        );
                                        const d = await r.json();
                                        if (!r.ok) {
                                            showToast(d?.detail || d?.error || 'annuleren mislukt', 'error');
                                        } else {
                                            showToast('Upload geannuleerd — je kan opnieuw proberen', 'success');
                                        }
                                        await load();
                                    } catch (e) {
                                        showToast((e as Error).message, 'error');
                                    }
                                }}
                                onDelete={async () => {
                                    try {
                                        const r = await fetch(
                                            `/api/leveranciers/${levId}/prijslijst/${u.id}/delete`,
                                            { method: 'POST' },
                                        );
                                        const d = await r.json();
                                        if (!r.ok) {
                                            showToast(d?.detail || d?.error || 'verwijderen mislukt', 'error');
                                        } else {
                                            const kept = d.keptMutations ?? 0;
                                            const msg = kept > 0
                                                ? `Upload verwijderd · ${kept} goedgekeurde mutations blijven staan`
                                                : 'Upload verwijderd — PDF kan opnieuw geupload worden';
                                            showToast(msg, 'success');
                                        }
                                        await load();
                                    } catch (e) {
                                        showToast((e as Error).message, 'error');
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </RequireTier>
    );
}

function fmtAgo(iso: string): string {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}u`;
    return `${Math.floor(diff / 86400)}d`;
}

function UploadRowItem({
    u, levId, onRetry, onCancel, onDelete,
}: {
    u: UploadRow;
    levId: number;
    onRetry: () => Promise<void>;
    onCancel: () => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const [retrying, setRetrying] = React.useState(false);
    const [cancelling, setCancelling] = React.useState(false);
    const [deleting, setDeleting] = React.useState(false);
    async function handleRetry() {
        if (retrying) return;
        setRetrying(true);
        try { await onRetry(); } finally { setRetrying(false); }
    }
    async function handleCancel() {
        if (cancelling) return;
        if (!confirm('Deze upload stoppen? Status wordt op "mislukt" gezet zodat je opnieuw kan proberen.')) return;
        setCancelling(true);
        try { await onCancel(); } finally { setCancelling(false); }
    }
    async function handleDelete() {
        if (deleting) return;
        if (!confirm('Deze upload volledig verwijderen? PDF + alle openstaande regels worden gewist. Goedgekeurde mutations blijven staan.')) return;
        setDeleting(true);
        try { await onDelete(); } finally { setDeleting(false); }
    }
    const isChunked = (u.chunk_total ?? 0) > 1;
    const StatusIcon =
        u.status === 'parsed' ? CheckCircle2 :
        u.status === 'partial' ? AlertTriangle :
        u.status === 'failed' ? AlertTriangle :
        u.status === 'dismissed' ? X :
        FileCheck2;
    const statusColor =
        u.status === 'parsed' ? '#5cb85c' :
        u.status === 'partial' ? '#e0a040' :
        u.status === 'failed' ? '#e57373' :
        u.status === 'parsing' || u.status === 'queued' ? GOLD :
        'var(--muted)';
    const spinning = u.status === 'parsing' || u.status === 'queued' || u.status === 'uploaded';
    const showProgress = u.status === 'parsing' || u.status === 'queued';

    /* Voor non-chunked failed uploads kan je hele upload retryen.
       Voor partial of chunked uploads loopt retry via chunk-strip. */
    const canRetryWhole = u.status === 'failed' && !isChunked;

    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {spinning
                    ? <Loader2 size={16} className="animate-spin" style={{ color: GOLD, flexShrink: 0 }} />
                    : <StatusIcon size={16} style={{ color: statusColor, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                        fontSize: 13, fontWeight: 700, color: 'var(--text)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {u.filename}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                        <span>{fmtAgo(u.created_at)} geleden</span>
                        {u.size_bytes != null && (
                            <><span>·</span><span>{(u.size_bytes / 1024 / 1024).toFixed(1)}MB</span></>
                        )}
                        {u.page_count != null && (
                            <><span>·</span><span>{u.page_count} pag</span></>
                        )}
                        <span>·</span>
                        <span style={{ textTransform: 'capitalize' }}>
                            {isChunked ? `chunked (${u.chunk_total} blokken)` : u.processing_mode}
                        </span>
                        {u.status === 'parsing' && !isChunked && <><span>·</span><span style={{ color: GOLD }}>verwerken…</span></>}
                        {u.status === 'parsing' && isChunked && (
                            <><span>·</span><span style={{ color: GOLD }}>{u.chunks_done}/{u.chunk_total} klaar</span></>
                        )}
                        {u.status === 'queued' && <><span>·</span><span style={{ color: GOLD }}>in wachtrij</span></>}
                        {u.status === 'partial' && (
                            <><span>·</span><span style={{ color: '#e0a040' }}>
                                {u.chunks_done}/{u.chunk_total} gelukt
                            </span></>
                        )}
                        {(u.status === 'parsed' || u.status === 'partial') && u.parsed_product_count != null && (
                            <>
                                <span>·</span>
                                <span style={{ color: 'var(--text)' }}>
                                    {u.parsed_product_count} regels
                                    {u.new_count != null && ` · ${u.new_count} nieuw`}
                                    {u.updated_count != null && ` · ${u.updated_count} updates`}
                                </span>
                            </>
                        )}
                        {u.ai_cost_cents != null && u.ai_cost_cents > 0 && (
                            <><span>·</span><span>{formatEur((u.ai_cost_cents / 100))}</span></>
                        )}
                        {u.status === 'failed' && u.parse_error && (
                            <><span>·</span><span style={{ color: '#e57373' }}>{u.parse_error.slice(0, 80)}</span></>
                        )}
                        {u.manual_review_required && (
                            <><span>·</span><span style={{ color: '#e0a040', fontWeight: 700 }}>handmatig nakijken</span></>
                        )}
                    </div>
                </div>
                {showProgress && (
                    <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        title="Force-stop deze upload zodat je opnieuw kan proberen"
                        style={{
                            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                            background: 'transparent', color: '#e57373',
                            border: '1px solid #e5737355',
                            cursor: cancelling ? 'wait' : 'pointer', opacity: cancelling ? 0.6 : 1,
                            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        }}
                    >
                        {cancelling
                            ? <><Loader2 size={11} className="animate-spin" /> Stoppen…</>
                            : <><Ban size={11} /> Annuleer</>
                        }
                    </button>
                )}
                {canRetryWhole && (
                    <button
                        onClick={handleRetry}
                        disabled={retrying}
                        title="PDF opnieuw door AI laten verwerken"
                        style={{
                            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            background: GOLD, color: '#0a0a0c', border: 'none',
                            cursor: retrying ? 'wait' : 'pointer', opacity: retrying ? 0.6 : 1,
                            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                        }}
                    >
                        {retrying
                            ? <><Loader2 size={11} className="animate-spin" /> Bezig…</>
                            : <><RefreshCw size={11} /> Probeer opnieuw</>
                        }
                    </button>
                )}
                {(u.status === 'parsed' || u.status === 'partial') && (
                    <Link
                        href={`/leveranciers?review=${levId}`}
                        style={{
                            padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            background: GOLD, color: '#0a0a0c', textDecoration: 'none',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        Review <ArrowRight size={11} />
                    </Link>
                )}
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    title="Verwijder deze upload helemaal (PDF + openstaande regels). Goedgekeurde mutations blijven."
                    style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: 'transparent', color: 'var(--muted)',
                        border: '1px solid var(--border)',
                        cursor: deleting ? 'wait' : 'pointer', opacity: deleting ? 0.5 : 1,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    {deleting
                        ? <Loader2 size={12} className="animate-spin" />
                        : <Trash2 size={12} />
                    }
                </button>
            </div>

            {showProgress && (
                <UploadProgressBar
                    isChunked={isChunked}
                    chunksDone={u.chunks_done}
                    chunkTotal={u.chunk_total ?? 1}
                    startedAt={u.parse_started_at ?? u.created_at}
                />
            )}

            {isChunked && (u.status === 'parsing' || u.status === 'partial' || u.status === 'failed') && (
                <ChunkProgressStrip parentId={u.id} levId={levId} />
            )}
        </div>
    );
}

function UploadProgressBar({
    isChunked, chunksDone, chunkTotal, startedAt,
}: {
    isChunked: boolean;
    chunksDone: number;
    chunkTotal: number;
    startedAt: string;
}) {
    const [elapsedSec, setElapsedSec] = React.useState(() =>
        Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
    );

    React.useEffect(() => {
        const t = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
        }, 1000);
        return () => clearInterval(t);
    }, [startedAt]);

    const fmtElapsed = (s: number): string => {
        if (s < 60) return `${s}s bezig`;
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}m ${r}s bezig`;
    };

    /* Stage-tekst die meeloopt met elapsed time. Geeft Sam een idee van WAT er
       gebeurt op elk moment — vooral nuttig in sync flow waar er anders geen
       feedback is tussen "send" en "receive". */
    const syncStage = (() => {
        if (elapsedSec < 3) return 'PDF voorbereiden…';
        if (elapsedSec < 12) return 'AI bekijkt de PDF…';
        if (elapsedSec < 30) return 'AI leest producten…';
        if (elapsedSec < 60) return 'AI verwerkt regels…';
        if (elapsedSec < 90) return 'Bijna klaar, dit duurt iets langer dan normaal…';
        return 'Hapert mogelijk — overweeg te annuleren en opnieuw';
    })();

    const chunkedStage = (() => {
        if (chunksDone === 0 && elapsedSec < 30) return 'Blokken worden voorbereid voor Batch API…';
        if (chunksDone === 0) return 'Wachten op eerste blok van Anthropic Batch (kan paar min duren)…';
        if (chunksDone < chunkTotal) return `${chunksDone} van ${chunkTotal} blokken geanalyseerd…`;
        return 'Resultaten worden samengevoegd…';
    })();

    /* Chunked: exacte progress. Sync: indeterminate (loopt heen-en-weer met CSS animatie). */
    const pct = isChunked ? Math.round((chunksDone / chunkTotal) * 100) : 0;

    /* Stuck-threshold: sync = 90s (1 Anthropic call moet snel zijn),
       chunked = 10 min (Batch API kan tot 24u, 10 min is realistic voor first chunk). */
    const stuckThreshold = isChunked ? 10 * 60 : 90;
    const stuck = elapsedSec > stuckThreshold;

    return (
        <div style={{ marginTop: 8, paddingLeft: 28 }}>
            <div style={{
                height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 2,
                overflow: 'hidden', position: 'relative',
            }}>
                {isChunked ? (
                    <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: stuck ? '#e0a040' : GOLD,
                        transition: 'width .4s ease',
                        boxShadow: `0 0 8px ${stuck ? '#e0a04055' : `${GOLD}66`}`,
                    }} />
                ) : (
                    <div style={{
                        position: 'absolute',
                        height: '100%',
                        width: '30%',
                        background: stuck ? '#e0a040' : GOLD,
                        borderRadius: 2,
                        boxShadow: `0 0 8px ${stuck ? '#e0a04055' : `${GOLD}66`}`,
                        animation: 'indeterminate 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
                    }} />
                )}
            </div>
            <div style={{
                marginTop: 4, fontSize: 10, color: stuck ? '#e0a040' : 'var(--muted)',
                display: 'flex', justifyContent: 'space-between', gap: 12,
            }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isChunked ? chunkedStage : syncStage}
                </span>
                <span style={{ flexShrink: 0 }}>
                    {fmtElapsed(elapsedSec)}
                    {stuck && (isChunked ? ' · duurt langer dan normaal' : ' · annuleer en probeer opnieuw')}
                </span>
            </div>
            <style jsx>{`
                @keyframes indeterminate {
                    0% { left: -30%; }
                    100% { left: 100%; }
                }
            `}</style>
        </div>
    );
}

function ChunkProgressStrip({ parentId, levId }: { parentId: string; levId: number }) {
    const showToast = useToast();
    const [chunks, setChunks] = React.useState<ChunkRow[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [retryingId, setRetryingId] = React.useState<string | null>(null);

    const load = React.useCallback(async () => {
        try {
            const r = await fetch(`/api/pricelists/uploads/${parentId}/chunks`);
            const d = await r.json();
            if (r.ok) setChunks((d.chunks ?? []) as ChunkRow[]);
        } catch { /* silent */ }
        finally { setLoading(false); }
    }, [parentId]);

    React.useEffect(() => { load(); }, [load]);

    /* Poll als chunks nog parsing zijn */
    React.useEffect(() => {
        const busy = chunks.some(c => c.status === 'parsing' || c.status === 'queued');
        if (!busy) return;
        const t = setInterval(load, 8_000);
        return () => clearInterval(t);
    }, [chunks, load]);

    async function retryChunk(chunkId: string) {
        if (retryingId) return;
        setRetryingId(chunkId);
        try {
            const r = await fetch(
                `/api/leveranciers/${levId}/prijslijst/${parentId}/retry?chunkId=${chunkId}`,
                { method: 'POST' },
            );
            const d = await r.json();
            if (!r.ok) {
                showToast(d?.detail || d?.error || 'chunk retry mislukt', 'error');
            } else {
                showToast(`Blok klaar — ${d.lineCount ?? 0} regels`, 'success');
            }
            await load();
        } catch (e) {
            showToast((e as Error).message, 'error');
        } finally {
            setRetryingId(null);
        }
    }

    if (loading) {
        return (
            <div style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 28 }}>
                blokken laden…
            </div>
        );
    }
    if (chunks.length === 0) return null;

    return (
        <div style={{
            paddingLeft: 28, display: 'flex', flexDirection: 'column', gap: 4,
            borderTop: '1px dashed var(--border)', paddingTop: 8,
        }}>
            <div style={{
                display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center',
            }}>
                {chunks.map(c => {
                    const dotColor =
                        c.status === 'parsed' ? '#5cb85c' :
                        c.status === 'failed' ? '#e57373' :
                        c.status === 'parsing' ? GOLD : 'var(--muted)';
                    return (
                        <div
                            key={c.id}
                            title={`Blok ${c.chunk_index + 1}/${c.chunk_total} — pag ${c.page_start}-${c.page_end} — ${c.status}${c.parsed_product_count != null ? ` (${c.parsed_product_count} regels)` : ''}${c.parse_error ? ` · ${c.parse_error.slice(0, 100)}` : ''}`}
                            style={{
                                width: 10, height: 10, borderRadius: 5, background: dotColor,
                                flexShrink: 0,
                                animation: c.status === 'parsing' ? 'pulse 1.4s ease-in-out infinite' : undefined,
                            }}
                        />
                    );
                })}
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
                    {chunks.filter(c => c.status === 'parsed').length}/{chunks.length} blokken
                </span>
            </div>
            {chunks.filter(c => c.status === 'failed').map(c => (
                <div key={`fail-${c.id}`} style={{
                    fontSize: 11, color: '#e57373', display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 2,
                }}>
                    <span>
                        Blok {c.chunk_index + 1} (pag {c.page_start}-{c.page_end}) mislukt
                        {c.retry_count > 0 && ` · ${c.retry_count}× geprobeerd`}
                    </span>
                    {c.retry_count < 2 && (
                        <button
                            onClick={() => retryChunk(c.id)}
                            disabled={retryingId === c.id}
                            style={{
                                fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                background: GOLD, color: '#0a0a0c', border: 'none',
                                cursor: retryingId === c.id ? 'wait' : 'pointer',
                                opacity: retryingId === c.id ? 0.6 : 1,
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}
                        >
                            {retryingId === c.id
                                ? <><Loader2 size={10} className="animate-spin" /> Bezig…</>
                                : <><RefreshCw size={10} /> Opnieuw</>
                            }
                        </button>
                    )}
                </div>
            ))}
            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
