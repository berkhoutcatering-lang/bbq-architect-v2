'use client';

import { Check } from 'lucide-react';
import type { ThemePreset } from '@/lib/themes';
import { verdictFor, type ContrastVerdict } from '@/lib/contrast';

interface Props {
    preset: ThemePreset;
    isActive: boolean;       // matches huidige saved settings.brand_*
    isPreviewing: boolean;   // currently shown in left preview-pane
    bedrijfsnaam?: string;
    onPreview: (presetId: string) => void;
}

const VERDICT_STYLES: Record<ContrastVerdict, { bg: string; border: string; color: string; label: string }> = {
    AAA: { bg: 'rgba(34,197,94,.12)', border: 'rgba(34,197,94,.35)', color: '#22c55e', label: 'AAA' },
    AA: { bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.35)', color: '#f59e0b', label: 'AA' },
    FAIL: { bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.35)', color: '#ef4444', label: 'Fail' },
};

const AUDIENCE_STYLES: Record<string, { bg: string; color: string }> = {
    lars: { bg: 'rgba(99,179,237,.12)', color: '#63b3ed' },
    pro: { bg: 'rgba(196,163,90,.14)', color: '#c4a35a' },
    showcase: { bg: 'rgba(167,139,250,.14)', color: '#a78bfa' },
    demo: { bg: 'rgba(244,114,182,.14)', color: '#f472b6' },
};

export default function ThemePresetCard({ preset, isActive, isPreviewing, bedrijfsnaam, onPreview }: Props) {
    const { tokens, naam, omschrijving, audience, audienceLabel } = preset;
    const textVsCard = verdictFor(tokens.text, tokens.card);
    const verdictStyle = VERDICT_STYLES[textVsCard];
    const audienceStyle = AUDIENCE_STYLES[audience] ?? AUDIENCE_STYLES.pro;

    const borderColor = isPreviewing ? tokens.primary : (isActive ? `color-mix(in oklch, ${tokens.primary}, transparent 60%)` : 'var(--border)');
    const borderWidth = isPreviewing ? 2 : 1;

    return (
        <button
            type="button"
            onClick={() => onPreview(preset.id)}
            aria-pressed={isPreviewing}
            aria-label={`Preview ${naam}-thema`}
            style={{
                padding: 0,
                borderRadius: 12,
                overflow: 'hidden',
                cursor: 'pointer',
                border: `${borderWidth}px solid ${borderColor}`,
                background: 'transparent',
                textAlign: 'left',
                color: 'var(--text)',
                transition: 'transform .15s, border-color .15s',
                position: 'relative',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
            {/* Mini-preview met preset's eigen kleuren (lampion-effect) */}
            <div style={{ padding: 12, background: tokens.bg, borderBottom: `1px solid ${tokens.card}` }}>
                <div style={{
                    padding: 10, borderRadius: 8, marginBottom: 8,
                    background:
                        `radial-gradient(140% 60% at 50% 0%, color-mix(in oklch, ${tokens.primary}, transparent 80%), transparent 65%), ` +
                        `radial-gradient(120% 45% at 50% 100%, color-mix(in oklch, ${tokens.primary}, transparent 92%), transparent 55%), ` +
                        tokens.card,
                    boxShadow:
                        `inset 0 1px 0 0 color-mix(in oklch, ${tokens.text}, transparent 92%), ` +
                        `inset 0 0 20px 0 color-mix(in oklch, ${tokens.primary}, transparent 92%), ` +
                        '0 1px 2px rgba(0,0,0,.06), 0 6px 16px -6px rgba(0,0,0,.22)',
                }}>
                    <div style={{ fontSize: 9, color: tokens.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 3 }}>
                        Event
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tokens.text, marginBottom: 6, lineHeight: 1.2 }}>
                        {bedrijfsnaam || 'Jouw bedrijf'}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <span style={{ padding: '3px 8px', borderRadius: 4, background: tokens.primary, color: tokens.card, fontSize: 9, fontWeight: 700 }}>OFFERTE</span>
                        <span style={{ padding: '3px 8px', borderRadius: 4, background: 'transparent', border: `1px solid ${tokens.accent}`, color: tokens.accent, fontSize: 9, fontWeight: 700 }}>FACTUUR</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 3 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: tokens.primary }} title="Primair" />
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: tokens.accent }} title="Accent" />
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: tokens.card, border: `1px solid ${tokens.accent}` }} title="Kaart" />
                    <span style={{ width: 16, height: 16, borderRadius: 3, background: tokens.bg, border: `1px solid ${tokens.accent}` }} title="Achtergrond" />
                </div>
            </div>

            <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {naam}
                        {isActive && (
                            <span aria-label="Huidige huisstijl" title="Huidige huisstijl" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, borderRadius: 4, background: 'color-mix(in oklch, var(--brand-primary), transparent 80%)', color: 'var(--brand-primary)' }}>
                                <Check size={10} aria-hidden />
                            </span>
                        )}
                    </span>
                    <span
                        title={`Tekst-op-kaart contrast (WCAG ratio)`}
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: verdictStyle.bg,
                            border: `1px solid ${verdictStyle.border}`,
                            color: verdictStyle.color,
                            letterSpacing: '.05em',
                            flexShrink: 0,
                        }}
                    >
                        {verdictStyle.label}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span
                        style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: audienceStyle.bg,
                            color: audienceStyle.color,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                        }}
                    >
                        {audienceLabel}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.3 }}>{omschrijving}</div>
            </div>
        </button>
    );
}
