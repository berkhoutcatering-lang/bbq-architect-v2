/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/* PR8 Inspiratie Bibliotheek — proactieve combo-suggesties.
   Knop op de landing scant tenant's components-bibliotheek met Sonnet 4.6,
   suggereert 3 ongebruikte combinaties. Read-only. Mens maakt gerecht via
   /inspiratie/gerechten als hij/zij eentje wil bouwen. */

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
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <Sparkles size={20} className="mt-0.5 shrink-0 text-primary" />
                    <div>
                        <h3 className="font-medium">AI als Creative Chef — proactieve combo's</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Klik om AI je components-bibliotheek te laten scannen. Hij vindt 3 ongebruikte
                            combinaties die een nieuw gerecht zouden vormen — met smaak-onderbouwing en kostprijs.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                    {busy
                        ? <><Loader2 size={14} className="animate-spin" /> AI scant...</>
                        : suggestions
                            ? <><RefreshCw size={14} /> Opnieuw scannen</>
                            : <><Sparkles size={14} /> Vind combos</>}
                </button>
            </div>

            {suggestions && suggestions.length > 0 && (
                <div className="mt-4 space-y-3">
                    <div className="text-[11px] text-muted-foreground">
                        {suggestions.length} voorstellen — gegenereerd{ranAt ? ` om ${ranAt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                    </div>
                    {suggestions.map((s, i) => (
                        <div key={i} className="rounded-xl border border-border bg-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                    <h4 className="text-base font-semibold">{s.name}</h4>
                                    {s.description && (
                                        <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                                    )}
                                </div>
                                <div className="shrink-0 text-right">
                                    <div className="text-xs text-muted-foreground">Kostprijs</div>
                                    <div className="text-sm font-medium">{formatEuro(s.total_cost_cents)}</div>
                                </div>
                            </div>

                            {s.components.length > 0 && (
                                <div className="mt-3">
                                    <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                        <Boxes size={11} /> Componenten ({s.components.length})
                                    </div>
                                    <ul className="space-y-0.5 text-xs">
                                        {s.components.map(c => (
                                            <li key={c.component_id} className="flex justify-between">
                                                <span>{c.name}</span>
                                                <span className="text-muted-foreground">
                                                    {c.quantity} {c.unit} · {formatEuro(c.cost_cents)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {s.why_this_combo && (
                                <div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                                    <Sparkles size={10} className="mr-1 inline text-primary" />
                                    {s.why_this_combo}
                                </div>
                            )}
                        </div>
                    ))}

                    <Link
                        href="/inspiratie/gerechten"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                        <ChefHat size={11} /> Maak een gerecht aan op basis van een idee
                    </Link>
                </div>
            )}

            {!suggestions && !busy && (
                <div className="mt-3 text-[11px] text-muted-foreground">
                    Tip: werkt het beste als je &gt;5 components in de bibliotheek hebt. Anders mist AI variatie.
                </div>
            )}
        </div>
    );
}
