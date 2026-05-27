'use client';
/* FinanceCopilotIdeaCard — Bucket J P0.9
   Card met "Ik zag iets" insight. Drie statussen (idee/opgeslagen/weggeklikt).
   Pillar #2 — source_refs verplicht zichtbaar als chips.
   Pillar #3 — [Boekhouder beslist] chip onder elke fiscale claim. */

import { useState } from 'react';
import { AlertTriangle, Send, Eye, Check, ShieldCheck, X } from 'lucide-react';

export type IdeaStatus = 'idee' | 'opgeslagen' | 'weggeklikt';
export type IdeaKind = 'cost_optimization' | 'btw_check' | 'investering' | 'klant_concentratie' | 'margelek' | 'cashflow';
export type IdeaSeverity = 'low' | 'medium' | 'high';

export interface SourceRef {
    kind: 'bon' | 'factuur' | 'event' | 'margelek_maand' | 'investering';
    id: string;
    label?: string;
}

export interface IdeaProps {
    /** ID van de finance_copilot_messages row (na save). Null voor pre-save state. */
    messageId?: string | null;
    /** Variant beïnvloedt accent-kleur. */
    variant?: 'inline' | 'standalone';
    gap: string;
    opportunity: string;
    opportunity_ref: SourceRef[];
    kind: IdeaKind;
    severity: IdeaSeverity;
    status: IdeaStatus;
    onSave?: () => Promise<void> | void;
    onDismiss?: () => Promise<void> | void;
    onSendToBookkeeper?: () => Promise<void> | void;
}

const SEVERITY_COLORS: Record<IdeaSeverity, { bg: string; border: string; icon: string }> = {
    low: { bg: 'rgba(96,165,250,.06)', border: 'rgba(96,165,250,.18)', icon: 'var(--blue, #60a5fa)' },
    medium: { bg: 'rgba(245,158,11,.06)', border: 'rgba(245,158,11,.18)', icon: 'var(--amber, #f59e0b)' },
    high: { bg: 'rgba(239,68,68,.06)', border: 'rgba(239,68,68,.18)', icon: 'var(--red, #ef4444)' },
};

const KIND_LABELS: Record<IdeaKind, string> = {
    cost_optimization: 'Kostenoptimalisatie',
    btw_check: 'BTW-check',
    investering: 'Investering',
    klant_concentratie: 'Klant-concentratie',
    margelek: 'Margelek',
    cashflow: 'Cashflow',
};

/* Detecteer of opportunity-tekst fiscaal-relevant is — toon dan [Boekhouder beslist] chip. */
function isFiscaal(kind: IdeaKind, opportunity: string): boolean {
    if (kind === 'btw_check' || kind === 'investering') return true;
    return /\[boekhouder beslist\]|aftrek|btw|fiscaal|kia|aangifte/i.test(opportunity);
}

