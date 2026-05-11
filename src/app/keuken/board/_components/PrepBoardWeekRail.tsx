'use client';

import type { PrepTask } from '@/types/database.types';

interface EventBucket {
    eventId: number;
    name: string;
    date: string;
    taskCount: number;
    doneCount: number;
}

interface DayBucket {
    /** YYYY-MM-DD */
    date: string;
    label: string;       // 'Ma 12', 'Vandaag', 'Morgen'
    isToday: boolean;
    taskCount: number;
    doneCount: number;
    events: EventBucket[];
}

interface Props {
    tasks: PrepTask[];
    eventsById: Map<number, { id: number; name: string; date: string }>;
    onPickEvent?: (eventId: number) => void;
}

/**
 * Week-rail: horizontale 7-dagen-strip met per dag de events + tasks-count.
 * Bovenaan board onder filter-pillbar.
 *
 * Pillar #2 (multi-event aggregated): zien hoeveel werk per dag + welke events.
 */
export default function PrepBoardWeekRail({ tasks, eventsById, onPickEvent }: Props) {
    const days = buildDayBuckets(tasks, eventsById);

    return (
        <div className="prep-week-rail">
            {days.map((d) => {
                const pct = d.taskCount === 0 ? 0 : Math.round((d.doneCount / d.taskCount) * 100);
                return (
                    <div
                        key={d.date}
                        className={`prep-day ${d.isToday ? 'is-today' : ''} ${d.taskCount === 0 ? 'is-empty' : ''}`}
                    >
                        <div className="prep-day__header">
                            <span className="prep-day__label">{d.label}</span>
                            {d.taskCount > 0 && (
                                <span className="prep-day__count">
                                    {d.doneCount}/{d.taskCount}
                                </span>
                            )}
                        </div>
                        {d.taskCount > 0 && (
                            <div
                                className="prep-day__progress"
                                role="progressbar"
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <span style={{ width: `${pct}%` }} />
                            </div>
                        )}
                        <div className="prep-day__events">
                            {d.events.slice(0, 3).map((e) => (
                                <button
                                    key={e.eventId}
                                    className="prep-day__event"
                                    onClick={() => onPickEvent?.(e.eventId)}
                                    title={e.name}
                                >
                                    <span className="prep-day__event-name">{e.name}</span>
                                    <span className="prep-day__event-count">
                                        {e.doneCount}/{e.taskCount}
                                    </span>
                                </button>
                            ))}
                            {d.events.length > 3 && (
                                <span className="prep-day__event-more">+{d.events.length - 3}</span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Bouw 7-dagen-buckets vanaf vandaag.
 * Tasks zonder scheduled_at vallen op event.date als fallback;
 * zonder beide vallen ze uit het rail (verschijnen wel in kolommen).
 */
function buildDayBuckets(
    tasks: PrepTask[],
    eventsById: Map<number, { id: number; name: string; date: string }>,
): DayBucket[] {
    const today = startOfDay(new Date());
    const buckets: DayBucket[] = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(today.getTime() + i * 86400_000);
        const iso = d.toISOString().slice(0, 10);
        const label =
            i === 0 ? 'Vandaag'
                : i === 1 ? 'Morgen'
                    : d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
        buckets.push({
            date: iso,
            label,
            isToday: i === 0,
            taskCount: 0,
            doneCount: 0,
            events: [],
        });
    }

    const eventBucketsPerDay = new Map<string, Map<number, EventBucket>>();

    for (const t of tasks) {
        const taskDate = pickTaskDate(t, eventsById);
        if (!taskDate) continue;
        const bucket = buckets.find((b) => b.date === taskDate);
        if (!bucket) continue;
        bucket.taskCount += 1;
        if (t.status === 'done') bucket.doneCount += 1;

        const ev = eventsById.get(t.event_id);
        if (!ev) continue;
        let perDay = eventBucketsPerDay.get(taskDate);
        if (!perDay) {
            perDay = new Map();
            eventBucketsPerDay.set(taskDate, perDay);
        }
        let eventBucket = perDay.get(ev.id);
        if (!eventBucket) {
            eventBucket = {
                eventId: ev.id,
                name: ev.name,
                date: ev.date,
                taskCount: 0,
                doneCount: 0,
            };
            perDay.set(ev.id, eventBucket);
            bucket.events.push(eventBucket);
        }
        eventBucket.taskCount += 1;
        if (t.status === 'done') eventBucket.doneCount += 1;
    }

    return buckets;
}

function pickTaskDate(
    t: PrepTask,
    eventsById: Map<number, { id: number; name: string; date: string }>,
): string | null {
    if (t.scheduled_at) {
        return t.scheduled_at.slice(0, 10);
    }
    const ev = eventsById.get(t.event_id);
    if (ev?.date) return ev.date.slice(0, 10);
    return null;
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
