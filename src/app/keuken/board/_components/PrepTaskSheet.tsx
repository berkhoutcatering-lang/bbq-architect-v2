'use client';

import { useState } from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from '@/components/mobile/Sheet';
import { Play, Check, X, Clock, AlertTriangle, User, ChevronRight } from 'lucide-react';
import type { PrepTask, KitchenStation, Personeel, PrepTaskStatus } from '@/types/database.types';
import { ALLERGEN_META } from '@/lib/prep/allergens';
import type { Allergen } from '@/lib/allergenDetect';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    task: PrepTask | null;
    station?: KitchenStation;
    eventLabel?: string;
    eventDateLabel?: string;
    eventTimeLabel?: string;
    eventAllergens?: Allergen[];
    assigneeName?: string | null;
    personeel: Personeel[];
    /** Acties — alle return Promise<void>. */
    onStart: (taskId: number) => Promise<void>;
    onComplete: (taskId: number, actualQty?: number, notes?: string) => Promise<void>;
    onSkip: (taskId: number, reason: string) => Promise<void>;
    onSnooze: (taskId: number, minutes: number) => Promise<void>;
    onReassign: (taskId: number, newAssigneeId: string) => Promise<void>;
}

/**
 * PrepTaskSheet — bottom-sheet met details + alle acties.
 * Eén plek voor: detail-info / start-done-skip-snooze / reassign / notitie / qty-input.
 *
 * Pillar #3 (Gloved-hand): 48-56pt buttons, primary CTA 56pt.
 * Pillar #5 (Allergeen-radar): allergens chip-list met EU14 kleuren.
 */
