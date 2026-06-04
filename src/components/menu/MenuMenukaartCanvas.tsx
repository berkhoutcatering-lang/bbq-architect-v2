'use client';

/**
 * MenuMenukaartCanvas — de geünificeerde "Menu & automatische menukaart".
 *
 * Sam's visie: kies gerechten → de opgemaakte menukaart vult zichzelf live.
 * Eén canva, links menu samenstellen (uit de INTERNE gerechten-bibliotheek),
 * rechts een automatische menukaart-preview (PreviewFor-template + cascade).
 * Vervangt de 4 overlappende offerte-knoppen (Menu Builder / Menu Wizard /
 * Menukaart / Vega menukaart). Bereikbaar vanuit offerte én event.
 *
 * Leidend principe (Sam): minimale input, maximale output.
 *  - "Laad menukaart" = één klik → vol menu + opgemaakte kaart.
 *  - Slimme defaults: default-template + brand-styling staan al aan.
 *  - Geen dubbele invoer: menu één keer kiezen voedt offerte + menukaart + PDF.
 *
 * Self-contained inline styles (geen menu-hub.css-afhankelijkheid) zodat de
 * canva op /offertes én /events werkt.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
    X, Search, Plus, Save, Loader2, Download, BookOpen, ChefHat, Palette,
} from 'lucide-react';
import type { Gerecht, Gang } from '@/types';
import { PreviewFor } from '@/components/menukaart/templates';
import { resolveCascade, flatten } from '@/lib/menukaart/cascade';
import {
    getTemplate, listEnabledTemplates, DEFAULT_TEMPLATE_ID, type Overrides,
} from '@/lib/menukaart/registry';
import { buildMenuData, countDishes } from '@/lib/menukaart/build-menu-data';
import { MENUKAART_PRESETS, type MenukaartPreset } from '@/lib/menukaart/presets';
import { getGangKey, getGangVisual, fmtEuro } from '@/components/menu/helpers';

export interface MenuTemplateLite {
    id: number;
    naam: string;
    is_default?: boolean;
    /** Breed getypeerd zodat MenuTemplateRow past; normalize() filtert runtime. */
    menu_selectie?: Record<string, unknown> | string | null;
}

export interface CanvasSaveResult {
    menuSelectie: Record<string, string[]>;
    templateId: string;
    customOverrides: Overrides;
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Context-indicator, bv. "OFF-2026-002 · Mariel velema". */
    contextLabel?: string;
    /** Interne gerechten-bibliotheek (de enige bron — geen website_gerechten). */
    gerechten: Gerecht[];
    /** Gangen voor volgorde + display-namen. */
    gangen: Gang[];
    /** Opgeslagen menukaarten voor "Laad menukaart" (één klik = vol menu). */
    menuTemplates?: MenuTemplateLite[];
    initialMenuSelectie: Record<string, string[]> | null | undefined;
    /** Styling-cascade. */
    templateId: string;
    brandOverrides: Overrides;
    customOverrides: Overrides;
    logoUrl?: string | null;
    /** Voor PDF-download (alleen tonen als opgeslagen offerte bestaat). */
    offerId?: string | number | null;
    onSave: (result: CanvasSaveResult) => Promise<void> | void;
}

/* ── Self-contained shell styles ──────────────────────────────────────── */
const SCRIM: CSSProperties = { position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(4px)' };
const SHELL: CSSProperties = {
    position: 'fixed', inset: '2vh 2vw', zIndex: 201,
    background: 'var(--bg-elevated, var(--surface, #16161a))',
    border: '1px solid var(--border)', borderRadius: 16,
    boxShadow: '0 24px 64px rgba(0,0,0,.55)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
};
const HEADER: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
    borderBottom: '1px solid var(--border)', flexShrink: 0,
};
const BODY: CSSProperties = { flex: 1, display: 'flex', minHeight: 0 };
const LEFT: CSSProperties = { width: 380, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 };
const RIGHT: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--bg, #0e0e10)' };
const FOOTER: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
    borderTop: '1px solid var(--border)', flexShrink: 0,
};

