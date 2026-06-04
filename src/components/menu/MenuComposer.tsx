'use client';

/**
 * MenuComposer — Stel-menu-samen v2.
 *
 * Per gang een sortable lijst van gerecht-pills. AddDishButton opent
 * een inline popover-picker (search + dish-list); "Vraag AI" roept
 * /api/menu-templates/suggest aan. Save → upsertMenuTemplate Server Action.
 *
 * Layout:
 *   - Desktop (≥ lg): 2-koloms. Links sticky gangen-navigatie, rechts actieve gang.
 *   - Mobile (< lg): één-kolom accordion (alle gangen onder elkaar, open/dicht).
 *
 * State-flow:
 *   empty → editing → dirty → saving → saved   (error-branch overal)
 *
 * Autosave: draft naar localStorage `bbq.menu.draft.<orgId>.<menuId|new>`,
 * debounced 500ms. Wist na succesvolle save. Bij refresh met draft toont
 * banner "Hersteld — [Behoud] [Verwerp]".
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    Plus, Sparkles, Save, Trash2, GripVertical, X, Loader2,
    ChevronDown, ChevronRight, ArrowRight, AlertTriangle, FileText,
    CornerDownRight, UtensilsCrossed, ChefHat,
    ShieldAlert, PanelRightOpen, PanelRightClose, Utensils,
} from 'lucide-react';

// Lazy-loaded sub-components. Each only loads its chunk the first time it mounts
// (LibrarySidebar / AiSuggestionsSheet on first open, InlinePicker on first add-click).
const LibrarySidebar = dynamic(() => import('./LibrarySidebar'), { ssr: false });
const AiSuggestionsSheet = dynamic(() => import('./AiSuggestionsSheet'), { ssr: false });
const InlinePicker = dynamic(() => import('./InlinePicker'), { ssr: false });
import {
    DndContext, KeyboardSensor, PointerSensor, TouchSensor,
    useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, arrayMove, sortableKeyboardCoordinates,
    useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/lib/OrgContext';
import { GANG_VISUALS, getGangKey, fmtEuro } from './helpers';
import { upsertMenuTemplate, deleteMenuTemplate } from '@/app/menu-templates/actions';
import type { MenuTemplateWithItems, MenuTemplateGerechtRef } from '@/lib/dal/menuTemplates';
import type { Gerecht, Gang } from '@/types';

interface Props {
    /** null = create-modus, bestaand object = edit-modus. */
    initial: MenuTemplateWithItems | null;
    /** Volledige gerechten-bibliotheek (voor picker). */
    gerechten: Gerecht[];
    /** Gangen-master-data (per org). */
    gangen: Gang[];
}

/* Item-shape voor de composer-state. gerecht_id + gang_slug zijn de enige
   echte bron-data; alle andere velden worden via een lookup op gerechten[]
   gerenderd (rename-resistant). */
interface ComposerItem {
    uid: string;            // stabiel binnen sessie voor dnd-kit
    gerecht_id: string;
    gang_slug: string;
    volgorde: number;
}

interface ComposerState {
    naam: string;
    beschrijving: string;
    basis_prijs_pp: number;
    aantal_gasten: number;
    is_default: boolean;
    items: ComposerItem[];
}

const draftKey = (orgId: string | null, id: number | 'new') => `bbq.menu.draft.${orgId ?? 'anon'}.${id}`;

function emptyState(): ComposerState {
    return {
        naam: '',
        beschrijving: '',
        basis_prijs_pp: 0,
        aantal_gasten: 40,
        is_default: false,
        items: [],
    };
}

function stateFromInitial(initial: MenuTemplateWithItems): ComposerState {
    return {
        naam: initial.naam,
        beschrijving: initial.beschrijving ?? '',
        basis_prijs_pp: initial.basis_prijs_pp,
        aantal_gasten: initial.aantal_gasten,
        is_default: initial.is_default,
        items: initial.items.map((it, i) => ({
            uid: it.id,
            gerecht_id: it.gerecht_id,
            gang_slug: it.gang_slug,
            volgorde: it.volgorde ?? i,
        })),
    };
}

