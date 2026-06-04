'use client';

/**
 * OfferteMenuPicker — Rechter-drawer in de offerte-flow voor menukaart-keuze.
 *
 * Vervangt de oude MenuWizard "stel-een-menu-samen-per-gang" stappen. Sam's
 * mentale model: de menukaart wordt op /gerechten/menukaarten samengesteld;
 * de offerte KIEST eruit. Geen tweede samenstel-flow in de offerte-wizard.
 *
 * Flow:
 *   1. Dropdown van actieve menu_templates (default = is_default).
 *   2. Per gang een checkbox-rij; alles default-aangevinkt
 *      (Sam: "alle gerechten eraan toevoegt"). Vink uit wat de klant niet krijgt.
 *   3. "Toepassen" → returnt {menu_selectie, template_naam} met de uitgevinkte
 *      items eruit gefilterd. GEEN prijs/gasten: die vult de cateraar in de
 *      offerte in (een menukaart houdt geen geld vast).
 *
 * Out-of-scope v1: gerecht-buiten-menukaart toevoegen. Cateraar voegt eerst
 * toe in MenuComposer, kiest dan een aangepaste menukaart hier.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { X, BookOpen, Check, Star, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/* Self-contained drawer-shell. Deze component leeft op /offertes, waar
   menu-hub.css (de bron van .mr-drawer-*) NIET geladen is — die wordt enkel
   in gerechten/layout.tsx geïmporteerd. Inline styles maken 'm portable naar
   elke pagina zonder CSS-afhankelijkheid. */
const DRAWER_SCRIM: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)',
};
const DRAWER_PANEL: CSSProperties = {
    position: 'fixed', right: 0, top: 0, height: '100vh',
    width: 560, maxWidth: '94vw', zIndex: 201,
    background: 'var(--bg-elevated, var(--surface, #1a1a1e))',
    borderLeft: '1px solid var(--border)',
    boxShadow: '-20px 0 40px rgba(0,0,0,.4)',
    display: 'flex', flexDirection: 'column',
};
const DRAWER_HEADER: CSSProperties = {
    display: 'flex', gap: 16, padding: '20px 24px',
    borderBottom: '1px solid var(--border)', position: 'relative', flexShrink: 0,
};
const DRAWER_CLOSE: CSSProperties = {
    position: 'absolute', top: 16, right: 16, width: 32, height: 32,
    borderRadius: 8, background: 'transparent', border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--muted)', cursor: 'pointer',
};
const DRAWER_BODY: CSSProperties = { flex: 1, overflowY: 'auto', minHeight: 0 };
const DRAWER_FOOTER: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    padding: '14px 24px', borderTop: '1px solid var(--border)',
    background: 'var(--bg-elevated, var(--surface, #1a1a1e))', flexShrink: 0,
};

type MenuTemplate = {
    id: number;
    naam: string;
    beschrijving: string | null;
    menu_selectie: Record<string, string[]> | string;
    is_default: boolean;
};

export interface OfferteMenuPickerResult {
    menu_selectie: Record<string, string[]>;
    template_naam: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onApply: (data: OfferteMenuPickerResult) => void;
    /** Optionele initial template-id (bv. uit prefillFromTemplate). */
    initialTemplateId?: number | null;
}

