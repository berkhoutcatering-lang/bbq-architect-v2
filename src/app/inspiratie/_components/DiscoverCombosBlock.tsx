/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Sparkles, Loader2, Boxes, RefreshCw, ChefHat } from 'lucide-react';
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

export default function DiscoverCombosBlock() {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
    const [ranAt, setRanAt] = useState<Date | null>(null);

    async function handleDiscover() {
        setBusy(true);
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
                toast('AI vond geen nieuwe combos — voeg eerst meer components toe', 'error');
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
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
            {/* Lead */}
            <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)] ring-1 ring-[var(--brand)]/20">
                    <Sparkles size={16} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-relaxed text-[var(--muted-light)]">
                        Klik om AI je components-bibliotheek te laten scannen. Hij vindt drie ongebruikte combinaties met
                        smaak-onderbouwing en kostprijs. Read-only — jij beslist.
                    </p>
                    {!suggestions && !busy && (
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                            Werkt beter naarmate je bibliotheek groeit (minimaal 3 components).
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--brand)] px-3.5 py-2 text-[13px] font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                >
                    {busy
                        ? <><Loader2 size={13} className="animate-spin" /> AI scant…</>
                        : suggestions
                            ? <><RefreshCw size={13} /> Opnieuw</>
                            : <><Sparkles size={13} /> Vind combos</>}
                </button>
            </div>

            {/* Suggesties */}
            {suggestions && suggestions.length > 0 && (
                <div className="border-t border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6">
                    <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                        <span>{suggestions.length} voorstellen</span>
                        {ranAt && <span>{ranAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>

                    <div className="space-y-3">
                        {suggestions.map((s, i) => (
                            <article
                                key={i}
                                className="rounded-xl border border-[var(--border)] bg-[var(--card-solid)] p-5"
                            >
                                <header className="mb-3 flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <h4 className="font-[var(--font-artisan)] text-lg font-medium leading-tight">
                                            {s.name}
                                        </h4>
                                        {s.description && (
                                            <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted-light)]">
                                                {s.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                                            Kostprijs
                                        </div>
                                        <div className="font-mono text-[15px] font-medium tabular-nums">
                                            {formatEuro(s.total_cost_cents)}
                                        </div>
                                    </div>
                                </header>

                                {s.components.length > 0 && (
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
                                        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                                            <Boxes size={10} /> Componenten · {s.components.length}
                                        </div>
                                        <ul className="space-y-0.5 text-[12px]">
                                            {s.components.map(c => (
                                                <li key={c.component_id} className="flex items-baseline justify-between gap-3">
                                                    <span className="truncate">{c.name}</span>
                                                    <span className="shrink-0 font-mono tabular-nums text-[var(--muted)]">
                                                        {c.quantity} {c.unit} · {formatEuro(c.cost_cents)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {s.why_this_combo && (
                                    <p className="mt-3 border-l-2 border-[var(--brand)]/40 pl-3 text-[11px] italic leading-relaxed text-[var(--muted-light)]">
                                        {s.why_this_combo}
                                    </p>
                                )}
                            </article>
                        ))}
                    </div>

                    <Link
                        href="/inspiratie/gerechten"
                        className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-[var(--brand)] hover:underline"
                    >
                        <ChefHat size={11} /> Bouw een gerecht op basis van een idee
                    </Link>
                </div>
            )}
        </div>
    );
}
