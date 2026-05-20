import Link from 'next/link';
import { ShieldCheck, ArrowRight, Clock } from 'lucide-react';
import type { AllergenStats } from '../_lib/types';

interface Props {
    stats: AllergenStats;
}

/* Donut chart met 3 segmenten (audit-proof groen, partial amber, missing rood).
   Pure SVG met strokeDasharray-trick — geen chart-library nodig. */
export default function AllergenDonut({ stats }: Props) {
    const total = stats.totalGerechten;
    const pct = total ? Math.round(stats.auditProof / total * 100) : 0;
    const size = 100;
    const strokeW = 8;
    const r = (size - strokeW) / 2;
    const c = 2 * Math.PI * r;

    const dashAudit = total ? c * (stats.auditProof / total) : 0;
    const dashPartial = total ? c * (stats.partial / total) : 0;
    const dashMissing = total ? c * (stats.missing / total) : 0;

    const segments = [
        { dash: dashAudit,   color: 'var(--green)', offset: 0 },
        { dash: dashPartial, color: 'var(--amber)', offset: dashAudit },
        { dash: dashMissing, color: 'var(--red)',   offset: dashAudit + dashPartial },
    ];

    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <ShieldCheck size={15} color="var(--brand-gold)" />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Allergeen-readiness</span>
                    <Link href="/gerechten/allergen-queue" style={{ marginLeft: 'auto', textDecoration: 'none', fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Open queue <ArrowRight size={12} />
                    </Link>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    {/* Donut */}
                    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
                        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden>
                            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(130,130,130,.08)" strokeWidth={strokeW} />
                            {total > 0 && segments.map((seg, i) => (
                                <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
                                    stroke={seg.color} strokeWidth={strokeW}
                                    strokeDasharray={`${seg.dash} ${c}`}
                                    strokeDashoffset={-seg.offset}
                                    strokeLinecap="round"
                                />
                            ))}
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                            <span className="metric" style={{ fontSize: 22, lineHeight: 1 }}>{pct}%</span>
                        </div>
                    </div>

                    {/* Stats-lijst */}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: pct === 100 ? 'var(--green)' : 'var(--text)' }}>
                            {stats.auditProof} van {total} gerechten audit-proof
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <LegendRow color="var(--green)" label="Volledig bevestigd" value={stats.auditProof} />
                            <LegendRow color="var(--amber)" label="Deels compleet" value={stats.partial} />
                            <LegendRow color="var(--red)" label="Ontbreekt" value={stats.missing} />
                        </div>
                        {stats.queueSize > 0 && (
                            <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 6, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', fontSize: 11, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <Clock size={11} aria-hidden /> {stats.queueSize} items in allergeen-queue
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} aria-hidden />
            <span style={{ color: 'var(--muted)' }}>{label}</span>
            <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>{value}</span>
        </div>
    );
}
