'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import styles from '../haccp.module.css';

interface TrendRow {
    check_type: string;
    wat: string;
    total_checks: number;
    ok_count: number;
    deviation_count: number;
    anomaly_count: number;
    avg_temp: number;
    min_temp: number;
    max_temp: number;
    last_check_at: string;
    deviation_pct: number;
}

interface Props {
    days?: 30 | 90 | 180;
}

/**
 * TrendView — 90-day pattern review in Dossier-archief.
 *
 * SOTA gap-filler: "trend review across recurring issues — showing not just
 * that data was collected but reviewed and acted upon."
 * Sluit gap vs SafetyCulture/FoodReady/FoodDocs.
 *
 * Toont per (gerecht, check_type): aantal checks, afwijking%, anomalies,
 * gemiddelde + min/max temp over de gekozen periode.
 */
export default function TrendView({ days: initialDays = 90 }: Props) {
    const [days, setDays] = useState<30 | 90 | 180>(initialDays);
    const [rows, setRows] = useState<TrendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        fetch(`/api/haccp/trends?days=${days}`)
            .then(async (r) => {
                if (!r.ok) throw new Error(`API ${r.status}`);
                return (await r.json()) as { trends: TrendRow[] };
            })
            .then((d) => {
                setRows(d.trends || []);
                setLoading(false);
            })
            .catch((err: Error) => {
                setError(err.message);
                setLoading(false);
            });
    }, [days]);

    const totalDeviations = rows.reduce((s, r) => s + r.deviation_count, 0);
    const totalChecks = rows.reduce((s, r) => s + r.total_checks, 0);
    const overallDeviationPct = totalChecks > 0 ? Math.round((totalDeviations / totalChecks) * 100) : 0;

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
                        TREND-REVIEW
                    </div>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 300,
                            fontSize: 22,
                            margin: 0,
                        }}
                    >
                        Wat wijkt af in de laatste {days} dagen
                    </h2>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {([30, 90, 180] as const).map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDays(d)}
                            className={d === days ? 'pill pill-green' : 'pill'}
                            style={{ cursor: 'pointer', fontSize: 11 }}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {loading && (
                <div
                    className="metal"
                    style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}
                >
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 12, marginTop: 6 }}>Trends laden…</div>
                </div>
            )}

            {error && !loading && (
                <div
                    className="metal"
                    style={{
                        padding: 24,
                        textAlign: 'center',
                        borderLeft: '3px solid var(--amber)',
                    }}
                >
                    <AlertTriangle size={20} color="var(--amber)" />
                    <div style={{ fontSize: 13, marginTop: 6 }}>Kon trends niet laden: {error}</div>
                </div>
            )}

            {!loading && !error && rows.length === 0 && (
                <div
                    className="metal"
                    style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}
                >
                    <CheckCircle2 size={24} color="var(--green)" />
                    <div style={{ fontSize: 14, marginTop: 8, fontWeight: 600 }}>
                        Geen logs in deze periode
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                        Begin met loggen op een event om trends te zien.
                    </div>
                </div>
            )}

            {!loading && rows.length > 0 && (
                <>
                    {/* Overall summary */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 12,
                            marginBottom: 24,
                        }}
                    >
                        <div className={styles.statTile}>
                            <div
                                className={styles.statTileIcon}
                                style={{ background: 'rgba(196,163,90,.12)' }}
                            >
                                <TrendingUp size={16} color="var(--brand-gold)" />
                            </div>
                            <div>
                                <div className={styles.statTileValue}>{totalChecks}</div>
                                <div className={styles.statTileLabel}>Totaal checks</div>
                            </div>
                        </div>
                        <div className={styles.statTile}>
                            <div
                                className={`${styles.statTileIcon} ${overallDeviationPct === 0 ? styles.statTileIconOk : styles.statTileIconWarn}`}
                            >
                                {overallDeviationPct === 0 ? (
                                    <CheckCircle2 size={16} color="var(--green)" />
                                ) : (
                                    <AlertTriangle size={16} color="var(--amber)" />
                                )}
                            </div>
                            <div>
                                <div
                                    className={styles.statTileValue}
                                    style={{
                                        color: overallDeviationPct === 0 ? 'var(--green)' : 'var(--amber)',
                                    }}
                                >
                                    {overallDeviationPct}%
                                </div>
                                <div className={styles.statTileLabel}>Afwijkingen</div>
                            </div>
                        </div>
                        <div className={styles.statTile}>
                            <div className={styles.statTileIcon}>
                                <AlertTriangle size={16} color="var(--muted)" />
                            </div>
                            <div>
                                <div className={styles.statTileValue}>
                                    {rows.filter((r) => r.deviation_pct > 0).length}
                                </div>
                                <div className={styles.statTileLabel}>Risk-prone gerechten</div>
                            </div>
                        </div>
                        <div className={styles.statTile}>
                            <div className={styles.statTileIcon}>
                                <TrendingUp size={16} color="var(--muted)" />
                            </div>
                            <div>
                                <div className={styles.statTileValue}>{rows.length}</div>
                                <div className={styles.statTileLabel}>Unieke combinaties</div>
                            </div>
                        </div>
                    </div>

                    {/* Trends-tabel */}
                    <div className="metal" style={{ marginBottom: 24 }}>
                        <div
                            className="metal-head"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                Per gerecht × check-type
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                Gesorteerd op afwijking% (hoog → laag)
                            </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className={styles.dossierTable} style={{ minWidth: 720 }}>
                                <thead>
                                    <tr>
                                        <th style={{ minWidth: 140 }}>Gerecht</th>
                                        <th style={{ width: 80 }}>Type</th>
                                        <th style={{ width: 60 }}>Totaal</th>
                                        <th style={{ width: 80 }}>Afwijking%</th>
                                        <th style={{ width: 80 }}>Anomalies</th>
                                        <th style={{ width: 100 }}>Avg temp</th>
                                        <th style={{ width: 100 }}>Min / max</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => {
                                        const isWarn = r.deviation_pct > 0;
                                        const isHigh = r.deviation_pct >= 20;
                                        return (
                                            <tr
                                                key={`${r.check_type}-${r.wat}`}
                                                className={isHigh ? styles.dossierRowAnom : ''}
                                            >
                                                <td style={{ fontWeight: 500 }}>{r.wat || '—'}</td>
                                                <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                    {r.check_type}
                                                </td>
                                                <td className="tabular">{r.total_checks}</td>
                                                <td>
                                                    <span
                                                        style={{
                                                            color: isHigh
                                                                ? 'var(--amber)'
                                                                : isWarn
                                                                  ? 'var(--text)'
                                                                  : 'var(--green)',
                                                            fontWeight: isWarn ? 700 : 400,
                                                            fontVariantNumeric: 'tabular-nums',
                                                        }}
                                                    >
                                                        {r.deviation_pct}%
                                                    </span>
                                                </td>
                                                <td className="tabular">
                                                    {r.anomaly_count > 0 ? (
                                                        <span style={{ color: 'var(--amber)', fontWeight: 600 }}>
                                                            {r.anomaly_count}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td
                                                    className="tabular"
                                                    style={{ fontFamily: 'var(--font-mono)' }}
                                                >
                                                    {r.avg_temp ? `${Number(r.avg_temp).toFixed(1)}°C` : '—'}
                                                </td>
                                                <td
                                                    className="tabular"
                                                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                                                >
                                                    {r.min_temp != null && r.max_temp != null
                                                        ? `${Number(r.min_temp).toFixed(1)} / ${Number(r.max_temp).toFixed(1)}`
                                                        : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Footer-toelichting */}
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--muted)',
                            padding: 12,
                            borderRadius: 8,
                            background: 'rgba(130,130,130,.04)',
                            border: '1px solid var(--border)',
                        }}
                    >
                        <strong style={{ color: 'var(--text)' }}>Trend-review</strong> — rijen met
                        ≥20% afwijking krijgen een amber rij. Anomalies = post-hoc z-score &gt;2σ
                        van rolling 30-day baseline. Gebruik dit om pro-actief gerechten met
                        terugkerende issues op te pakken (sensor, proces, training).
                    </div>
                </>
            )}
        </div>
    );
}
