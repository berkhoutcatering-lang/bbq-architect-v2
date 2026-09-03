'use client';

/**
 * SubstitutionDrawer — Pillar #3 (Substitutie-suggesties)
 *
 * Vaul-drawer rechts. Tab "Regels" toont rules-based alternatieven uit de
 * RPC find_cheaper_substitutes_same_cut. Tab "AI" doet on-demand een Haiku
 * call via Server Action suggestSubstitutions(mode='ai') met grounding op
 * meat_taxonomy + per-org master_products.
 *
 * Hard rule 9: customer-input zit IN sanitized_input-delimiters in de
 * server action — deze drawer geeft alleen interne IDs door.
 */

import { useState, useTransition } from 'react';
import { Drawer } from 'vaul';
import { Sparkles, ChevronRight, Zap, X, AlertCircle } from 'lucide-react';
import { suggestSubstitutions, type SuggestionResult } from '@/app/price-intelligence/_actions';
import { formatPercent } from '@/lib/format';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    masterProductId: number | null;
    ingredientName: string;
    currentSupplier: string | null;
    currentPrice: number | null;
}

type Suggestion = SuggestionResult['items'][number];

export default function SubstitutionDrawer({
    open,
    onOpenChange,
    masterProductId,
    ingredientName,
    currentSupplier,
    currentPrice,
}: Props) {
    const [tab, setTab] = useState<'rules' | 'ai'>('rules');
    const [rulesData, setRulesData] = useState<Suggestion[] | null>(null);
    const [aiData, setAiData] = useState<Suggestion[] | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const [costCapped, setCostCapped] = useState(false);
    const [isPending, startTransition] = useTransition();

    /* Load rules tab content when drawer opens */
    function loadRules() {
        if (!masterProductId || rulesData !== null) return;
        startTransition(async () => {
            const res = await suggestSubstitutions({ masterProductId, mode: 'rules', limit: 3 });
            if (res.data) setRulesData(res.data.items);
        });
    }

    function loadAi() {
        if (!masterProductId) return;
        setAiError(null);
        setCostCapped(false);
        startTransition(async () => {
            const res = await suggestSubstitutions({ masterProductId, mode: 'ai', limit: 3 });
            if (res.error) {
                setAiError(res.error);
                return;
            }
            if (res.data) {
                if (res.data.source === 'cost_capped') {
                    setCostCapped(true);
                    setAiData(res.data.items);
                } else {
                    setAiData(res.data.items);
                }
            }
        });
    }

    return (
        <Drawer.Root
            direction="right"
            open={open}
            onOpenChange={(o) => {
                onOpenChange(o);
                if (o) loadRules();
            }}
        >
            <Drawer.Portal>
                <Drawer.Overlay className="fixed inset-0 bg-black/50 z-50" />
                <Drawer.Content
                    className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-full max-w-md"
                    style={{
                        background: 'var(--color-bg-primary, #0f172a)',
                        borderLeft: '1px solid var(--color-border, #374151)',
                    }}
                >
                    <Drawer.Title className="sr-only">Goedkopere alternatieven</Drawer.Title>

                    <header style={{ padding: 16, borderBottom: '1px solid var(--color-border, #374151)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: 0.5 }}>
                                    Goedkoper alternatief voor
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{ingredientName}</div>
                                {currentSupplier && (
                                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                                        Nu: {currentSupplier}
                                        {currentPrice !== null && ` — € ${currentPrice.toFixed(2)} / kg`}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                aria-label="Sluiten"
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--color-text-muted)',
                                    cursor: 'pointer',
                                    padding: 4,
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div role="tablist" style={{ display: 'flex', gap: 4, marginTop: 16 }}>
                            <TabButton
                                active={tab === 'rules'}
                                onClick={() => setTab('rules')}
                                label="Regels"
                                icon={<Zap size={14} />}
                            />
                            <TabButton
                                active={tab === 'ai'}
                                onClick={() => {
                                    setTab('ai');
                                    if (!aiData && !aiError) loadAi();
                                }}
                                label="AI-suggesties"
                                icon={<Sparkles size={14} />}
                            />
                        </div>
                    </header>

                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {tab === 'rules' && (
                            <RulesPanel
                                data={rulesData}
                                isLoading={isPending && rulesData === null}
                                currentPrice={currentPrice}
                            />
                        )}
                        {tab === 'ai' && (
                            <AiPanel
                                data={aiData}
                                error={aiError}
                                costCapped={costCapped}
                                isLoading={isPending}
                                onRetry={loadAi}
                            />
                        )}
                    </div>
                </Drawer.Content>
            </Drawer.Portal>
        </Drawer.Root>
    );
}

function TabButton({
    active,
    onClick,
    label,
    icon,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    icon: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: active ? 'var(--color-accent-gold, #d97706)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text-muted)',
                border: active ? 'none' : '1px solid var(--color-border, #374151)',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
            }}
        >
            {icon}
            {label}
        </button>
    );
}

function RulesPanel({
    data,
    isLoading,
    currentPrice,
}: {
    data: Suggestion[] | null;
    isLoading: boolean;
    currentPrice: number | null;
}) {
    if (isLoading) return <SkeletonRows />;
    if (!data || data.length === 0) {
        return (
            <EmptyState
                title="Geen regel-based alternatieven gevonden"
                body="Probeer de AI-tab voor creatieve voorstellen, of voeg een alias toe in de Leveranciers-pagina zodat we cuts beter herkennen."
            />
        );
    }
    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map((s) => (
                <SuggestionRow key={s.candidate_id} s={s} currentPrice={currentPrice} />
            ))}
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Regels: zelfde cut-categorie, andere leverancier, lager €/kg.
            </p>
        </ul>
    );
}

