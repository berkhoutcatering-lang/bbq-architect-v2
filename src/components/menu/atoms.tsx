/* ═══════════════════════════════════════════════════════════════
   Menu & Recepten — Shared Atoms (TSX port van mr-atoms.jsx)
   StatusPill · CardVisual · MarginRing · CostBar · ViewToggle · etc.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import {
    AlertTriangle, Beef, ChefHat, Cookie, Drumstick, IceCream2,
    Image as ImageIcon, Leaf, LayoutGrid, List as ListIcon, Salad,
    Sandwich, Search, Soup, UtensilsCrossed, Wheat,
} from 'lucide-react';
import {
    GANG_VISUALS, getGangVisual, getGangKey, marginTone, shouldShowPhoto,
    type GangVisual, type PhotoMode,
} from './helpers';

/* Icon name → component map (zodat helpers strings kunnen teruggeven).
   Sandwich + Soup zijn voor Sam-eigen gangen (Hapje + Anders). */
const GANG_ICON_MAP: Record<string, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
    Drumstick, Salad, Beef, Wheat, IceCream2, Leaf,
    Cookie, Sandwich, Soup, UtensilsCrossed, ChefHat,
};

/* ═══ MRStatusPill ═══════════════════════════════════════════ */
const STATUS_STYLES = {
    actief:  { bg: 'rgba(34,197,94,.10)',   border: 'rgba(34,197,94,.28)',   color: '#86efac', dot: '#22c55e', label: 'Actief' },
    concept: { bg: 'rgba(167,139,250,.10)', border: 'rgba(167,139,250,.32)', color: '#c4b5fd', dot: '#a78bfa', label: 'Concept' },
    review:  { bg: 'rgba(245,158,11,.10)',  border: 'rgba(245,158,11,.28)',  color: '#fbbf24', dot: '#f59e0b', label: 'Review' },
    inactief:{ bg: 'rgba(130,130,130,.10)', border: 'rgba(130,130,130,.28)', color: '#a3a3a3', dot: '#737373', label: 'Inactief' },
} as const;

export type GerechtStatus = keyof typeof STATUS_STYLES;

export function MRStatusPill({ status }: { status: GerechtStatus }) {
    const s = STATUS_STYLES[status] ?? STATUS_STYLES.concept;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
            borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: s.bg, border: `1px solid ${s.border}`, color: s.color,
        }}>
            <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: s.dot,
                boxShadow: status === 'actief' ? `0 0 6px ${s.dot}` : 'none',
            }} />
            {s.label}
        </span>
    );
}

