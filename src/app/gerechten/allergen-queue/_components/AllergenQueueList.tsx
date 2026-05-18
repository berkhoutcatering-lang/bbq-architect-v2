'use client';

import { useState, useTransition } from 'react';
import { Check, X, ShieldCheck, Sparkles, ChefHat, ShoppingBag, Loader2 } from 'lucide-react';
import {
    confirmComponentAllergen,
    rejectComponentAllergen,
    bulkConfirmComponent,
} from '../actions';

export interface QueueItem {
    componentId: number;
    componentName: string;
    componentType: 'prepared' | 'bought_in';
    allergens: Array<{ code: string; label: string }>;
}

interface Props {
    items: QueueItem[];
}

interface RowState {
    processing: Set<string>; // "componentId:code"
    bulkProcessing: Set<number>;
    errors: Map<string, string>;
}

const TYPE_LABEL: Record<'prepared' | 'bought_in', string> = {
    prepared: 'Zelf-bereid',
    bought_in: 'Inkoop',
};

export default function AllergenQueueList({ items }: Props) {
    const [, startTransition] = useTransition();
    const [state, setState] = useState<RowState>({
        processing: new Set(),
        bulkProcessing: new Set(),
        errors: new Map(),
    });

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

    function handleConfirm(componentId: number, code: string) {
        const key = `${componentId}:${code}`;
        setError(key, null);
        setProcessing(key, true);
        startTransition(async () => {
            const res = await confirmComponentAllergen(componentId, code);
            setProcessing(key, false);
            // Use 'in' operator for discriminated-union narrowing (Next.js Server Action types)
            if ('error' in res) setError(key, res.error);
            // Bij success: revalidatePath in de action zorgt voor server re-fetch
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

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            {items.map((item) => {
                const bulkKey = `bulk:${item.componentId}`;
                const bulkError = state.errors.get(bulkKey);
                const isBulkProcessing = state.bulkProcessing.has(item.componentId);

                return (
                    <div
                        key={item.componentId}
                        className="card"
                        style={{
                            padding: 'var(--space-4)',
                            display: 'grid',
                            gap: 12,
                        }}
                    >
                        {/* Header: component-naam + type + bulk-knop */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
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
                                const key = `${item.componentId}:${a.code}`;
                                const isProcessing = state.processing.has(key);
                                const err = state.errors.get(key);
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
                                            opacity: isProcessing ? 0.6 : 1,
                                        }}
                                        title={err ?? `Code: ${a.code} — bevestig of verwerp`}
                                    >
                                        <span aria-hidden>{a.code}</span>
                                        <span>{a.label}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleConfirm(item.componentId, a.code)}
                                            disabled={isProcessing}
                                            aria-label={`Bevestig ${a.label}`}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 6,
                                                background: 'rgba(0,212,161,.12)',
                                                border: '1px solid rgba(0,212,161,.30)',
                                                color: '#00d4a1',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: isProcessing ? 'wait' : 'pointer',
                                            }}
                                        >
                                            <Check size={14} aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleReject(item.componentId, a.code)}
                                            disabled={isProcessing}
                                            aria-label={`Verwerp ${a.label}`}
                                            style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 6,
                                                background: 'rgba(239,68,68,.08)',
                                                border: '1px solid rgba(239,68,68,.25)',
                                                color: '#ef4444',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: isProcessing ? 'wait' : 'pointer',
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
