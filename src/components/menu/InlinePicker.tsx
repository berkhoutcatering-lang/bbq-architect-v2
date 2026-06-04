'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Search, ArrowRight, UtensilsCrossed } from 'lucide-react';
import { getGangKey, fmtEuro } from './helpers';
import type { Gerecht } from '@/types';

interface Props {
    open: boolean;
    onClose: () => void;
    gerechten: Gerecht[];
    gangSlug: string;
    gangNaam: string;
    excludeIds: Set<string>;
    onPick: (gerechtId: string) => void;
    onCreateNew?: () => void;
}

function btnSmall(primary: boolean): React.CSSProperties {
    return {
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: 5,
        background: primary ? 'var(--brand, #c4a35a)' : 'transparent',
        color: primary ? '#1a1a1e' : 'var(--text)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
    };
}

export default function InlinePicker({
    open, onClose, gerechten, gangSlug, gangNaam, excludeIds, onPick, onCreateNew,
}: Props) {
    const [q, setQ] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            requestAnimationFrame(() => {
                panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                inputRef.current?.focus({ preventScroll: true });
            });
        }
        if (!open) setQ('');
    }, [open]);

    if (!open) return null;

    const ql = q.trim().toLowerCase();
    const targetKey = getGangKey({ gang_slug: gangSlug });
    const available = gerechten.filter(g => {
        if (g.is_in_wizard === false) return false;
        if (excludeIds.has(String(g.id))) return false;
        return true;
    });
    const inGang = available.filter(g => getGangKey(g) === targetKey);
    const matched = ql ? inGang.filter(g => g.naam.toLowerCase().includes(ql)) : inGang;
    const libraryEmpty = inGang.length === 0;

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />

            <div
                ref={panelRef}
                role="dialog"
                aria-label={'Voeg gerecht toe aan ' + gangNaam}
                style={{
                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 31,
                    maxHeight: 380, display: 'flex', flexDirection: 'column',
                    background: 'var(--card, var(--surface, #1e1e22))',
                    border: '1px solid var(--border)', borderRadius: 14,
                    boxShadow: '0 12px 40px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04)',
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                    borderBottom: '1px solid var(--border)', flexShrink: 0,
                }}>
                    <Search size={16} style={{ color: 'var(--muted)' }} />
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={'Zoek in ' + gangNaam.toLowerCase() + '…'}
                        style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: 'var(--text)', fontSize: 14,
                        }}
                    />
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: libraryEmpty ? 0 : 8, minHeight: 0 }}>
                    {libraryEmpty ? (
                        <div style={{
                            padding: '28px 20px', textAlign: 'center',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                        }}>
                            <span style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: 'rgba(196,163,90,.1)', color: 'var(--brand, #c4a35a)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <UtensilsCrossed size={22} />
                            </span>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                                    Nog geen gerechten in &lsquo;{gangNaam}&rsquo;
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 260 }}>
                                    Maak eerst een paar {gangNaam.toLowerCase()} aan, dan kun je ze hier kiezen.
                                </div>
                            </div>
                            {onCreateNew && (
                                <button
                                    type="button"
                                    onClick={onCreateNew}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '7px 12px', borderRadius: 8, border: 'none',
                                        background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                                        fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 2,
                                    }}
                                >
                                    <ArrowRight size={14} />Naar /gerechten
                                </button>
                            )}
                        </div>
                    ) : matched.length === 0 ? (
                        <div style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
                            Geen gerechten gevonden voor &ldquo;<span style={{ color: 'var(--text)' }}>{q}</span>&rdquo;.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {matched.map(g => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => onPick(String(g.id))}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '9px 12px', minHeight: 48,
                                        border: '1px solid transparent', borderRadius: 10,
                                        cursor: 'pointer', textAlign: 'left',
                                        background: 'transparent', color: 'var(--text)',
                                        transition: 'background .12s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,163,90,.06)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {g.foto_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={g.foto_url} alt="" style={{
                                            width: 32, height: 32, borderRadius: 8, objectFit: 'cover',
                                            border: '1px solid var(--border)', flexShrink: 0,
                                        }} />
                                    ) : (
                                        <span style={{
                                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                            background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)',
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'var(--muted)', fontSize: 13, fontWeight: 600,
                                        }}>{g.naam.charAt(0).toUpperCase()}</span>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 14, fontWeight: 500,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{g.naam}</div>
                                    </div>
                                    <span style={{
                                        fontSize: 12, color: 'var(--muted)', flexShrink: 0,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>{fmtEuro(Number(g.verkoopprijs ?? g.prijs ?? 0))}</span>
                                    <span style={{
                                        width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        border: '1.5px solid var(--border)', color: 'var(--muted)',
                                    }}>
                                        <Plus size={14} />
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0,
                }}>
                    {onCreateNew ? (
                        <button
                            type="button"
                            onClick={onCreateNew}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: 'transparent', border: 'none', cursor: 'pointer',
                                color: 'var(--brand, #c4a35a)', fontSize: 13, fontWeight: 600,
                                padding: '6px 4px',
                            }}
                        >
                            <Plus size={15} />Nieuw {gangNaam.toLowerCase()}
                        </button>
                    ) : <span />}
                    <button
                        type="button"
                        onClick={onClose}
                        style={{ ...btnSmall(false), minHeight: 36, padding: '6px 14px' }}
                    >Klaar</button>
                </div>
            </div>
        </>
    );
}
