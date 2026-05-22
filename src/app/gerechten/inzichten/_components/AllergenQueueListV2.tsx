'use client';

import { useState, useTransition, useMemo } from 'react';
import { Check, X, ShieldCheck, Sparkles, ChefHat, ShoppingBag, Loader2, CheckSquare, Square } from 'lucide-react';
import {
    confirmComponentAllergen,
    rejectComponentAllergen,
    bulkConfirmComponent,
} from '../actions';
import type { QueueItem } from '../_lib/loadInsights';

interface Props {
    items: QueueItem[];
}

interface RowState {
    processing: Set<string>;     // per chip "componentId:code"
    bulkProcessing: Set<number>; // per component
    errors: Map<string, string>;
    /* Multi-select state: componentIds die door de gebruiker gechecked zijn. */
    selected: Set<number>;
}

const TYPE_LABEL: Record<'prepared' | 'bought_in', string> = {
    prepared: 'Zelf-bereid',
    bought_in: 'Inkoop',
};

/**
 * Bulk-confirm versie van AllergenQueueList — Sprint 3 A8.
 *
 * Bovenop de per-chip confirm/reject + per-component bulk-confirm uit V1, voegt
 * deze versie multi-select toe: vink meerdere componenten aan + één klik
 * "Bevestig N componenten" → batch van per-component bulk-confirm Server Action
 * calls. Geen mass-confirm-all knop om accidental bulk-confirms te voorkomen.
 */
