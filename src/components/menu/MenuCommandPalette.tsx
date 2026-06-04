/* ═══════════════════════════════════════════════════════════════
   MenuCommandPalette — ⌘K op /gerechten/*
   Bucket C P0-6. 3 sections: Gerechten (fuzzy search), Componenten, Acties.
   Eigen implementatie (geen cmdk lib nodig). Werkt op echte Supabase
   Gerecht[] uit parent. Ingrediënten-deeplink is 2026-06-02 verwijderd —
   Voorraad is de canonical plek (sidebar + /voorraad hub-tabs). */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight, BarChart3, Package, Search, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { Gerecht } from '@/types';
import { MRCardVisual } from './atoms';
import { fmtEuro, fuzzyMatch, getMargin, getGangKey, getGangLabel } from './helpers';

interface ComponentLite {
    id: string | number;
    name: string;
    description?: string | null;
    used_in?: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    gerechten: Gerecht[];
    componenten?: ComponentLite[];
    onSelectGerecht: (g: Gerecht) => void;
    onSelectComponent?: (c: ComponentLite) => void;
    /* Action-callback voor static items: 'bedenker'|'analyse'|'allergens' */
    onAction?: (id: string) => void;
    /* Stel-menu-samen v2: 'picker' mode voor MenuComposer.
       - geen analyse/voorraad acties (verstoort flow)
       - context-bar toont voor welke gang het is
       - 'new-gerecht' is wél een actie zodat Sam vanuit picker een gerecht
         kan aanmaken zonder palette te sluiten */
    mode?: 'search' | 'picker';
    pickerContext?: { gangSlug: string; gangLabel: string };
    /* Hide-set: gerecht-ids die al in de huidige selectie zitten worden
       verborgen of doorgestreept zodat Sam geen dubbeltap doet */
    excludeIds?: Set<string>;
}

type Item =
    | { kind: 'gerecht'; data: Gerecht }
    | { kind: 'component'; data: ComponentLite }
    | { kind: 'action'; id: string; label: string; desc: string; Icon: typeof Sparkles; href?: string };

interface Section {
    title: string;
    items: Item[];
}

