'use client';

/**
 * MenukaartEditor — hoofdcomponent met cascade-aware state + 10 templates.
 *
 * State-model:
 *   - templateId         (muteerbaar — via TemplatePickerSheet)
 *   - brandOverrides     (read-only — uit settings.menukaart_overrides)
 *   - customOverrides    (local state — schrijven naar offertes.menukaart_overrides)
 *   - undoStack/redoStack van customOverrides snapshots
 *
 * Cascade-resolver pakt template-defaults → brand → custom in die volgorde.
 * Per-key reset = key uit customOverrides verwijderen (valt door naar brand).
 *
 * Sprint 4 fase 2: 10 templates beschikbaar via TemplatePickerSheet.
 * "Persoonlijke boodschap"-sectie laat de caterer per-event een tekst
 * meesturen aan de klant op de menukaart.
 */

import { useState, useMemo, useTransition, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Palette,
    Type,
    Image as ImageIcon,
    TextCursorInput,
    Sparkles,
    Undo2,
    Redo2,
    Save,
    Layout,
    Columns,
    SlidersHorizontal,
    Heart,
    AtSign,
    Printer,
    UtensilsCrossed,
    Monitor,
} from 'lucide-react';
import { useIsPhone } from '@/hooks/useIsMobile';
import {
    getTemplate,
    DEFAULT_TEMPLATE_ID,
    type Overrides,
    type LogoPosition,
    type EventMessagePosition,
} from '@/lib/menukaart/registry';
import { resolveCascade, flatten, sourceOf, type Resolved, type CascadeSource } from '@/lib/menukaart/cascade';
import { PreviewFor } from '@/components/menukaart/templates';
import { DEMO_MENU, type MenuData } from '@/lib/menukaart/menu-data';
import {
    Section,
    ColorControl,
    SizeControl,
    FontControl,
    WeightControl,
    TextControl,
    ToggleControl,
    PositionChips,
} from './controls';
import AICoach, { type Diff } from './AICoach';
import TemplatePickerSheet from './TemplatePickerSheet';
import EventMessageControl from './EventMessageControl';
import { saveOfferOverrides, resetOfferKeys, saveOfferMenu } from '@/app/offertes/[id]/menukaart-editor/actions';
import type { Template } from '@/lib/menukaart/registry';
import MenuMenukaartCanvas, { type MenuTemplateLite, type CanvasSaveResult } from '@/components/menu/MenuMenukaartCanvas';
import type { Gerecht, Gang } from '@/types';
import './editor.css';

const ZOOM_STEPS = [50, 75, 100, 125] as const;
type ZoomStep = typeof ZOOM_STEPS[number];

type Props = {
    offerId: string;
    offerLabel: string;
    templateId: string;
    brandOverrides: Overrides;
    customOverrides: Overrides;
    menuData?: MenuData;
    logoUrl?: string | null;
    /** Bibliotheek voor de "Bewerk menu"-canva. Optioneel zodat de editor
     *  ook standalone werkt (zonder menu-knop). */
    gerechten?: Gerecht[];
    gangen?: Gang[];
    menuTemplates?: MenuTemplateLite[];
    /** Huidige menu_selectie van de offerte (gang_slug → dish-namen). */
    initialMenuSelectie?: Record<string, string[]> | null;
    /** Tonen we de "Bewerk menu"-knop? Default: alleen als gerechten/gangen aanwezig zijn. */
    showMenuButton?: boolean;
    /** Optionele context-string voor de canva-header (bv. "EVT-2026-001 · …"). */
    contextLabel?: string;
};

