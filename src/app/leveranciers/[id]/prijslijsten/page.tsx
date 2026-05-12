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
import {
    Upload, FileText, Loader2, CheckCircle2, AlertTriangle, X, FileCheck2, RefreshCw, ArrowRight,
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
    parse_finished_at: string | null;
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

    /* Auto-refresh wanneer er iets parsing/queued is */
    useEffect(() => {
        const stillBusy = uploads.some(u => u.status === 'parsing' || u.status === 'queued');
        if (!stillBusy) return;
        const t = setInterval(() => { load(); }, 15_000);
        return () => clearInterval(t);
    }, [uploads, load]);

    async function uploadFiles(files: FileList | File[]) {
        const list = Array.from(files).filter(f => f.type === 'application/pdf' && f.size <= 32 * 1024 * 1024);
        if (list.length === 0) {
            showToast('Alleen PDFs onder 32MB', 'error');
            return;
        }
        setUploading(true);
        try {
            /* 1e PDF realtime */
            const fd = new FormData();
            fd.append('file', list[0]);
            const r1 = await fetch(`/api/leveranciers/${levId}/prijslijst/upload`, {
                method: 'POST', body: fd,
            });
            const d1 = await r1.json();
            if (!r1.ok) {
                showToast(d1?.error || 'upload mislukt', 'error');
                setUploading(false);
                return;
            }
            if (d1.deduped) {
                showToast('Al eerder verwerkt', 'info');
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
                    <button
                        onClick={load}
                        title="Refresh"
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
                        {uploads.map(u => <UploadRowItem key={u.id} u={u} levId={levId} />)}
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

function UploadRowItem({ u, levId }: { u: UploadRow; levId: number }) {
    const StatusIcon =
        u.status === 'parsed' ? CheckCircle2 :
        u.status === 'failed' ? AlertTriangle :
        u.status === 'dismissed' ? X :
        FileCheck2;
    const statusColor =
        u.status === 'parsed' ? '#5cb85c' :
        u.status === 'failed' ? '#e57373' :
        u.status === 'parsing' || u.status === 'queued' ? GOLD :
        'var(--muted)';
    const spinning = u.status === 'parsing' || u.status === 'queued' || u.status === 'uploaded';

    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
            padding: 12, display: 'flex', alignItems: 'center', gap: 12,
        }}>
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
                    <span>·</span>
                    <span>{(u.size_bytes / 1024 / 1024).toFixed(1)}MB</span>
                    <span>·</span>
                    <span style={{ textTransform: 'capitalize' }}>{u.processing_mode}</span>
                    {u.status === 'parsing' && <><span>·</span><span style={{ color: GOLD }}>verwerken…</span></>}
                    {u.status === 'queued' && <><span>·</span><span style={{ color: GOLD }}>in wachtrij</span></>}
                    {u.status === 'parsed' && u.parsed_product_count != null && (
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
                        <><span>·</span><span>€{(u.ai_cost_cents / 100).toFixed(2)}</span></>
                    )}
                    {u.status === 'failed' && u.parse_error && (
                        <><span>·</span><span style={{ color: '#e57373' }}>{u.parse_error.slice(0, 80)}</span></>
                    )}
                </div>
            </div>
            {u.status === 'parsed' && (
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
        </div>
    );
}
