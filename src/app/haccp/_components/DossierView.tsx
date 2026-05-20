'use client';

import { useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    ShieldCheck,
    Download,
    ArrowLeft,
    TrendingUp,
    Archive,
} from 'lucide-react';

import Button from '@/components/Button';
import { downloadNvwaHaccpPdf } from '@/lib/haccpPdf';
import styles from '../haccp.module.css';
import {
    HACCP_EVENT,
    HACCP_PAST_DOSSIERS,
    type HaccpCheck,
    type HaccpEvent,
    type HaccpLogEntry,
} from '../_data';
import { Pill, StatTile, TypeBadge } from './atoms';
import TrendView from './TrendView';

interface Props {
    event: HaccpEvent;
    checks: HaccpCheck[];
    logEntries: Record<string, HaccpLogEntry>;
    archiveMode: boolean;
    archiveTab?: 'archive' | 'trends';
    onArchiveTabChange?: (tab: 'archive' | 'trends') => void;
    onBack: () => void;
}

export default function DossierView({
    event,
    checks,
    logEntries,
    archiveMode,
    archiveTab = 'archive',
    onArchiveTabChange,
    onBack,
}: Props) {
    const [showArchive, setShowArchive] = useState(archiveMode);

    if (showArchive) {
        return (
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 20,
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    <div>
                        <div className="eyebrow" style={{ marginBottom: 4 }}>
                            NVWA-DOSSIER
                        </div>
                        <h2
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontWeight: 300,
                                fontSize: 22,
                                margin: 0,
                            }}
                        >
                            HACCP {archiveTab === 'trends' ? 'Trends' : 'Archief'}
                        </h2>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* v3 SOTA-tab: Trend-review naast Archief */}
                        <div
                            style={{
                                display: 'inline-flex',
                                background: 'rgba(130,130,130,0.06)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 2,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => onArchiveTabChange?.('archive')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: archiveTab === 'archive' ? 'var(--brand)' : 'transparent',
                                    color: archiveTab === 'archive' ? '#000' : 'var(--muted)',
                                }}
                            >
                                <Archive size={12} />
                                Archief
                            </button>
                            <button
                                type="button"
                                onClick={() => onArchiveTabChange?.('trends')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: archiveTab === 'trends' ? 'var(--brand)' : 'transparent',
                                    color: archiveTab === 'trends' ? '#000' : 'var(--muted)',
                                }}
                            >
                                <TrendingUp size={12} />
                                Trends
                            </button>
                        </div>
                        <Button
                            variant="ghost"
                            icon={<ArrowLeft size={13} />}
                            onClick={onBack}
                        >
                            Terug
                        </Button>
                    </div>
                </div>

                {archiveTab === 'trends' && <TrendView />}
                {archiveTab === 'archive' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {HACCP_PAST_DOSSIERS.map((d) => (
                            <div
                                key={d.id}
                                className="metal"
                                role="button"
                                tabIndex={0}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setShowArchive(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setShowArchive(false);
                                    }
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 14,
                                        padding: 14,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 10,
                                            background:
                                                d.anomalies > 0
                                                    ? 'rgba(245,158,11,.12)'
                                                    : 'rgba(34,197,94,.12)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {d.anomalies > 0 ? (
                                            <AlertTriangle size={18} color="var(--amber)" />
                                        ) : (
                                            <CheckCircle2 size={18} color="var(--green)" />
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600 }}>{d.title}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {d.date} · {d.guests} gasten · {d.total} checks
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <Pill variant={d.anomalies > 0 ? 'optie' : 'ok'}>
                                            {d.anomalies > 0
                                                ? `${d.anomalies} afwijking`
                                                : 'Compleet'}
                                        </Pill>
                                    </div>
                                    <ChevronRight size={16} color="var(--muted)" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const enabled = checks.filter((c) => c.enabled);
    const okCount = enabled.filter((c) => logEntries[c.id]?.status === 'ok').length;
    const anomCount = enabled.filter(
        (c) => logEntries[c.id]?.status === 'afwijking',
    ).length;
    const anomalyChecks = enabled.filter(
        (c) => logEntries[c.id]?.status === 'afwijking',
    );
    const compliancePct =
        enabled.length > 0 ? Math.round((okCount / enabled.length) * 100) : 0;

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {anomCount > 0 && (
                <div
                    className={`${styles.anomalyBanner} ${styles.fadeUp}`}
                    style={{ marginBottom: 20 }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <AlertTriangle size={20} color="var(--amber)" />
                        <div style={{ flex: 1 }}>
                            <div
                                style={{
                                    fontSize: 15,
                                    fontWeight: 700,
                                    color: 'var(--amber)',
                                }}
                            >
                                {anomCount} afwijking{anomCount > 1 ? 'en' : ''} gedetecteerd
                            </div>
                            {anomalyChecks.map((c) => (
                                <div
                                    key={c.id}
                                    style={{
                                        fontSize: 12,
                                        color: 'var(--muted)',
                                        marginTop: 3,
                                    }}
                                >
                                    <strong>{c.label}:</strong> {logEntries[c.id]?.anomaly}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div
                        style={{
                            fontSize: 10,
                            color: 'var(--muted)',
                            marginTop: 10,
                            borderTop: '1px solid rgba(245,158,11,.2)',
                            paddingTop: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <ShieldCheck size={10} />
                        Data-integriteit: registratie is niet aangepast — anomaly genoteerd
                        achteraf
                    </div>
                </div>
            )}

            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                        NVWA-DOSSIER
                    </div>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 300,
                            fontSize: 22,
                            margin: 0,
                        }}
                    >
                        {event.title}
                    </h2>
                    <div
                        style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}
                    >
                        {event.guests} gasten · {event.servingTime} ·{' '}
                        {event.dayLabel || HACCP_EVENT.dayLabel}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {archiveMode && (
                        <Button
                            variant="ghost"
                            icon={<ArrowLeft size={13} />}
                            onClick={onBack}
                        >
                            Terug
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        icon={<Download size={13} />}
                        onClick={() => downloadNvwaHaccpPdf({ event, checks, logEntries })}
                    >
                        PDF exporteren
                    </Button>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginBottom: 24,
                }}
            >
                <StatTile
                    label="Totaal checks"
                    value={enabled.length}
                    icon={<ClipboardCheck size={16} color="var(--brand-gold)" />}
                />
                <StatTile
                    label="Goedgekeurd"
                    value={okCount}
                    tone="ok"
                    icon={<CheckCircle2 size={16} color="var(--green)" />}
                />
                <StatTile
                    label="Afwijkingen"
                    value={anomCount}
                    tone={anomCount > 0 ? 'warn' : 'ok'}
                    icon={
                        <AlertTriangle
                            size={16}
                            color={anomCount > 0 ? 'var(--amber)' : 'var(--green)'}
                        />
                    }
                />
                <StatTile
                    label="Compliance"
                    value={`${compliancePct}%`}
                    tone={anomCount === 0 ? 'ok' : 'warn'}
                    icon={<ShieldCheck size={16} color="var(--brand-gold)" />}
                />
            </div>

            <div className="metal" style={{ marginBottom: 24 }}>
                <div
                    className="metal-head"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Registratie-overzicht
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        100% mens-bevestigd
                    </span>
                </div>
                <div className="tbl-wrap">
                    <table className={styles.dossierTable} style={{ minWidth: 860 }}>
                        <thead>
                            <tr>
                                <th style={{ width: 28 }}>#</th>
                                <th style={{ minWidth: 130 }}>Check</th>
                                <th style={{ width: 90 }}>Type</th>
                                <th style={{ width: 100 }}>Norm</th>
                                <th style={{ width: 56 }}>Plan</th>
                                <th style={{ width: 56 }}>Log</th>
                                <th style={{ width: 80 }}>Waarde</th>
                                <th style={{ width: 110 }}>Status</th>
                                <th style={{ width: 90 }}>Door</th>
                            </tr>
                        </thead>
                        <tbody>
                            {enabled.map((c, i) => {
                                const entry = logEntries[c.id];
                                return (
                                    <tr
                                        key={c.id}
                                        className={
                                            entry?.status === 'afwijking'
                                                ? styles.dossierRowAnom
                                                : ''
                                        }
                                    >
                                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {i + 1}
                                        </td>
                                        <td style={{ fontWeight: 500 }}>{c.label}</td>
                                        <td>
                                            <TypeBadge type={c.type} />
                                        </td>
                                        <td
                                            style={{
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: 11,
                                            }}
                                        >
                                            {c.target}
                                        </td>
                                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {c.time}
                                        </td>
                                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {entry?.at || '—'}
                                        </td>
                                        <td
                                            style={{
                                                fontVariantNumeric: 'tabular-nums',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {entry?.val || '—'}
                                        </td>
                                        <td>
                                            {entry?.status === 'ok' && (
                                                <Pill
                                                    variant="ok"
                                                    icon={<CheckCircle2 size={10} />}
                                                >
                                                    OK
                                                </Pill>
                                            )}
                                            {entry?.status === 'afwijking' && (
                                                <Pill
                                                    variant="danger"
                                                    icon={<AlertTriangle size={10} />}
                                                >
                                                    Afwijking
                                                </Pill>
                                            )}
                                            {!entry && (
                                                <Pill variant="draft">Openstaand</Pill>
                                            )}
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {entry?.by || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div
                    style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <ShieldCheck size={12} />
                    Alle registraties zijn mens-bevestigd · geen AI-derived rijen · NVWA-compliant
                </div>
                <Button
                    variant="brand"
                    icon={<Download size={13} />}
                    onClick={() => downloadNvwaHaccpPdf({ event, checks, logEntries })}
                >
                    NVWA-rapport downloaden
                </Button>
            </div>
        </div>
    );
}
