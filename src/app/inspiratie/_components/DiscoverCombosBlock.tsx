/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Boxes, RefreshCw, ChefHat, Flame } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

interface SuggestionComponent {
    component_id: number;
    name: string;
    quantity: number;
    unit: string;
    cost_cents: number;
}
interface Suggestion {
    name: string;
    description: string;
    why_this_combo: string;
    components: SuggestionComponent[];
    total_cost_cents: number;
}

function formatEuro(cents: number): string {
    return `€${(cents / 100).toFixed(2)}`;
}

const PITMASTER_LINES = [
    'De pitmaster scharrelt door je smaakbank…',
    'Even kijken wat er rookt…',
    'Combinaties proeven in het hoofd…',
    'AI staat naast de smoker…',
];

export default function DiscoverCombosBlock() {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [ranAt, setRanAt] = useState<Date | null>(null);
    const [pitline, setPitline] = useState(PITMASTER_LINES[0]);

    async function handleDiscover() {
        setBusy(true);
        setPitline(PITMASTER_LINES[Math.floor(Math.random() * PITMASTER_LINES.length)]);
        try {
            const res = await fetch('/api/ai/discover-combinations', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'AI-call mislukt');
            const arr = body.suggestions as Suggestion[];
            if (!arr || arr.length === 0) {
                toast('AI vond geen nieuwe combos — voeg eerst meer bouwstenen toe', 'error');
                return;
            }
            setSuggestions(arr);
            setRanAt(new Date());
        } catch (e: any) {
            toast(e.message || 'AI-call mislukt', 'error');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="overflow-hidden rounded-2xl border border-[var(--border)]"
            style={{ background: 'linear-gradient(135deg, var(--card) 0%, var(--card-solid) 100%)' }}
        >
            {/* Lead */}
            <div className="flex items-start gap-4 p-5 sm:p-6">
                <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl shadow-lg ring-1 ring-[#FFBF00]/30"
                    style={{ background: 'linear-gradient(135deg, #FFBF00 0%, #FF6B35 100%)' }}
                >
                    🧠
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-[var(--muted-light)]">
                        Klik op de knop en AI scant je hele bouwstenen-bibliotheek. Geen herhaling van wat
                        je al hebt — alleen <span style={{ color: 'var(--text)' }}>nieuwe combinaties</span> met smaak-onderbouwing en kostprijs.
                    </p>
                    {!suggestions && !busy && (
                        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                            Werkt het beste met ≥3 bouwstenen in je bibliotheek.
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={busy}
                    className="group inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold text-black shadow-lg shadow-[#FF6B35]/30 transition-all hover:scale-105 hover:shadow-[#FF6B35]/50 disabled:opacity-60"
                    style={{ background: 'linear-gradient(90deg, #FFBF00 0%, #FF6B35 100%)' }}
                >
                    {busy
                        ? <><Loader2 size={14} className="animate-spin" /> Bezig…</>
                        : suggestions
                            ? <><RefreshCw size={14} className="transition-transform group-hover:rotate-180" /> Opnieuw</>
                            : <><Flame size={14} className="animate-pulse" /> Vind combos</>}
                </button>
            </div>

            {/* Pitmaster denkt-na strook */}
            {busy && (
                <div className="border-t border-[var(--border)] bg-black/40 px-6 py-4 text-center">
                    <div className="inline-flex items-center gap-2 text-[12px] italic text-[#FFA552]">
                        <Flame size={12} className="animate-pulse" />
                        {pitline}
                    </div>
                </div>
            )}

            {/* Suggesties */}
            {suggestions && suggestions.length > 0 && !busy && (
                <div className="border-t border-[var(--border)] bg-black/30 p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                        <span className="text-[#FFA552]">🔥 {suggestions.length} verse ideeën</span>
                        {ranAt && <span>{ranAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>

                    <div className="space-y-3">
                        {suggestions.map((s, i) => (
                            <article
                                key={i}
                                className="overflow-hidden rounded-xl border border-[var(--border)] p-5 transition-all hover:border-[#FF6B35]/40"
                                style={{ background: 'linear-gradient(135deg, var(--card-solid) 0%, #16161a 100%)' }}
                            >
                                <header className="mb-3 flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="text-lg font-bold leading-tight" style={{ color: 'var(--text)' }}>
                                            {s.name}
                                        </h4>
                                        {s.description && (
                                            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-light)]">
                                                {s.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="shrink-0 rounded-lg border border-[#FFBF00]/30 bg-[#FFBF00]/10 px-2.5 py-1.5 text-right">
                                        <div className="text-[9px] font-bold uppercase tracking-wider text-[#FFA552]">
                                            Kost
                                        </div>
                                        <div className="font-mono text-[15px] font-bold tabular-nums text-[#FFBF00]">
                                            {formatEuro(s.total_cost_cents)}
                                        </div>
                                    </div>
                                </header>

                                {s.components.length > 0 && (
                                    <div className="rounded-lg border border-[var(--border)] bg-black/30 p-3">
                                        <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#FFA552]">
                                            <Boxes size={10} /> {s.components.length} bouwstenen
                                        </div>
                                        <ul className="space-y-1 text-[12px]">
                                            {s.components.map(c => (
                                                <li key={c.component_id} className="flex items-baseline justify-between gap-3">
                                                    <span style={{ color: 'var(--text)' }}>{c.name}</span>
                                                    <span className="shrink-0 font-mono tabular-nums text-[var(--muted)]">
                                                        {c.quantity} {c.unit} · {formatEuro(c.cost_cents)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {s.why_this_combo && (
                                    <div className="mt-3 flex gap-2 rounded-lg border-l-4 border-[#FF6B35] bg-[#FF6B35]/5 p-3">
                                        <Sparkles size={12} className="mt-0.5 shrink-0 text-[#FFA552]" />
                                        <p className="text-[11px] leading-relaxed text-[var(--muted-light)]">
                                            {s.why_this_combo}
                                        </p>
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>

                    <Link
                        href="/inspiratie/gerechten"
                        className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[12px] font-semibold text-[#FFA552] no-underline transition hover:border-[#FF6B35]/30 hover:bg-[#FF6B35]/5"
                    >
                        <ChefHat size={12} /> Bouw een gerecht op basis van een idee →
                    </Link>
                </div>
            )}
        </div>
    );
}
