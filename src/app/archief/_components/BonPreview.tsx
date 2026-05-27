/**
 * BonPreview — slide-over drawer met 4 tabs (P0.6).
 *
 * Design DNA uit Claude archief-detail.jsx.
 * Tabs:
 *   1. Preview     — PDF inline via lazy-loaded react-pdf-viewer + highlight
 *   2. Details     — key/value grid (datum, leverancier, totalen, BTW, RGS, tags)
 *   3. Voorraad    — stock_movements gekoppeld via bon_id (uit migratie 010)
 *   4. Activiteit  — audit_log timeline (record_table='bonnen')
 *
 * PdfViewerInner wordt lazy via next/dynamic geladen (ssr:false) zodat
 * 300kb pdf-viewer bundle niet in main chunk eindigt.
 */
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Eye, FileText, Package, Clock, Download, ExternalLink, Tag, Share2, Lock, Calendar, ZoomIn, ZoomOut, Search, ArrowDownRight, ArrowRight } from 'lucide-react';
import { useQueryState } from 'nuqs';
import type { BonRow, AuditLogEntry, StockMovementForBon } from '@/lib/dal/bonnen';
import { getStatusVisual } from '../_lib/statusMap';
import { fmtEur, fmtDate, fmtDateTime, fmtDateShort } from './format';
import { getSignedUrlAction } from '../actions';

const PdfViewerInner = dynamic(() => import('./PdfViewerInner'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full w-full items-center justify-center bg-white/5">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
        </div>
    ),
});

type Tab = 'preview' | 'details' | 'voorraad' | 'activiteit';

interface Props {
    bon: BonRow | null;
    onClose: () => void;
    onAuditLoad: (bonId: number) => Promise<AuditLogEntry[]>;
    onStockLoad: (bonId: number) => Promise<StockMovementForBon[]>;
}

