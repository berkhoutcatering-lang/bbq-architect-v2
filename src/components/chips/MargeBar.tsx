'use client';

/* ═══════════════════════════════════════════════════════════════
   MargeBar — Pillar #3 (One-glance margin-truth)
   ─────────────────────────────────────────────────────────────
   Visuele marge-indicator: stacked bar (kost vs marge) + percentage.
   Traffic-light kleur op marge-band (rood <30%, oranje 30-50%, groen >50%).
   Geëxtracteerd uit /m/gerechten MobileLarsView zodat ook /gerechten
   library, ConceptCard en EditorDrawer 'm kunnen hergebruiken.
   ─────────────────────────────────────────────────────────────── */

interface Props {
    /** Marge als ratio 0-1 (bv. 0.62 = 62%). */
    margin: number;
    /** Optional: compact-mode toont alleen de bar zonder percentage-tekst. */
    compact?: boolean;
    /** Optional: explicit hoogte in px. Default 6. */
    height?: number;
}

export function marginColor(margin: number): string {
    if (margin > 0.5) return '#00d4a1';
    if (margin > 0.3) return '#f59e0b';
    return '#ef4444';
}

export default function MargeBar({ margin, compact = false, height = 6 }: Props) {
    const clamped = Math.max(0, Math.min(1, margin));
    const left = 1 - clamped;
    const c = marginColor(clamped);

    if (compact) {
        return (
            <div
                aria-label={`Marge ${Math.round(clamped * 100)} procent`}
                style={{ height, display: 'flex', gap: 1, borderRadius: 3, overflow: 'hidden', width: '100%' }}
            >
                <div style={{ flex: left, background: '#2a2a2e', borderRadius: '3px 0 0 3px' }} />
                <div style={{ flex: clamped, background: c, borderRadius: '0 3px 3px 0' }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
                aria-hidden
                style={{
                    flex: 1,
                    height,
                    display: 'flex',
                    gap: 1,
                    borderRadius: 3,
                    overflow: 'hidden',
                }}
            >
                <div style={{ flex: left, background: '#2a2a2e', borderRadius: '3px 0 0 3px' }} />
                <div style={{ flex: clamped, background: c, borderRadius: '0 3px 3px 0' }} />
            </div>
            <span
                style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 36,
                    textAlign: 'right',
                    color: c,
                }}
                aria-label={`${Math.round(clamped * 100)} procent marge`}
            >
                {Math.round(clamped * 100)}%
            </span>
        </div>
    );
}
