'use client';

import { useState, useMemo, useRef } from 'react';
import { Play, Check, Clock, AlertTriangle, MoreHorizontal, User, ChevronRight } from 'lucide-react';
import type { PrepTask, KitchenStation, PrepTaskStatus } from '@/types/database.types';
import { ALLERGEN_META, primaryAllergen, highestSeverity } from '@/lib/prep/allergens';
import type { Allergen } from '@/lib/allergenDetect';

interface Props {
    task: PrepTask;
    /** Station info — kleur + naam voor context-strip. */
    station?: KitchenStation;
    /** Event-naam + datum + start_time voor context-regel. */
    eventLabel?: string;
    eventDateLabel?: string;
    eventTimeLabel?: string;
    /** Allergenen die op dit event van toepassing zijn (pin op kaart bovenaan). */
    eventAllergens?: Allergen[];
    eventAllergenSeverity?: 'normal' | 'high' | 'critical';
    /** Assignee-naam — uit personeel-tabel join. */
    assigneeName?: string | null;
    /** Of de huidige user de assignee is — voor "Mijn taken" highlight. */
    isMine?: boolean;
    /** Primary action — context-aware: start/done/(re)assign. */
    onPrimaryAction: () => void;
    /** Secondary menu opener. */
    onOpenMenu?: () => void;
    /** Open detail-sheet. */
    onExpand?: () => void;
    /** Swipe-rechts = done met undo-toast. */
    onSwipeRight?: () => void;
    /** Swipe-links = snooze 15m. */
    onSwipeLeft?: () => void;
}

/* Swipe-thresholds: pixel-afstand om de gesture als "intentioneel" te tellen.
   Te laag = mis-touches; te hoog = frustratie. 80px is sweet spot voor
   tablet met handschoenen (zie Pillar #3 — gloved-hand). */
const SWIPE_THRESHOLD_PX = 80;
const SWIPE_MAX_VERTICAL_PX = 40; // verticale beweging mag niet te groot zijn (anders is het scroll)

const STATUS_TOKEN: Record<PrepTaskStatus, { label: string; pillClass: string; icon: typeof Clock }> = {
    planned:     { label: 'Gepland',    pillClass: 'pill-zinc',  icon: Clock },
    queued:      { label: 'Te doen',    pillClass: 'pill-brand', icon: Play },
    in_progress: { label: 'Bezig',      pillClass: 'pill-amber', icon: Clock },
    done:        { label: 'Klaar',      pillClass: 'pill-green', icon: Check },
    skipped:     { label: 'Overgeslagen', pillClass: 'pill-zinc',  icon: AlertTriangle },
    blocked:     { label: 'Geblokkeerd', pillClass: 'pill-purple', icon: AlertTriangle },
};

const PRIMARY_LABEL: Record<PrepTaskStatus, string> = {
    planned: 'Start prep',
    queued: 'Start prep',
    in_progress: 'Markeer klaar',
    done: '✓ Klaar',
    skipped: 'Hervat',
    blocked: 'Wacht op…',
};

/**
 * PrepTaskCard — kaart op het Prep-KDS.
 *
 * Pillar #3 (Gloved-hand): 64pt primary button, swipe-friendly via parent.
 * Pillar #5 (Allergeen-radar): allergeen-bandje bij kritieke gevallen,
 *   gebruikt de EU-14 allergens-meta voor consistent icon/color.
 *
 * Status-flow: planned → queued → in_progress → done / skipped / blocked
 */