export function BonPreview({ bon, onClose, onAuditLoad, onStockLoad }: Props) {
    const [tab, setTab] = useState<Tab>('preview');
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [mime, setMime] = useState<string | null>(null);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [q] = useQueryState('q');

    useEffect(() => {
        if (!bon) {
            setSignedUrl(null);
            setMime(null);
            return;
        }
        setUrlError(null);
        getSignedUrlAction({ bonId: bon.id }).then((r) => {
            if (r.ok) {
                setSignedUrl(r.url);
                setMime(r.mime);
            } else {
                setUrlError(r.error);
            }
        });
    }, [bon]);

    if (!bon) return null;

    const status = getStatusVisual(bon.status);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bon-preview-title"
            className="fixed inset-0 z-[9998] flex"
        >
            <button
                type="button"
                aria-label="Sluit detail"
                onClick={onClose}
                className="flex-1 cursor-default"
                style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' }}
            />

            <aside
                className="flex h-full w-[720px] max-w-[95vw] flex-col border-l"
                style={{
                    background: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                    animation: 'slideInRight .35s cubic-bezier(.16,1,.3,1)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-start justify-between border-b px-6 py-4"
                    style={{ borderColor: 'var(--border)' }}
                >
                    <div>
                        <div
                            id="bon-preview-title"
                            className="mb-1 text-[22px] font-extralight"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            {bon.leverancier_naam ?? bon.winkel ?? '—'}
                        </div>
                        <div className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                            <span>{fmtDate(bon.datum)}</span>
                            <span>·</span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[10px] font-semibold ${status.pillClass}`}
                            >
                                {status.label}
                            </span>
                            {bon.locked_at && (
                                <span
                                    className="inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[11px]"
                                    style={{
                                        background: 'rgba(59,130,246,.1)',
                                        color: 'var(--blue)',
                                        borderColor: 'rgba(59,130,246,.2)',
                                    }}
                                >
                                    <Lock size={10} />
                                    Vergrendeld
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Sluiten"
                        className="text-[var(--muted)] transition hover:text-[var(--text)]"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tab strip */}
                <div className="flex border-b px-6" style={{ borderColor: 'var(--border)' }}>
                    {(
                        [
                            { id: 'preview', label: 'Preview', icon: Eye },
                            { id: 'details', label: 'Details', icon: FileText },
                            { id: 'voorraad', label: 'Voorraad-impact', icon: Package },
                            { id: 'activiteit', label: 'Activiteit', icon: Clock },
                        ] as Array<{ id: Tab; label: string; icon: typeof Eye }>
                    ).map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className="flex items-center gap-1.5 border-b-2 px-4 py-3 text-[12px] font-semibold transition"
                            style={{
                                borderColor: tab === t.id ? 'var(--brand)' : 'transparent',
                                color: tab === t.id ? 'var(--text)' : 'var(--muted)',
                            }}
                        >
                            <t.icon size={14} />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                    {tab === 'preview' && (
                        <PreviewTab
                            url={signedUrl}
                            mime={mime}
                            highlight={q}
                            error={urlError}
                            bonId={bon.id}
                        />
                    )}
                    {tab === 'details' && <DetailsTab bon={bon} />}
                    {tab === 'voorraad' && <VoorraadTab bonId={bon.id} loader={onStockLoad} />}
                    {tab === 'activiteit' && <ActiviteitTab bonId={bon.id} loader={onAuditLoad} />}
                </div>

                {/* Bottom action bar */}
                <div
                    className="flex flex-wrap gap-2 border-t px-6 py-3.5"
                    style={{ borderColor: 'var(--border)' }}
                >
                    {signedUrl && (
                        <a
                            href={signedUrl}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--text)] transition hover:bg-white/[0.05]"
                        >
                            <Download size={14} />
                            Download
                        </a>
                    )}
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--text)] transition hover:bg-white/[0.05]"
                    >
                        <ExternalLink size={14} />
                        Open in Geld
                    </button>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] text-[var(--text)] transition hover:bg-white/[0.05]"
                    >
                        <Tag size={14} />
                        Hertaggen
                    </button>
                    <div className="flex-1" />
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--brand)] px-3 py-1.5 text-[12px] font-semibold text-black transition hover:bg-[var(--brand-hover)]"
                    >
                        <Share2 size={14} />
                        Export
                    </button>
                </div>
            </aside>
        </div>
    );
}

// ── Preview Tab ──────────────────────────────────────────────────────

function PreviewTab({
    url,
    mime,
    highlight,
    error,
    bonId,
}: {
    url: string | null;
    mime: string | null;
    highlight: string | null;
    error: string | null;
    bonId: number;
}) {
    // Error of leeg = "no file" state — niet alarmerend, wel uitnodigend.
    if (error) {
        // Specifieke "geen file in DB" detectie (uit DAL).
        const isMissingFile = /niet gevonden|not found|geen bestand/i.test(error);
        return isMissingFile ? (
            <NoFileState
                bonId={bonId}
                title="Geen bestand bewaard"
                description="Deze bon is gemaakt vóór de file-upload-flow live ging, of de file is later verwijderd. Scan opnieuw om de PDF toe te voegen."
                showScanCta
            />
        ) : (
            <NoFileState
                bonId={bonId}
                title="Kon bestand niet ophalen"
                description={`Er ging iets mis met laden: ${error}. Probeer 't opnieuw of scan de bon nog eens.`}
                showScanCta
            />
        );
    }

    if (!url) {
        // Loading state — skeleton ipv spinner (Doherty)
        return (
            <div className="flex h-full flex-col gap-3 p-6">
                <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
                <div className="flex-1 animate-pulse rounded-lg bg-white/5" />
            </div>
        );
    }

    const isPdf = mime?.includes('pdf') || url.toLowerCase().endsWith('.pdf');
    const isImage = mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(url);

    if (isPdf) {
        return (
            <div className="h-[calc(100vh-220px)]">
                {highlight && (
                    <div
                        className="flex items-center gap-1.5 border-b px-4 py-2 text-[11px] text-[var(--muted)]"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        <Search size={12} className="text-[var(--brand)]" />
                        Zoekterm:{' '}
                        <strong className="text-[var(--brand)]">{highlight}</strong>{' '}
                        <span className="text-[var(--muted-light)]">— gemarkeerd in PDF</span>
                    </div>
                )}
                <PdfViewerInner url={url} highlight={highlight ?? null} />
            </div>
        );
    }

    if (isImage) {
        return (
            <div className="flex h-full items-center justify-center bg-black/30 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Bon" className="max-h-full max-w-full object-contain" />
            </div>
        );
    }

    return <NoFileState bonId={bonId} title="Onbekend bestandstype" description={`MIME: ${mime ?? 'onbekend'}`} />;
}

