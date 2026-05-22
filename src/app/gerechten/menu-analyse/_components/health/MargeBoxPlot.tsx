import Link from 'next/link';
import { BarChart3, ArrowRight } from 'lucide-react';
import type { MarginStats } from '../../_lib/health/types';

interface Props {
    stats: MarginStats;
}

/* Horizontale box-plot: track + whiskers + IQR-box + median + min/max-dots.
   Onderaan: outlier-lijsten (laag + hoog) met deeplinks naar /gerechten/{id}. */
export default function MargeBoxPlot({ stats }: Props) {
    const min = 0;
    const max = 100;
    const scale = (v: number) => ((v - min) / (max - min)) * 100;

    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Marge-gezondheid</span>
                    </div>
                    <Link href="/gerechten/menu-analyse" style={{ textDecoration: 'none', fontSize: 12, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        Open analyse <ArrowRight size={12} />
                    </Link>
                </div>

                {/* Drie hero-getallen */}
                <div style={{ display: 'flex', gap: 24, marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>Mediaan</div>
                        <div className="metric" style={{ fontSize: 28, color: 'var(--green)' }}>{stats.median}%</div>
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div>
                        <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>P10 – P90</div>
                        <div className="metric" style={{ fontSize: 28 }}>{stats.p10}% – {stats.p90}%</div>
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div>
                        <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>Gerechten</div>
                        <div className="metric" style={{ fontSize: 28 }}>{stats.count}</div>
                    </div>
                </div>

                {stats.count > 0 ? (
                    <>
                        {/* Box plot SVG-vrij — pure CSS-positioning */}
                        <div style={{ position: 'relative', height: 48, margin: '0 0 8px' }} aria-hidden>
                            {/* Track */}
                            <div style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 6, background: 'rgba(130,130,130,.08)', borderRadius: 3 }} />
                            {/* Whisker links */}
                            <div style={{ position: 'absolute', top: 21, left: `${scale(stats.min)}%`, width: `${scale(stats.p10) - scale(stats.min)}%`, height: 4, background: 'rgba(130,130,130,.2)', borderRadius: '2px 0 0 2px' }} />
                            {/* Whisker rechts */}
                            <div style={{ position: 'absolute', top: 21, left: `${scale(stats.p90)}%`, width: `${scale(stats.max) - scale(stats.p90)}%`, height: 4, background: 'rgba(130,130,130,.2)', borderRadius: '0 2px 2px 0' }} />
                            {/* IQR box */}
                            <div style={{ position: 'absolute', top: 14, left: `${scale(stats.p10)}%`, width: `${scale(stats.p90) - scale(stats.p10)}%`, height: 18, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.35)', borderRadius: 4 }} />
                            {/* Median line */}
                            <div style={{ position: 'absolute', top: 10, left: `${scale(stats.median)}%`, width: 2, height: 26, background: 'var(--green)', borderRadius: 1, transform: 'translateX(-1px)' }} />
                            {/* Min/max dots */}
                            <div style={{ position: 'absolute', top: 18, left: `${scale(stats.min)}%`, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', border: '2px solid var(--bg)', transform: 'translate(-4px, 0)' }} />
                            <div style={{ position: 'absolute', top: 18, left: `${scale(stats.max)}%`, width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--bg)', transform: 'translate(-4px, 0)' }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted-light)', fontVariantNumeric: 'tabular-nums' }}>
                            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                        </div>

                        {/* Outliers */}
                        {(stats.outliers_low.length > 0 || stats.outliers_high.length > 0) && (
                            <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Lage uitschieters</div>
                                    {stats.outliers_low.map(o => (
                                        <Link key={o.id} href={`/gerechten/${o.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', padding: '3px 0', textDecoration: 'none' }}>
                                            <span style={{ color: 'var(--text)' }}>{o.name}</span>
                                            <span style={{ color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{o.margin}%</span>
                                        </Link>
                                    ))}
                                </div>
                                <div style={{ width: 1, background: 'var(--border)' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 10, color: 'var(--green)', fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Hoge uitschieters</div>
                                    {stats.outliers_high.map(o => (
                                        <Link key={o.id} href={`/gerechten/${o.id}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', padding: '3px 0', textDecoration: 'none' }}>
                                            <span style={{ color: 'var(--text)' }}>{o.name}</span>
                                            <span style={{ color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{o.margin}%</span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ padding: '24px 0', fontSize: 12, color: 'var(--muted-light)', textAlign: 'center' }}>
                        Nog geen gerechten met zowel kostprijs als verkoopprijs.
                    </div>
                )}
            </div>
        </div>
    );
}
