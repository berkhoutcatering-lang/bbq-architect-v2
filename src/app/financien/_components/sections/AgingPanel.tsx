'use client';
/* AgingPanel — Pillar #2 (Raise / Must-be)
   DSO + 4 aging-buckets. Klik op bucket → drawer met factuurlijst + actie-knoppen. */

import { useMemo, useState } from 'react';
import { Clock, ChevronRight, X, Send, AlertTriangle } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';
import { fmt } from '@/lib/utils';
import { computeAging, type FactuurMin, type AgingBucket } from '@/lib/financeAnalytics';

interface Props {
    facturen: FactuurMin[];
}

const BUCKET_COLORS: Record<AgingBucket['label'], { bg: string; border: string; icon: string; text: string }> = {
    '0-30': { bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.25)', icon: 'var(--green)', text: 'On track' },
    '30-60': { bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.25)', icon: 'var(--amber)', text: 'Vraag aandacht' },
    '60-90': { bg: 'rgba(239,68,68,.08)', border: 'rgba(239,68,68,.25)', icon: 'var(--red)', text: 'Stuur reminder' },
    '90+': { bg: 'rgba(127,29,29,.15)', border: 'rgba(239,68,68,.4)', icon: '#ef4444', text: 'Bel klant' },
};

export default function AgingPanel({ facturen }: Props) {
    const aging = useMemo(() => computeAging(facturen), [facturen]);
    const [openBucket, setOpenBucket] = useState<AgingBucket['label'] | null>(null);

    if (aging.totaal_openstaand === 0 && aging.dso_days === 0) return null;

    const branchemean = 32; /* KHN-research 2026: catering gemiddeld DSO 32d */
    const dsoIsBetter = aging.dso_days > 0 && aging.dso_days < branchemean;

    const detailBucket = openBucket ? aging.buckets.find(b => b.label === openBucket) : null;

    return (
        <>
            <MetallicCard hover={false} className="mt-4">
                <div className="panel-head">
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Clock size={12} style={{ color: 'var(--brand)' }} /> Aging — wie betaalt te laat?
                    </h3>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmt(aging.totaal_openstaand)} openstaand</span>
                </div>

                {/* DSO header */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>DSO</div>
                        <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dsoIsBetter ? 'var(--green)' : 'var(--text)' }}>
                            {aging.dso_days} <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>dagen</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 480 }}>
                        Gemiddelde tijd tussen factuurdatum en betaaldatum (laatste 12 maanden).{' '}
                        <strong style={{ color: dsoIsBetter ? 'var(--green)' : 'var(--amber)' }}>
                            Branche-gemiddelde catering: {branchemean} dagen
                        </strong>
                        {dsoIsBetter ? ' — beter dan gemiddeld.' : ' — boven gemiddelde, ruimte voor verbetering.'}
                    </div>
                </div>

                {/* 4 buckets grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 1, background: 'var(--border)' }}>
                    {aging.buckets.map(b => {
                        const c = BUCKET_COLORS[b.label];
                        const isEmpty = b.count === 0;
                        return (
                            <button
                                key={b.label}
                                data-testid={`aging-bucket-${b.label}`}
                                onClick={() => !isEmpty && setOpenBucket(b.label)}
                                disabled={isEmpty}
                                style={{
                                    background: isEmpty ? 'var(--bg)' : c.bg,
                                    border: 'none',
                                    padding: '16px 18px',
                                    textAlign: 'left',
                                    cursor: isEmpty ? 'default' : 'pointer',
                                    fontFamily: 'inherit',
                                    color: 'inherit',
                                    minHeight: 100,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                    opacity: isEmpty ? 0.5 : 1,
                                    transition: '.15s',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: isEmpty ? 'var(--muted)' : c.icon, letterSpacing: '.06em', textTransform: 'uppercase' }}>{b.label} dagen</span>
                                    {!isEmpty && <ChevronRight size={14} color={c.icon} />}
                                </div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: isEmpty ? 'var(--muted)' : 'var(--text)' }}>
                                    {fmt(b.bedrag)}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                    {b.count} {b.count === 1 ? 'factuur' : 'facturen'} · {isEmpty ? '—' : c.text}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </MetallicCard>

            {/* Drawer met factuurlijst */}
            {detailBucket && (
                <>
                    <div onClick={() => setOpenBucket(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)', zIndex: 9998 }} />
                    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 540, maxWidth: '95vw', background: 'var(--bg-elevated, #16161a)', borderLeft: '1px solid var(--border)', zIndex: 9999, animation: 'slideInRight .35s cubic-bezier(.16,1,.3,1)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>
                                    Facturen {detailBucket.label} dagen
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                    {detailBucket.count} {detailBucket.count === 1 ? 'factuur' : 'facturen'} · totaal {fmt(detailBucket.bedrag)}
                                </div>
                            </div>
                            <button onClick={() => setOpenBucket(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44 }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
                            {detailBucket.facturen
                                .sort((a, b) => b.dagen_oud - a.dagen_oud)
                                .map(f => (
                                    <div
                                        key={f.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12,
                                            padding: '12px 24px',
                                            borderBottom: '1px solid var(--border)',
                                        }}
                                    >
                                        {f.dagen_oud >= 60 && <AlertTriangle size={14} color="var(--red)" style={{ flexShrink: 0 }} />}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{f.nummer} · {f.client}</div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                                Vervaldatum {f.vervaldatum} · {f.dagen_oud >= 0 ? `${f.dagen_oud} dgn verlopen` : `nog ${Math.abs(f.dagen_oud)} dgn`}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.bedrag)}</div>
                                        </div>
                                        <button
                                            data-testid={`aging-reminder-${f.id}`}
                                            disabled
                                            title="Komende functie — P1"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                                padding: '6px 10px',
                                                borderRadius: 8,
                                                background: 'transparent',
                                                border: '1px solid var(--border)',
                                                color: 'var(--muted-weak, #888)',
                                                fontSize: 11,
                                                fontWeight: 500,
                                                opacity: 0.5,
                                                cursor: 'not-allowed',
                                                fontFamily: 'inherit',
                                                minHeight: 32,
                                            }}
                                        >
                                            <Send size={11} /> Reminder
                                        </button>
                                    </div>
                                ))}
                        </div>
                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--text)' }}>Smart-Pay reminders</strong> komen in P1 — auto-emails op T+1/T+7/T+14 vervaldatum-overschrijding.
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
