'use client';

import type { PrepTask, KitchenStation } from '@/types/database.types';
import type { Allergen } from '@/lib/allergenDetect';
import PrepTaskCard from './PrepTaskCard';

interface EventLite {
    id: number;
    name: string;
    date: string;
    start_time?: string | null;
    allergens?: Allergen[];
    allergenSeverity?: 'normal' | 'high' | 'critical';
}

interface PersoneelLite {
    id: string;
    naam: string;
    user_id: string | null;
}

interface Props {
    station: KitchenStation | null;
    /** "Geen station" wanneer station=null. */
    fallbackName?: string;
    tasks: PrepTask[];
    eventsById: Map<number, EventLite>;
    personeelById: Map<string, PersoneelLite>;
    currentUserId: string | null;
    onTaskPrimary: (task: PrepTask) => void;
    onTaskMenu: (task: PrepTask) => void;
    onTaskExpand: (task: PrepTask) => void;
    onTaskSwipeRight?: (task: PrepTask) => void;
    onTaskSwipeLeft?: (task: PrepTask) => void;
}

/**
 * 1 station = 1 kolom. Tasks gesorteerd op urgentie:
 *   1. in_progress (boven)
 *   2. queued / planned (deadline ASC, blocked als laatste)
 *   3. done / skipped (gedimd, onderaan)
 */
export default function PrepBoardColumn({
    station,
    fallbackName = 'Overig',
    tasks,
    eventsById,
    personeelById,
    currentUserId,
    onTaskPrimary,
    onTaskMenu,
    onTaskExpand,
    onTaskSwipeRight,
    onTaskSwipeLeft,
}: Props) {
    const stationName = station?.name ?? fallbackName;
    const stationColor = station?.color ?? 'var(--muted)';
    const sorted = [...tasks].sort(sortTasks);

    const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
    const doneCount = tasks.filter((t) => t.status === 'done').length;
    const totalCount = tasks.length;

    return (
        <div className="prep-column" data-station-id={station?.id ?? 'none'}>
            <header className="prep-column__header" style={{ borderTopColor: stationColor }}>
                <div className="prep-column__title">
                    <span className="prep-column__dot" style={{ background: stationColor }} aria-hidden />
                    <span>{stationName}</span>
                </div>
                <div className="prep-column__count">
                    {doneCount}/{totalCount}
                    {inProgressCount > 0 && (
                        <span className="prep-column__active" title={`${inProgressCount} bezig`}>
                            <span className="prep-column__active-dot" />
                            {inProgressCount}
                        </span>
                    )}
                </div>
            </header>
            <div className="prep-column__list" role="list">
                {sorted.length === 0 && (
                    <div className="prep-column__empty">Geen taken</div>
                )}
                {sorted.map((task) => {
                    const event = eventsById.get(task.event_id);
                    const assignee = task.assignee_id ? personeelById.get(task.assignee_id) : null;
                    const isMine = !!assignee && assignee.user_id !== null && assignee.user_id === currentUserId;
                    return (
                        <PrepTaskCard
                            key={task.id}
                            task={task}
                            station={station ?? undefined}
                            eventLabel={event?.name}
                            eventDateLabel={event ? formatDate(event.date) : undefined}
                            eventTimeLabel={event?.start_time ?? undefined}
                            eventAllergens={event?.allergens ?? []}
                            eventAllergenSeverity={event?.allergenSeverity}
                            assigneeName={assignee?.naam ?? null}
                            isMine={isMine}
                            onPrimaryAction={() => onTaskPrimary(task)}
                            onOpenMenu={() => onTaskMenu(task)}
                            onExpand={() => onTaskExpand(task)}
                            onSwipeRight={onTaskSwipeRight ? () => onTaskSwipeRight(task) : undefined}
                            onSwipeLeft={onTaskSwipeLeft ? () => onTaskSwipeLeft(task) : undefined}
                        />
                    );
                })}
            </div>
        </div>
    );
}

const STATUS_RANK: Record<string, number> = {
    in_progress: 0,
    queued: 1,
    planned: 2,
    blocked: 3,
    skipped: 4,
    done: 5,
};

function sortTasks(a: PrepTask, b: PrepTask): number {
    const aRank = STATUS_RANK[a.status ?? 'planned'] ?? 99;
    const bRank = STATUS_RANK[b.status ?? 'planned'] ?? 99;
    if (aRank !== bRank) return aRank - bRank;
    // binnen zelfde status: deadline ASC, dan id
    const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;
    return (b.priority ?? 50) - (a.priority ?? 50);
}

function formatDate(date: string): string {
    try {
        const d = new Date(date);
        if (!Number.isFinite(d.getTime())) return date;
        return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
        return date;
    }
}
