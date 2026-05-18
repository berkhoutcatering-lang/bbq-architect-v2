'use client';

/* ═══════════════════════════════════════════════════════════════
   ReuseCounterChip — Pillar #4 (Component-reuse als IP)
   ─────────────────────────────────────────────────────────────
   Toont per component: "🔁 7 gerechten · €420/mo impact" zodat
   tenants zien welke componenten echt waarde leveren.
   Geen concurrent toont deze counter expliciet.
   ─────────────────────────────────────────────────────────────── */

import { Recycle } from 'lucide-react';

interface Props {
    /** Aantal gerechten waarin dit component voorkomt. */
    count: number;
    /** Optioneel: geschatte impact per maand in euro (verkoopprijs × maandelijkse afzet). */
    monthlyImpactEur?: number;
    /** Compact-mode toont alleen count + icoon, geen labels. */
    compact?: boolean;
}

function formatEuro(n: number): string {
    if (n >= 1000) {
        return `€${(n / 1000).toFixed(1).replace('.', ',')}k`;
    }
    return `€${Math.round(n)}`;
}

export default function ReuseCounterChip({ count, monthlyImpactEur, compact = false }: Props) {
    // Color intensity based on reuse-density
    const color = count >= 5 ? '#00d4a1' : count >= 2 ? '#FFBF00' : 'var(--muted)';
    const bg = count >= 5 ? 'rgba(0,212,161,.08)' : count >= 2 ? 'rgba(255,191,0,.08)' : 'rgba(255,255,255,.04)';
    const border = count >= 5 ? 'rgba(0,212,161,.25)' : count >= 2 ? 'rgba(255,191,0,.25)' : 'var(--border)';

    if (compact) {
        return (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 7px',
                    borderRadius: 5,
                    background: bg,
                    border: `1px solid ${border}`,
                    color,
                    fontSize: 11,
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                }}
                title={`Gebruikt in ${count} ${count === 1 ? 'gerecht' : 'gerechten'}`}
            >
                <Recycle size={10} aria-hidden />
                {count}
            </span>
        );
    }

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: bg,
                border: `1px solid ${border}`,
                color,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
            }}
            title={
                monthlyImpactEur !== undefined
                    ? `Gebruikt in ${count} ${count === 1 ? 'gerecht' : 'gerechten'} · ~${formatEuro(monthlyImpactEur)}/maand impact`
                    : `Gebruikt in ${count} ${count === 1 ? 'gerecht' : 'gerechten'}`
            }
        >
            <Recycle size={11} aria-hidden />
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{count}</span>
            <span>{count === 1 ? 'gerecht' : 'gerechten'}</span>
            {monthlyImpactEur !== undefined && monthlyImpactEur > 0 && (
                <>
                    <span aria-hidden style={{ opacity: 0.5 }}>·</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatEuro(monthlyImpactEur)}/mo</span>
                </>
            )}
        </span>
    );
}