/* ═══ MRPhoto ═══ — img met fallback naar lege gradient + icon ═══ */
export function MRPhoto({ src, alt, style, className, fallbackSize = 24 }: {
    src?: string | null;
    alt?: string;
    style?: CSSProperties;
    className?: string;
    fallbackSize?: number;
}) {
    const [err, setErr] = useState(false);
    if (err || !src) {
        return (
            <div className={className} style={{
                ...style,
                background: 'linear-gradient(135deg,#1a1a1e 0%,#2a2024 50%,#1a1a1e 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <ImageIcon size={fallbackSize} color="var(--muted-weak, var(--muted))" strokeWidth={1.5} />
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={alt ?? ''}
            className={className}
            style={{ ...style, objectFit: 'cover' }}
            onError={() => setErr(true)}
            loading="lazy"
        />
    );
}

/* ═══ MRCardVisual ═══════════════════════════════════════════
   Echte foto als foto_url bestaat; anders een gang-getinte gradient met
   het gang-icoon en (optioneel) de dish-naam als overlay. `showName`
   true op Grid + Gallery (waar de visual een poster vervangt) en false
   op kleine thumbnails (List-rij). */
export function MRCardVisual({
    gerecht,
    photoMode = 'mixed',
    style,
    className,
    iconSize = 48,
    showName = false,
}: {
    gerecht: { id: string | number; foto_url?: string | null; gang_slug?: string; categorie?: string; naam?: string };
    photoMode?: PhotoMode;
    style?: CSSProperties;
    className?: string;
    iconSize?: number;
    showName?: boolean;
}) {
    const showPhoto = shouldShowPhoto(gerecht, photoMode);
    const gangKey = getGangKey(gerecht);
    const visual: GangVisual = getGangVisual(gangKey);
    const IconComp = GANG_ICON_MAP[visual.icon] ?? UtensilsCrossed;

    if (showPhoto) {
        return (
            <div style={{ position: 'relative', ...style }} className={className}>
                <MRPhoto src={gerecht.foto_url} alt={gerecht.naam ?? ''} style={{ width: '100%', height: '100%' }} />
            </div>
        );
    }

    return (
        <div
            className={className}
            style={{
                ...style,
                background: visual.gradient,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
                gap: showName ? 8 : 0,
                padding: showName ? '12px 10px' : 0,
            }}
        >
            {/* Noise-texture overlay 8% — gang-gradient krijgt textuur */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%270 0 200 200%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.65%27 numOctaves=%273%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
                opacity: 0.08, pointerEvents: 'none', mixBlendMode: 'overlay',
            }} />
            <IconComp
                size={showName ? Math.round(iconSize * 0.6) : iconSize}
                color={showName ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.7)'}
                strokeWidth={1.75}
                style={{ flexShrink: 0, position: 'relative' }}
            />
            {showName && gerecht.naam && (
                <div style={{
                    position: 'relative',
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,.92)',
                    textShadow: '0 1px 8px rgba(0,0,0,.5)',
                    maxWidth: '95%',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {gerecht.naam}
                </div>
            )}
        </div>
    );
}

/* ═══ MRMarginRing — SVG-ring met dynamische kleur ═══ */
export function MRMarginRing({ pct, size = 40 }: { pct: number; size?: number }) {
    const r = (size - 4) / 2;
    const c = 2 * Math.PI * r;
    const dash = c * (Math.max(0, Math.min(100, pct)) / 100);
    const tone = marginTone(pct);
    return (
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="3" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.color} strokeWidth="3"
                strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
        </svg>
    );
}

/* ═══ MRCostBar — gestapelde horizontale bar ═══ */
export function MRCostBar({ cost, price }: { cost: number; price: number }) {
    if (!price || price <= 0) return null;
    const segs = [
        { pct: (cost * 0.62) / price, color: '#c4a35a', label: 'Food' },
        { pct: (cost * 0.28) / price, color: '#8b8b8f', label: 'Labor' },
        { pct: (cost * 0.10) / price, color: '#5a5a5e', label: 'OH' },
        { pct: Math.max(0, (price - cost) / price), color: '#22c55e', label: 'Marge' },
    ];
    return (
        <div style={{
            display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden',
            background: 'rgba(255,255,255,.04)', width: '100%',
        }}>
            {segs.map((s, i) => (
                <div
                    key={i}
                    style={{ flex: s.pct, background: s.color, minWidth: s.pct > 0.02 ? 2 : 0 }}
                    title={`${s.label} ${Math.round(s.pct * 100)}%`}
                />
            ))}
        </div>
    );
}

/* ═══ MRTag ═══ */
export function MRTag({ children, color }: { children: ReactNode; color?: string }) {
    return (
        <span style={{
            fontSize: 10, padding: '2px 6px', borderRadius: 4,
            background: color ? `${color}14` : 'rgba(255,255,255,.05)',
            border: `1px solid ${color ? color + '33' : 'var(--border)'}`,
            color: color || 'var(--muted)',
            fontWeight: 600, whiteSpace: 'nowrap',
        }}>{children}</span>
    );
}

/* ═══ MRAllergenChip ═══ */
export function MRAllergenChip({ allergens }: { allergens: string[] | null | undefined }) {
    if (!allergens?.length) return null;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, padding: '2px 7px', borderRadius: 4,
            background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)',
            color: '#fbbf24', fontWeight: 600,
        }}>
            <AlertTriangle size={10} /> {allergens.join(' · ')}
        </span>
    );
}

/* ═══ MRViewToggle — Grid/List/Gallery ═══ */
export type MenuViewMode = 'grid' | 'list' | 'gallery';

