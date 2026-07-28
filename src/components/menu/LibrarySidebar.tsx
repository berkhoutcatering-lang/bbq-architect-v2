'use client';

import { useMemo, useState } from 'react';
import { Plus, Search, UtensilsCrossed, PanelRightClose } from 'lucide-react';
import { getGangKey, getGangVisual, fmtEuro } from './helpers';
import { effectieveKostprijsPP } from '@/lib/gerecht-kosten';
import type { Gerecht, Gang } from '@/types';

interface Props {
    gangen: Gang[];
    gerechten: Gerecht[];
    excludeIdsByGang: (slug: string) => Set<string>;
    onPick: (gangSlug: string, gerechtId: string) => void;
    onClose: () => void;
}

export default function LibrarySidebar({
    gangen, gerechten, excludeIdsByGang, onPick, onClose,
}: Props) {
    const [q, setQ] = useState('');
    const ql = q.trim().toLowerCase();

    const byGang = useMemo(() => {
        const m = new Map<string, Gerecht[]>();
        for (const g of gangen) m.set(g.slug, []);
        for (const dish of gerechten) {
            if (dish.is_in_wizard === false) continue;
            if (ql && !dish.naam.toLowerCase().includes(ql)) continue;
            const key = getGangKey(dish);
            const gang = gangen.find(gg => getGangKey({ gang_slug: gg.slug }) === key);
            if (!gang) continue;
            m.get(gang.slug)!.push(dish);
        }
        return m;
    }, [gerechten, gangen, ql]);

    return (
        <aside style={{
            width: 248, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 70,
            background: 'var(--card, var(--surface))', border: '1px solid var(--border)',
            borderRadius: 14, overflow: 'hidden', display: 'flex', flexDirection: 'column',
            maxHeight: 'calc(100vh - 100px)',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                borderBottom: '1px solid var(--border)',
            }}>
                <UtensilsCrossed size={16} style={{ color: 'var(--brand, #c4a35a)' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Gerechten-library</span>
                <button
                    type="button"
                    onClick={onClose}
                    title="Verberg library"
                    style={{
                        width: 28, height: 28, borderRadius: 7,
                        border: '1px solid var(--border)', background: 'transparent',
                        color: 'var(--muted)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <PanelRightClose size={15} />
                </button>
            </div>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--muted)', pointerEvents: 'none' }} />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Filter gerechten…"
                        style={{
                            width: '100%', boxSizing: 'border-box',
                            padding: '8px 10px 8px 30px', borderRadius: 9, minHeight: 36,
                            background: 'transparent', border: '1px solid var(--border)',
                            color: 'var(--text)', fontSize: 13, outline: 'none',
                        }}
                    />
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {gangen.map(g => {
                    const items = byGang.get(g.slug) ?? [];
                    if (items.length === 0) return null;
                    const exclude = excludeIdsByGang(g.slug);
                    const gangVisual = getGangVisual(getGangKey({ gang_slug: g.slug }));
                    return (
                        <div key={g.slug} style={{ marginBottom: 14 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '0 4px 6px',
                            }}>
                                <span style={{
                                    width: 14, height: 4, borderRadius: 2, flexShrink: 0,
                                    background: gangVisual.gradient,
                                }} aria-hidden />
                                <span style={{
                                    fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                                    textTransform: 'uppercase', color: 'var(--muted)',
                                }}>{g.naam}</span>
                                <span style={{ flex: 1 }} />
                                <span style={{
                                    fontSize: 10, color: 'var(--muted)',
                                    fontVariantNumeric: 'tabular-nums',
                                }}>{items.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {items.map(dish => {
                                    const alreadyAdded = exclude.has(String(dish.id));
                                    return (
                                        <button
                                            key={dish.id}
                                            type="button"
                                            onClick={() => !alreadyAdded && onPick(g.slug, String(dish.id))}
                                            disabled={alreadyAdded}
                                            title={alreadyAdded ? 'Staat al in deze gang' : 'Klik om toe te voegen aan ' + g.naam}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                padding: '6px 8px', borderRadius: 9,
                                                cursor: alreadyAdded ? 'default' : 'pointer',
                                                background: 'transparent', border: '1px solid var(--border)',
                                                color: 'var(--text)', textAlign: 'left',
                                                opacity: alreadyAdded ? 0.4 : 1,
                                                transition: 'background .12s, border-color .12s',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!alreadyAdded) {
                                                    e.currentTarget.style.background = 'rgba(196,163,90,.08)';
                                                    e.currentTarget.style.borderColor = 'rgba(196,163,90,.4)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!alreadyAdded) {
                                                    e.currentTarget.style.background = 'transparent';
                                                    e.currentTarget.style.borderColor = 'var(--border)';
                                                }
                                            }}
                                        >
                                            {dish.foto_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={dish.foto_url} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                            ) : (
                                                <span style={{
                                                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                                                    background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    color: 'var(--muted)', fontSize: 11, fontWeight: 600,
                                                }}>{dish.naam.charAt(0).toUpperCase()}</span>
                                            )}
                                            <span style={{
                                                fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
                                                flex: 1, minWidth: 0, whiteSpace: 'nowrap',
                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                            }}>{dish.naam}</span>
                                            <span style={{
                                                fontSize: 11, color: 'var(--muted)',
                                                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                                            }}>{(function () {
                                                    const eigen = Number(dish.verkoopprijs ?? dish.prijs ?? 0);
                                                    if (eigen > 0) return fmtEuro(eigen);
                                                    /* Geen eigen prijs (vast menu) → toon de kostprijs, niet €0,00. */
                                                    const k = effectieveKostprijsPP(dish as { total_cost_cents?: number | null; kostprijs_pp?: number | string | null });
                                                    return k > 0 ? fmtEuro(k) : '—';
                                                })()}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{
                padding: '8px 12px', borderTop: '1px solid var(--border)',
                fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <Plus size={12} />Klik om toe te voegen
            </div>
        </aside>
    );
}
