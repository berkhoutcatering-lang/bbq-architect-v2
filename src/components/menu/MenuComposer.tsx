'use client';

/**
 * MenuComposer — Stel-menu-samen v2.
 *
 * Per gang een sortable lijst van gerecht-pills. Plus-knop opent
 * MenuCommandPalette in 'picker'-mode; "Vraag AI" roept
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
import {
    Plus, Sparkles, Save, Trash2, GripVertical, X, Loader2,
    ChevronDown, ChevronRight, ArrowRight, AlertTriangle, FileText,
} from 'lucide-react';
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
import { MenuCommandPalette } from './MenuCommandPalette';
import { GANG_VISUALS, getGangKey } from './helpers';
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
    const [picker, setPicker] = useState<{ open: boolean; gangSlug: string } | null>(null);
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

    return (
        <div className="menu-composer" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
            {/* ── Sticky header ─────────────────────────────────────────── */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 5,
                background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
            }}>
                <input
                    type="text"
                    value={state.naam}
                    onChange={e => { setState(s => ({ ...s, naam: e.target.value })); setDirty(true); }}
                    placeholder="Naam van de menukaart…"
                    style={{
                        flex: '1 1 220px', minWidth: 220, fontSize: 18, fontWeight: 600,
                        padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6,
                        background: 'transparent', color: 'var(--text)',
                    }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Basisprijs p.p.
                    <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={state.basis_prijs_pp}
                        onChange={e => { setState(s => ({ ...s, basis_prijs_pp: Number(e.target.value) || 0 })); setDirty(true); }}
                        style={{ width: 80, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text)' }}
                    />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                    Gasten
                    <input
                        type="number"
                        min={1}
                        value={state.aantal_gasten}
                        onChange={e => { setState(s => ({ ...s, aantal_gasten: Number(e.target.value) || 40 })); setDirty(true); }}
                        style={{ width: 70, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--text)' }}
                    />
                </label>
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

            {/* ── Main split — mobile = stacked, desktop = 2-col ────────── */}
            <div className="menu-composer-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 0, flex: 1 }}>
                {/* Desktop sticky left column (collapses on mobile) */}
                <div className="menu-composer-gangs-nav" style={{ display: 'none' }}>
                    {gangen.map(g => {
                        const count = itemsByGang.get(g.slug)?.length ?? 0;
                        const vis = GANG_VISUALS[getGangKey({ gang_slug: g.slug })] ?? GANG_VISUALS.default;
                        const active = activeGang === g.slug;
                        return (
                            <button
                                key={g.slug}
                                type="button"
                                onClick={() => setActiveGang(g.slug)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', border: 'none', borderLeft: active ? '3px solid var(--brand, #c4a35a)' : '3px solid transparent',
                                    background: active ? 'rgba(196,163,90,.08)' : 'transparent',
                                    color: 'var(--text)', cursor: 'pointer', textAlign: 'left', width: '100%',
                                }}
                            >
                                <span style={{
                                    width: 26, height: 26, borderRadius: 6,
                                    background: vis.gradient,
                                    flexShrink: 0,
                                }} />
                                <span style={{ flex: 1, fontWeight: active ? 600 : 400 }}>{g.naam}</span>
                                <span style={{
                                    fontSize: 11, color: 'var(--muted)',
                                    background: 'rgba(255,255,255,.04)', padding: '2px 7px', borderRadius: 99,
                                }}>{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Right column — actieve gang OR (mobile) accordion van alle gangen */}
                <div className="menu-composer-content" style={{ padding: 16 }}>
                    {/* Mobile accordion: alle gangen onder elkaar */}
                    <div className="menu-composer-mobile-list" style={{ display: 'block' }}>
                        {gangen.map(g => {
                            const items = itemsByGang.get(g.slug) ?? [];
                            const expanded = mobileExpanded[g.slug] ?? false;
                            const unlinked = unlinkedByGang.get(g.slug) ?? [];
                            return (
                                <div key={g.slug} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
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
                                                gerechtById={gerechtById}
                                                unlinkedNames={unlinked}
                                                onAdd={() => setPicker({ open: true, gangSlug: g.slug })}
                                                onRemove={removeItem}
                                                onReorder={(oldIdx, newIdx) => reorderInGang(g.slug, oldIdx, newIdx)}
                                                onMoveToGang={moveToGang}
                                                onAi={() => requestAiSuggestions(g.slug)}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Picker palette (gedeeld over gangen) ───────────────────── */}
            {picker?.open && (
                <MenuCommandPalette
                    open={picker.open}
                    mode="picker"
                    pickerContext={{
                        gangSlug: picker.gangSlug,
                        gangLabel: gangen.find(g => g.slug === picker.gangSlug)?.naam ?? picker.gangSlug,
                    }}
                    excludeIds={new Set(state.items.filter(it => it.gang_slug === picker.gangSlug).map(it => it.gerecht_id))}
                    onClose={() => setPicker(null)}
                    gerechten={gerechten}
                    onSelectGerecht={(g) => { addGerecht(picker.gangSlug, String(g.id)); setPicker(null); }}
                    onAction={(id) => {
                        if (id === 'new-gerecht') {
                            window.open('/gerechten?new=1&gang=' + picker.gangSlug, '_blank');
                            setPicker(null);
                        }
                    }}
                />
            )}

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

            {/* ── Responsive CSS — desktop 2-koloms via media query ────── */}
            <style jsx>{`
                @media (min-width: 1024px) {
                    .menu-composer-grid { grid-template-columns: 280px 1fr; }
                    .menu-composer-gangs-nav { display: flex !important; flex-direction: column; border-right: 1px solid var(--border); padding: 12px 0; }
                    .menu-composer-mobile-list { display: none !important; }
                    .menu-composer-desktop-active { display: block !important; }
                }
            `}</style>

            {/* Desktop-only: actieve gang panel (verborgen op mobile via CSS) */}
            <div className="menu-composer-desktop-active" style={{ display: 'none', padding: 16 }}>
                {activeGang && (() => {
                    const gang = gangen.find(g => g.slug === activeGang);
                    if (!gang) return null;
                    const items = itemsByGang.get(gang.slug) ?? [];
                    const unlinked = unlinkedByGang.get(gang.slug) ?? [];
                    return (
                        <GangPanel
                            gang={gang}
                            items={items}
                            gangen={gangen}
                            gerechtById={gerechtById}
                            unlinkedNames={unlinked}
                            onAdd={() => setPicker({ open: true, gangSlug: gang.slug })}
                            onRemove={removeItem}
                            onReorder={(oldIdx, newIdx) => reorderInGang(gang.slug, oldIdx, newIdx)}
                            onMoveToGang={moveToGang}
                            onAi={() => requestAiSuggestions(gang.slug)}
                        />
                    );
                })()}
            </div>
        </div>
    );
}

/* ─── Subcomponent: GangPanel ───────────────────────────────────────── */

interface GangPanelProps {
    gang: Gang;
    items: ComposerItem[];
    gangen: Gang[];
    gerechtById: Map<string, Gerecht>;
    unlinkedNames: string[];
    onAdd: () => void;
    onRemove: (uid: string) => void;
    onReorder: (oldIdx: number, newIdx: number) => void;
    onMoveToGang: (uid: string, newGangSlug: string) => void;
    onAi: () => void;
}

function GangPanel({ gang, items, gangen, gerechtById, unlinkedNames, onAdd, onRemove, onReorder, onMoveToGang, onAi }: GangPanelProps) {
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

            {items.length === 0 ? (
                <div style={{
                    padding: 28, textAlign: 'center', border: '1px dashed var(--border)',
                    borderRadius: 8, color: 'var(--muted)', fontSize: 13,
                }}>
                    Nog geen gerechten in deze gang.
                </div>
            ) : (
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

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    onClick={onAdd}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
                        background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                    }}
                >
                    <Plus size={14} /> Voeg gerecht toe
                </button>
                <button
                    type="button"
                    onClick={onAi}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 12px', border: '1px solid rgba(196,163,90,.4)', borderRadius: 6,
                        background: 'rgba(196,163,90,.06)', color: 'var(--brand, #c4a35a)', cursor: 'pointer',
                    }}
                >
                    <Sparkles size={14} /> Vraag AI om suggesties
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
                style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'grab', padding: 0 }}
            >
                <GripVertical size={14} />
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

/* ─── Subcomponent: AiSuggestionsSheet ──────────────────────────────── */

function AiSuggestionsSheet({ gangNaam, loading, error, suggesties, gerechtById, onClose, onAccept }: {
    gangNaam: string;
    loading: boolean;
    error?: string;
    suggesties: Array<{ gerecht_id: string; redenering: string }>;
    gerechtById: Map<string, Gerecht>;
    onClose: () => void;
    onAccept: (gerechtId: string) => void;
}) {
    return (
        <div className="mr-modal-scrim" onClick={onClose} role="presentation">
            <div onClick={e => e.stopPropagation()} style={{
                position: 'fixed', right: 0, top: 0, bottom: 0, width: '95%', maxWidth: 480,
                background: 'var(--surface)', borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
            }}>
                <div style={{
                    padding: 14, borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    <Sparkles size={16} color="var(--brand, #c4a35a)" />
                    <h3 style={{ margin: 0, flex: 1, fontSize: 15 }}>AI-voorstellen voor {gangNaam}</h3>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                        <X size={16} />
                    </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                            <Loader2 size={20} className="animate-spin" /> Voorstellen ophalen…
                        </div>
                    )}
                    {error && (
                        <div style={{ padding: 14, background: 'rgba(220,50,47,.07)', border: '1px solid rgba(220,50,47,.25)', borderRadius: 6, color: 'var(--text)', fontSize: 13 }}>
                            Kon geen voorstellen ophalen: {error}
                        </div>
                    )}
                    {!loading && !error && suggesties.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>
                            Geen voorstellen — voeg eerst meer gerechten toe aan je bibliotheek.
                        </div>
                    )}
                    {suggesties.map(s => {
                        const g = gerechtById.get(s.gerecht_id);
                        const prijs = g ? Number(g.verkoopprijs ?? 0) : 0;
                        return (
                            <div key={s.gerecht_id} style={{
                                padding: 12, marginBottom: 10, border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <h4 style={{ margin: 0, fontSize: 14, flex: 1 }}>{g?.naam ?? '(onbekend gerecht)'}</h4>
                                    {g && <span style={{ fontSize: 11, color: 'var(--muted)' }}>€{prijs.toFixed(2)} p.p.</span>}
                                </div>
                                {s.redenering && (
                                    <p style={{ marginTop: 6, marginBottom: 8, fontSize: 12, color: 'var(--muted)' }}>{s.redenering}</p>
                                )}
                                <button
                                    type="button"
                                    onClick={() => onAccept(s.gerecht_id)}
                                    disabled={!g}
                                    style={{
                                        padding: '6px 10px', border: 'none', borderRadius: 4,
                                        background: g ? 'var(--brand, #c4a35a)' : 'var(--muted)',
                                        color: '#1a1a1e', cursor: g ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 600,
                                    }}
                                >
                                    Voeg toe
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
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