export default function MenuComposer({ initial, gerechten, gangen }: Props) {
    const router = useRouter();
    const showToast = useToast();
    const { orgId } = useOrg();
    const templateId = initial?.id ?? null;

    const [state, setState] = useState<ComposerState>(() => initial ? stateFromInitial(initial) : emptyState());
    const [activeGang, setActiveGang] = useState<string | null>(() => gangen[0]?.slug ?? null);
    /* Picker-state is verhuisd naar GangPanel (lokaal per gang via InlinePicker).
       De oude full-modal MenuCommandPalette in picker-mode is verwijderd
       — Sam vond die te onduidelijk. */
    const [aiPanel, setAiPanel] = useState<{ open: boolean; gangSlug: string; loading: boolean; result: Array<{ gerecht_id: string; redenering: string }>; error?: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [draftRestored, setDraftRestored] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [mobileExpanded, setMobileExpanded] = useState<Record<string, boolean>>(() => {
        const e: Record<string, boolean> = {};
        gangen.forEach((g, i) => { e[g.slug] = i === 0; });
        return e;
    });

    /* Quick-lookup voor gerecht-info bij rendering pills */
    const gerechtById = useMemo(() => {
        const m = new Map<string, Gerecht>();
        for (const g of gerechten) m.set(String(g.id), g);
        return m;
    }, [gerechten]);

    /* Build legacy "ongekoppeld" list — names die backfill niet kon matchen */
    const unlinkedByGang = useMemo(() => {
        if (!initial?.menu_selectie_legacy) return new Map<string, string[]>();
        const linked = new Set<string>();
        for (const item of state.items) {
            const naam = gerechtById.get(item.gerecht_id)?.naam;
            if (naam) linked.add(`${item.gang_slug}::${naam.toLowerCase().trim()}`);
        }
        const out = new Map<string, string[]>();
        for (const [gangSlug, names] of Object.entries(initial.menu_selectie_legacy)) {
            const missing = names.filter(n => !linked.has(`${gangSlug}::${n.toLowerCase().trim()}`));
            if (missing.length > 0) out.set(gangSlug, missing);
        }
        return out;
    }, [initial, state.items, gerechtById]);

    /* ── Draft autosave (debounced 500ms) ─────────────────────────────── */
    const stateRef = useRef(state);
    stateRef.current = state;
    useEffect(() => {
        if (!orgId) return;
        const key = draftKey(orgId, templateId ?? 'new');
        const t = setTimeout(() => {
            try {
                if (dirty) {
                    localStorage.setItem(key, JSON.stringify({ state: stateRef.current, at: Date.now() }));
                }
            } catch { /* quota / private mode */ }
        }, 500);
        return () => clearTimeout(t);
    }, [state, dirty, orgId, templateId]);

    /* Load draft op mount, bied keuze tot herstel als afwijkend van initial */
    useEffect(() => {
        if (!orgId) return;
        const key = draftKey(orgId, templateId ?? 'new');
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const { state: draftState, at } = JSON.parse(raw) as { state: ComposerState; at: number };
            const isStale = Date.now() - at > 1000 * 60 * 60 * 24 * 7; // 7 dagen
            if (isStale) {
                localStorage.removeItem(key);
                return;
            }
            const sameAsInitial = JSON.stringify(draftState) === JSON.stringify(initial ? stateFromInitial(initial) : emptyState());
            if (!sameAsInitial) {
                setDraftRestored(true);
                /* Toon banner; pas restorate via knop */
            }
        } catch { /* malformed JSON */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const acceptDraft = () => {
        if (!orgId) return;
        const key = draftKey(orgId, templateId ?? 'new');
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const { state: draftState } = JSON.parse(raw) as { state: ComposerState };
            setState(draftState);
            setDirty(true);
            setDraftRestored(false);
        } catch { setDraftRestored(false); }
    };
    const discardDraft = () => {
        if (!orgId) return;
        localStorage.removeItem(draftKey(orgId, templateId ?? 'new'));
        setDraftRestored(false);
    };

    /* ── Mutators ─────────────────────────────────────────────────────── */
    const mutate = (fn: (s: ComposerState) => ComposerState) => {
        setState(s => fn(s));
        setDirty(true);
    };

    const addGerecht = (gangSlug: string, gerechtId: string) => {
        mutate(s => {
            if (s.items.some(it => it.gang_slug === gangSlug && it.gerecht_id === gerechtId)) return s;
            const inGang = s.items.filter(it => it.gang_slug === gangSlug);
            const maxOrd = inGang.length ? Math.max(...inGang.map(it => it.volgorde)) + 1 : 0;
            const uid = `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            return { ...s, items: [...s.items, { uid, gerecht_id: gerechtId, gang_slug: gangSlug, volgorde: maxOrd }] };
        });
    };

    const removeItem = (uid: string) => {
        mutate(s => ({ ...s, items: s.items.filter(it => it.uid !== uid) }));
    };

    const reorderInGang = (gangSlug: string, oldIdx: number, newIdx: number) => {
        mutate(s => {
            const inGang = s.items.filter(it => it.gang_slug === gangSlug).sort((a, b) => a.volgorde - b.volgorde);
            const others = s.items.filter(it => it.gang_slug !== gangSlug);
            const reordered = arrayMove(inGang, oldIdx, newIdx).map((it, i) => ({ ...it, volgorde: i }));
            return { ...s, items: [...others, ...reordered] };
        });
    };

    const moveToGang = (uid: string, newGangSlug: string) => {
        mutate(s => {
            const item = s.items.find(it => it.uid === uid);
            if (!item || item.gang_slug === newGangSlug) return s;
            const inNewGang = s.items.filter(it => it.gang_slug === newGangSlug);
            const maxOrd = inNewGang.length ? Math.max(...inNewGang.map(it => it.volgorde)) + 1 : 0;
            return {
                ...s,
                items: s.items.map(it => it.uid === uid ? { ...it, gang_slug: newGangSlug, volgorde: maxOrd } : it),
            };
        });
    };

    /* ── Save / Delete ────────────────────────────────────────────────── */
    const handleSave = async (then?: 'stay' | 'use-in-offerte') => {
        if (!state.naam.trim()) {
            showToast('Geef de menukaart eerst een naam', 'warning');
            return;
        }
        if (state.items.length === 0) {
            showToast('Voeg minstens één gerecht toe voordat je opslaat', 'warning');
            return;
        }
        setSaving(true);
        const payload = {
            id: templateId ?? undefined,
            naam: state.naam.trim(),
            beschrijving: state.beschrijving.trim(),
            basis_prijs_pp: state.basis_prijs_pp,
            aantal_gasten: state.aantal_gasten,
            is_default: state.is_default,
            items: state.items.map(it => ({
                gerecht_id: it.gerecht_id,
                gang_slug: it.gang_slug,
                volgorde: it.volgorde,
            })),
        };
        const res = await upsertMenuTemplate(payload);
        setSaving(false);
        if ('error' in res) {
            showToast(`Opslaan mislukt: ${res.error}`, 'error');
            return;
        }
        if (orgId) {
            try { localStorage.removeItem(draftKey(orgId, templateId ?? 'new')); } catch { /* ignore */ }
        }
        setDirty(false);
        showToast('Menukaart opgeslagen', 'success');
        if (then === 'use-in-offerte') {
            router.push(`/offertes?template=${res.data.id}`);
        } else if (!templateId) {
            router.push(`/gerechten/menukaarten/${res.data.id}`);
        } else {
            router.refresh();
        }
    };

    const handleDelete = async () => {
        if (!templateId) return;
        const res = await deleteMenuTemplate(templateId);
        if ('error' in res) {
            showToast(`Verwijderen mislukt: ${res.error}`, 'error');
            return;
        }
        showToast('Menukaart verwijderd', 'success');
        router.push('/gerechten/menukaarten');
    };

    /* ── AI suggestions ───────────────────────────────────────────────── */
    const requestAiSuggestions = async (gangSlug: string) => {
        setAiPanel({ open: true, gangSlug, loading: true, result: [] });
        const huidigeIds = state.items.filter(it => it.gang_slug === gangSlug).map(it => it.gerecht_id);
        try {
            const r = await fetch('/api/menu-templates/suggest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gang_slug: gangSlug, huidige_selectie_ids: huidigeIds, gewenst_aantal: 4 }),
            });
            const data = await r.json();
            if (!r.ok) {
                setAiPanel({ open: true, gangSlug, loading: false, result: [], error: data.error ?? 'Onbekende fout' });
                return;
            }
            setAiPanel({ open: true, gangSlug, loading: false, result: data.suggesties ?? [] });
        } catch (e) {
            setAiPanel({ open: true, gangSlug, loading: false, result: [], error: (e as Error).message });
        }
    };

    /* ── Render helpers ───────────────────────────────────────────────── */
    const itemsByGang = useMemo(() => {
        const m = new Map<string, ComposerItem[]>();
        for (const g of gangen) m.set(g.slug, []);
        for (const it of state.items) {
            if (!m.has(it.gang_slug)) m.set(it.gang_slug, []);
            m.get(it.gang_slug)!.push(it);
        }
        for (const [, list] of m) list.sort((a, b) => a.volgorde - b.volgorde);
        return m;
    }, [state.items, gangen]);

    /* Library-sidebar open/dicht — desktop only. State leeft hier zodat
       hero-toggle in sync blijft met de sidebar. */
    const [libraryOpen, setLibraryOpen] = useState(true);

    /* KPI-stats: optellen op basis van toegevoegde items + gerechten-lookup.
       Marge gebruikt verkoopprijs vs kostprijs_pp. Alle berekeningen client-side,
       geen AI-derivatie (Hard Rule: prijs/marge nooit door AI). */
    /* Samenstelling-tellingen voor de KPI-strip. Geen prijs/marge: een
       menukaart houdt geen geld vast (dat zit op de offerte). */
    const stats = useMemo(() => {
        const allergenenSet = new Set<string>();
        const gangenSet = new Set<string>();
        for (const it of state.items) {
            const g = gerechtById.get(it.gerecht_id);
            if (!g) continue;
            gangenSet.add(it.gang_slug);
            for (const a of g.allergenen ?? []) allergenenSet.add(a);
        }
        return {
            gerechten: state.items.length,
            allergenen: allergenenSet.size,
            gangenCount: gangenSet.size,
        };
    }, [state.items, gerechtById]);

    return (
        <div className="menu-composer" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            {/* ── Hero — Playfair naam-input + actions ───────────────────── */}
            <ComposerHero
                naam={state.naam}
                onNaamChange={(v) => { setState(s => ({ ...s, naam: v })); setDirty(true); }}
                onToggleLibrary={() => setLibraryOpen(o => !o)}
                libraryOpen={libraryOpen}
            />

            {/* ── KPI strip — samenstelling-tellingen (geen prijs/gasten:
                   die horen bij de offerte, niet bij de menukaart) ───────── */}
            <KpiStrip stats={stats} />

            {/* ── Compact action-bar — standaard-toggle + save. Basisprijs en
                   aantal gasten zijn bewust weg: een menukaart is het aanbod,
                   prijs + headcount vul je per klant in de offerte in. ────── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: 'var(--surface)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                marginTop: 16,
                padding: '10px 20px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
            }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    <input
                        type="checkbox"
                        checked={state.is_default}
                        onChange={e => { setState(s => ({ ...s, is_default: e.target.checked })); setDirty(true); }}
                    />
                    Standaard
                </label>
                <div style={{ flex: 1 }} />
                {templateId && (
                    <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        title="Verwijder menukaart"
                        style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--danger, #c0392b)', cursor: 'pointer' }}
                    >
                        <Trash2 size={14} />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => handleSave('use-in-offerte')}
                    disabled={saving}
                    style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    <FileText size={14} /> Gebruik in offerte
                </button>
                <button
                    type="button"
                    onClick={() => handleSave('stay')}
                    disabled={saving || !dirty}
                    style={{
                        padding: '8px 14px', border: 'none', borderRadius: 6,
                        background: dirty ? 'var(--brand, #c4a35a)' : 'var(--muted)',
                        color: '#1a1a1e', fontWeight: 600, cursor: dirty ? 'pointer' : 'not-allowed',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {saving ? 'Opslaan…' : dirty ? 'Opslaan' : 'Opgeslagen'}
                </button>
            </div>

            {/* ── Draft-restored banner ─────────────────────────────────── */}
            {draftRestored && (
                <div style={{
                    margin: 12, padding: 12, background: 'rgba(255,191,0,.1)',
                    border: '1px solid rgba(255,191,0,.3)', borderRadius: 8,
                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
                }}>
                    <AlertTriangle size={16} color="var(--brand)" />
                    <span style={{ flex: 1 }}>Niet-opgeslagen wijzigingen hersteld.</span>
                    <button type="button" onClick={acceptDraft} style={btnSmall(true)}>Behoud</button>
                    <button type="button" onClick={discardDraft} style={btnSmall(false)}>Verwerp</button>
                </div>
            )}

            {/* ── Main content area ─────────────────────────────────────── */}
            <div className="menu-composer-body" style={{ flex: 1, padding: 20 }}>
                {/* Mobile (< lg): accordion van alle gangen */}
                <div className="menu-composer-mobile-list">
                    {gangen.map(g => {
                        const items = itemsByGang.get(g.slug) ?? [];
                        const expanded = mobileExpanded[g.slug] ?? false;
                        const unlinked = unlinkedByGang.get(g.slug) ?? [];
                        return (
                            <div key={g.slug} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                                <button
                                    type="button"
                                    onClick={() => setMobileExpanded(m => ({ ...m, [g.slug]: !m[g.slug] }))}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                        padding: 12, border: 'none', background: 'var(--surface)', color: 'var(--text)',
                                        textAlign: 'left', cursor: 'pointer', fontWeight: 600,
                                    }}
                                >
                                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                    <span style={{ flex: 1 }}>{g.naam}</span>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{items.length} gerechten</span>
                                </button>
                                {expanded && (
                                    <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
                                        <GangPanel
                                            gang={g}
                                            items={items}
                                            gangen={gangen}
                                            gerechten={gerechten}
                                            gerechtById={gerechtById}
                                            unlinkedNames={unlinked}
                                            onAddGerecht={(id) => addGerecht(g.slug, id)}
                                            onRemove={removeItem}
                                            onReorder={(oldIdx, newIdx) => reorderInGang(g.slug, oldIdx, newIdx)}
                                            onMoveToGang={moveToGang}
                                            onAi={() => requestAiSuggestions(g.slug)}
                                            onCreateNew={() => window.open('/gerechten?new=1&gang=' + g.slug, '_blank')}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Desktop (≥ lg): 2-koloms grid met ALLE gangen tegelijk + library sidebar.
                    Vervangt de oude left-nav + actieve-gang flow — Sam wil alles in
                    één scherm kunnen samenstellen, niet gang-voor-gang doorklikken. */}
                <div className="menu-composer-desktop-split">
                    <div style={{
                        flex: 1, minWidth: 0,
                        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 16, alignItems: 'start',
                    }}>
                        {gangen.map(g => {
                            const items = itemsByGang.get(g.slug) ?? [];
                            const unlinked = unlinkedByGang.get(g.slug) ?? [];
                            return (
                                <div
                                    key={g.slug}
                                    style={{
                                        padding: 16,
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 12,
                                        boxShadow: '0 1px 0 rgba(255,255,255,.04) inset, 0 8px 20px rgba(0,0,0,.18)',
                                    }}
                                >
                                    <GangPanel
                                        gang={g}
                                        items={items}
                                        gangen={gangen}
                                        gerechten={gerechten}
                                        gerechtById={gerechtById}
                                        unlinkedNames={unlinked}
                                        onAddGerecht={(id) => addGerecht(g.slug, id)}
                                        onRemove={removeItem}
                                        onReorder={(oldIdx, newIdx) => reorderInGang(g.slug, oldIdx, newIdx)}
                                        onMoveToGang={moveToGang}
                                        onAi={() => requestAiSuggestions(g.slug)}
                                        onCreateNew={() => window.open('/gerechten?new=1&gang=' + g.slug, '_blank')}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* LibrarySidebar — komt in volgende stap. Placeholder voor layout. */}
                    {libraryOpen && (
                        <LibrarySidebar
                            gangen={gangen}
                            gerechten={gerechten}
                            excludeIdsByGang={(slug) => new Set((itemsByGang.get(slug) ?? []).map(it => it.gerecht_id))}
                            onPick={addGerecht}
                            onClose={() => setLibraryOpen(false)}
                        />
                    )}
                </div>
            </div>

            {/* Picker is nu inline per gang (zie GangPanel → InlinePicker).
                Geen full-modal MenuCommandPalette meer voor add-flow. */}

            {/* ── AI suggestions sheet ───────────────────────────────────── */}
            {aiPanel?.open && (
                <AiSuggestionsSheet
                    gangNaam={gangen.find(g => g.slug === aiPanel.gangSlug)?.naam ?? aiPanel.gangSlug}
                    loading={aiPanel.loading}
                    error={aiPanel.error}
                    suggesties={aiPanel.result}
                    gerechtById={gerechtById}
                    onClose={() => setAiPanel(null)}
                    onAccept={(gerechtId) => {
                        addGerecht(aiPanel.gangSlug, gerechtId);
                        showToast('Voorstel toegevoegd', 'success');
                    }}
                />
            )}

            {/* ── Confirm delete ──────────────────────────────────────── */}
            {confirmDelete && (
                <div className="mr-modal-scrim" onClick={() => setConfirmDelete(false)} role="presentation">
                    <div onClick={e => e.stopPropagation()} style={{
                        maxWidth: 420, width: '90%', padding: 20,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                    }}>
                        <h3 style={{ marginTop: 0 }}>Verwijder menukaart</h3>
                        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                            Weet je zeker dat je &quot;{state.naam || 'deze menukaart'}&quot; wilt verwijderen?
                            Offertes die deze menukaart al hebben geladen blijven werken (de regels zijn gekopieerd), maar deze template is daarna niet meer beschikbaar.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                            <button type="button" onClick={() => setConfirmDelete(false)} style={btnSmall(false)}>Annuleer</button>
                            <button type="button" onClick={() => { setConfirmDelete(false); handleDelete(); }}
                                style={{ ...btnSmall(true), background: 'var(--danger, #c0392b)', color: '#fff' }}>
                                Verwijderen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Responsive CSS — accordion mobile, 2-koloms grid desktop ── */}
            <style jsx>{`
                .menu-composer-mobile-list { display: block; }
                .menu-composer-desktop-split { display: none; }
                @media (min-width: 1024px) {
                    .menu-composer-mobile-list { display: none; }
                    .menu-composer-desktop-split { display: flex; gap: 20px; align-items: flex-start; }
                }
            `}</style>
        </div>
    );
}

/* LibrarySidebar, AiSuggestionsSheet en InlinePicker zijn verhuisd naar eigen
   bestanden en worden via next/dynamic geladen. Zo komen ze niet in de initial
   bundle van MenuComposer terecht. */

/* ─── Subcomponent: GangPanel ───────────────────────────────────────── */

interface GangPanelProps {
    gang: Gang;
    items: ComposerItem[];
    gangen: Gang[];
    gerechten: Gerecht[];
    gerechtById: Map<string, Gerecht>;
    unlinkedNames: string[];
    onAddGerecht: (gerechtId: string) => void;
    onRemove: (uid: string) => void;
    onReorder: (oldIdx: number, newIdx: number) => void;
    onMoveToGang: (uid: string, newGangSlug: string) => void;
    onAi: () => void;
    onCreateNew?: () => void;
}

function GangPanel({ gang, items, gangen, gerechten, gerechtById, unlinkedNames, onAddGerecht, onRemove, onReorder, onMoveToGang, onAi, onCreateNew }: GangPanelProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (e: DragEndEvent) => {
        if (!e.over || e.active.id === e.over.id) return;
        const oldIdx = items.findIndex(it => it.uid === e.active.id);
        const newIdx = items.findIndex(it => it.uid === e.over!.id);
        if (oldIdx >= 0 && newIdx >= 0) onReorder(oldIdx, newIdx);
    };

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{gang.naam}</h2>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {items.length}{gang.minimum ? ` / ${gang.minimum} minimum` : ''}
                </span>
            </div>

            {items.length > 0 && (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={items.map(it => it.uid)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {items.map(it => (
                                <SortablePill
                                    key={it.uid}
                                    item={it}
                                    gerecht={gerechtById.get(it.gerecht_id) ?? null}
                                    gangen={gangen}
                                    currentGangSlug={gang.slug}
                                    onRemove={() => onRemove(it.uid)}
                                    onMoveToGang={(newSlug) => onMoveToGang(it.uid, newSlug)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {items.length === 0 && (
                <div style={{
                    fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.4,
                    padding: '4px 2px 0', display: 'flex', alignItems: 'center', gap: 7,
                }}>
                    <CornerDownRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                    Voeg het eerste gerecht toe — klik op de knop hieronder of vraag AI.
                </div>
            )}

            {/* Primary action: prominent dashed add-button with inline picker.
                Replaces old MenuCommandPalette modal-flow (Sam: "te onduidelijk"). */}
            <div style={{ position: 'relative', marginTop: 12 }}>
                <AddDishButton
                    gangNaam={gang.naam}
                    open={pickerOpen}
                    onClick={() => setPickerOpen(o => !o)}
                />
                {pickerOpen && (
                    <InlinePicker
                        open={pickerOpen}
                        onClose={() => setPickerOpen(false)}
                        gerechten={gerechten}
                        gangSlug={gang.slug}
                        gangNaam={gang.naam}
                        excludeIds={new Set(items.map(it => it.gerecht_id))}
                        onPick={(id) => onAddGerecht(id)}
                        onCreateNew={onCreateNew}
                    />
                )}
            </div>

            {/* Secondary action: AI suggestion link — subtle, right-aligned */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <button
                    type="button"
                    onClick={onAi}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', border: 'none', borderRadius: 6,
                        background: 'transparent', color: 'var(--brand, #c4a35a)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}
                >
                    <Sparkles size={13} />Of vraag AI om suggesties
                </button>
            </div>

            {unlinkedNames.length > 0 && (
                <div style={{
                    marginTop: 12, padding: 10, background: 'rgba(220, 50, 47, .07)',
                    border: '1px solid rgba(220, 50, 47, .25)', borderRadius: 6,
                    fontSize: 12, color: 'var(--muted)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: 'var(--text)' }}>
                        <AlertTriangle size={12} /> <strong>Ongekoppelde namen uit oude data</strong>
                    </div>
                    Deze stonden in de oude menukaart maar zijn niet meer als gerecht herkenbaar.
                    Voeg ze opnieuw toe of negeer:
                    <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                        {unlinkedNames.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

/* ─── Subcomponent: SortablePill ─────────────────────────────────────── */

function SortablePill({ item, gerecht, gangen, currentGangSlug, onRemove, onMoveToGang }: {
    item: ComposerItem;
    gerecht: Gerecht | null;
    gangen: Gang[];
    currentGangSlug: string;
    onRemove: () => void;
    onMoveToGang: (slug: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };
    const [menuOpen, setMenuOpen] = useState(false);
    const naam = gerecht?.naam ?? '⚠ verwijderd gerecht';
    const prijs = gerecht ? Number(gerecht.verkoopprijs ?? 0) : 0;

    return (
        <div
            ref={setNodeRef}
            style={{
                ...style,
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6,
                background: gerecht ? 'var(--surface)' : 'rgba(220, 50, 47, .04)',
            }}
        >
            <button
                type="button"
                {...attributes}
                {...listeners}
                aria-label="Sleep om volgorde te wijzigen"
                style={{
                    border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'grab',
                    /* WCAG 2.2 SC 2.5.8: minimum 24×24 voor pointer-target. Op mobile maken we
                       em ruimer (44×44) zodat een vinger de handle echt kan pakken. */
                    minWidth: 44, minHeight: 44, padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    touchAction: 'none',
                }}
            >
                <GripVertical size={16} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {naam}
                </div>
                {gerecht && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        €{prijs.toFixed(2)} p.p.
                    </div>
                )}
            </div>
            <div style={{ position: 'relative' }}>
                <button
                    type="button"
                    onClick={() => setMenuOpen(o => !o)}
                    title="Acties"
                    style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
                >
                    <ArrowRight size={14} />
                </button>
                {menuOpen && (
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'absolute', right: 0, top: '100%',
                            marginTop: 4, padding: 6,
                            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                            minWidth: 180, zIndex: 10, fontSize: 12,
                            boxShadow: '0 4px 12px rgba(0,0,0,.18)',
                        }}
                    >
                        <div style={{ padding: '4px 8px', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>Verplaats naar</div>
                        {gangen.filter(g => g.slug !== currentGangSlug).map(g => (
                            <button
                                key={g.slug}
                                type="button"
                                onClick={() => { onMoveToGang(g.slug); setMenuOpen(false); }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer', borderRadius: 4 }}
                            >
                                {g.naam}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <button
                type="button"
                onClick={onRemove}
                title="Verwijder uit menu"
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
            >
                <X size={14} />
            </button>
        </div>
    );
}

function btnSmall(primary: boolean): React.CSSProperties {
    return {
        padding: '6px 10px',
        border: '1px solid var(--border)',
        borderRadius: 5,
        background: primary ? 'var(--brand, #c4a35a)' : 'transparent',
        color: primary ? '#1a1a1e' : 'var(--text)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: primary ? 600 : 400,
    };
}

/* ─── Subcomponent: ComposerHero ────────────────────────────────────────
   Warm BBQ-foto-band met Playfair-italic naam-input + meta.
   Vervangt de oude top-bar inputs voor naam — biedt context-by-design. */

function ComposerHero({
    naam, onNaamChange, onAskAi, onToggleLibrary, libraryOpen,
}: {
    naam: string;
    onNaamChange: (s: string) => void;
    onAskAi?: () => void;
    onToggleLibrary?: () => void;
    libraryOpen?: boolean;
}) {
    return (
        <div style={{ position: 'relative', overflow: 'hidden', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
            {/* Background photo */}
            <div style={{
                position: 'absolute', inset: 0,
                backgroundImage: 'url(/menucomposer-hero.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center 40%',
            }} />
            {/* Horizontal scrim — text-zijde donkerder */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(95deg, rgba(10,10,12,.97) 0%, rgba(10,10,12,.86) 34%, rgba(12,10,8,.42) 100%)',
            }} />
            {/* Vertical scrim — bodem-fade */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(0deg, rgba(8,8,10,.7) 0%, transparent 60%)',
            }} />
            {/* Brand-tinted glow rechtsboven */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(120% 90% at 88% 18%, rgba(196,163,90,.18), transparent 60%)',
                pointerEvents: 'none',
            }} />

            <div style={{
                position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 16,
                padding: '22px 24px', minHeight: 156,
            }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Eyebrow */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                        <span style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: 'rgba(20,18,16,.6)', backdropFilter: 'blur(6px)',
                            border: '1px solid rgba(196,163,90,.3)', color: '#c4a35a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <ChefHat size={17} />
                        </span>
                        <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
                            color: '#c4a35a',
                        }}>Menukaart</span>
                    </div>

                    {/* Title — Playfair italic, editable. Clamp font on narrow phones so
                        names like "menu 1 seizoen 1" don't visually scroll out of view. */}
                    <input
                        type="text"
                        value={naam}
                        onChange={(e) => onNaamChange(e.target.value)}
                        placeholder="Naam van de menukaart…"
                        style={{
                            fontFamily: 'var(--font-display, Georgia, serif)',
                            fontStyle: 'italic', fontWeight: 600,
                            color: 'var(--text, #fff)',
                            fontSize: 'clamp(22px, 7vw, 34px)',
                            lineHeight: 1.05, letterSpacing: '-.01em',
                            textShadow: '0 2px 18px rgba(0,0,0,.5)',
                            background: 'transparent', border: 'none', outline: 'none',
                            width: '100%', padding: 0, display: 'block',
                            textOverflow: 'ellipsis',
                        }}
                    />

                    {/* Eyebrow-subtitle: een menukaart is het aanbod, geen prijs/headcount */}
                    <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.6)', marginTop: 10 }}>
                        Je vaste aanbod — prijs en aantal gasten vul je per klant in de offerte in.
                    </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {onAskAi && (
                        <button
                            type="button"
                            onClick={onAskAi}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                background: 'linear-gradient(180deg, #c4a35a 0%, #9e781c 100%)',
                                color: '#1a1a1e', border: 'none', fontSize: 13, fontWeight: 700,
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2), 0 2px 6px rgba(0,0,0,.3)',
                            }}
                        >
                            <Sparkles size={15} />Vraag AI
                        </button>
                    )}
                    {onToggleLibrary && (
                        <button
                            type="button"
                            onClick={onToggleLibrary}
                            title={libraryOpen ? 'Verberg library' : 'Toon library'}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(20,18,16,.6)', backdropFilter: 'blur(8px)',
                                color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.15)',
                                fontSize: 13, fontWeight: 600,
                            }}
                        >
                            {libraryOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
                            Library
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Subcomponent: KpiStrip ────────────────────────────────────────────
   3 telling-tiles: gerechten · gangen · allergenen. Geen prijs/marge —
   een menukaart houdt geen geld vast. */

const KPI_TILE_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)' };
const KPI_TILE_VALUE: React.CSSProperties = { fontSize: 24, fontWeight: 300, fontFamily: 'var(--font-display, Georgia, serif)', marginTop: 4, lineHeight: 1.1 };
const KPI_TILE_SUB: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginTop: 4 };

function KpiTile({ icon, label, value, sub, valueColor, accent }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub: string;
    valueColor?: string;
    accent?: boolean;
}) {
    return (
        <div style={{
            padding: '14px 16px', minHeight: 84,
            border: '1px solid ' + (accent ? 'rgba(196,163,90,.3)' : 'var(--border)'),
            borderRadius: 12,
            background: accent ? 'rgba(196,163,90,.06)' : 'transparent',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ color: accent ? '#c4a35a' : 'var(--muted)', display: 'inline-flex' }}>{icon}</span>
                <span style={KPI_TILE_LABEL}>{label}</span>
            </div>
            <div style={{ ...KPI_TILE_VALUE, color: valueColor || 'var(--text)' }}>{value}</div>
            <div style={KPI_TILE_SUB}>{sub}</div>
        </div>
    );
}

function KpiStrip({ stats }: {
    stats: { gerechten: number; allergenen: number; gangenCount: number };
}) {
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, padding: '16px 20px 0',
        }}>
            <KpiTile icon={<Utensils size={13} />} label="Gerechten" value={String(stats.gerechten)} sub={stats.gerechten === 1 ? 'gerecht' : 'gerechten'} valueColor="#c4a35a" accent />
            <KpiTile icon={<UtensilsCrossed size={13} />} label="Gangen" value={String(stats.gangenCount)} sub={stats.gangenCount === 1 ? 'gang' : 'gangen'} />
            <KpiTile icon={<ShieldAlert size={13} />} label="Allergenen" value={String(stats.allergenen)} sub="soorten in menu" />
        </div>
    );
}

/* ─── Subcomponent: AddDishButton ────────────────────────────────────────
   Prominent dashed-border button per gang — primaire toevoeg-affordance.
   Opent een inline popover-picker direct onder de knop. */

function AddDishButton({ gangNaam, open, onClick }: { gangNaam: string; open: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            style={{
                width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
                border: '1.5px dashed ' + (open ? 'var(--brand, #c4a35a)' : 'var(--border)'),
                background: open ? 'rgba(196,163,90,.06)' : 'transparent',
                color: open ? 'var(--brand, #c4a35a)' : 'var(--text)',
                fontSize: 14, fontWeight: 700,
                transition: 'border-color .15s, background .15s, color .15s',
            }}
            onMouseEnter={(e) => {
                if (!open) {
                    e.currentTarget.style.borderColor = 'var(--brand, #c4a35a)';
                    e.currentTarget.style.background = 'rgba(196,163,90,.04)';
                }
            }}
            onMouseLeave={(e) => {
                if (!open) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.background = 'transparent';
                }
            }}
        >
            <Plus size={18} />
            <span>Voeg gerecht toe aan {gangNaam}</span>
        </button>
    );
}

/* InlinePicker is verhuisd naar ./InlinePicker.tsx (dynamic-load on first open). */

