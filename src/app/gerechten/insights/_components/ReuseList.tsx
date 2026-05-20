import Link from 'next/link';
import { Repeat2 } from 'lucide-react';
import type { ReuseComponent } from '../_lib/types';

interface Props {
    top: ReuseComponent[];
    bottom: ReuseComponent[];
}

/* Twee kolommen: meest gebruikt (groen) en minst gebruikt (amber).
   Per regel: rank + naam + count + voortgangsbar. */
export default function ReuseList({ top, bottom }: Props) {
    const maxUsage = Math.max(...top.map(c => c.usageCount), 1);

    function ListCol({ items, title, titleColor, barColor, emptyLabel }: {
        items: ReuseComponent[];
        title: string;
        titleColor: string;
        barColor: string;
        emptyLabel: string;
    }) {
        return (
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: titleColor, fontWeight: 700, marginBottom: 10 }}>{title}</div>
                {items.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--muted-light)', fontStyle: 'italic' }}>{emptyLabel}</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {items.map((c, i) => (
                            <Link key={c.id} href={`/gerechten/componenten/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 11, color: 'var(--muted-light)', width: 16, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                                            <span style={{ color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                                            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 8 }}>{c.usageCount}×</span>
                                        </div>
                                        <div style={{ height: 3, background: 'rgba(130,130,130,.08)', borderRadius: 2, overflow: 'hidden' }} aria-hidden>
                                            <div style={{ width: `${(c.usageCount / maxUsage) * 100}%`, height: '100%', background: barColor, borderRadius: 2, opacity: 0.6 }} />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Repeat2 size={15} color="var(--brand-gold)" />
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Component-hergebruik</span>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                    <ListCol items={top} title="Meest gebruikt" titleColor="var(--green)" barColor="var(--green)" emptyLabel="Nog geen gerechten gekoppeld" />
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <ListCol items={bottom} title="Minst gebruikt" titleColor="var(--amber)" barColor="var(--amber)" emptyLabel="Nog geen componenten" />
                </div>
            </div>
        </div>
    );
}
