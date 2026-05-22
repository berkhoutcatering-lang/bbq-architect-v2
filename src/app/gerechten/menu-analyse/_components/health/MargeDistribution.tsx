import Link from 'next/link';
import { AlignLeft } from 'lucide-react';
import type { MarginBucket } from '../../_lib/health/types';

interface Props {
    buckets: MarginBucket[];
}

/* Horizontale stacked bar — flex-weight per bucket = relatieve count.
   Klikbare legend deeplinkt naar /gerechten?filter=marge_bucket_N. */
export default function MargeDistribution({ buckets }: Props) {
    const total = buckets.reduce((s, b) => s + b.count, 0);
    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <AlignLeft size={15} color="var(--brand-gold)" />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Marge-distributie</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{total} gerechten</span>
                </div>

                {total === 0 ? (
                    <div style={{ padding: '20px 0', fontSize: 12, color: 'var(--muted-light)', textAlign: 'center' }}>
                        Geen gerechten met prijs &gt; kostprijs.
                    </div>
                ) : (
                    <>
                        {/* Stacked bar */}
                        <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }} aria-hidden>
                            {buckets.map((b, i) => (
                                <div key={b.label} style={{
                                    flex: b.count, background: b.color, position: 'relative',
                                    borderRight: i < buckets.length - 1 ? '1px solid var(--bg)' : 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    transition: 'flex .4s ease',
                                    minWidth: b.count > 0 ? 24 : 0,
                                }}>
                                    {b.count > 0 && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#000', fontVariantNumeric: 'tabular-nums' }}>{b.count}</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Klikbare legend */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {buckets.map((b, i) => (
                                <Link key={b.label} href={`/gerechten?filter=marge_bucket_${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                                    <span>{b.label}</span>
                                    <span style={{ color: 'var(--text)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{b.count}</span>
                                    <span style={{ color: 'var(--muted-light)' }}>({total ? Math.round(b.count / total * 100) : 0}%)</span>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