function AiPanel({
    data,
    error,
    costCapped,
    isLoading,
    onRetry,
}: {
    data: Suggestion[] | null;
    error: string | null;
    costCapped: boolean;
    isLoading: boolean;
    onRetry: () => void;
}) {
    if (error) {
        return (
            <div style={{ background: '#7f1d1d22', border: '1px solid #7f1d1d', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fca5a5', fontSize: 13 }}>
                    <AlertCircle size={14} />
                    {error}
                </div>
                <button
                    type="button"
                    onClick={onRetry}
                    style={{ marginTop: 8, padding: '6px 10px', background: 'transparent', border: '1px solid #7f1d1d', borderRadius: 4, color: '#fca5a5', cursor: 'pointer', fontSize: 12 }}
                >
                    Opnieuw proberen
                </button>
            </div>
        );
    }
    if (isLoading) return <SkeletonRows />;
    if (costCapped) {
        return (
            <EmptyState
                title="AI-budget bereikt deze maand"
                body="Je organisatie zit boven de AI-cost-cap voor deze cyclus. Probeer het volgende maand of verhoog je tier."
            />
        );
    }
    if (!data || data.length === 0) {
        return (
            <EmptyState
                title="AI vond geen alternatieven"
                body="De Haiku-suggester kon niets vinden binnen je catalog. Voeg meer producten + aliassen toe via de Leveranciers-pagina."
            />
        );
    }
    return (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.map((s) => (
                <SuggestionRow key={s.candidate_id} s={s} currentPrice={null} aiBadge />
            ))}
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                AI grounded op meat_taxonomy + jouw master_products catalog. Geen externe data.
            </p>
        </ul>
    );
}

function SuggestionRow({
    s,
    currentPrice,
    aiBadge = false,
}: {
    s: Suggestion;
    currentPrice: number | null;
    aiBadge?: boolean;
}) {
    const savingsEur =
        currentPrice !== null && s.prijs_per_kg !== null
            ? currentPrice - s.prijs_per_kg
            : null;
    return (
        <li
            style={{
                background: 'var(--color-bg-secondary, #1f2937)',
                border: '1px solid var(--color-border, #374151)',
                borderRadius: 8,
                padding: 12,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.candidate_naam}</div>
                    {s.leverancier && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            via {s.leverancier}
                            {s.prijs_per_kg !== null && ` — € ${Number(s.prijs_per_kg).toFixed(2)} / kg`}
                        </div>
                    )}
                    {(s.cut_groep || s.soort) && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                            {s.soort && <span>{s.soort}</span>}
                            {s.cut_groep && (
                                <span style={{ marginLeft: s.soort ? 8 : 0 }}>· {s.cut_groep}</span>
                            )}
                        </div>
                    )}
                    {s.ai_reason && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-secondary, #cbd5e1)', marginTop: 6, fontStyle: 'italic' }}>
                            &ldquo;{s.ai_reason}&rdquo;
                        </p>
                    )}
                </div>
                <div style={{ textAlign: 'right' }}>
                    {aiBadge && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, padding: '2px 6px', background: 'var(--color-accent-gold, #d97706)', color: '#fff', borderRadius: 4 }}>
                            <Sparkles size={10} />
                            AI
                        </span>
                    )}
                    {Number(s.savings_pct) > 0 && (
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                            -{formatPercent(Number(s.savings_pct))}
                        </div>
                    )}
                    {savingsEur !== null && savingsEur > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                            € {savingsEur.toFixed(2)} / kg
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

function SkeletonRows() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    style={{
                        height: 80,
                        background: 'var(--color-bg-secondary, #1f2937)',
                        borderRadius: 8,
                        opacity: 0.5,
                    }}
                />
            ))}
        </div>
    );
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div style={{ padding: 24, textAlign: 'center' }}>
            <ChevronRight size={32} style={{ color: 'var(--color-text-muted)', margin: '0 auto 8px' }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.5 }}>{body}</p>
        </div>
    );
}