export default function FinanceCopilotIdeaCard({
    variant = 'inline',
    gap,
    opportunity,
    opportunity_ref,
    kind,
    severity,
    status,
    onSave,
    onDismiss,
    onSendToBookkeeper,
}: IdeaProps) {
    const [busy, setBusy] = useState<null | 'save' | 'dismiss' | 'send'>(null);
    const sevColor = SEVERITY_COLORS[severity];
    const showFiscaalChip = isFiscaal(kind, opportunity);

    /* Strip [Boekhouder beslist] markup voor de tekst-render — chip toont al die info. */
    const cleanOpportunity = opportunity.replace(/\s*\[boekhouder beslist\]\s*/gi, '').trim();

    async function handle(fn: (() => Promise<void> | void) | undefined, type: 'save' | 'dismiss' | 'send') {
        if (!fn) return;
        setBusy(type);
        try {
            await fn();
        } finally {
            setBusy(null);
        }
    }

    if (status === 'weggeklikt') return null;

    return (
        <div
            data-testid="finance-idea-card"
            data-status={status}
            style={{
                background: variant === 'inline' ? 'linear-gradient(135deg, rgba(167,139,250,.05), rgba(167,139,250,.02))' : sevColor.bg,
                border: `1px solid ${variant === 'inline' ? 'rgba(167,139,250,.18)' : sevColor.border}`,
                borderRadius: 'var(--radius-xl, 14px)',
                padding: '16px 18px',
                marginBottom: 16,
                animation: 'fadeIn 0.4s ease-out',
                opacity: status === 'opgeslagen' ? 0.7 : 1,
            }}
        >
            {/* Top row — eyebrow + Send-to-Bookkeeper top right */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: sevColor.bg, border: `1px solid ${sevColor.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <AlertTriangle size={14} color={sevColor.icon} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4,
                        }}>
                            <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
                                textTransform: 'uppercase', color: 'var(--purple)',
                            }}>
                                Ik zag iets
                            </span>
                            <span style={{
                                fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                                background: 'rgba(130,130,130,.08)', color: 'var(--muted)',
                                textTransform: 'uppercase', letterSpacing: '.06em',
                            }}>
                                {KIND_LABELS[kind]}
                            </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, fontWeight: 500 }}>
                            {gap}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55, marginTop: 4 }}>
                            {cleanOpportunity}
                        </div>
                    </div>
                </div>
                {status === 'idee' && onSendToBookkeeper && (
                    <button
                        data-testid="idea-send-bookkeeper-top"
                        onClick={() => handle(onSendToBookkeeper, 'send')}
                        disabled={busy !== null}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '6px 12px', borderRadius: 999, minHeight: 32,
                            background: 'rgba(167,139,250,.1)', border: '1px solid rgba(167,139,250,.25)',
                            color: 'var(--purple)', fontSize: 11, fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                            opacity: busy ? 0.6 : 1, flexShrink: 0,
                        }}
                    >
                        <Send size={11} /> Stuur naar boekhouder
                    </button>
                )}
            </div>

            {/* Source refs */}
            {opportunity_ref.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10, marginLeft: 38 }}>
                    {opportunity_ref.slice(0, 6).map((ref, i) => (
                        <span
                            key={i}
                            data-testid="idea-source-ref"
                            style={{
                                fontSize: 10, fontFamily: 'var(--font-mono, ui-monospace)',
                                padding: '2px 8px', borderRadius: 4,
                                background: 'rgba(130,130,130,.08)', color: 'var(--muted)',
                                border: '1px solid var(--border)',
                            }}
                            title={ref.label}
                        >
                            {ref.id}
                        </span>
                    ))}
                    {opportunity_ref.length > 6 && (
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                            +{opportunity_ref.length - 6} meer
                        </span>
                    )}
                </div>
            )}

            {/* Bottom row — chip + acties */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginLeft: 38 }}>
                {showFiscaalChip && (
                    <span
                        data-testid="boekhouder-beslist-chip"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 10, fontWeight: 600, color: 'var(--muted)',
                            background: 'rgba(130,130,130,.08)',
                            border: '1px solid var(--border)', borderRadius: 999,
                            padding: '3px 8px',
                        }}
                    >
                        <ShieldCheck size={10} /> Boekhouder beslist
                    </span>
                )}

                <div style={{ flex: 1 }} />

                {status === 'idee' && (
                    <>
                        <button
                            data-testid="idea-save"
                            onClick={() => handle(onSave, 'save')}
                            disabled={busy !== null}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 8, minHeight: 32,
                                background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)',
                                color: 'var(--green)', fontSize: 11, fontWeight: 600,
                                cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: busy ? 0.6 : 1,
                            }}
                        >
                            <Check size={11} /> Sla op voor boekhouder
                        </button>
                        <button
                            data-testid="idea-dismiss"
                            onClick={() => handle(onDismiss, 'dismiss')}
                            disabled={busy !== null}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 8, minHeight: 32,
                                background: 'transparent', border: '1px solid var(--border)',
                                color: 'var(--muted)', fontSize: 11, fontWeight: 500,
                                cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: busy ? 0.6 : 1,
                            }}
                        >
                            <X size={11} /> Negeer
                        </button>
                        <button
                            data-testid="idea-show-bonnen"
                            disabled
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 8, minHeight: 32,
                                background: 'transparent', border: '1px solid var(--border)',
                                color: 'var(--muted-weak, #888)', fontSize: 11, fontWeight: 500,
                                opacity: 0.4, fontFamily: 'inherit',
                            }}
                            title="Komende functie — P1"
                        >
                            <Eye size={11} /> Toon bonnen
                        </button>
                    </>
                )}

                {status === 'opgeslagen' && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
                        color: 'var(--green)', fontWeight: 600,
                    }}>
                        <Check size={12} /> Opgeslagen voor boekhouder
                    </span>
                )}
            </div>
        </div>
    );
}