export function MenuCommandPalette({
    open, onClose, gerechten, componenten = [], onSelectGerecht, onSelectComponent, onAction,
    mode = 'search', pickerContext, excludeIds,
}: Props) {
    const isPicker = mode === 'picker';
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    /* Focus + reset bij open */
    useEffect(() => {
        if (open) {
            setQuery('');
            setActiveIdx(0);
            /* Kleine timeout zodat input zeker gemount is */
            const t = setTimeout(() => inputRef.current?.focus(), 10);
            return () => clearTimeout(t);
        }
        return undefined;
    }, [open]);

    /* Esc */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    /* In picker mode prioriteren we gerechten die bij de huidige gang horen,
       en filteren we al-geselecteerde IDs (excludeIds) weg uit de lijst. */
    const visibleGerechten = useMemo(() => {
        let list = gerechten;
        if (excludeIds && excludeIds.size > 0) {
            list = list.filter(g => !excludeIds.has(String(g.id)));
        }
        if (isPicker && pickerContext?.gangSlug) {
            const slug = pickerContext.gangSlug;
            const matching = list.filter(g => g.gang_slug === slug);
            const rest = list.filter(g => g.gang_slug !== slug);
            return [...matching, ...rest];
        }
        return list;
    }, [gerechten, excludeIds, isPicker, pickerContext]);

    const sections: Section[] = useMemo(() => {
        const out: Section[] = [];

        if (!query) {
            if (isPicker) {
                /* Picker empty-state: "+ Nieuw gerecht" actie + gang-matching gerechten */
                out.push({
                    title: 'Acties',
                    items: [
                        { kind: 'action', id: 'new-gerecht', label: 'Nieuw gerecht aanmaken', desc: 'Opent gerecht-detail in concept-modus', Icon: Sparkles },
                    ],
                });
                if (visibleGerechten.length > 0) {
                    const gangLabel = pickerContext?.gangLabel ?? '';
                    out.push({
                        title: gangLabel ? `Past bij ${gangLabel}` : 'Suggesties',
                        items: visibleGerechten.slice(0, 12).map((g) => ({ kind: 'gerecht' as const, data: g })),
                    });
                }
                return out;
            }
            /* Search empty-state: top acties + recent */
            out.push({
                title: 'Acties',
                items: [
                    { kind: 'action', id: 'bedenker',  label: 'Bedenk met AI',  desc: 'Open AI gerechten-brainstorm', Icon: Sparkles },
                    { kind: 'action', id: 'analyse',   label: 'Open Analyse',   desc: 'Performance & Health',         Icon: BarChart3, href: '/gerechten/analyse' },
                    { kind: 'action', id: 'allergens', label: 'Allergens-queue',desc: 'Bevestig openstaande allergenen', Icon: ShieldCheck },
                ],
            });
            if (gerechten.length > 0) {
                out.push({
                    title: 'Recent',
                    items: gerechten.slice(0, 5).map((g) => ({ kind: 'gerecht' as const, data: g })),
                });
            }
            return out;
        }

        /* Met query: filter alles */
        const dishMatches = visibleGerechten
            .filter((g) => fuzzyMatch(query, g.naam) || fuzzyMatch(query, g.beschrijving ?? '') || fuzzyMatch(query, getGangLabel(getGangKey(g))))
            .slice(0, 12);
        if (dishMatches.length) {
            out.push({
                title: `Gerechten (${dishMatches.length})`,
                items: dishMatches.map((g) => ({ kind: 'gerecht' as const, data: g })),
            });
        }

        if (isPicker) {
            /* Picker: bij query altijd "Nieuw gerecht" als laatste optie zodat
               Sam direct kan aanmaken als hij niets vindt */
            out.push({
                title: 'Acties',
                items: [
                    { kind: 'action', id: 'new-gerecht', label: `Maak "${query}" aan`, desc: 'Nieuw gerecht in concept-modus', Icon: Sparkles },
                ],
            });
            return out;
        }

        const compMatches = componenten
            .filter((c) => fuzzyMatch(query, c.name) || fuzzyMatch(query, c.description ?? ''))
            .slice(0, 5);
        if (compMatches.length) {
            out.push({
                title: `Componenten (${compMatches.length})`,
                items: compMatches.map((c) => ({ kind: 'component' as const, data: c })),
            });
        }

        const allActions: Item[] = [
            { kind: 'action', id: 'bedenker', label: 'Bedenk met AI',  desc: 'AI gerechten brainstorm', Icon: Sparkles },
            { kind: 'action', id: 'analyse',  label: 'Open Analyse',   desc: 'Ga naar /gerechten/analyse', Icon: BarChart3, href: '/gerechten/analyse' },
        ];
        const actions = allActions.filter((a) => a.kind === 'action' && fuzzyMatch(query, a.label));
        if (actions.length) out.push({ title: 'Acties', items: actions });

        return out;
    }, [query, gerechten, componenten, isPicker, pickerContext, visibleGerechten]);

    const allItems = sections.flatMap((s) => s.items);

    /* Reset activeIdx als items veranderen */
    useEffect(() => {
        if (activeIdx >= allItems.length) setActiveIdx(0);
    }, [allItems.length, activeIdx]);

    const handleSelect = (item: Item) => {
        onClose();
        if (item.kind === 'gerecht') onSelectGerecht(item.data);
        else if (item.kind === 'component') onSelectComponent?.(item.data);
        else if (item.kind === 'action') {
            if (item.href) router.push(item.href);
            else onAction?.(item.id);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, allItems.length - 1)); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
        if (e.key === 'Enter' && allItems[activeIdx]) { e.preventDefault(); handleSelect(allItems[activeIdx]); }
    };

    if (!open) return null;

    /* Globale running index voor highlight */
    let globalIdx = -1;

    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div
                className="mr-cmdk"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Zoek-palette"
            >
                {isPicker && pickerContext && (
                    <div style={{
                        padding: '6px 14px',
                        borderBottom: '1px solid var(--border)',
                        fontSize: 11,
                        color: 'var(--muted)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.4,
                    }}>
                        Voeg toe aan <strong style={{ color: 'var(--text)' }}>{pickerContext.gangLabel}</strong>
                    </div>
                )}
                <div className="mr-cmdk-input-wrap">
                    <Search size={18} color="var(--muted)" />
                    <input
                        ref={inputRef}
                        className="mr-cmdk-input"
                        placeholder={isPicker ? 'Zoek een gerecht uit je bibliotheek…' : 'Zoek gerechten, componenten, acties…'}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                        onKeyDown={handleKey}
                        autoFocus
                    />
                    <kbd style={{
                        fontSize: 10, padding: '2px 7px',
                        border: '1px solid var(--border)', borderRadius: 5,
                        fontFamily: 'var(--font-mono, ui-monospace)', color: 'var(--muted)',
                    }}>ESC</kbd>
                </div>

                <div className="mr-cmdk-results">
                    {sections.map((section, si) => (
                        <div key={si}>
                            <div className="mr-cmdk-section">{section.title}</div>
                            {section.items.map((item, ii) => {
                                globalIdx++;
                                const idx = globalIdx;
                                const active = activeIdx === idx;
                                return (
                                    <div
                                        key={ii}
                                        className={`mr-cmdk-item ${active ? 'active' : ''}`}
                                        onClick={() => handleSelect(item)}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                    >
                                        {item.kind === 'gerecht' ? (
                                            <>
                                                <MRCardVisual gerecht={item.data} photoMode="mixed"
                                                    style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0 }}
                                                    iconSize={14} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {item.data.naam}
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                        {getGangLabel(getGangKey(item.data))} · {getMargin(item.data)}% marge
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                    {fmtEuro(Number(item.data.verkoopprijs ?? item.data.prijs ?? 0))}
                                                </span>
                                            </>
                                        ) : item.kind === 'component' ? (
                                            <>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 6,
                                                    background: 'rgba(196,163,90,.08)', border: '1px solid rgba(196,163,90,.2)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                }}>
                                                    <Package size={14} color="var(--brand-gold, #c4a35a)" />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.data.name}</div>
                                                    {item.data.description && (
                                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.data.description}</div>
                                                    )}
                                                </div>
                                                {item.data.used_in != null && (
                                                    <span style={{ fontSize: 11, color: 'var(--green, #22c55e)' }}>{item.data.used_in}×</span>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: 6,
                                                    background: 'rgba(255,191,0,.08)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                }}>
                                                    <item.Icon size={14} color="var(--brand)" />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.desc}</div>
                                                </div>
                                                <ArrowRight size={14} color="var(--muted)" />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    {allItems.length === 0 && (
                        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                            Geen resultaten voor &quot;{query}&quot;
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Hook om ⌘K te openen vanuit elke /gerechten/* pagina. ─── */
export function useCmdKShortcut(onOpen: () => void) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                onOpen();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onOpen]);
}
