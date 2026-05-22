'use client';

/**
 * Editor controls — pure UI primitives. Bedraad door `MenukaartEditor` met
 * cascade-aware state. Geen Server-Action-calls hier; alles bubbelt naar boven
 * via callbacks.
 */

import { useState, useEffect, useRef } from 'react';
import { ChevronRight, RotateCcw, Plus, Minus } from 'lucide-react';
import type { CascadeSource } from '@/lib/menukaart/cascade';

/* ── Section (collapsible) ────────────────────────────────────── */
type SectionProps = {
    icon: React.ReactNode;
    title: string;
    summary?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
};
export function Section({ icon, title, summary, defaultOpen = false, children }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="mke-section">
            <button className="mke-section-header" onClick={() => setOpen(o => !o)}>
                <span className="mke-section-icon">{icon}</span>
                <span className="mke-section-title">{title}</span>
                {!open && summary && <span className="mke-section-summary">{summary}</span>}
                <span className={`mke-chevron ${open ? 'open' : ''}`}><ChevronRight size={14} /></span>
            </button>
            {open && <div className="mke-section-body">{children}</div>}
        </div>
    );
}

/* ── Cascade badge ────────────────────────────────────── */
export function CascadeBadge({ source }: { source: CascadeSource }) {
    const label = source === 'custom' ? 'Custom' : source === 'brand' ? 'Brand' : 'Default';
    return <span className={`mke-badge ${source}`} title={`Bron: ${label}`}>{label}</span>;
}

