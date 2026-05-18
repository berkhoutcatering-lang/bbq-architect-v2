'use client';

/* ═══════════════════════════════════════════════════════════════
   AllergenSourceChainPopover — Pillar #2 (Allergeen-cascade audit)
   ─────────────────────────────────────────────────────────────
   Toont de evidence-chain bij hover/click op een allergen-chip:
     "← gluten via 'Brioche bun' → ingrediënt 'Bloem'"
   Voedt direct uit gerecht_allergens_mv.source_chain JSONB.
   ─────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { Info, AlertTriangle, ShieldCheck } from 'lucide-react';

export interface SourceChainEntry {
    inventory_id: number | null;
    fallback_name: string | null;
    component_id: number;
    confirmed: boolean;
    ai_suggested: boolean;
}

interface Props {
    allergenCode: string;
    allergenLabel: string;
    sourceChain: SourceChainEntry[];
    /** Wanneer geen mens-bevestiging in de chain zit toont icoon + tooltip "needs review". */
    requireConfirmation?: boolean;
}

export default function AllergenSourceChainPopover({
    allergenCode,
    allergenLabel,
    sourceChain,
    requireConfirmation = true,
}: Props) {
    const [open, setOpen] = useState(false);

    const allConfirmed = sourceChain.every((s) => s.confirmed);
    const hasUnconfirmedAi = sourceChain.some((s) => s.ai_suggested && !s.confirmed);
    const status: 'confirmed' | 'pending' | 'mixed' = allConfirmed
        ? 'confirmed'
        : hasUnconfirmedAi
        ? 'pending'
        : 'mixed';

    const statusColor = status === 'confirmed' ? '#00d4a1' : status === 'pending' ? '#f59e0b' : 'var(--muted)';
    const StatusIcon = status === 'confirmed' ? ShieldCheck : status === 'pending' ? AlertTriangle : Info;

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                aria-expanded={open}
                aria-label={`${allergenLabel} — bron-keten (${status === 'confirmed' ? 'bevestigd' : 'wacht op bevestiging'})`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: status === 'confirmed' ? 'rgba(0,212,161,.08)' : 'rgba(245,158,11,.08)',
                    border: requireConfirmation && status !== 'confirmed'
                        ? `1px dashed ${statusColor}`
                        : `1px solid ${statusColor}55`,
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'help',
                }}
            >
                <span aria-hidden style={{ fontWeight: 700 }}>{allergenCode}</span>
                <span>{allergenLabel}</span>
                <StatusIcon size={10} aria-hidden />
            </button>

            {open && sourceChain.length > 0 && (
                <div
                    role="tooltip"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 50,
                        minWidth: 240,
                        maxWidth: 320,
                        padding: 12,
                        background: 'var(--bg-elevated, #18181c)',
                        border: '1px solid var(--border, rgba(255,255,255,.08))',
                        borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,.4)',
                        fontSize: 11,
                        lineHeight: 1.5,
                    }}
                >
                    <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted, #71717a)', fontWeight: 700, marginBottom: 8 }}>
                        Bron-keten · EU 1169/2011
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {sourceChain.map((entry, i) => (
                            <div key={`${entry.component_id}-${entry.inventory_id ?? entry.fallback_name ?? i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, color: 'var(--text, #f5f5f7)' }}>
                                <span aria-hidden style={{ color: 'var(--muted, #71717a)', marginTop: 1 }}>↳</span>
                                <span style={{ flex: 1 }}>
                                    {entry.fallback_name ?? `Ingrediënt #${entry.inventory_id}`}
                                    {entry.confirmed ? (
                                        <span style={{ color: '#00d4a1', marginLeft: 6 }} title="Mens-bevestigd">✓</span>
                                    ) : entry.ai_suggested ? (
                                        <span style={{ color: '#f59e0b', marginLeft: 6 }} title="Door AI voorgesteld — nog niet bevestigd">⚠</span>
                                    ) : null}
                                </span>
                            </div>
                        ))}
                    </div>
                    {status !== 'confirmed' && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border, rgba(255,255,255,.06))', fontSize: 10, color: 'var(--muted, #a1a1aa)' }}>
                            Bevestig in /gerechten/allergen-queue
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
