'use client';

import { useState, type ReactNode } from 'react';
import {
    Check,
    AlertTriangle,
    BookOpen,
    ChevronDown,
    ChevronRight,
    Hand,
    Sparkles,
    SlidersHorizontal,
    ClipboardCheck,
    FolderCheck,
    Package,
    Thermometer,
    Flame,
    UtensilsCrossed,
    RefreshCw,
    type LucideIcon,
} from 'lucide-react';

import styles from '../haccp.module.css';
import {
    CHECK_TYPES,
    STEP_META,
    type HaccpCheck,
    type HaccpCheckType,
    type HaccpCitation,
    type RiskLevel,
    type CitationMode,
} from '../_data';

const STEP_ICONS: Record<string, LucideIcon> = {
    hand: Hand,
    sparkles: Sparkles,
    'sliders-horizontal': SlidersHorizontal,
    'clipboard-check': ClipboardCheck,
    'folder-check': FolderCheck,
};

const CHECK_ICONS: Record<HaccpCheckType, LucideIcon> = {
    ontvangst: Package,
    bewaring: Thermometer,
    kern: Flame,
    uitgifte: UtensilsCrossed,
    regenereren: RefreshCw,
};

/* ── Step bar ────────────────────────────────────────────── */
export function HStepBar({
    current,
    completed = [],
    onStep,
}: {
    current: number;
    completed?: number[];
    onStep: (i: number) => void;
}) {
    return (
        <div className={styles.steps}>
            {STEP_META.map((s, i) => {
                const done = completed.includes(i);
                const act = i === current;
                const Icon = STEP_ICONS[s.icon] ?? Hand;
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        {i > 0 && (
                            <span
                                className={[
                                    styles.stepLine,
                                    done ? styles.stepLineDone : '',
                                    act ? styles.stepLineAct : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            />
                        )}
                        <button
                            type="button"
                            className={styles.step}
                            onClick={() => onStep(i)}
                            style={{ opacity: !done && !act && i > current + 1 ? 0.45 : 1 }}
                        >
                            <span
                                className={[
                                    styles.stepDot,
                                    done ? styles.stepDotDone : '',
                                    act ? styles.stepDotAct : '',
                                ]
                                    .filter(Boolean)
                                    .join(' ')}
                            >
                                {done ? <Check size={13} /> : <Icon size={13} />}
                            </span>
                            <span
                                className={`${styles.stepLbl} ${act ? styles.stepActLbl : ''} ${done ? styles.stepDoneLbl : ''}`}
                            >
                                {s.label}
                            </span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

/* ── Type badge ──────────────────────────────────────────── */
export function TypeBadge({ type }: { type: HaccpCheckType }) {
    const t = CHECK_TYPES[type];
    const Icon = CHECK_ICONS[type];
    return (
        <span
            className={styles.typeBadge}
            style={{ background: t.bg, color: t.color }}
        >
            <Icon size={10} color={t.color} />
            {t.label}
        </span>
    );
}

/* ── Risk badge ──────────────────────────────────────────── */
export function HRisk({ risk }: { risk: RiskLevel }) {
    if (risk === 'hoog') {
        return (
            <span
                className="pill pill-red"
                style={{ fontSize: 9, padding: '1px 7px', gap: 3 }}
            >
                <AlertTriangle size={9} />
                Hoog
            </span>
        );
    }
    if (risk === 'middel') {
        return (
            <span
                className="pill pill-optie"
                style={{ fontSize: 9, padding: '1px 7px' }}
            >
                Middel
            </span>
        );
    }
    return null;
}

/* ── Citation ────────────────────────────────────────────── */
export function CiteTip({
    cite,
    mode = 'tooltip',
}: {
    cite?: HaccpCitation;
    mode?: CitationMode;
}) {
    const [open, setOpen] = useState(false);
    if (!cite) return null;

    if (mode === 'inline') {
        return (
            <div className={styles.citeInline}>
                <BookOpen size={10} style={{ flexShrink: 0, marginTop: 1 }} />
                {cite.sum}
            </div>
        );
    }
    if (mode === 'expandable') {
        return (
            <div style={{ marginTop: 6 }}>
                <button
                    type="button"
                    className={styles.citeExpandBtn}
                    onClick={() => setOpen(!open)}
                >
                    {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <BookOpen size={10} />
                    Bron
                </button>
                {open && (
                    <div className={`${styles.citeExpandBody} ${styles.fadeUp}`}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{cite.src}</div>
                        <div>{cite.ref}</div>
                    </div>
                )}
            </div>
        );
    }
    /* tooltip (default) */
    return (
        <span
            className={styles.citeTooltipWrap}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            tabIndex={0}
        >
            <BookOpen size={13} color="var(--muted)" style={{ cursor: 'help' }} />
            {open && (
                <div className={`${styles.citeTooltip} ${styles.fadeUp}`}>
                    <div
                        className="eyebrow"
                        style={{ marginBottom: 6, fontSize: 9 }}
                    >
                        Bron
                    </div>
                    <div
                        style={{
                            fontSize: 12,
                            color: 'var(--text)',
                            fontWeight: 500,
                            marginBottom: 3,
                        }}
                    >
                        {cite.src}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{cite.ref}</div>
                    <div className={styles.citeTooltipSum}>{cite.sum}</div>
                </div>
            )}
        </span>
    );
}

/* ── Typing dots ─────────────────────────────────────────── */
export function TypingDots() {
    return (
        <span
            style={{
                display: 'inline-flex',
                gap: 4,
                marginLeft: 6,
                verticalAlign: 'middle',
            }}
        >
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className={styles.typingDot}
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}
        </span>
    );
}

/* ── StatTile ────────────────────────────────────────────── */
export function StatTile({
    label,
    value,
    tone,
    icon,
}: {
    label: string;
    value: ReactNode;
    tone?: 'ok' | 'warn';
    icon: ReactNode;
}) {
    return (
        <div className={styles.statTile}>
            <div
                className={[
                    styles.statTileIcon,
                    tone === 'ok' ? styles.statTileIconOk : '',
                    tone === 'warn' ? styles.statTileIconWarn : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {icon}
            </div>
            <div>
                <div
                    className={styles.statTileValue}
                    style={{
                        color:
                            tone === 'ok'
                                ? 'var(--green)'
                                : tone === 'warn'
                                  ? 'var(--amber)'
                                  : 'var(--text)',
                    }}
                >
                    {value}
                </div>
                <div className={styles.statTileLabel}>{label}</div>
            </div>
        </div>
    );
}

/* ── Pill (small wrapper that maps the prototype's variants
 *        onto the existing globals.css .pill-* classes) ─── */
type PillVariant = 'ok' | 'danger' | 'optie' | 'send' | 'draft';
const PILL_CLASS: Record<PillVariant, string> = {
    ok: 'pill pill-green',
    danger: 'pill pill-red',
    optie: 'pill pill-optie',
    send: 'pill pill-amber',
    draft: 'pill',
};
export function Pill({
    variant = 'draft',
    children,
    icon,
    style,
}: {
    variant?: PillVariant;
    children: ReactNode;
    icon?: ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <span className={PILL_CLASS[variant]} style={style}>
            {icon}
            {children}
        </span>
    );
}

/* ── Check card (read-only or editable) ─────────────────── */
export function CheckCard({
    check,
    citeMode,
    editable,
    onToggle,
    onTime,
    dishLookup,
    idx = 0,
}: {
    check: HaccpCheck;
    citeMode?: CitationMode;
    editable?: boolean;
    onToggle?: (id: string) => void;
    onTime?: (id: string, time: string) => void;
    dishLookup: (id: string) => string | undefined;
    idx?: number;
}) {
    const t = CHECK_TYPES[check.type];
    const dishNames = check.dishIds
        .map((id) => dishLookup(id))
        .filter(Boolean)
        .join(', ');
    const enabled = check.enabled ?? true;

    return (
        <div
            className={`metal ${styles.checkCard} ${styles.fadeUp}`}
            style={{
                borderLeft: `3px solid ${t.color}`,
                animationDelay: `${idx * 60}ms`,
                opacity: editable && !enabled ? 0.35 : 1,
            }}
        >
            <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {editable && (
                        <label className={styles.hcheck}>
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => onToggle?.(check.id)}
                            />
                            <span className={styles.hcheckBox}>
                                <Check size={11} />
                            </span>
                        </label>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                marginBottom: 5,
                                flexWrap: 'wrap',
                            }}
                        >
                            <TypeBadge type={check.type} />
                            <HRisk risk={check.risk} />
                        </div>
                        <div
                            style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}
                        >
                            {check.label}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 12,
                                    color: 'var(--muted)',
                                    fontFamily: 'var(--font-mono)',
                                    background: 'rgba(130,130,130,.08)',
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                }}
                            >
                                {check.target}
                            </span>
                            <span
                                style={{ fontSize: 11, color: 'var(--muted)' }}
                            >
                                {dishNames}
                            </span>
                        </div>
                        <CiteTip cite={check.cite} mode={citeMode} />
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        {editable ? (
                            <input
                                type="time"
                                value={check.time}
                                onChange={(e) => onTime?.(check.id, e.target.value)}
                                className="input"
                                style={{
                                    width: 96,
                                    padding: '5px 8px',
                                    textAlign: 'center',
                                    fontSize: 13,
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            />
                        ) : (
                            <div
                                style={{
                                    fontSize: 20,
                                    fontFamily: 'var(--font-display)',
                                    fontWeight: 600,
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                {check.time}
                            </div>
                        )}
                        <div
                            style={{
                                fontSize: 9,
                                color: 'var(--muted)',
                                marginTop: 2,
                                letterSpacing: '.12em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Gepland
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