/* Vriendelijke "geen bestand" state — design DNA: gold-tinted, niet rood/alarm.
   Bevat: illustratie + uitleg + duidelijke CTA (scan opnieuw). */
function NoFileState({
    bonId,
    title,
    description,
    showScanCta = true,
}: {
    bonId: number;
    title: string;
    description: string;
    showScanCta?: boolean;
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center">
            {/* Subtle line-art icon ipv groot blok */}
            <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--brand-gold)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.6 }}
                aria-hidden="true"
            >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" strokeDasharray="2 2" />
                <line x1="9" y1="17" x2="13" y2="17" strokeDasharray="2 2" />
            </svg>
            <div>
                <div
                    className="mb-1 text-[16px] font-light tracking-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    {title}
                </div>
                <p className="max-w-[320px] text-[12px] leading-[1.55] text-[var(--muted)]">
                    {description}
                </p>
            </div>
            {showScanCta && (
                <a
                    href={`/bonnen?prefill=${bonId}`}
                    className="inline-flex items-center gap-2 rounded-[10px] border px-3.5 py-2 text-[12px] font-semibold text-[var(--text)] transition hover:bg-white/[0.05]"
                    style={{
                        borderColor: 'rgba(196,163,90,0.3)',
                        background: 'rgba(196,163,90,0.05)',
                    }}
                >
                    Scan opnieuw om PDF toe te voegen →
                </a>
            )}
            <p className="text-[10px] text-[var(--muted-light)]">
                Bon-data (datum, leverancier, bedrag, BTW) blijft bewaard in de Details-tab.
            </p>
        </div>
    );
}

// ── Details Tab ──────────────────────────────────────────────────────