export default function MenukaartEditor({
    offerId,
    offerLabel,
    templateId: initialTemplateId,
    brandOverrides,
    customOverrides: initialCustom,
    menuData,
    logoUrl,
    gerechten,
    gangen,
    menuTemplates,
    initialMenuSelectie,
    showMenuButton,
    contextLabel,
}: Props) {
    const isPhone = useIsPhone();
    const router = useRouter();
    const [templateId, setTemplateId] = useState(initialTemplateId);
    const template = useMemo(() => getTemplate(templateId), [templateId]);

    const [custom, setCustom] = useState<Overrides>(initialCustom);
    const [undoStack, setUndoStack] = useState<Overrides[]>([]);
    const [redoStack, setRedoStack] = useState<Overrides[]>([]);
    const [tab, setTab] = useState<'properties' | 'ai'>('properties');
    const [zoom, setZoom] = useState<ZoomStep>(75);
    const [compareMode, setCompareMode] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [aiState, setAiState] = useState<'idle' | 'loading' | 'result' | 'error'>('idle');
    const [aiPrompt, setAiPrompt] = useState('');
    const [diffs, setDiffs] = useState<Diff[]>([]);
    const [aiSummary, setAiSummary] = useState<string | undefined>(undefined);
    const [aiError, setAiError] = useState<string | undefined>(undefined);
    const [aiCostCents, setAiCostCents] = useState<number | undefined>(undefined);
    const [aiRateRemaining, setAiRateRemaining] = useState<number | undefined>(undefined);
    const aiAbortRef = useRef<AbortController | null>(null);

    const [isPending, startTransition] = useTransition();
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | 'never'>(
        Object.keys(initialCustom).length > 0 ? 'saved' : 'never',
    );
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    /* Menu-canva drawer — opent via "Bewerk menu"-knop in de header. Schrijft
       menu_selectie + template + overrides in één Server Action (saveOfferMenu)
       zodat een stijl-edit nooit per ongeluk de menu reset of vice versa. */
    const [canvasOpen, setCanvasOpen] = useState(false);
    const canMenuEdit = Boolean(
        showMenuButton !== false && gerechten && gangen && gerechten.length > 0,
    );

    /* ── Cascade resolution ─────────────────────────────────── */
    const resolved = useMemo(() => resolveCascade(template, brandOverrides, custom), [template, brandOverrides, custom]);
    const flat = useMemo(() => flatten(resolved) as Overrides, [resolved]);
    const data: MenuData = useMemo(() => ({ ...(menuData ?? DEMO_MENU), logoUrl }), [menuData, logoUrl]);

    const TemplatePreview = useMemo(() => PreviewFor(templateId), [templateId]);

    const overallStatus = Object.keys(custom).length > 0 ? 'custom' : 'brand';

    /* ── Mutations ──────────────────────────────────────────── */
    const updateKey = useCallback(
        <K extends keyof Overrides>(key: K, value: Overrides[K]) => {
            setUndoStack(s => [...s, custom]);
            setRedoStack([]);
            setCustom(prev => ({ ...prev, [key]: value }));
            setSaveStatus('saving');
        },
        [custom],
    );

    const resetKey = useCallback(
        (key: keyof Overrides) => {
            setUndoStack(s => [...s, custom]);
            setRedoStack([]);
            setCustom(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setSaveStatus('saving');
            startTransition(async () => {
                const result = await resetOfferKeys({ offerId, keys: [String(key)] });
                if ('error' in result) setSaveStatus('error');
                else {
                    setSaveStatus('saved');
                    setLastSavedAt(new Date());
                }
            });
        },
        [custom, offerId],
    );

    const undo = useCallback(() => {
        if (undoStack.length === 0) return;
        const prev = undoStack[undoStack.length - 1];
        setRedoStack(r => [...r, custom]);
        setUndoStack(s => s.slice(0, -1));
        setCustom(prev);
        setSaveStatus('saving');
    }, [undoStack, custom]);

    const redo = useCallback(() => {
        if (redoStack.length === 0) return;
        const next = redoStack[redoStack.length - 1];
        setUndoStack(s => [...s, custom]);
        setRedoStack(r => r.slice(0, -1));
        setCustom(next);
        setSaveStatus('saving');
    }, [redoStack, custom]);

    /* ── Debounced auto-save naar Server Action ─────────────────────────── */
    useEffect(() => {
        if (saveStatus !== 'saving') return;
        const t = setTimeout(() => {
            startTransition(async () => {
                const result = await saveOfferOverrides(offerId, templateId, custom);
                if ('error' in result) setSaveStatus('error');
                else {
                    setSaveStatus('saved');
                    setLastSavedAt(new Date());
                }
            });
        }, 600);
        return () => clearTimeout(t);
    }, [custom, saveStatus, offerId, templateId]);

    /* ── Keyboard shortcuts ─────────────────────────────────── */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey;
            if (!meta) return;
            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo]);

    /* ── AI flow (UI-only voor S4-fase-1) ───────────────────── */
    const applyDiff = useCallback(
        (d: Diff) => {
            setUndoStack(s => [...s, custom]);
            setRedoStack([]);
            setCustom(prev => ({ ...prev, ...d.apply }));
            setSaveStatus('saving');
            setDiffs(ds => ds.map(x => (x.id === d.id ? { ...x, status: 'applied' } : x)));
        },
        [custom],
    );

    const applyAll = useCallback(() => {
        const merged: Overrides = { ...custom };
        for (const d of diffs.filter(x => x.status !== 'skipped')) {
            Object.assign(merged, d.apply);
        }
        setUndoStack(s => [...s, custom]);
        setRedoStack([]);
        setCustom(merged);
        setSaveStatus('saving');
        setDiffs(ds => ds.map(d => (d.status === 'open' ? { ...d, status: 'applied' } : d)));
        setCompareMode(false);
    }, [custom, diffs]);

    /* ── Menu-canva save → Server Action saveOfferMenu ─────────────
       De canva levert {menuSelectie, templateId, customOverrides}.
       We schrijven het in 1 RPC, sluiten de drawer, en refreshen de pagina
       zodat de live menukaart-preview de nieuwe menu_selectie oppikt. */
    const handleCanvasSave = useCallback(async (result: CanvasSaveResult) => {
        setSaveStatus('saving');
        const res = await saveOfferMenu({
            offerId,
            menuSelectie: result.menuSelectie,
            templateId: result.templateId,
            rawOverrides: result.customOverrides,
        });
        if ('error' in res) {
            setSaveStatus('error');
            return;
        }
        setTemplateId(result.templateId);
        setCustom(result.customOverrides);
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        setCanvasOpen(false);
        /* Refresh haalt de nieuwe menu_selectie + brandOverrides terug zodat
           de preview de toegevoegde gerechten direct toont. */
        router.refresh();
    }, [offerId, router]);

    /* ── Template switch — sluit compare-mode + accepteer server-side overrides reset ─ */
    const handleTemplateSwitched = useCallback((newTemplateId: string) => {
        setTemplateId(newTemplateId);
        setUndoStack([]);
        setRedoStack([]);
        setCompareMode(false);
        setDiffs([]);
        setAiState('idle');
        // Server heeft custom-overrides al gefilterd; we resetten local state na router refresh
        router.refresh();
        // Pull bevestiging — re-render zal updates oppikken
    }, [router]);

    /* ── Section summaries ──────────────────────────────────── */
    const colorCustom = (['accent', 'bg', 'text'] as const).filter(k => sourceOf(resolved, k) === 'custom').length;
    const colorBrand = (['accent', 'bg', 'text'] as const).filter(k => sourceOf(resolved, k) === 'brand').length;
    const colorSummary = colorCustom > 0 ? `${colorCustom} custom · ${3 - colorCustom} brand` : `${colorBrand} brand`;

    const typoKeys: Array<keyof Overrides> = ['headingFont', 'bodyFont', 'headingSize', 'bodySize', 'headingWeight'];
    const typoCustom = typoKeys.filter(k => sourceOf(resolved, k) === 'custom').length;
    const typoSummary = typoCustom > 0 ? `${typoCustom} custom` : 'Brand-default';

    const textCount = (['brandName', 'subtitle', 'addressLine', 'email', 'website', 'footer'] as const).filter(
        k => (flat[k] as string | undefined)?.length,
    ).length;
    const textSummary = `${textCount} ingevuld`;

    const eventCount = (['eventTitle', 'eventMessage'] as const).filter(k => (flat[k] as string | undefined)?.length).length;
    const eventSummary = eventCount > 0 ? `${eventCount} ingevuld` : 'Leeg';

    const decoCount = [
        flat.showAllergens ? 1 : 0,
        flat.showOrnament ? 1 : 0,
        flat.showDividers ? 1 : 0,
        flat.showGhostNumbers ? 1 : 0,
        flat.showFootnoteAllergens ? 1 : 0,
    ].reduce((a, b) => a + b, 0);
    const decoSummary = `${decoCount} actief`;

    /* ── Render ─────────────────────────────────────────────── */
    if (isPhone) {
        return (
            <div style={{
                minHeight: 'calc(100dvh - 60px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '32px 24px', textAlign: 'center', gap: 16,
                background: 'var(--bg)',
            }}>
                <div style={{
                    width: 72, height: 72, borderRadius: 18,
                    background: 'rgba(196,163,90,.12)',
                    border: '1px solid rgba(196,163,90,.3)',
                    color: 'var(--brand, #c4a35a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Monitor size={32} />
                </div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
                    Open op een desktop of tablet
                </h1>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.5 }}>
                    De menukaart-editor laat je het thema, de lay-out en de tekst zien op een echte
                    A4-preview. Dat past niet op een telefoon — open dezelfde link op een laptop of
                    tablet (≥1024px breed).
                </p>
                <div style={{
                    fontSize: 12, color: 'var(--muted)', padding: '6px 12px',
                    border: '1px solid var(--border)', borderRadius: 999,
                }}>
                    Offerte · <span style={{ color: 'var(--text)', fontWeight: 600 }}>{offerLabel}</span>
                </div>
                <Link href={`/offertes/${offerId}`} style={{
                    marginTop: 8, padding: '10px 18px', borderRadius: 10,
                    background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                    fontWeight: 600, fontSize: 14, textDecoration: 'none',
                }}>
                    Terug naar de offerte
                </Link>
            </div>
        );
    }

    return (
        <div className="mke">
            <div className="mke-shell">
                <Header
                    offerId={offerId}
                    offerLabel={offerLabel}
                    templateName={template.name}
                    saveStatus={saveStatus}
                    lastSavedAt={lastSavedAt}
                    canUndo={undoStack.length > 0}
                    canRedo={redoStack.length > 0}
                    onUndo={undo}
                    onRedo={redo}
                    onClose={() => router.push(`/offertes/${offerId}/view`)}
                    onOpenPicker={() => setPickerOpen(true)}
                    canMenuEdit={canMenuEdit}
                    onOpenMenu={() => setCanvasOpen(true)}
                />

                <div className="mke-body">
                    {/* ── Canvas ── */}
                    <div className="mke-canvas-area">
                        <div className="mke-canvas-toolbar">
                            <div className="mke-template-label">
                                <span className="mke-template-name">{template.name}</span>
                                <span className={`mke-status-badge ${overallStatus}`}>
                                    {overallStatus === 'custom' ? 'Custom' : 'Brand-default'}
                                </span>
                            </div>
                            <div className="mke-zoom">
                                {ZOOM_STEPS.map(z => (
                                    <button
                                        key={z}
                                        className={`mke-zoom-btn ${zoom === z ? 'active' : ''}`}
                                        onClick={() => setZoom(z)}
                                        type="button"
                                    >
                                        {z}%
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mke-canvas-viewport">
                            {compareMode ? (
                                <div className="mke-compare">
                                    <div className="mke-compare-col">
                                        <span className="mke-compare-label current">Huidig</span>
                                        <PreviewWrapper zoom={zoom}>
                                            <div className="menukaart-printable">
                                                <TemplatePreview overrides={flat} data={data} size="small" />
                                            </div>
                                        </PreviewWrapper>
                                    </div>
                                    <div className="mke-compare-col">
                                        <span className="mke-compare-label proposal">Voorstel</span>
                                        <PreviewWrapper zoom={zoom}>
                                            <TemplatePreview overrides={previewProposal(flat, diffs)} data={data} size="small" />
                                        </PreviewWrapper>
                                    </div>
                                </div>
                            ) : (
                                <PreviewWrapper zoom={zoom}>
                                    <div className="menukaart-printable">
                                        <TemplatePreview overrides={flat} data={data} />
                                    </div>
                                </PreviewWrapper>
                            )}
                        </div>
                        <div className="mke-canvas-footer" style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button
                                className="mke-btn-compare"
                                onClick={() => setCompareMode(c => !c)}
                                disabled={diffs.length === 0 && !compareMode}
                                type="button"
                            >
                                <Columns size={14} /> {compareMode ? 'Sluit vergelijk' : 'Vergelijken'}
                            </button>
                            <button
                                className="mke-btn-compare"
                                onClick={() => window.print()}
                                type="button"
                                title="Bekijk hoe het er in PDF uitziet (browser print-dialoog → opslaan als PDF)"
                            >
                                <Printer size={14} /> Bekijk PDF
                            </button>
                        </div>
                        <style jsx global>{`
                            @media print {
                                @page { size: A4 portrait; margin: 0; }
                                body * { visibility: hidden; }
                                .menukaart-printable, .menukaart-printable * { visibility: visible; }
                                .menukaart-printable {
                                    position: absolute !important;
                                    left: 0 !important; top: 0 !important;
                                    width: 210mm !important; height: 297mm !important;
                                    transform: none !important;
                                    overflow: visible !important;
                                }
                                .menukaart-printable > * {
                                    width: 210mm !important; height: 297mm !important;
                                    box-shadow: none !important; border-radius: 0 !important;
                                }
                            }
                        `}</style>
                    </div>

                    {/* ── Right panel ── */}
                    <div className="mke-right">
                        <div className="mke-tabs">
                            <button
                                className={`mke-tab ${tab === 'properties' ? 'active' : ''}`}
                                onClick={() => setTab('properties')}
                                type="button"
                            >
                                <SlidersHorizontal size={14} /> Eigenschappen
                            </button>
                            <button
                                className={`mke-tab ${tab === 'ai' ? 'active' : ''}`}
                                onClick={() => setTab('ai')}
                                type="button"
                            >
                                <Sparkles size={14} /> AI-Coach
                            </button>
                        </div>

                        <div className="mke-scroll">
                            {tab === 'properties' ? (
                                <PropertiesPanel
                                    resolved={resolved}
                                    flat={flat}
                                    template={template}
                                    colorSummary={colorSummary}
                                    typoSummary={typoSummary}
                                    textSummary={textSummary}
                                    eventSummary={eventSummary}
                                    decoSummary={decoSummary}
                                    isPending={isPending}
                                    onChange={updateKey}
                                    onChangeMany={(values) => {
                                        setUndoStack(s => [...s, custom]);
                                        setRedoStack([]);
                                        setCustom(prev => ({ ...prev, ...values }));
                                        setSaveStatus('saving');
                                    }}
                                    onResetKey={resetKey}
                                />
                            ) : (
                                <AICoach
                                    state={aiState}
                                    prompt={aiPrompt}
                                    onPromptChange={setAiPrompt}
                                    onSubmit={async () => {
                                        if (!aiPrompt.trim()) return;
                                        aiAbortRef.current?.abort();
                                        const controller = new AbortController();
                                        aiAbortRef.current = controller;
                                        setAiState('loading');
                                        setAiError(undefined);
                                        try {
                                            const res = await fetch('/api/menukaart-editor/suggest', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                signal: controller.signal,
                                                body: JSON.stringify({
                                                    offerId,
                                                    templateId,
                                                    prompt: aiPrompt,
                                                    customOverrides: custom,
                                                }),
                                            });
                                            if (!res.ok) {
                                                const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
                                                if (res.status === 429) {
                                                    setAiError(err.error || 'Te veel verzoeken — wacht even.');
                                                } else if (res.status === 503) {
                                                    setAiError('AI niet geconfigureerd op deze omgeving.');
                                                } else {
                                                    setAiError(err.error || `Fout (${res.status})`);
                                                }
                                                setAiState('error');
                                                return;
                                            }
                                            const data = await res.json() as {
                                                summary: string;
                                                diffs: Diff[];
                                                costCents?: number;
                                                rateLimitRemaining?: number;
                                            };
                                            setDiffs(data.diffs);
                                            setAiSummary(data.summary);
                                            setAiCostCents(data.costCents);
                                            setAiRateRemaining(data.rateLimitRemaining);
                                            setAiState('result');
                                            if (data.diffs.length > 0) setCompareMode(true);
                                        } catch (e) {
                                            if ((e as Error).name === 'AbortError') return;
                                            setAiError((e as Error).message || 'Netwerk-fout');
                                            setAiState('error');
                                        }
                                    }}
                                    onCancel={() => {
                                        aiAbortRef.current?.abort();
                                        setAiState('idle');
                                        setDiffs([]);
                                        setAiSummary(undefined);
                                    }}
                                    summary={aiState === 'result' ? aiSummary : undefined}
                                    diffs={diffs}
                                    errorMessage={aiError}
                                    costCents={aiCostCents}
                                    rateLimitRemaining={aiRateRemaining}
                                    onApplyOne={(id) => {
                                        const d = diffs.find(x => x.id === id);
                                        if (d) applyDiff(d);
                                    }}
                                    onSkipOne={(id) => {
                                        setDiffs(ds => ds.map(x => (x.id === id ? { ...x, status: 'skipped' } : x)));
                                    }}
                                    onApplyAll={applyAll}
                                    onDiscardAll={() => {
                                        setDiffs([]);
                                        setAiState('idle');
                                        setAiSummary(undefined);
                                        setCompareMode(false);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <TemplatePickerSheet
                    open={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    offerId={offerId}
                    currentTemplateId={templateId}
                    currentAccent={flat.accent}
                    onSwitched={handleTemplateSwitched}
                />

                {/* Menu-canva drawer — hergebruikt de bestaande canva uit
                    /offertes (zelfde UX, zelfde dish-picker, live preview). */}
                {canMenuEdit && (
                    <MenuMenukaartCanvas
                        open={canvasOpen}
                        onClose={() => setCanvasOpen(false)}
                        contextLabel={contextLabel ?? offerLabel}
                        gerechten={gerechten ?? []}
                        gangen={gangen ?? []}
                        menuTemplates={menuTemplates ?? []}
                        initialMenuSelectie={initialMenuSelectie ?? {}}
                        templateId={templateId}
                        brandOverrides={brandOverrides}
                        customOverrides={custom}
                        logoUrl={logoUrl}
                        offerId={offerId}
                        onSave={handleCanvasSave}
                    />
                )}
            </div>
        </div>
    );
}

/* ── Sub-components ─────────────────────────── */

function Header({
    offerId,
    offerLabel,
    templateName,
    saveStatus,
    lastSavedAt,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onClose,
    onOpenPicker,
    canMenuEdit,
    onOpenMenu,
}: {
    offerId: string;
    offerLabel: string;
    templateName: string;
    saveStatus: 'saved' | 'saving' | 'error' | 'never';
    lastSavedAt: Date | null;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onClose: () => void;
    onOpenPicker: () => void;
    canMenuEdit: boolean;
    onOpenMenu: () => void;
}) {
    return (
        <header className="mke-header">
            <div className="mke-header-left">
                <div className="mke-breadcrumb">
                    <Link href="/offertes">Offertes</Link>
                    <span className="sep">/</span>
                    <Link href={`/offertes/${offerId}/view`}>{offerLabel}</Link>
                    <span className="sep">/</span>
                    <span className="current">Menukaart-editor</span>
                </div>
                <div className="mke-title-row">
                    <div className="mke-title">Menukaart aanpassen — {templateName}</div>
                    <AutosaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
                </div>
            </div>
            <div className="mke-header-actions">
                <button className="mke-icon-btn" onClick={onUndo} disabled={!canUndo} title="Ongedaan maken (⌘Z)" type="button">
                    <Undo2 size={15} />
                </button>
                <button className="mke-icon-btn" onClick={onRedo} disabled={!canRedo} title="Opnieuw (⌘⇧Z)" type="button">
                    <Redo2 size={15} />
                </button>
                <div className="mke-header-divider" />
                {canMenuEdit && (
                    <button
                        className="mke-btn-ghost"
                        type="button"
                        onClick={onOpenMenu}
                        title="Voeg gerechten toe of pas gangen aan"
                    >
                        <UtensilsCrossed size={13} /> Bewerk menu
                    </button>
                )}
                <button className="mke-btn-ghost" type="button" onClick={onOpenPicker} title="Kies een andere template">
                    <Layout size={13} /> Wisselen van template
                </button>
                <button className="mke-btn-primary" onClick={onClose} type="button">
                    <Save size={13} /> Opslaan &amp; sluiten
                </button>
            </div>
        </header>
    );
}

function AutosaveIndicator({
    status,
    lastSavedAt,
}: {
    status: 'saved' | 'saving' | 'error' | 'never';
    lastSavedAt: Date | null;
}) {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 5000);
        return () => clearInterval(id);
    }, []);
    void tick;

    if (status === 'never') return <span className="mke-autosave" style={{ color: 'var(--mke-muted-light)' }}>Nog niet gewijzigd</span>;
    if (status === 'saving') return <span className="mke-autosave"><span className="mke-autosave-dot saving" /> Opslaan…</span>;
    if (status === 'error') return <span className="mke-autosave" style={{ color: '#ef4444' }}>Opslaan mislukt</span>;
    return (
        <span className="mke-autosave">
            <span className="mke-autosave-dot" />
            {lastSavedAt ? `Automatisch opgeslagen · ${timeAgo(lastSavedAt)}` : 'Opgeslagen'}
        </span>
    );
}

function timeAgo(d: Date): string {
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 5) return 'nu';
    if (sec < 60) return `${sec} sec geleden`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min geleden`;
    return `${Math.floor(min / 60)} u geleden`;
}

function PreviewWrapper({ zoom, children }: { zoom: ZoomStep; children: React.ReactNode }) {
    const scale = zoom / 100;
    return (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', display: 'inline-block' }}>
            {children}
        </div>
    );
}

function previewProposal(flat: Overrides, diffs: Diff[]): Overrides {
    const out: Overrides = { ...flat };
    for (const d of diffs.filter(x => x.status === 'open' || x.status === 'applied')) {
        Object.assign(out, d.apply);
    }
    return out;
}

/* ── Properties panel ─────────────────────────── */

type PropertiesProps = {
    resolved: Record<keyof Overrides, Resolved<unknown>>;
    flat: Overrides;
    template: Template;
    colorSummary: string;
    typoSummary: string;
    textSummary: string;
    eventSummary: string;
    decoSummary: string;
    isPending: boolean;
    onChange: <K extends keyof Overrides>(key: K, value: Overrides[K]) => void;
    onChangeMany: (values: Partial<Overrides>) => void;
    onResetKey: (key: keyof Overrides) => void;
};

function PropertiesPanel({
    resolved,
    flat,
    template,
    colorSummary,
    typoSummary,
    textSummary,
    eventSummary,
    decoSummary,
    onChange,
    onChangeMany,
    onResetKey,
}: PropertiesProps) {
    const src = (k: keyof Overrides): CascadeSource => sourceOf(resolved, k);

    return (
        <>
            <Section icon={<Palette size={15} />} title="Kleuren" summary={colorSummary} defaultOpen>
                <ColorControl
                    label="Primary accent"
                    value={flat.accent ?? template.defaults.accent}
                    source={src('accent')}
                    onChange={v => onChange('accent', v)}
                    onReset={() => onResetKey('accent')}
                />
                <ColorControl
                    label="Achtergrond"
                    value={flat.bg ?? template.defaults.bg}
                    source={src('bg')}
                    onChange={v => onChange('bg', v)}
                    onReset={() => onResetKey('bg')}
                />
                <ColorControl
                    label="Tekst-kleur"
                    value={flat.text ?? template.defaults.text}
                    source={src('text')}
                    onChange={v => onChange('text', v)}
                    onReset={() => onResetKey('text')}
                />
            </Section>

            <Section icon={<Type size={15} />} title="Typografie" summary={typoSummary}>
                <FontControl
                    label="Heading-font"
                    value={flat.headingFont ?? template.defaults.headingFont}
                    options={template.allowList.headingFont?.options ?? [template.defaults.headingFont]}
                    source={src('headingFont')}
                    onChange={v => onChange('headingFont', v)}
                />
                <FontControl
                    label="Body-font"
                    value={flat.bodyFont ?? template.defaults.bodyFont}
                    options={template.allowList.bodyFont?.options ?? [template.defaults.bodyFont]}
                    source={src('bodyFont')}
                    onChange={v => onChange('bodyFont', v)}
                />
                <SizeControl
                    label="Heading-grootte"
                    value={flat.headingSize ?? template.defaults.headingSize}
                    min={template.allowList.headingSize?.min ?? 12}
                    max={template.allowList.headingSize?.max ?? 48}
                    source={src('headingSize')}
                    onChange={v => onChange('headingSize', v)}
                    onReset={() => onResetKey('headingSize')}
                />
                <SizeControl
                    label="Body-grootte"
                    value={flat.bodySize ?? template.defaults.bodySize}
                    min={template.allowList.bodySize?.min ?? 8}
                    max={template.allowList.bodySize?.max ?? 16}
                    source={src('bodySize')}
                    onChange={v => onChange('bodySize', v)}
                    onReset={() => onResetKey('bodySize')}
                />
                <WeightControl
                    label="Heading-weight"
                    value={flat.headingWeight ?? template.defaults.headingWeight}
                    options={template.allowList.headingWeight?.options ?? [300, 400, 500, 600, 700, 800]}
                    source={src('headingWeight')}
                    onChange={v => onChange('headingWeight', v)}
                />
            </Section>

            <Section
                icon={<ImageIcon size={15} />}
                title="Logo"
                summary={src('logoPosition') === 'custom' || src('logoSize') === 'custom' ? 'Custom' : 'Brand-default'}
            >
                {template.allowList.logoPosition && (
                    <div className="mke-row-stack">
                        <span className="mke-label">Positie</span>
                        <PositionChips
                            value={(flat.logoPosition as LogoPosition) ?? template.defaults.logoPosition}
                            onChange={v => onChange('logoPosition', v)}
                        />
                    </div>
                )}
                <SizeControl
                    label="Grootte"
                    value={flat.logoSize ?? template.defaults.logoSize}
                    min={template.allowList.logoSize?.min ?? 24}
                    max={template.allowList.logoSize?.max ?? 80}
                    source={src('logoSize')}
                    onChange={v => onChange('logoSize', v)}
                    onReset={() => onResetKey('logoSize')}
                />
            </Section>

            <Section icon={<TextCursorInput size={15} />} title="Bedrijfs-tekst" summary={textSummary}>
                <TextControl
                    label="Bedrijfsnaam"
                    value={flat.brandName ?? ''}
                    max={template.allowList.brandName?.max ?? 40}
                    source={src('brandName')}
                    onChange={v => onChange('brandName', v)}
                />
                <TextControl
                    label="Ondertitel"
                    value={flat.subtitle ?? ''}
                    max={template.allowList.subtitle?.max ?? 60}
                    source={src('subtitle')}
                    onChange={v => onChange('subtitle', v)}
                />
                {template.allowList.addressLine && (
                    <TextControl
                        label="Adres"
                        value={flat.addressLine ?? ''}
                        max={template.allowList.addressLine.max}
                        source={src('addressLine')}
                        onChange={v => onChange('addressLine', v)}
                    />
                )}
                {template.allowList.email && (
                    <TextControl
                        label="E-mail"
                        value={flat.email ?? ''}
                        max={template.allowList.email.max}
                        source={src('email')}
                        onChange={v => onChange('email', v)}
                    />
                )}
                {template.allowList.website && (
                    <TextControl
                        label="Website"
                        value={flat.website ?? ''}
                        max={template.allowList.website.max}
                        source={src('website')}
                        onChange={v => onChange('website', v)}
                    />
                )}
                <TextControl
                    label="Footer-tekst"
                    value={flat.footer ?? ''}
                    max={template.allowList.footer?.max ?? 160}
                    source={src('footer')}
                    onChange={v => onChange('footer', v)}
                />
            </Section>

            <Section icon={<Heart size={15} />} title="Persoonlijke boodschap" summary={eventSummary} defaultOpen={eventSummary !== 'Leeg'}>
                <EventMessageControl
                    title={flat.eventTitle ?? ''}
                    message={flat.eventMessage ?? ''}
                    position={(flat.eventMessagePosition as EventMessagePosition) ?? 'top'}
                    titleMax={template.allowList.eventTitle?.max ?? 80}
                    messageMax={template.allowList.eventMessage?.max ?? 300}
                    hasCustomTitle={src('eventTitle') === 'custom'}
                    hasCustomMessage={src('eventMessage') === 'custom'}
                    hasCustomPosition={src('eventMessagePosition') === 'custom'}
                    onChange={(next) => {
                        const patch: Partial<Overrides> = {};
                        if (next.title !== undefined) patch.eventTitle = next.title;
                        if (next.message !== undefined) patch.eventMessage = next.message;
                        if (next.position !== undefined) patch.eventMessagePosition = next.position;
                        onChangeMany(patch);
                    }}
                    onResetField={(field) => onResetKey(field)}
                />
            </Section>

            {(template.allowList.showAllergens || template.allowList.showOrnament || template.allowList.showDividers || template.allowList.showGhostNumbers || template.allowList.showFootnoteAllergens) && (
            <Section icon={<Sparkles size={15} />} title="Decoraties" summary={decoSummary}>
                {template.allowList.showAllergens && (
                    <ToggleControl
                        label="Allergenen op de kaart"
                        value={!!flat.showAllergens}
                        source={src('showAllergens')}
                        onChange={v => onChange('showAllergens', v)}
                    />
                )}
                {template.allowList.showOrnament && (
                    <ToggleControl
                        label="Toon ornament-randen"
                        value={flat.showOrnament !== false}
                        source={src('showOrnament')}
                        onChange={v => onChange('showOrnament', v)}
                    />
                )}
                {template.allowList.showDividers && (
                    <ToggleControl
                        label="Toon dividers tussen gangen"
                        value={flat.showDividers !== false}
                        source={src('showDividers')}
                        onChange={v => onChange('showDividers', v)}
                    />
                )}
                {template.allowList.showGhostNumbers && (
                    <ToggleControl
                        label="Toon ghost-cijfers"
                        value={flat.showGhostNumbers !== false}
                        source={src('showGhostNumbers')}
                        onChange={v => onChange('showGhostNumbers', v)}
                    />
                )}
                {template.allowList.showFootnoteAllergens && (
                    <ToggleControl
                        label="Allergenen onderaan elke gang"
                        value={flat.showFootnoteAllergens !== false}
                        source={src('showFootnoteAllergens')}
                        onChange={v => onChange('showFootnoteAllergens', v)}
                    />
                )}
            </Section>
            )}

            {/* Tenant-info hint */}
            <div className="mke-section-footnote">
                <AtSign size={11} /> Bedrijfs-tekst staat op tenant-niveau in Instellingen. Per-offerte overschrijven blijft alleen voor déze menukaart gelden.
            </div>
        </>
    );
}