export default function AllergenQueueListV2({ items }: Props) {
    const [, startTransition] = useTransition();
    const [state, setState] = useState<RowState>({
        processing: new Set(),
        bulkProcessing: new Set(),
        errors: new Map(),
        selected: new Set(),
    });

    const allIds = useMemo(() => items.map((i) => i.componentId), [items]);
    const allSelected = state.selected.size > 0 && state.selected.size === allIds.length;
    const someSelected = state.selected.size > 0 && !allSelected;

    function setProcessing(key: string, on: boolean) {
        setState((prev) => {
            const next = new Set(prev.processing);
            if (on) next.add(key); else next.delete(key);
            return { ...prev, processing: next };
        });
    }

    function setBulkProcessing(id: number, on: boolean) {
        setState((prev) => {
            const next = new Set(prev.bulkProcessing);
            if (on) next.add(id); else next.delete(id);
            return { ...prev, bulkProcessing: next };
        });
    }

    function setError(key: string, msg: string | null) {
        setState((prev) => {
            const next = new Map(prev.errors);
            if (msg) next.set(key, msg); else next.delete(key);
            return { ...prev, errors: next };
        });
    }

    function toggleSelect(componentId: number) {
        setState((prev) => {
            const next = new Set(prev.selected);
            if (next.has(componentId)) next.delete(componentId); else next.add(componentId);
            return { ...prev, selected: next };
        });
    }

    function toggleSelectAll() {
        setState((prev) => ({
            ...prev,
            selected: allSelected ? new Set() : new Set(allIds),
        }));
    }

    function handleConfirm(componentId: number, code: string) {
        const key = `${componentId}:${code}`;
        setError(key, null);
        setProcessing(key, true);
        startTransition(async () => {
            const res = await confirmComponentAllergen(componentId, code);
            setProcessing(key, false);
            if ('error' in res) setError(key, res.error);
        });
    }

    function handleReject(componentId: number, code: string) {
        const key = `${componentId}:${code}`;
        setError(key, null);
        setProcessing(key, true);
        startTransition(async () => {
            const res = await rejectComponentAllergen(componentId, code);
            setProcessing(key, false);
            if ('error' in res) setError(key, res.error);
        });
    }

    function handleBulkConfirm(componentId: number) {
        const key = `bulk:${componentId}`;
        setError(key, null);
        setBulkProcessing(componentId, true);
        startTransition(async () => {
            const res = await bulkConfirmComponent(componentId);
            setBulkProcessing(componentId, false);
            if ('error' in res) setError(key, res.error);
        });
    }

    function handleBulkConfirmSelected() {
        const ids = Array.from(state.selected);
        if (ids.length === 0) return;
        setError('multi-bulk', null);
        startTransition(async () => {
            for (const id of ids) setBulkProcessing(id, true);
            const results = await Promise.all(ids.map((id) => bulkConfirmComponent(id)));
            for (const id of ids) setBulkProcessing(id, false);
            const failures = results
                .map((r, i) => ('error' in r ? { id: ids[i], error: r.error } : null))
                .filter((x): x is { id: number; error: string } => x !== null);
            if (failures.length > 0) {
                setError('multi-bulk', `${failures.length}/${ids.length} mislukt: ${failures.map((f) => f.error).join(', ')}`);
            } else {
                setState((prev) => ({ ...prev, selected: new Set() }));
            }
        });
    }

    if (items.length === 0) {
        return (
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)', borderLeft: '3px solid #00d4a1' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#00d4a1', marginBottom: 4 }}>
                    <Check size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
                    Alles up-to-date
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Geen openstaande AI-suggesties — je componenten-allergens zijn allemaal bevestigd of leeg.
                </div>
            </div>
        );
    }

    const multiBulkError = state.errors.get('multi-bulk');
    const anySelectedProcessing = Array.from(state.selected).some((id) => state.bulkProcessing.has(id));

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {/* Selectie-toolbar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: state.selected.size > 0 ? 'rgba(0,212,161,.08)' : 'rgba(255,255,255,.02)',
                    border: `1px solid ${state.selected.size > 0 ? 'rgba(0,212,161,.3)' : 'var(--border)'}`,
                    flexWrap: 'wrap',
                }}
            >
                <button
                    type="button"
                    onClick={toggleSelectAll}
                    aria-label={allSelected ? 'Selecteer niets' : 'Selecteer alle componenten in queue'}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 10px', borderRadius: 6,
                        background: 'transparent', border: '1px solid var(--border)',
                        color: 'var(--text)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', minHeight: 36,
                    }}
                >
                    {allSelected ? <CheckSquare size={14} aria-hidden /> : someSelected ? <CheckSquare size={14} aria-hidden style={{ opacity: 0.5 }} /> : <Square size={14} aria-hidden />}
                    {allSelected ? 'Deselecteer alles' : `Selecteer alle ${allIds.length}`}
                </button>
                {state.selected.size > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {state.selected.size} van {allIds.length} geselecteerd
                    </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {multiBulkError && (
                        <span style={{ fontSize: 12, color: '#ef4444' }}>
                            {multiBulkError}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleBulkConfirmSelected}
                        disabled={state.selected.size === 0 || anySelectedProcessing}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '8px 14px', borderRadius: 8,
                            background: state.selected.size === 0 ? 'rgba(255,255,255,.05)' : 'rgba(0,212,161,.12)',
                            border: `1px solid ${state.selected.size === 0 ? 'var(--border)' : 'rgba(0,212,161,.35)'}`,
                            color: state.selected.size === 0 ? 'var(--muted)' : '#00d4a1',
                            fontSize: 12, fontWeight: 700,
                            cursor: state.selected.size === 0 ? 'not-allowed' : (anySelectedProcessing ? 'wait' : 'pointer'),
                            minHeight: 40,
                            opacity: anySelectedProcessing ? 0.6 : 1,
                        }}
                        aria-label={state.selected.size === 0 ? 'Selecteer eerst componenten' : `Bevestig ${state.selected.size} componenten`}
                    >
                        {anySelectedProcessing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />}
                        Bevestig {state.selected.size > 0 ? state.selected.size : ''} componenten
                    </button>
                </div>
            </div>

            {/* Rows */}
            {items.map((item) => {
                const bulkKey = `bulk:${item.componentId}`;
                const bulkError = state.errors.get(bulkKey);
                const isBulkProcessing = state.bulkProcessing.has(item.componentId);
                const isSelected = state.selected.has(item.componentId);

                return (
                    <div
                        key={item.componentId}
                        className="card"
                        style={{
                            padding: 'var(--space-4)',
                            display: 'grid',
                            gap: 12,
                            outline: isSelected ? '2px solid rgba(0,212,161,.4)' : 'none',
                            outlineOffset: 0,
                        }}
                    >
                        {/* Header: checkbox + naam + type + bulk-knop */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => toggleSelect(item.componentId)}
                                aria-label={isSelected ? `Deselecteer ${item.componentName}` : `Selecteer ${item.componentName}`}
                                aria-pressed={isSelected}
                                style={{
                                    width: 28, height: 28, borderRadius: 6,
                                    background: isSelected ? 'rgba(0,212,161,.15)' : 'transparent',
                                    border: `1px solid ${isSelected ? 'rgba(0,212,161,.4)' : 'var(--border)'}`,
                                    color: isSelected ? '#00d4a1' : 'var(--muted)',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }}
                            >
                                {isSelected ? <CheckSquare size={14} aria-hidden /> : <Square size={14} aria-hidden />}
                            </button>
                            <div
                                aria-hidden
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    background: item.componentType === 'prepared' ? 'rgba(255,191,0,.10)' : 'rgba(99,179,237,.10)',
                                    border: `1px solid ${item.componentType === 'prepared' ? 'rgba(255,191,0,.25)' : 'rgba(99,179,237,.25)'}`,
                                    color: item.componentType === 'prepared' ? '#FFBF00' : '#63b3ed',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                }}
                            >
                                {item.componentType === 'prepared' ? <ChefHat size={16} /> : <ShoppingBag size={16} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                                    {item.componentName}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Sparkles size={11} aria-hidden />
                                    AI stelt {item.allergens.length} {item.allergens.length === 1 ? 'allergeen' : 'allergens'} voor
                                    <span aria-hidden>·</span>
                                    <span>{TYPE_LABEL[item.componentType]}</span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleBulkConfirm(item.componentId)}
                                disabled={isBulkProcessing}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '8px 14px',
                                    borderRadius: 8,
                                    background: 'rgba(0,212,161,.10)',
                                    border: '1px solid rgba(0,212,161,.30)',
                                    color: '#00d4a1',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: isBulkProcessing ? 'wait' : 'pointer',
                                    minHeight: 44,
                                    opacity: isBulkProcessing ? 0.6 : 1,
                                }}
                                aria-label={`Bevestig alle ${item.allergens.length} allergens voor ${item.componentName}`}
                            >
                                {isBulkProcessing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} aria-hidden />}
                                Alles bevestigen
                            </button>
                        </div>

                        {/* Allergen-chips met confirm/reject per chip */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {item.allergens.map((a) => {
                                const chipKey = `${item.componentId}:${a.code}`;
                                const isChipProcessing = state.processing.has(chipKey);
                                const err = state.errors.get(chipKey);
                                return (
                                    <div
                                        key={a.code}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '6px 8px 6px 12px',
                                            borderRadius: 8,
                                            background: 'rgba(245,158,11,.06)',
                                            border: '1px dashed rgba(245,158,11,.35)',
                                            color: '#fbbf24',
                                            fontSize: 12,
                                            fontWeight: 600,
                                            opacity: isChipProcessing ? 0.6 : 1,
                                        }}
                                        title={err ?? `Code: ${a.code} — bevestig of verwerp`}
                                    >
                                        <span aria-hidden>{a.code}</span>
                                        <span>{a.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleConfirm(item.componentId, a.code)}
                                            disabled={isChipProcessing}
                                            aria-label={`Bevestig ${a.label}`}
                                            style={{
                                                width: 28, height: 28, borderRadius: 6,
                                                background: 'rgba(0,212,161,.12)',
                                                border: '1px solid rgba(0,212,161,.30)',
                                                color: '#00d4a1',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: isChipProcessing ? 'wait' : 'pointer',
                                            }}
                                        >
                                            <Check size={14} aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleReject(item.componentId, a.code)}
                                            disabled={isChipProcessing}
                                            aria-label={`Verwerp ${a.label}`}
                                            style={{
                                                width: 28, height: 28, borderRadius: 6,
                                                background: 'rgba(239,68,68,.08)',
                                                border: '1px solid rgba(239,68,68,.25)',
                                                color: '#ef4444',
                                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: isChipProcessing ? 'wait' : 'pointer',
                                            }}
                                        >
                                            <X size={14} aria-hidden />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {bulkError && (
                            <div style={{ fontSize: 12, color: '#ef4444' }}>
                                Bulk-actie mislukt: {bulkError}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