function DetailsTab({ bon }: { bon: BonRow }) {
    const rows: Array<{ k: string; v: React.ReactNode }> = [
        { k: 'Datum', v: fmtDate(bon.datum) },
        { k: 'Leverancier', v: bon.leverancier_naam ?? bon.winkel ?? '—' },
        {
            k: 'Totaal',
            v: <span className="font-mono tabular-nums">{fmtEur(Number(bon.totaal_bedrag ?? 0))}</span>,
        },
        {
            k: 'BTW 9%',
            v: (
                <span className="font-mono tabular-nums text-[var(--muted)]">
                    {fmtEur(Number(bon.btw_laag_bedrag ?? 0))}
                </span>
            ),
        },
        {
            k: 'BTW 21%',
            v: (
                <span className="font-mono tabular-nums text-[var(--muted)]">
                    {fmtEur(Number(bon.btw_hoog_bedrag ?? 0))}
                </span>
            ),
        },
        {
            k: 'RGS-code',
            v: bon.rgs_code ? (
                <>
                    <span className="font-mono text-[12px]">{bon.rgs_code}</span>
                    {bon.rgs_category_label && (
                        <span className="ml-2 text-[12px] text-[var(--muted)]">({bon.rgs_category_label})</span>
                    )}
                </>
            ) : (
                <span className="text-[var(--muted-light)]">Geen</span>
            ),
        },
        { k: 'Categorie', v: bon.categorie ?? <span className="text-[var(--muted-light)]">—</span> },
        {
            k: 'Bron',
            v: (
                <span className="capitalize">
                    {bon.source === 'scan'
                        ? 'Camera scan'
                        : bon.source === 'email'
                          ? 'Email-in'
                          : bon.source === 'api'
                            ? 'API'
                            : 'Upload'}
                </span>
            ),
        },
        {
            k: 'Event-koppeling',
            v: bon.hasEvent ? (
                <span className="inline-flex items-center gap-1.5">
                    <Calendar size={13} style={{ color: 'var(--brand-gold)' }} />
                    {bon.hasEvent}
                </span>
            ) : (
                <span className="text-[var(--muted-light)]">Geen</span>
            ),
        },
        {
            k: 'Tags',
            v:
                bon.tags && bon.tags.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1">
                        {bon.tags.map((t) => (
                            <span
                                key={t}
                                className="rounded-[4px] px-1.5 py-0.5 text-[10px] text-[var(--muted)]"
                                style={{ background: 'rgba(130,130,130,.08)' }}
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className="text-[var(--muted-light)]">—</span>
                ),
        },
    ];

    return (
        <div className="px-6 py-5">
            <div className="grid grid-cols-[140px_1fr]">
                {rows.map((r) => (
                    <Row key={r.k} k={r.k} v={r.v} />
                ))}
            </div>
        </div>
    );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
    return (
        <>
            <div
                className="border-b py-2.5 text-[13px] text-[var(--muted)]"
                style={{ borderColor: 'rgba(130,130,130,.06)' }}
            >
                {k}
            </div>
            <div
                className="border-b py-2.5 text-[13px] font-medium"
                style={{ borderColor: 'rgba(130,130,130,.06)' }}
            >
                {v}
            </div>
        </>
    );
}

// ── Voorraad Tab ──────────────────────────────────────────────────────

function VoorraadTab({
    bonId,
    loader,
}: {
    bonId: number;
    loader: (id: number) => Promise<StockMovementForBon[]>;
}) {
    const [movements, setMovements] = useState<StockMovementForBon[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        loader(bonId)
            .then(setMovements)
            .catch(() => setMovements([]))
            .finally(() => setLoading(false));
    }, [bonId, loader]);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
            </div>
        );
    }

    if (!movements || movements.length === 0) {
        return <EmptyTabState message="Geen voorraadmutaties gekoppeld aan deze bon" icon={Package} />;
    }

    return (
        <div className="px-6 py-5">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">
                Voorraadmutaties
            </div>
            <div className="flex flex-col gap-2">
                {movements.map((m) => (
                    <div
                        key={m.id}
                        className="flex items-center gap-3.5 rounded-[10px] border px-3.5 py-3"
                        style={{
                            background: 'rgba(130,130,130,.03)',
                            borderColor: 'var(--border)',
                        }}
                    >
                        <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px]"
                            style={{ background: 'rgba(34,197,94,.1)' }}
                        >
                            <ArrowDownRight size={14} className="text-emerald-400" />
                        </div>
                        <div className="flex-1">
                            <div className="text-[13px] font-semibold">{m.item_naam}</div>
                            <div className="text-[11px] text-[var(--muted)]">
                                {m.warehouse ?? 'Onbekend magazijn'} · {fmtDateShort(m.created_at)}
                            </div>
                        </div>
                        <div className="font-mono text-[13px] font-semibold tabular-nums text-emerald-400">
                            +{m.qty} {m.qty_eenheid ?? ''}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-3.5 flex items-center gap-1 text-[11px] text-[var(--muted)]">
                <ArrowRight size={11} />
                <a href="/voorraad?context=movements" className="underline">
                    Bekijk in Voorraad &gt; Historie
                </a>
            </div>
        </div>
    );
}

// ── Activiteit Tab ───────────────────────────────────────────────────

function ActiviteitTab({
    bonId,
    loader,
}: {
    bonId: number;
    loader: (id: number) => Promise<AuditLogEntry[]>;
}) {
    const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        loader(bonId)
            .then(setEntries)
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, [bonId, loader]);

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent" />
            </div>
        );
    }

    if (!entries || entries.length === 0) {
        return <EmptyTabState message="Nog geen activiteit gelogd" icon={Clock} />;
    }

    return (
        <div className="px-6 py-5">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[.15em] text-[var(--muted)]">
                Audit log
            </div>
            <div className="relative pl-5">
                {/* Timeline line */}
                <div
                    className="absolute top-1.5 bottom-1.5 left-[5px] w-px"
                    style={{ background: 'var(--border)' }}
                />
                {entries.map((e, i) => (
                    <div
                        key={e.id}
                        className="relative pb-4"
                        style={{ animation: `fadeInUp .3s ease ${i * 60}ms both` }}
                    >
                        <div
                            className="absolute top-1 left-[-16px] h-2.5 w-2.5 rounded-full border-2"
                            style={{
                                borderColor: 'var(--border)',
                                background: actorColor(e),
                            }}
                        />
                        <div className="mb-0.5 font-mono text-[10px] text-[var(--muted-light)]">
                            {fmtDateTime(e.changed_at)}
                        </div>
                        <div className="mb-0.5 text-[12px] font-semibold">
                            <span style={{ color: actorTextColor(e) }}>{actorLabel(e)}</span>
                            <span className="font-normal text-[var(--muted)]"> — {formatAction(e)}</span>
                        </div>
                        {formatDetail(e) && (
                            <div className="text-[11px] text-[var(--muted)]">{formatDetail(e)}</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

function actorLabel(e: AuditLogEntry): string {
    if (e.user_naam) return e.user_naam;
    if (!e.user_id) return 'Systeem';
    return 'Gebruiker';
}
function actorColor(e: AuditLogEntry): string {
    if (e.action === 'ai_scan' || e.action === 'extract_pdf') return 'var(--brand)';
    if (!e.user_id) return 'var(--blue)';
    return 'var(--bg-elevated)';
}
function actorTextColor(e: AuditLogEntry): string {
    if (e.action === 'ai_scan' || e.action === 'extract_pdf') return 'var(--brand)';
    return 'var(--text)';
}
function formatAction(e: AuditLogEntry): string {
    switch (e.action) {
        case 'insert': return 'Bon aangemaakt';
        case 'update': return 'Bijgewerkt';
        case 'delete': return 'Verwijderd';
        case 'ai_scan': return 'AI-gescand';
        case 'extract_pdf': return 'Tekst geëxtraheerd';
        case 'lock': return 'Vergrendeld voor aangifte';
        case 'unlock': return 'Vergrendeling opgeheven';
        case 'share_created': return 'Deellink aangemaakt';
        case 'share_revoked': return 'Deellink ingetrokken';
        case 'share_accessed': return 'Deellink geopend';
        case 'bulk_export': return 'Geëxporteerd in maandpakket';
        case 'moneybird_sync': return 'Naar Moneybird gesyncd';
        default: return e.action;
    }
}
function formatDetail(e: AuditLogEntry): string {
    const detail = e.changes?.detail;
    if (typeof detail === 'string') return detail;
    // Voor status_change: toon old → new
    const changes = e.changes as Record<string, { before?: unknown; after?: unknown }>;
    const entries = Object.entries(changes).filter(([k]) => k !== 'detail');
    if (entries.length === 0) return '';
    return entries
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${String(v?.before ?? '—')} → ${String(v?.after ?? '—')}`)
        .join(' · ');
}

// ── Helper ────────────────────────────────────────────────────────────

function EmptyTabState({
    message,
    icon: Icon = FileText,
}: {
    message: string;
    icon?: React.ComponentType<{ size?: number; className?: string }>;
}) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <Icon size={28} className="mb-3 text-[var(--muted-light)]" />
            <div className="text-[13px] text-[var(--muted)]">{message}</div>
        </div>
    );
}