export default function MenuMenukaartCanvas({
    open, onClose, contextLabel, gerechten, gangen, menuTemplates = [],
    initialMenuSelectie, templateId, brandOverrides, customOverrides,
    logoUrl, offerId, onSave,
}: Props) {
    const [menuSelectie, setMenuSelectie] = useState<Record<string, string[]>>(() => normalize(initialMenuSelectie));
    const [activeTemplateId, setActiveTemplateId] = useState(templateId || DEFAULT_TEMPLATE_ID);
    /* Lokale styling-state: presets + de allergenen-toggle schrijven hierin; bij
       Opslaan gaat dit terug als customOverrides. Init uit de prop. */
    const [overrides, setOverrides] = useState<Overrides>(customOverrides);
    const [search, setSearch] = useState('');
    const [openGang, setOpenGang] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);

    /* Sync wanneer de drawer opnieuw opent met andere offerte-data. */
    useEffect(() => {
        if (open) {
            setMenuSelectie(normalize(initialMenuSelectie));
            setActiveTemplateId(templateId || DEFAULT_TEMPLATE_ID);
            setOverrides(customOverrides);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    /* ── Live menukaart-preview ──────────────────────────────────────── */
    const template = useMemo(() => getTemplate(activeTemplateId), [activeTemplateId]);
    const flat = useMemo(
        () => flatten(resolveCascade(template, brandOverrides, overrides)) as Overrides,
        [template, brandOverrides, overrides],
    );
    const menuData = useMemo(
        () => buildMenuData(menuSelectie, gerechten, gangen, { logoUrl, showAllergens: overrides.showAllergens ?? false }),
        [menuSelectie, gerechten, gangen, logoUrl, overrides.showAllergens],
    );
    const Preview = useMemo(() => PreviewFor(activeTemplateId), [activeTemplateId]);
    const totalDishes = countDishes(menuSelectie);

    /* Gerechten per gang (interne bron, gefilterd op zoek + al-toegevoegd). */
    const gerechtenByGang = useMemo(() => {
        const m = new Map<string, Gerecht[]>();
        for (const g of gangen) m.set(g.slug, []);
        for (const dish of gerechten) {
            if ((dish as { is_in_wizard?: boolean }).is_in_wizard === false) continue;
            const gang = gangen.find((gg) => getGangKey({ gang_slug: gg.slug }) === getGangKey(dish));
            if (gang) m.get(gang.slug)!.push(dish);
        }
        return m;
    }, [gerechten, gangen]);

    /* Zichtbare gangen: gesorteerd op volgorde (zelfde als de preview rechts) en
       lege gangen verborgen — een gang verschijnt zodra hij gerechten heeft of al
       in de selectie zit. De 9 gangen blijven in de DB (andere cateraars kunnen ze
       wél gebruiken); we tonen ze hier alleen niet leeg. */
    const visibleGangen = useMemo(() => {
        const sorted = [...gangen].sort((a, b) => {
            const oa = (a as { volgorde?: number | null }).volgorde ?? 999;
            const ob = (b as { volgorde?: number | null }).volgorde ?? 999;
            return (oa - ob) || a.slug.localeCompare(b.slug);
        });
        return sorted.filter((g) =>
            (gerechtenByGang.get(g.slug)?.length ?? 0) > 0 || (menuSelectie[g.slug]?.length ?? 0) > 0,
        );
    }, [gangen, gerechtenByGang, menuSelectie]);

    const addDish = (gangSlug: string, naam: string) => {
        setMenuSelectie((prev) => {
            const cur = prev[gangSlug] ?? [];
            if (cur.includes(naam)) return prev;
            return { ...prev, [gangSlug]: [...cur, naam] };
        });
    };
    const removeDish = (gangSlug: string, naam: string) => {
        setMenuSelectie((prev) => ({ ...prev, [gangSlug]: (prev[gangSlug] ?? []).filter((n) => n !== naam) }));
    };

    const loadTemplate = (t: MenuTemplateLite) => {
        const raw = t.menu_selectie;
        setMenuSelectie(normalize(typeof raw === 'string' ? safeParse(raw) : raw));
    };

    /* Stijl-preset toepassen — zet de template + merge de preset-overrides
       (accent/font) over de huidige styling. Tekst-overrides (brandName,
       eventbericht, …) blijven staan; alleen de look verandert. */
    const applyPreset = (p: MenukaartPreset) => {
        setActiveTemplateId(p.templateId);
        setOverrides((prev) => ({ ...prev, ...p.overrides }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({ menuSelectie, templateId: activeTemplateId, customOverrides: overrides });
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!offerId) return;
        setDownloading(true);
        try {
            /* POST de actuele canva-state mee — anders rendert de server de stale
               DB-versie en mismatcht de PDF met de live-preview rechts (Sam,
               2026-06-04: dessert "Bavarois" in de PDF ipv "Aardbeien dessert"
               in de canva omdat onSave op /offertes alleen form-state update). */
            const res = await fetch(`/api/menukaart/pdf/${offerId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    menuSelectie,
                    templateId: activeTemplateId,
                    customOverrides: overrides,
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `menukaart-${offerId}.pdf`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch { /* stil; netwerk/route-fout */ } finally {
            setDownloading(false);
        }
    };

    if (!open) return null;
    const enabledTemplates = listEnabledTemplates();

    return (
        <>
            <div style={SCRIM} onClick={onClose} role="presentation" />
            <div style={SHELL} role="dialog" aria-modal="true" aria-label="Menu en menukaart samenstellen">
                {/* Header */}
                <div style={HEADER}>
                    <ChefHat size={18} style={{ color: 'var(--brand, #c4a35a)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Menu &amp; menukaart</div>
                        {contextLabel && <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contextLabel}</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {totalDishes} {totalDishes === 1 ? 'gerecht' : 'gerechten'}
                    </span>
                    <button onClick={onClose} aria-label="Sluit" style={closeBtn}><X size={18} /></button>
                </div>

                {/* Body — twee koloms */}
                <div style={BODY}>
                    {/* Links — menu samenstellen */}
                    <div style={LEFT}>
                        {/* Laad menukaart — min input max output */}
                        {menuTemplates.length > 0 && (
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                                    Laad menukaart
                                </label>
                                <select
                                    defaultValue=""
                                    onChange={(e) => {
                                        const t = menuTemplates.find((x) => String(x.id) === e.target.value);
                                        if (t) loadTemplate(t);
                                        e.target.value = '';
                                    }}
                                    style={selectStyle}
                                >
                                    <option value="" disabled>Kies een menukaart als startpunt…</option>
                                    {menuTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>{t.naam}{t.is_default ? ' ★' : ''}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Zoek */}
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--muted)', pointerEvents: 'none' }} />
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Zoek gerecht…"
                                    style={{ ...selectStyle, padding: '8px 10px 8px 30px' }}
                                />
                            </div>
                        </div>

                        {/* Per gang — gesorteerd op volgorde, lege gangen verborgen */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {visibleGangen.length === 0 ? (
                                <div style={{ padding: '24px 12px', fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6 }}>
                                    Nog geen gerechten in je bibliotheek. Voeg ze toe via Menu &rarr; Gerechten — dan verschijnen de gangen hier vanzelf.
                                </div>
                            ) : visibleGangen.map((gang) => {
                                const added = menuSelectie[gang.slug] ?? [];
                                const all = gerechtenByGang.get(gang.slug) ?? [];
                                const ql = search.trim().toLowerCase();
                                const pickable = all.filter((d) =>
                                    !added.includes(d.naam) && (!ql || d.naam.toLowerCase().includes(ql)),
                                );
                                const visual = getGangVisual(getGangKey({ gang_slug: gang.slug }));
                                const isOpen = openGang === gang.slug;
                                return (
                                    <div key={gang.slug} style={{ marginBottom: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <span style={{ width: 14, height: 4, borderRadius: 2, background: visual.gradient, flexShrink: 0 }} aria-hidden />
                                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{gang.naam}</span>
                                            <span style={{ flex: 1 }} />
                                            <span style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{added.length}</span>
                                        </div>

                                        {/* Toegevoegde gerechten */}
                                        {added.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                                {added.map((naam) => (
                                                    <span key={naam} style={chip}>
                                                        {naam}
                                                        <button onClick={() => removeDish(gang.slug, naam)} style={chipX} aria-label={`Verwijder ${naam}`}><X size={11} /></button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Voeg toe */}
                                        <button type="button" onClick={() => setOpenGang(isOpen ? null : gang.slug)} style={addBtn}>
                                            <Plus size={13} /> Voeg toe aan {gang.naam.toLowerCase()}
                                        </button>
                                        {isOpen && (
                                            <div style={pickList}>
                                                {pickable.length === 0 ? (
                                                    <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
                                                        {all.length === 0 ? 'Nog geen gerechten in deze gang.' : 'Alles toegevoegd of geen match.'}
                                                    </div>
                                                ) : pickable.slice(0, 30).map((d) => (
                                                    <button key={d.id} type="button" onClick={() => { addDish(gang.slug, d.naam); }} style={pickRow}>
                                                        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.naam}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtEuro(Number(d.verkoopprijs ?? d.prijs ?? 0))}</span>
                                                        <Plus size={13} style={{ color: 'var(--brand, #c4a35a)' }} />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Rechts — automatische menukaart-preview */}
                    <div style={RIGHT}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                            <Palette size={15} style={{ color: 'var(--brand, #c4a35a)' }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Stijl</span>
                            <select value={activeTemplateId} onChange={(e) => setActiveTemplateId(e.target.value)} style={{ ...selectStyle, maxWidth: 190 }}>
                                {enabledTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <label style={toggleLabel} title="Allergenen-codes op de menukaart tonen — standaard uit">
                                <input
                                    type="checkbox"
                                    checked={!!overrides.showAllergens}
                                    onChange={(e) => setOverrides((prev) => ({ ...prev, showAllergens: e.target.checked }))}
                                    style={{ accentColor: 'var(--brand, #c4a35a)', width: 14, height: 14 }}
                                />
                                Allergenen
                            </label>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Live voorbeeld</span>
                        </div>
                        {/* Stijl-presets — voorgebouwde look-combo's, één klik = volledige stijl */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', flexShrink: 0 }}>Snel een stijl</span>
                            {MENUKAART_PRESETS.map((p) => (
                                <button key={p.id} type="button" onClick={() => applyPreset(p)} title={p.beschrijving} style={presetChip(activeTemplateId === p.templateId)}>
                                    <span style={{ width: 10, height: 10, borderRadius: 3, background: p.overrides.accent ?? 'var(--brand, #c4a35a)', flexShrink: 0, border: '1px solid rgba(255,255,255,.25)' }} aria-hidden />
                                    {p.naam}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24 }}>
                            {totalDishes === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--muted)', maxWidth: 320, marginTop: 60 }}>
                                    <BookOpen size={32} style={{ marginBottom: 12, opacity: 0.6 }} />
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Kies gerechten links</div>
                                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>De menukaart vult zichzelf automatisch zodra je gerechten toevoegt. Of laad een opgeslagen menukaart als startpunt.</div>
                                </div>
                            ) : (
                                <div style={{ boxShadow: '0 8px 32px rgba(0,0,0,.4)', background: '#fff' }}>
                                    <Preview overrides={flat} data={menuData} size="normal" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div style={FOOTER}>
                    <div style={{ flex: 1, fontSize: 12, color: 'var(--muted)' }}>
                        Menu één keer samenstellen voedt offerte, menukaart én PDF.
                    </div>
                    {offerId && (
                        <button type="button" onClick={handleDownloadPdf} disabled={downloading || totalDishes === 0} style={ghostBtn}>
                            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download PDF
                        </button>
                    )}
                    <button type="button" onClick={handleSave} disabled={saving} style={primaryBtn}>
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Opslaan
                    </button>
                </div>
            </div>
        </>
    );
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function normalize(sel: unknown): Record<string, string[]> {
    if (!sel || typeof sel !== 'object' || Array.isArray(sel)) return {};
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(sel as Record<string, unknown>)) {
        if (Array.isArray(v)) out[k] = v.filter((n): n is string => typeof n === 'string');
    }
    return out;
}
function safeParse(s: string): unknown {
    try { return JSON.parse(s); } catch { return {}; }
}

/* ── Inline style atoms ───────────────────────────────────────────────── */
const closeBtn: CSSProperties = { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const selectStyle: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle, rgba(255,255,255,.02))', color: 'var(--text)', fontSize: 13, outline: 'none' };
const chip: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'rgba(196,163,90,.1)', border: '1px solid rgba(196,163,90,.25)', fontSize: 12, color: 'var(--text)' };
const chipX: CSSProperties = { border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, display: 'flex' };
const addBtn: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--brand, #c4a35a)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const pickList: CSSProperties = { marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' };
const pickRow: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' };
const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 36 };
const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--brand, #c4a35a)', color: '#1a1a1e', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36 };
const toggleLabel: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer', userSelect: 'none', flexShrink: 0 };
function presetChip(active: boolean): CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 999,
        border: `1px solid ${active ? 'var(--brand, #c4a35a)' : 'var(--border)'}`,
        background: active ? 'rgba(196,163,90,.12)' : 'var(--bg-subtle, rgba(255,255,255,.02))',
        color: 'var(--text)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
    };
}
