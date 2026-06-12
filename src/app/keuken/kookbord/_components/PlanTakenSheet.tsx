'use client';

import { useMemo, useState } from 'react';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody,
} from '@/components/mobile/Sheet';
import { CalendarPlus, Check, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import type { DbEvent, PrepTask } from '@/types/database.types';

/**
 * PlanTakenSheet — de ontbrekende schakel tussen events en het kookbord.
 *
 * De backend-generator (bulkScheduleEventPrep) bestond al en draait bij
 * offerte-acceptatie, maar er was geen enkele plek in de UI die hem kon
 * aanroepen voor bestaande events. Deze sheet toont komende events met hun
 * taak-stand en laat per event taken genereren via /api/prep/bulk-schedule
 * (zelfde code-pad, withTenantAuth + audit-log).
 */

interface PlanResult {
    status: 'busy' | 'done' | 'error';
    message?: string;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    events: DbEvent[];
    tasks: PrepTask[];
    /** Na succesvolle generatie — parent doet een refetch van prep_tasks. */
    onPlanned: () => void;
}

export default function PlanTakenSheet({ open, onOpenChange, events, tasks, onPlanned }: Props) {
    const [results, setResults] = useState<Record<number, PlanResult>>({});

    const upcoming = useMemo(() => {
        const t0 = new Date();
        t0.setHours(0, 0, 0, 0);
        return events
            .filter((e) => {
                if (!e.date) return false;
                const t = new Date(e.date).getTime();
                return Number.isFinite(t) && t >= t0.getTime();
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 12);
    }, [events]);

    const taskCountByEvent = useMemo(() => {
        const m = new Map<number, number>();
        for (const t of tasks) m.set(t.event_id, (m.get(t.event_id) ?? 0) + 1);
        return m;
    }, [tasks]);

    async function plan(eventId: number, force: boolean) {
        if (force) {
            const ok = window.confirm(
                'Automatisch geplande taken voor dit event worden verwijderd en opnieuw aangemaakt. Handmatige taken blijven staan. Doorgaan?',
            );
            if (!ok) return;
        }
        setResults((p) => ({ ...p, [eventId]: { status: 'busy' } }));
        try {
            const res = await fetch('/api/prep/bulk-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId, force }),
            });
            const data = await res.json().catch(() => null) as
                | { taskCount?: number; error?: string }
                | null;
            if (!res.ok) {
                setResults((p) => ({
                    ...p,
                    [eventId]: { status: 'error', message: data?.error || 'Plannen mislukt' },
                }));
                return;
            }
            const n = data?.taskCount ?? 0;
            setResults((p) => ({
                ...p,
                [eventId]: {
                    status: 'done',
                    message: n > 0
                        ? `${n} ${n === 1 ? 'taak' : 'taken'} op het bord`
                        : 'Al gepland — geen nieuwe taken',
                },
            }));
            if (n > 0) onPlanned();
        } catch {
            setResults((p) => ({
                ...p,
                [eventId]: { status: 'error', message: 'Netwerkfout — probeer opnieuw' },
            }));
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange} variant="bottom">
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Taken plannen</SheetTitle>
                    <SheetDescription>
                        Genereer prep-taken per event — uit het menu, geschaald op gasten, per station.
                    </SheetDescription>
                </SheetHeader>
                <SheetBody>
                    {upcoming.length === 0 && (
                        <p className="plan-sheet__empty">
                            Geen komende events. Maak eerst een event aan (of accepteer een offerte) —
                            dan verschijnt het hier.
                        </p>
                    )}
                    <div className="plan-sheet__list">
                        {upcoming.map((e) => {
                            const count = taskCountByEvent.get(e.id) ?? 0;
                            const result = results[e.id];
                            const datum = new Date(e.date).toLocaleDateString('nl-NL', {
                                weekday: 'short', day: 'numeric', month: 'short',
                            });
                            return (
                                <div key={e.id} className="plan-sheet__row">
                                    <div className="plan-sheet__row-info">
                                        <span className="plan-sheet__row-name">{e.name}</span>
                                        <span className="plan-sheet__row-meta">
                                            {datum}
                                            {e.guests ? ` · ${e.guests} gasten` : ''}
                                            {count > 0 ? ` · ${count} ${count === 1 ? 'taak' : 'taken'}` : ' · nog geen taken'}
                                        </span>
                                        {result?.message && (
                                            <span
                                                className={`plan-sheet__row-result ${result.status === 'error' ? 'is-error' : 'is-ok'}`}
                                                role="status"
                                            >
                                                {result.status === 'error' && <AlertTriangle size={12} />}
                                                {result.status === 'done' && <Check size={12} />}
                                                {result.message}
                                            </span>
                                        )}
                                    </div>
                                    <div className="plan-sheet__row-actions">
                                        {count > 0 && (
                                            <button
                                                type="button"
                                                className="plan-sheet__btn plan-sheet__btn--ghost"
                                                onClick={() => plan(e.id, true)}
                                                disabled={result?.status === 'busy'}
                                                title="Verwijder automatisch geplande taken en genereer opnieuw"
                                            >
                                                <RefreshCw size={14} />
                                                <span>Opnieuw</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="plan-sheet__btn"
                                            onClick={() => plan(e.id, false)}
                                            disabled={result?.status === 'busy'}
                                        >
                                            {result?.status === 'busy'
                                                ? <Loader2 size={14} className="plan-sheet__spin" />
                                                : <CalendarPlus size={14} />}
                                            <span>Plan taken</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </SheetBody>
            </SheetContent>
        </Sheet>
    );
}