export default function PrepTaskSheet({
    open, onOpenChange, task, station,
    eventLabel, eventDateLabel, eventTimeLabel,
    eventAllergens = [], assigneeName, personeel,
    onStart, onComplete, onSkip, onSnooze, onReassign,
}: Props) {
    const [actualQty, setActualQty] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [skipReason, setSkipReason] = useState<string>('');
    const [showSkipInput, setShowSkipInput] = useState(false);
    const [showReassign, setShowReassign] = useState(false);

    if (!task) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange} variant="bottom">
                <SheetContent />
            </Sheet>
        );
    }

    const status: PrepTaskStatus = (task.status as PrepTaskStatus) ?? 'planned';
    const isDone = status === 'done' || status === 'skipped';

    async function handleStart() {
        if (!task) return;
        await onStart(task.id);
        onOpenChange(false);
    }

    async function handleComplete() {
        if (!task) return;
        const qty = actualQty ? parseFloat(actualQty) : undefined;
        await onComplete(task.id, Number.isFinite(qty) ? qty : undefined, notes || undefined);
        setActualQty('');
        setNotes('');
        onOpenChange(false);
    }

    async function handleSkip() {
        if (!task) return;
        const reason = skipReason.trim();
        if (!reason) return;
        await onSkip(task.id, reason);
        setSkipReason('');
        setShowSkipInput(false);
        onOpenChange(false);
    }

    async function handleSnooze(minutes: number) {
        if (!task) return;
        await onSnooze(task.id, minutes);
        onOpenChange(false);
    }

    async function handleReassign(newId: string) {
        if (!task) return;
        await onReassign(task.id, newId);
        setShowReassign(false);
        onOpenChange(false);
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange} variant="bottom">
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>{task.text || `Taak #${task.id}`}</SheetTitle>
                    <SheetDescription>
                        {[eventLabel, eventDateLabel, eventTimeLabel].filter(Boolean).join(' · ')}
                    </SheetDescription>
                </SheetHeader>

                <SheetBody>
                    {/* Meta-grid */}
                    <div className="prep-sheet__meta">
                        {station && (
                            <div className="prep-sheet__meta-row">
                                <span className="prep-sheet__meta-label">Station</span>
                                <span className="prep-sheet__meta-value" style={{ color: station.color }}>
                                    {station.name}
                                </span>
                            </div>
                        )}
                        {task.phase && task.phase !== 'other' && (
                            <div className="prep-sheet__meta-row">
                                <span className="prep-sheet__meta-label">Phase</span>
                                <span className="prep-sheet__meta-value">{task.phase}</span>
                            </div>
                        )}
                        {task.target_qty != null && (
                            <div className="prep-sheet__meta-row">
                                <span className="prep-sheet__meta-label">Target</span>
                                <span className="prep-sheet__meta-value">
                                    {task.target_qty} {task.target_unit || ''}
                                </span>
                            </div>
                        )}
                        {task.scheduled_at && (
                            <div className="prep-sheet__meta-row">
                                <span className="prep-sheet__meta-label">Klaar om</span>
                                <span className="prep-sheet__meta-value">
                                    {formatDateTime(task.scheduled_at)}
                                </span>
                            </div>
                        )}
                        <div className="prep-sheet__meta-row">
                            <span className="prep-sheet__meta-label">Toegewezen</span>
                            <span className="prep-sheet__meta-value">{assigneeName || 'Niemand'}</span>
                        </div>
                    </div>

                    {/* Allergens chips */}
                    {eventAllergens.length > 0 && (
                        <div className="prep-sheet__section">
                            <h3 className="prep-sheet__section-title">
                                <AlertTriangle size={14} /> Allergenen op dit event
                            </h3>
                            <div className="prep-sheet__chips">
                                {eventAllergens.map((code) => {
                                    const meta = ALLERGEN_META[code];
                                    if (!meta) return null;
                                    return (
                                        <span
                                            key={code}
                                            className="prep-sheet__chip"
                                            style={{ borderColor: `var(--${meta.color}, var(--muted))`, color: `var(--${meta.color}, var(--text))` }}
                                            title={meta.description}
                                        >
                                            {meta.badge} · {meta.label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notes existing */}
                    {task.notes && (
                        <div className="prep-sheet__section">
                            <h3 className="prep-sheet__section-title">Notities</h3>
                            <p className="prep-sheet__notes">{task.notes}</p>
                        </div>
                    )}

                    {/* Complete inputs (alleen tonen als status in_progress en niet done) */}
                    {!isDone && status === 'in_progress' && (
                        <div className="prep-sheet__section">
                            <h3 className="prep-sheet__section-title">Bij afronden (optioneel)</h3>
                            <label className="prep-sheet__field">
                                <span>Werkelijke hoeveelheid</span>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.01"
                                    min="0"
                                    placeholder={task.target_qty?.toString() ?? '0'}
                                    value={actualQty}
                                    onChange={(e) => setActualQty(e.target.value)}
                                />
                                {task.target_unit && <span className="prep-sheet__field-suffix">{task.target_unit}</span>}
                            </label>
                            <label className="prep-sheet__field">
                                <span>Notitie</span>
                                <input
                                    type="text"
                                    maxLength={500}
                                    placeholder="bv. iets meer rub gebruikt"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </label>
                        </div>
                    )}

                    {/* Skip reason inline form */}
                    {showSkipInput && (
                        <div className="prep-sheet__section">
                            <h3 className="prep-sheet__section-title">Reden voor overslaan</h3>
                            <input
                                type="text"
                                className="prep-sheet__skip-reason"
                                maxLength={250}
                                placeholder="bv. event afgezegd, vervangen door X"
                                value={skipReason}
                                onChange={(e) => setSkipReason(e.target.value)}
                                autoFocus
                            />
                            <div className="prep-sheet__inline-actions">
                                <button className="prep-sheet__secondary" onClick={() => { setShowSkipInput(false); setSkipReason(''); }}>
                                    Annuleren
                                </button>
                                <button
                                    className="prep-sheet__danger"
                                    onClick={handleSkip}
                                    disabled={!skipReason.trim()}
                                >
                                    Sla over
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reassign inline form */}
                    {showReassign && (
                        <div className="prep-sheet__section">
                            <h3 className="prep-sheet__section-title">Toewijzen aan</h3>
                            <div className="prep-sheet__personeel-list">
                                {personeel.filter((p) => p.actief).map((p) => (
                                    <button
                                        key={p.id}
                                        className="prep-sheet__personeel-row"
                                        onClick={() => handleReassign(p.id)}
                                    >
                                        <User size={16} />
                                        <span>{p.naam}</span>
                                        <span className="prep-sheet__personeel-functie">{p.functie}</span>
                                        <ChevronRight size={14} />
                                    </button>
                                ))}
                            </div>
                            <button className="prep-sheet__secondary" onClick={() => setShowReassign(false)}>
                                Annuleren
                            </button>
                        </div>
                    )}

                    {/* Secondary actions */}
                    {!isDone && !showSkipInput && !showReassign && (
                        <div className="prep-sheet__section prep-sheet__secondary-row">
                            <button className="prep-sheet__secondary" onClick={() => handleSnooze(15)}>
                                <Clock size={16} /> Snooze 15m
                            </button>
                            <button className="prep-sheet__secondary" onClick={() => handleSnooze(60)}>
                                <Clock size={16} /> 1u
                            </button>
                            <button className="prep-sheet__secondary" onClick={() => setShowReassign(true)}>
                                <User size={16} /> Toewijzen
                            </button>
                            <button className="prep-sheet__secondary" onClick={() => setShowSkipInput(true)}>
                                <X size={16} /> Sla over
                            </button>
                        </div>
                    )}
                </SheetBody>

                {!isDone && !showSkipInput && !showReassign && (
                    <SheetFooter>
                        {status === 'in_progress' ? (
                            <button className="prep-sheet__primary" onClick={handleComplete}>
                                <Check size={20} /> Markeer klaar
                            </button>
                        ) : (
                            <button className="prep-sheet__primary" onClick={handleStart}>
                                <Play size={20} /> Start prep
                            </button>
                        )}
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
}

function formatDateTime(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString('nl-NL', {
            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}
