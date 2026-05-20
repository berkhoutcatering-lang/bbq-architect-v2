'use client';

/* ═══════════════════════════════════════════════════════════════════
   PRICE-INTELLIGENCE — UI-atoms.

   Geëxtraheerd uit PriceIntelligenceClient.tsx (P0.25 slice 2 preparation).
   Houdt de hoofdfile leesbaarder en zet het patroon voor de geplande
   tab-extracts (_tabs/InvoicesTab.tsx, ReceiptsTab.tsx, PricelistsTab.tsx,
   BooksTab.tsx) in een volgende sessie.

   Geen state, geen data-fetches — pure presentational components.
   ═══════════════════════════════════════════════════════════════════ */

import React, { useState, type ComponentType } from 'react';
import { HelpCircle, Info, type LucideProps } from 'lucide-react';

/* Brand-accent voor deze hub. Houden we hier zodat atoms self-contained zijn. */
export const GOLD = '#c4a35a';

type IconComponent = ComponentType<LucideProps>;

export function MetalCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
        <div style={{
            position: 'relative', background: 'var(--card)', backdropFilter: 'blur(18px)',
            border: '1px solid rgba(130,130,130,.12)', borderRadius: 14, overflow: 'hidden', ...style,
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${GOLD}80, transparent)`, pointerEvents: 'none' }} />
            {children}
        </div>
    );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
    return <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>{children}</div>;
}

export function Hint({ tip, children }: { tip: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <span
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, borderBottom: '1px dotted var(--muted-light)', cursor: 'help' }}
            onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        >
            {children}
            <HelpCircle size={10} style={{ color: 'var(--muted-light)' }} />
            {open && (
                <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
                    background: '#0a0a0c', border: `1px solid ${GOLD}55`, borderRadius: 8,
                    padding: '8px 12px', fontSize: 11, color: 'var(--text)', width: 260, zIndex: 50,
                    lineHeight: 1.5, boxShadow: '0 8px 24px rgba(0,0,0,.5)', textAlign: 'left',
                    whiteSpace: 'normal', fontWeight: 400, letterSpacing: 'normal', textTransform: 'none',
                }}>
                    <div style={{ fontSize: 9, letterSpacing: '.18em', color: GOLD, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Uitleg</div>
                    {tip}
                </div>
            )}
        </span>
    );
}

export function BtnPrimary({ children, icon: I, right: R, onClick, style, disabled, type }: { children: React.ReactNode; icon?: IconComponent; right?: IconComponent; onClick?: () => void; style?: React.CSSProperties; disabled?: boolean; type?: 'button' | 'submit' }) {
    return (
        <button type={type || 'button'} onClick={onClick} disabled={disabled} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'var(--brand)', color: 'var(--brand-background)', fontWeight: 700, fontSize: 13,
            border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
            boxShadow: '0 4px 20px rgba(255,191,0,.25), inset 0 1px 0 rgba(255,255,255,.2)',
            ...style,
        }}>
            {I && <I size={14} />} {children} {R && <R size={14} />}
        </button>
    );
}

export function BtnGhost({ children, icon: I, right: R, onClick, style }: { children: React.ReactNode; icon?: IconComponent; right?: IconComponent; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10,
            background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13,
            border: '1px solid var(--border)', cursor: 'pointer', ...style,
        }}>
            {I && <I size={14} />} {children} {R && <R size={14} />}
        </button>
    );
}

export function ModelToggle({ value, onChange }: { value: 'haiku' | 'sonnet' | 'opus'; onChange: (v: 'haiku' | 'sonnet' | 'opus') => void }) {
    const MODELS: { id: 'haiku' | 'sonnet' | 'opus'; label: string; tagline: string }[] = [
        { id: 'haiku', label: 'Haiku', tagline: 'Snel · ±8s' },
        { id: 'sonnet', label: 'Sonnet', tagline: 'Nauwkeurig · ±20s' },
        { id: 'opus', label: 'Opus', tagline: 'Premium · ±30s' },
    ];
    return (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 8, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
            {MODELS.map(m => {
                const active = value === m.id;
                return (
                    <button key={m.id} onClick={() => onChange(m.id)}
                        title={m.tagline}
                        style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            border: 'none',
                            background: active ? 'var(--brand-primary)' : 'transparent',
                            color: active ? '#000' : 'var(--muted)',
                            transition: 'all .15s', letterSpacing: '.05em',
                        }}>
                        {m.label}
                    </button>
                );
            })}
        </div>
    );
}

export function Pill({ variant = 'draft', children, onClick }: { variant?: 'brand' | 'draft' | 'ok' | 'warn' | 'danger'; children: React.ReactNode; onClick?: () => void }) {
    const map: Record<string, React.CSSProperties> = {
        brand: { background: 'rgba(255,191,0,.12)', color: 'var(--brand)', borderColor: 'rgba(255,191,0,.3)' },
        draft: { background: 'rgba(130,130,130,.14)', color: 'var(--muted)', borderColor: 'var(--border)' },
        ok: { background: 'rgba(34,197,94,.12)', color: 'var(--green)', borderColor: 'rgba(34,197,94,.25)' },
        warn: { background: 'rgba(245,158,11,.12)', color: 'var(--amber)', borderColor: 'rgba(245,158,11,.3)' },
        danger: { background: 'rgba(239,68,68,.12)', color: 'var(--red)', borderColor: 'rgba(239,68,68,.25)' },
    };
    return (
        <span onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 999,
            fontSize: 11, fontWeight: 600, border: '1px solid transparent', cursor: onClick ? 'pointer' : 'default',
            ...map[variant],
        }}>{children}</span>
    );
}

export function SectionExplain({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex', gap: 8, alignItems: 'flex-start',
            padding: '10px 14px', marginBottom: 14,
            background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.15)',
            borderLeft: '2px solid rgba(59,130,246,.5)', borderRadius: 10,
            fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
        }}>
            <Info size={14} style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 1 }} />
            <div>{children}</div>
        </div>
    );
}