export default function OfferteMenuPicker({
    open, onClose, onApply, initialTemplateId,
}: Props) {
    const [templates, setTemplates] = useState<MenuTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(initialTemplateId ?? null);
    /** Per gang_slug: Set van gerecht-namen die UITGEVINKT staan. */
    const [excluded, setExcluded] = useState<Map<string, Set<string>>>(new Map());
    /** gang_slug → {volgorde, naam} uit de gangen-tabel, voor correcte sortering + labels. */
    const [gangMeta, setGangMeta] = useState<Map<string, { volgorde: number; naam: string }>>(new Map());

    /* Fetch templates + gangen-volgorde wanneer drawer opent. */
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            const [tplRes, gangRes] = await Promise.all([
                supabase
                    .from('menu_templates')
                    .select('id, naam, beschrijving, menu_selectie, is_default, updated_at')
                    .eq('actief', true)
                    .order('is_default', { ascending: false })
                    .order('updated_at', { ascending: false }),
                supabase
                    .from('gangen')
                    .select('slug, naam, volgorde')
                    .order('volgorde'),
            ]);
            if (cancelled) return;
            /* Gangen-volgorde-map (best-effort; faalt zacht naar slug-fallback). */
            const gm = new Map<string, { volgorde: number; naam: string }>();
            for (const g of gangRes.data ?? []) {
                gm.set(g.slug, { volgorde: g.volgorde ?? 999, naam: g.naam });
            }
            setGangMeta(gm);

            const { data, error } = tplRes;
            if (error || !data) {
                setTemplates([]);
                setLoading(false);
                return;
            }
            setTemplates(data as MenuTemplate[]);
            setLoading(false);
            /* Auto-select default (of de eerste) als nog niets gekozen. */
            if (data.length > 0 && selectedId == null) {
                const def = data.find((t: { is_default: boolean }) => t.is_default) ?? data[0];
                setSelectedId(def.id);
            }
        })();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    /* ESC sluit. */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    /* Reset excluded wanneer template wisselt. */
    useEffect(() => {
        setExcluded(new Map());
    }, [selectedId]);

    const selectedTemplate = useMemo(
        () => templates.find((t) => t.id === selectedId) ?? null,
        [templates, selectedId],
    );

    const menuSelectie = useMemo<Record<string, string[]>>(() => {
        if (!selectedTemplate) return {};
        const raw = selectedTemplate.menu_selectie;
        const sel = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
        const out: Record<string, string[]> = {};
        for (const [gangSlug, names] of Object.entries(sel)) {
            if (Array.isArray(names)) {
                out[gangSlug] = names.filter((n): n is string => typeof n === 'string');
            }
        }
        return out;
    }, [selectedTemplate]);

    /* Gangen in logische eet-volgorde (bites → voor → hoofd → dessert → …) op
       basis van de gangen-tabel volgorde. Gangen zonder match komen achteraan. */
    const sortedGangEntries = useMemo(() => {
        return Object.entries(menuSelectie)
            .filter(([, names]) => names.length > 0)
            .sort(([a], [b]) => {
                const oa = gangMeta.get(a)?.volgorde ?? 999;
                const ob = gangMeta.get(b)?.volgorde ?? 999;
                return oa - ob || a.localeCompare(b);
            });
    }, [menuSelectie, gangMeta]);

    const totalGangen = Object.keys(menuSelectie).length;
    const totalDishes = Object.values(menuSelectie).reduce((s, arr) => s + arr.length, 0);
    const totalExcluded = Array.from(excluded.values()).reduce((s, set) => s + set.size, 0);
    const remainingDishes = totalDishes - totalExcluded;

    const toggleItem = (gangSlug: string, naam: string) => {
        setExcluded((prev) => {
            const next = new Map(prev);
            const set = new Set(next.get(gangSlug) ?? []);
            if (set.has(naam)) set.delete(naam);
            else set.add(naam);
            next.set(gangSlug, set);
            return next;
        });
    };

    const applySelection = () => {
        if (!selectedTemplate) return;
        const finalSelectie: Record<string, string[]> = {};
        for (const [gangSlug, names] of Object.entries(menuSelectie)) {
            const exSet = excluded.get(gangSlug) ?? new Set();
            const filtered = names.filter((n) => !exSet.has(n));
            if (filtered.length > 0) finalSelectie[gangSlug] = filtered;
        }
        onApply({
            menu_selectie: finalSelectie,
            template_naam: selectedTemplate.naam,
        });
        onClose();
    };

    if (!open) return null;

    return (
        <>
            <div style={DRAWER_SCRIM} onClick={onClose} role="presentation" />
            <div
                style={DRAWER_PANEL}
                role="dialog"
                aria-modal="true"
                aria-labelledby="offerte-menu-picker-title"
            >
                <div style={DRAWER_HEADER}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase',
                            color: 'var(--brand, #c4a35a)', fontWeight: 700, marginBottom: 4,
                        }}>
                            Menukaart
                        </div>
                        <h2
                            id="offerte-menu-picker-title"
                            style={{
                                margin: 0,
                                fontFamily: 'var(--font-display, Georgia, serif)',
                                fontStyle: 'italic', fontSize: 22, fontWeight: 500,
                            }}
                        >
                            Welke menukaart krijgt deze klant?
                        </h2>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            Kies een menukaart en vink uit wat deze klant niet krijgt.
                        </div>
                    </div>
                    <button style={DRAWER_CLOSE} onClick={onClose} aria-label="Sluit">
                        <X size={18} />
                    </button>
                </div>

                <div style={DRAWER_BODY}>
                    {/* Template-keuze */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
                        {loading ? (
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                fontSize: 13, color: 'var(--muted)',
                            }}>
                                <Loader2 size={14} className="animate-spin" />
                                Menukaarten laden…
                            </div>
                        ) : templates.length === 0 ? (
                            <EmptyTemplatesState />
                        ) : (
                            <>
                                <label style={{
                                    display: 'block', fontSize: 11, fontWeight: 700,
                                    letterSpacing: '.1em', textTransform: 'uppercase',
                                    color: 'var(--muted)', marginBottom: 6,
                                }}>
                                    Menukaart
                                </label>
                                <select
                                    value={selectedId ?? ''}
                                    onChange={(e) => setSelectedId(Number(e.target.value))}
                                    style={{
                                        width: '100%', padding: '10px 12px',
                                        background: 'var(--bg-subtle, rgba(255,255,255,.02))',
                                        border: '1px solid var(--border)', borderRadius: 8,
                                        color: 'var(--text)', fontSize: 14, fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.naam}{t.is_default ? ' ★ (standaard)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {selectedTemplate?.beschrijving && (
                                    <div style={{
                                        marginTop: 8, fontSize: 12, color: 'var(--muted)',
                                        lineHeight: 1.5,
                                    }}>
                                        {selectedTemplate.beschrijving}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Per-gang checkbox-lijst */}
                    {selectedTemplate && totalDishes > 0 && (
                        <div style={{ padding: '16px 24px' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                gap: 12, marginBottom: 14, fontSize: 12, color: 'var(--muted)',
                            }}>
                                <span>
                                    {remainingDishes} van {totalDishes} gerechten · {totalGangen} gangen
                                </span>
                                {totalExcluded > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setExcluded(new Map())}
                                        style={{
                                            background: 'transparent', border: 'none', cursor: 'pointer',
                                            color: 'var(--brand, #c4a35a)', fontSize: 12, fontWeight: 600,
                                        }}
                                    >
                                        Alles weer aanvinken
                                    </button>
                                )}
                            </div>

                            {sortedGangEntries.map(([gangSlug, names]) => {
                                if (names.length === 0) return null;
                                const exSet = excluded.get(gangSlug) ?? new Set();
                                return (
                                    <div key={gangSlug} style={{ marginBottom: 18 }}>
                                        <div style={{
                                            fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
                                            textTransform: 'uppercase', color: 'var(--muted)',
                                            marginBottom: 8, paddingLeft: 4,
                                        }}>
                                            {gangMeta.get(gangSlug)?.naam ?? gangSlug.replace(/_/g, ' ')}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {names.map((naam) => {
                                                const checked = !exSet.has(naam);
                                                return (
                                                    <label
                                                        key={naam}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 10,
                                                            padding: '9px 12px', borderRadius: 8,
                                                            border: '1px solid var(--border)',
                                                            background: checked ? 'transparent' : 'rgba(255,255,255,.02)',
                                                            cursor: 'pointer',
                                                            opacity: checked ? 1 : 0.55,
                                                            transition: 'opacity .15s, background .15s',
                                                            fontSize: 13,
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleItem(gangSlug, naam)}
                                                            style={{
                                                                width: 16, height: 16, flexShrink: 0,
                                                                cursor: 'pointer',
                                                                accentColor: 'var(--brand, #c4a35a)',
                                                            }}
                                                        />
                                                        <span style={{
                                                            flex: 1, color: 'var(--text)',
                                                            textDecoration: checked ? 'none' : 'line-through',
                                                        }}>
                                                            {naam}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={DRAWER_FOOTER}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
                        {selectedTemplate && remainingDishes > 0 && (
                            <span>{remainingDishes} {remainingDishes === 1 ? 'gerecht' : 'gerechten'} geselecteerd</span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            padding: '8px 14px', borderRadius: 8,
                            border: '1px solid var(--border)', background: 'transparent',
                            color: 'var(--muted)', fontSize: 13, fontWeight: 500,
                            cursor: 'pointer', minHeight: 36,
                        }}
                    >
                        Annuleer
                    </button>
                    <button
                        type="button"
                        onClick={applySelection}
                        disabled={!selectedTemplate || remainingDishes === 0}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 16px', borderRadius: 8, border: 'none',
                            background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                            fontSize: 13, fontWeight: 700, cursor: 'pointer',
                            minHeight: 36,
                            opacity: (!selectedTemplate || remainingDishes === 0) ? 0.5 : 1,
                        }}
                    >
                        <Check size={14} /> Pas toe
                    </button>
                </div>
            </div>
        </>
    );
}

/* ─── Empty state — geen menukaarten in deze tenant ─────────────── */

function EmptyTemplatesState() {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '12px 16px', textAlign: 'center',
        }}>
            <span style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'rgba(196,163,90,.1)', color: 'var(--brand, #c4a35a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <BookOpen size={22} />
            </span>
            <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                    Nog geen menukaarten
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 320 }}>
                    Maak eerst een menukaart aan; daarna kies je hier welke
                    bij deze klant past.
                </div>
            </div>
            <Link
                href="/gerechten/menukaarten/nieuw"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 8, border: 'none',
                    background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}
            >
                <Star size={13} /> Maak een menukaart
            </Link>
        </div>
    );
}