/* ── ColorControl ────────────────────────────────────── */
type ColorControlProps = {
    label: string;
    value: string;
    source: CascadeSource;
    onChange: (hex: string) => void;
    onReset?: () => void;
};
export function ColorControl({ label, value, source, onChange, onReset }: ColorControlProps) {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <div className="mke-row">
            <span className="mke-label">{label}</span>
            <div className="mke-value">
                <button
                    className="mke-swatch"
                    style={{ background: value }}
                    onClick={() => ref.current?.click()}
                    type="button"
                    title="Kies kleur"
                />
                <input
                    ref={ref}
                    type="color"
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    className="mke-color-input"
                />
                <span className="mke-hex">{value.toUpperCase()}</span>
                <CascadeBadge source={source} />
                {source !== 'default' && onReset && (
                    <button className="mke-reset" onClick={onReset} title="Reset naar vorige laag" type="button">
                        <RotateCcw size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── SizeControl ──────────────────────────────────────
   Step-size schaalt met range zodat logo (24-200) snel groter wordt en
   body-size (7-20) nog steeds nauwkeurig blijft. Shift-click = 5× step
   voor sprongen. Houdt vingertopen niet vermoeid. */
type SizeControlProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    source: CascadeSource;
    suffix?: string;
    /** Optional override step — anders auto-detected uit range (max-min)/30. */
    step?: number;
    onChange: (n: number) => void;
    onReset?: () => void;
};
function clampStep(min: number, max: number): number {
    const range = max - min;
    if (range >= 100) return 8;
    if (range >= 50) return 4;
    if (range >= 20) return 2;
    return 1;
}
export function SizeControl({ label, value, min, max, source, suffix = 'px', step, onChange, onReset }: SizeControlProps) {
    const autoStep = step ?? clampStep(min, max);
    const fastStep = autoStep * 5;
    return (
        <div className="mke-row">
            <span className="mke-label">{label}</span>
            <div className="mke-value">
                <div className="mke-size">
                    <button
                        className="mke-size-btn"
                        onClick={e => onChange(Math.max(min, value - (e.shiftKey ? fastStep : autoStep)))}
                        disabled={value <= min}
                        type="button"
                        title={`-${autoStep} · shift = -${fastStep}`}
                    >
                        <Minus size={12} />
                    </button>
                    <span className="mke-size-val">{value}{suffix}</span>
                    <button
                        className="mke-size-btn"
                        onClick={e => onChange(Math.min(max, value + (e.shiftKey ? fastStep : autoStep)))}
                        disabled={value >= max}
                        type="button"
                        title={`+${autoStep} · shift = +${fastStep}`}
                    >
                        <Plus size={12} />
                    </button>
                </div>
                <CascadeBadge source={source} />
                {source !== 'default' && onReset && (
                    <button className="mke-reset" onClick={onReset} type="button" title="Reset">
                        <RotateCcw size={12} />
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── FontControl ────────────────────────────────────── */
type FontControlProps = {
    label: string;
    value: string;
    options: string[];
    source: CascadeSource;
    onChange: (font: string) => void;
};
export function FontControl({ label, value, options, source, onChange }: FontControlProps) {
    return (
        <div className="mke-row-stack">
            <div className="mke-row">
                <span className="mke-label">{label}</span>
                <CascadeBadge source={source} />
            </div>
            <select className="mke-select" value={value} onChange={e => onChange(e.target.value)}>
                {options.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
        </div>
    );
}

/* ── WeightControl ────────────────────────────────────── */
type WeightProps = {
    label: string;
    value: number;
    options: number[];
    source: CascadeSource;
    onChange: (w: number) => void;
};
export function WeightControl({ label, value, options, source, onChange }: WeightProps) {
    return (
        <div className="mke-row-stack">
            <div className="mke-row">
                <span className="mke-label">{label}</span>
                <CascadeBadge source={source} />
            </div>
            <div className="mke-weights">
                {options.map(w => (
                    <button
                        key={w}
                        className={`mke-weight ${w === value ? 'active' : ''}`}
                        onClick={() => onChange(w)}
                        type="button"
                    >
                        {w}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ── TextControl ────────────────────────────────────── */
type TextControlProps = {
    label: string;
    value: string;
    max: number;
    source: CascadeSource;
    onChange: (s: string) => void;
};
export function TextControl({ label, value, max, source, onChange }: TextControlProps) {
    const [local, setLocal] = useState(value);
    // Sync external state changes
    useEffect(() => { setLocal(value); }, [value]);
    return (
        <div className="mke-row-stack">
            <div className="mke-row">
                <span className="mke-label">{label}</span>
                <CascadeBadge source={source} />
            </div>
            <div className="mke-input-wrap">
                <input
                    type="text"
                    className="mke-input"
                    value={local}
                    maxLength={max}
                    onChange={e => setLocal(e.target.value)}
                    onBlur={() => { if (local !== value) onChange(local); }}
                />
                <span className="mke-charcount">{local.length}/{max}</span>
            </div>
        </div>
    );
}

/* ── ToggleControl ────────────────────────────────────── */
type ToggleProps = {
    label: string;
    value: boolean;
    source: CascadeSource;
    onChange: (b: boolean) => void;
};
export function ToggleControl({ label, value, source, onChange }: ToggleProps) {
    return (
        <div className="mke-toggle-row">
            <span className="mke-label">{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CascadeBadge source={source} />
                <button
                    className={`mke-toggle ${value ? 'on' : ''}`}
                    onClick={() => onChange(!value)}
                    type="button"
                    aria-pressed={value}
                />
            </div>
        </div>
    );
}

/* ── PositionChips ────────────────────────────────────── */
type PositionChipsProps = {
    value: 'top-left' | 'top-center' | 'top-right';
    onChange: (v: 'top-left' | 'top-center' | 'top-right') => void;
};
export function PositionChips({ value, onChange }: PositionChipsProps) {
    const opts: Array<{ id: 'top-left' | 'top-center' | 'top-right'; label: string }> = [
        { id: 'top-left', label: 'Linksboven' },
        { id: 'top-center', label: 'Boven-midden' },
        { id: 'top-right', label: 'Rechtsboven' },
    ];
    return (
        <div className="mke-pos-chips">
            {opts.map(o => (
                <button
                    key={o.id}
                    className={`mke-pos ${o.id === value ? 'active' : ''}`}
                    onClick={() => onChange(o.id)}
                    type="button"
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