export default function PrepTaskCard({
    task, station, eventLabel, eventDateLabel, eventTimeLabel,
    eventAllergens = [], eventAllergenSeverity,
    assigneeName, isMine,
    onPrimaryAction, onOpenMenu, onExpand,
    onSwipeRight, onSwipeLeft,
}: Props) {
    const status: PrepTaskStatus = (task.status as PrepTaskStatus) ?? 'planned';
    const statusMeta = STATUS_TOKEN[status];
    const StatusIcon = statusMeta.icon;
    const isDone = status === 'done' || status === 'skipped';

    const countdown = useCountdown(task.scheduled_at, isDone);
    const lateClass = countdown?.lateLevel
        ? `prep-task--late-${countdown.lateLevel}`
        : '';

    const primary = primaryAllergen(eventAllergens);
    const primaryMeta = primary ? ALLERGEN_META[primary] : null;
    const severity = eventAllergenSeverity ?? highestSeverity(eventAllergens);
    /* Audit Bundel 3 — allergen-band ALTIJD zichtbaar als er allergenen zijn,
       niet alleen bij critical. Severity bepaalt de kleur via data-attribute
       (geel = normal, oranje = high, rood = critical). Voorheen was lactose/ei
       verstopt in de detail-sheet — risico op gemist worden tijdens prep. */
    const showAllergenBand = eventAllergens.length > 0;

    const qtyDisplay = formatQty(task);

    /* Swipe-state: track start-coords + live offset voor visual feedback. */
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [swipeOffset, setSwipeOffset] = useState(0);
    const swipeEnabled = !isDone && (onSwipeRight || onSwipeLeft);

    function handleTouchStart(e: React.TouchEvent) {
        if (!swipeEnabled) return;
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };

        if (onOpenMenu) {
            longPressTimerRef.current = setTimeout(() => {
                if (touchStartRef.current) {
                    // Vibrate if available (haptic feedback)
                    try { navigator.vibrate?.(20); } catch { /* noop */ }
                    onOpenMenu();
                    touchStartRef.current = null;
                }
            }, 450);
        }
    }

    function handleTouchMove(e: React.TouchEvent) {
        if (!swipeEnabled || !touchStartRef.current) return;
        const t = e.touches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = Math.abs(t.clientY - touchStartRef.current.y);

        // Cancel long-press as soon as user starts moving
        if ((Math.abs(dx) > 8 || dy > 8) && longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        // Verticale beweging → laat scrollen door, geen swipe-tracking
        if (dy > SWIPE_MAX_VERTICAL_PX) {
            setSwipeOffset(0);
            return;
        }

        // Beperk visueel tot ±150px voor zachte feel
        const clamped = Math.max(-150, Math.min(150, dx));
        setSwipeOffset(clamped);
    }

    function handleTouchEnd() {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (!swipeEnabled || !touchStartRef.current) {
            setSwipeOffset(0);
            touchStartRef.current = null;
            return;
        }
        const offset = swipeOffset;
        setSwipeOffset(0);
        touchStartRef.current = null;
        if (offset >= SWIPE_THRESHOLD_PX && onSwipeRight) {
            onSwipeRight();
        } else if (offset <= -SWIPE_THRESHOLD_PX && onSwipeLeft) {
            onSwipeLeft();
        }
    }

    function handleTouchCancel() {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        setSwipeOffset(0);
        touchStartRef.current = null;
    }

    const swipeAction =
        swipeOffset >= SWIPE_THRESHOLD_PX ? 'done' :
        swipeOffset <= -SWIPE_THRESHOLD_PX ? 'snooze' : null;

    return (
        <div
            className={`prep-task ${lateClass} ${isMine ? 'is-mine' : ''} ${isDone ? 'is-done' : ''} ${swipeAction ? `is-swiping-${swipeAction}` : swipeOffset !== 0 ? 'is-swiping' : ''}`}
            data-status={status}
            data-phase={task.phase ?? 'other'}
            style={{
                ...(station ? ({ '--station-color': station.color } as React.CSSProperties) : {}),
                transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
                transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : undefined,
            }}
            onClick={onExpand}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onContextMenu={(e) => { e.preventDefault(); onOpenMenu?.(); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter') onExpand?.();
            }}
        >
            {showAllergenBand && primaryMeta && (
                <div
                    className="prep-task__allergen-band"
                    data-severity={severity}
                    aria-label={`Allergenen: ${primaryMeta.label}${eventAllergens.length > 1 ? ` en ${eventAllergens.length - 1} andere` : ''}`}
                >
                    <AlertTriangle size={12} aria-hidden />
                    <span>{primaryMeta.label.toUpperCase()}</span>
                    {eventAllergens.length > 1 && (
                        <span className="prep-task__allergen-extra">+{eventAllergens.length - 1}</span>
                    )}
                </div>
            )}

            <div className="prep-task__context">
                {eventLabel && <span className="prep-task__event">{eventLabel}</span>}
                <span className="prep-task__dot" aria-hidden>·</span>
                {eventDateLabel && <span>{eventDateLabel}</span>}
                {eventTimeLabel && (
                    <>
                        <span className="prep-task__dot" aria-hidden>·</span>
                        <span>{eventTimeLabel}</span>
                    </>
                )}
            </div>

            <div className="prep-task__title-row">
                <h3 className="prep-task__title">{task.text || `Taak #${task.id}`}</h3>
                {station && (
                    <span className="prep-task__station" style={{ color: station.color }}>
                        {station.name}
                    </span>
                )}
            </div>

            <div className="prep-task__meta">
                {qtyDisplay && <span className="prep-task__qty">{qtyDisplay}</span>}
                {countdown && (
                    <span className={`prep-task__countdown prep-task__countdown--${countdown.lateLevel ?? 'normal'}`}>
                        <Clock size={12} />
                        {countdown.label}
                    </span>
                )}
                <span className={`prep-task__status prep-pill ${statusMeta.pillClass}`}>
                    <StatusIcon size={12} />
                    {statusMeta.label}
                </span>
            </div>

            <div className="prep-task__bottom">
                <span className="prep-task__assignee">
                    <User size={14} />
                    {assigneeName || 'Niemand'}
                </span>
                <div className="prep-task__actions">
                    {onOpenMenu && (
                        <button
                            className="prep-task__menu"
                            onClick={(e) => { e.stopPropagation(); onOpenMenu(); }}
                            aria-label="Meer opties"
                        >
                            <MoreHorizontal size={18} />
                        </button>
                    )}
                    <button
                        className={`prep-task__primary prep-task__primary--${status}`}
                        onClick={(e) => { e.stopPropagation(); onPrimaryAction(); }}
                        disabled={status === 'done'}
                    >
                        <span>{PRIMARY_LABEL[status]}</span>
                        {status !== 'done' && <ChevronRight size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ─── Helpers ──────────────────────────────────────────────── */

interface CountdownInfo {
    label: string;
    /** null = geen urgentie; 'soon' = brand-pulse; 'late' = rood-pulse; 'critical' = rood-static */
    lateLevel: null | 'soon' | 'late' | 'critical';
}

function useCountdown(scheduledAt: string | null | undefined, isDone: boolean): CountdownInfo | null {
    return useMemo(() => {
        if (!scheduledAt || isDone) return null;
        const target = new Date(scheduledAt).getTime();
        if (!Number.isFinite(target)) return null;
        const diffMs = target - Date.now();
        const absMin = Math.abs(Math.round(diffMs / 60_000));
        const future = diffMs > 0;
        const label = future
            ? `nog ${formatDuration(absMin)}`
            : `🔥 ${formatDuration(absMin)} te laat`;
        let lateLevel: CountdownInfo['lateLevel'] = null;
        if (future) {
            if (absMin <= 30) lateLevel = 'soon';
        } else {
            lateLevel = absMin <= 30 ? 'late' : 'critical';
        }
        return { label, lateLevel };
    }, [scheduledAt, isDone]);
}

function formatDuration(min: number): string {
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m === 0 ? `${h}u` : `${h}u ${m}m`;
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return hr === 0 ? `${d}d` : `${d}d ${hr}u`;
}

function formatQty(t: PrepTask): string | null {
    const qty = t.actual_qty ?? t.target_qty;
    if (qty == null) return null;
    const unit = t.target_unit || '';
    const rounded = Math.round(qty * 100) / 100;
    return `${rounded} ${unit}`.trim();
}