export function MRViewToggle({ mode, onChange }: { mode: MenuViewMode; onChange: (m: MenuViewMode) => void }) {
    const views: Array<{ id: MenuViewMode; icon: React.ComponentType<{ size?: number }>; label: string }> = [
        { id: 'grid',    icon: LayoutGrid, label: 'Grid' },
        { id: 'list',    icon: ListIcon,   label: 'List' },
        { id: 'gallery', icon: ImageIcon,  label: 'Gallery' },
    ];
    return (
        <div style={{
            display: 'inline-flex', gap: 0, padding: 3,
            background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
            {views.map((v) => {
                const Icon = v.icon;
                const active = mode === v.id;
                return (
                    <button
                        key={v.id}
                        onClick={() => onChange(v.id)}
                        title={v.label}
                        aria-pressed={active}
                        aria-label={`Toon als ${v.label}`}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: 34, height: 30, borderRadius: 7,
                            background: active ? 'rgba(255,191,0,.08)' : 'transparent',
                            border: active ? '1px solid rgba(255,191,0,.25)' : '1px solid transparent',
                            color: active ? 'var(--brand)' : 'var(--muted)',
                            cursor: 'pointer', transition: '.15s',
                        }}
                    >
                        <Icon size={15} />
                    </button>
                );
            })}
        </div>
    );
}

/* ═══ MRFilterPill ═══ */
export function MRFilterPill({ label, active, count, onClick }: {
    label: ReactNode; active?: boolean; count?: number; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 13px', borderRadius: 8,
                background: active ? 'rgba(255,191,0,.06)' : 'transparent',
                border: `1px solid ${active ? 'rgba(255,191,0,.25)' : 'transparent'}`,
                color: active ? 'var(--text)' : 'var(--muted)',
                fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                transition: '.15s', whiteSpace: 'nowrap',
            }}
        >
            {label}
            {count != null && (
                <span style={{
                    fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
                    background: active ? 'rgba(255,191,0,.18)' : 'rgba(255,255,255,.05)',
                    color: active ? 'var(--brand)' : 'var(--muted)',
                    fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>{count}</span>
            )}
        </button>
    );
}

/* ═══ MRSearchBar — opent ⌘K bij klik ═══ */
export function MRSearchBar({ onCmdK, placeholder = 'Zoek gerechten…' }: { onCmdK: () => void; placeholder?: string }) {
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onCmdK}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCmdK(); } }}
            style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', background: 'var(--bg-subtle)',
                border: '1px solid var(--border)', borderRadius: 10,
                flex: 1, maxWidth: 360, transition: 'border-color .15s', cursor: 'text',
            }}
        >
            <Search size={15} color="var(--muted)" />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--muted)' }}>{placeholder}</span>
            {/* ⌘K badge alleen op desktop — telefoons hebben geen ⌘-toets.
                hidden-mobile-cmdk wordt verborgen via globals.css <768px. */}
            <kbd className="hidden-mobile-cmdk" style={{
                fontSize: 10, padding: '2px 7px',
                border: '1px solid var(--border)', borderRadius: 5,
                fontFamily: 'var(--font-mono, ui-monospace)',
                color: 'var(--muted)', background: 'rgba(255,255,255,.03)',
            }}>⌘K</kbd>
        </div>
    );
}

/* ═══ MREyebrow ═══ */
export function MREyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
    return (
        <div style={{
            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
            color: 'var(--muted)', fontWeight: 700, ...style,
        }}>{children}</div>
    );
}

/* ═══ MRButton — kleine variant van bestaande Button maar dichter
       bij de mr-* stijl (rounded-10, gold-accents). ═══ */
export type MRButtonVariant = 'primary' | 'ghost' | 'danger' | 'ai';

export function MRButton({
    variant = 'ghost', children, icon, sm, onClick, style, disabled, type = 'button',
}: {
    variant?: MRButtonVariant;
    children: ReactNode;
    icon?: ReactNode;
    sm?: boolean;
    onClick?: () => void;
    style?: CSSProperties;
    disabled?: boolean;
    type?: 'button' | 'submit' | 'reset';
}) {
    const variants: Record<MRButtonVariant, CSSProperties> = {
        primary: { background: 'var(--brand)', color: '#000', boxShadow: '0 4px 20px rgba(255,191,0,.3)' },
        ghost:   { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border)' },
        danger:  { background: 'rgba(239,68,68,.1)', color: 'var(--red, #ef4444)', borderColor: 'rgba(239,68,68,.25)' },
        ai:      { background: 'rgba(255,191,0,.08)', color: 'var(--brand)', borderColor: 'rgba(255,191,0,.25)' },
    };
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                borderRadius: 10, fontWeight: 600, fontFamily: 'var(--font-sans)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: '.15s', border: '1px solid transparent',
                fontSize: sm ? 12 : 13, padding: sm ? '6px 10px' : '8px 14px',
                opacity: disabled ? 0.5 : 1,
                ...variants[variant],
                ...style,
            }}
        >
            {icon}
            {children}
        </button>
    );
}
