/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * /logistiek/field — Veldmodus (Lars-mode).
 *
 * Vervangt de oude bus-check (busItems via gerechten.hardware_items) door
 * de nieuwe event_checklist_items multi-categorie aanpak (migratie 016).
 *
 * Field-rules (memory-rule: Lars > Pro > Mathijs):
 *   - 72px tap-targets (.field-mega-btn) — handschoen-vriendelijk.
 *   - GEEN tekst-input op event-dag — alleen toggles + bulk-actie.
 *   - navigator.vibrate(10) per toggle voor haptische feedback.
 *   - Hoog-contrast: geel = todo, groen = done.
 *   - Offline-banner top met queue-count.
 *   - Optimistic update + last-write-wins per (item_id, field=done).
 *
 * Offline-engine:
 *   - Bij toggle: meteen UI updaten; supabase.update proberen.
 *   - Bij failure of offline: enqueueWrite (offlineStorage.event_queue).
 *   - Bij reconnect: drainQueue() — leest queue FIFO en pusht naar Supabase.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OfflineTable } from '@/lib/offlineStorage';
import Link from 'next/link';
import {
    ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronUp, Loader2, Smartphone,
    Phone as PhoneIcon, Map as MapIcon, WifiOff, Truck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { LOGISTIEK_SECTIONS, type LogistiekCategory, type DbChecklistItem } from '@/lib/logistiek/sections';
import {
    enqueueWrite,
    readQueue,
    removeQueueEntry,
    countQueueForEvent,
    emitQueueChange,
    OFFLINE_EVENT_CHANGE,
} from '@/lib/offlineStorage';

interface EventRow {
    id: number;
    name: string | null;
    client_naam: string | null;
    date: string | null;
    guests: number | null;
    location: string | null;
    organization_id: string;
    status: string | null;
}

/* Kleine event-emitter zodat reconnect-drain alle pages tegelijk laat refetchen. */
const REFRESH_AFTER_SYNC = 'bbq-logistiek-field-refresh';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function LogistiekFieldPage() {
    const { orgId } = useOrg();
    const [events, setEvents] = useState<EventRow[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [items, setItems] = useState<DbChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [flashId, setFlashId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<LogistiekCategory, boolean>>(() => {
        const e = {} as Record<LogistiekCategory, boolean>;
        LOGISTIEK_SECTIONS.forEach(s => { e[s.id] = true; });
        return e;
    });
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [queueCount, setQueueCount] = useState(0);
    const [refreshTick, setRefreshTick] = useState(0);

    /* Load events + auto-select eerstvolgend. */
    useEffect(() => {
        if (!orgId || !supabase) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            const { data: evs } = await supabase
                .from('events')
                .select('id, name, client_naam, date, guests, location, organization_id, status')
                .eq('organization_id', orgId)
                .gte('date', todayStr())
                .neq('status', 'completed')
                .order('date', { ascending: true })
                .limit(20);
            if (cancelled) return;
            const evList = (evs ?? []) as EventRow[];
            setEvents(evList);
            if (evList.length > 0 && selectedId === null) setSelectedId(evList[0].id);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [orgId, selectedId]);

    /* Load checklist voor geselecteerd event. */
    useEffect(() => {
        if (!orgId || !supabase || !selectedId) { setItems([]); return; }
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('event_checklist_items')
                .select('*')
                .eq('event_id', selectedId)
                .eq('organization_id', orgId)
                .order('category', { ascending: true })
                .order('sort_order', { ascending: true });
            if (cancelled) return;
            setItems(((data ?? []) as DbChecklistItem[]).filter(c => !c.ai_pending));
        })();
        return () => { cancelled = true; };
    }, [orgId, selectedId, refreshTick]);

    /* Online/offline listener + queue-count tick. */
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const onOnline = () => { setIsOnline(true); void drainQueueFor(selectedId, () => setRefreshTick(t => t + 1)); };
        const onOffline = () => setIsOnline(false);
        const refreshQueue = async () => {
            if (selectedId) setQueueCount(await countQueueForEvent(selectedId));
        };
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        window.addEventListener(OFFLINE_EVENT_CHANGE, refreshQueue);
        window.addEventListener(REFRESH_AFTER_SYNC, refreshQueue);
        refreshQueue();
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener(OFFLINE_EVENT_CHANGE, refreshQueue);
            window.removeEventListener(REFRESH_AFTER_SYNC, refreshQueue);
        };
    }, [selectedId]);

    /* Bij mount + bij reconnect: queue drainen. */
    useEffect(() => {
        if (isOnline && selectedId) {
            void drainQueueFor(selectedId, () => setRefreshTick(t => t + 1));
        }
    }, [isOnline, selectedId]);

    const grouped = useMemo(() => {
        const g: Record<LogistiekCategory, DbChecklistItem[]> = {} as any;
        LOGISTIEK_SECTIONS.forEach(s => { g[s.id] = []; });
        items.forEach(it => { if (g[it.category]) g[it.category].push(it); });
        return g;
    }, [items]);

    const totalDone = items.filter(i => i.done).length;
    const totalAll = items.length;
    const pct = totalAll === 0 ? 0 : Math.round((totalDone / totalAll) * 100);
    const allDone = totalAll > 0 && totalDone === totalAll;

    const selectedEvent = useMemo(() => events.find(e => e.id === selectedId) ?? null, [events, selectedId]);

    const toggleItem = useCallback(async (id: string) => {
        const cur = items.find(i => i.id === id);
        if (!cur || !selectedId) return;
        const next = !cur.done;

        /* Optimistic UI. */
        setItems(prev => prev.map(i => i.id === id ? { ...i, done: next } : i));
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
        setFlashId(id);
        setTimeout(() => setFlashId(null), 400);

        /* Probeer online direct te schrijven; fallback naar queue. Last-write-wins
           per (item_id, field=done) — we sturen alleen `done`, niet de hele rij. */
        if (isOnline && supabase) {
            const { error } = await supabase
                .from('event_checklist_items')
                .update({ done: next })
                .eq('id', id);
            if (!error) return;
            /* Soft failure → queue. */
            console.warn('[field] online write faalde, queue fallback:', error.message);
        }

        try {
            /* Queue-entry — row.id (uuid) staat in `row` zodat de drain
               weet welke rij te updaten. rowId blijft null want
               offlineStorage typt 'em als number (legacy haccp-pad). */
            await enqueueWrite({
                eventId: selectedId,
                table: 'event_checklist_items' as unknown as OfflineTable,
                op: 'update',
                row: { id, done: next, updated_at: new Date().toISOString() },
                rowId: null,
            });
            emitQueueChange();
        } catch (e) {
            console.warn('[field] enqueue failed:', e);
        }
    }, [items, isOnline, selectedId]);

    const markAllForCat = useCallback(async (cat: LogistiekCategory) => {
        const open = grouped[cat].filter(i => !i.done);
        if (open.length === 0) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([10, 50, 10]);
        const ids = open.map(i => i.id);
        setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, done: true } : i));
        if (isOnline && supabase) {
            await supabase.from('event_checklist_items').update({ done: true }).in('id', ids);
        } else if (selectedId) {
            for (const id of ids) {
                await enqueueWrite({
                    eventId: selectedId,
                    table: 'event_checklist_items' as unknown as OfflineTable,
                    op: 'update',
                    row: { id, done: true, updated_at: new Date().toISOString() },
                    rowId: null,
                });
            }
            emitQueueChange();
        }
    }, [grouped, isOnline, selectedId]);

    const markAllOk = useCallback(async () => {
        const ids = items.filter(i => !i.done).map(i => i.id);
        if (ids.length === 0) return;
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([10, 50, 10, 50, 10]);
        setItems(prev => prev.map(i => ids.includes(i.id) ? { ...i, done: true } : i));
        if (isOnline && supabase) {
            await supabase.from('event_checklist_items').update({ done: true }).in('id', ids);
        } else if (selectedId) {
            for (const id of ids) {
                await enqueueWrite({
                    eventId: selectedId,
                    table: 'event_checklist_items' as unknown as OfflineTable,
                    op: 'update',
                    row: { id, done: true, updated_at: new Date().toISOString() },
                    rowId: null,
                });
            }
            emitQueueChange();
        }
    }, [items, isOnline, selectedId]);

    const toggleSection = (id: LogistiekCategory) => setExpanded(p => ({ ...p, [id]: !p[id] }));

    /* ───────────────── Render ───────────────── */

    if (loading) {
        return (
            <div className="min-h-screen grid place-items-center" style={{ background: '#0a0a0c' }}>
                <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col select-none" style={{ background: '#0a0a0c', color: '#f8f8f8' }}>
            {/* Header */}
            <div className="px-4 pt-3 pb-2 sticky top-0 z-20 backdrop-blur-md"
                style={{ background: 'rgba(20,20,22,.95)', borderBottom: '1px solid rgba(130,130,130,.12)' }}>

                {!isOnline && (
                    <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg mb-2 text-[12px] font-semibold"
                        style={{ background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', color: '#f59e0b' }}>
                        <WifiOff size={14} />
                        Offline · {queueCount} wijziging{queueCount === 1 ? '' : 'en'} wacht op sync
                        <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: 'rgba(245,158,11,.15)' }}>{queueCount}</span>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <Link href="/logistiek" aria-label="Terug"
                        className="w-12 h-12 rounded-2xl grid place-items-center"
                        style={{ background: 'transparent', border: '1px solid rgba(130,130,130,.12)' }}>
                        <ArrowLeft size={22} />
                    </Link>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-bold tracking-[0.04em]">
                            <Truck size={13} style={{ color: 'var(--brand)' }} />
                            Bus-check · Veldmodus
                        </div>
                        <div className="text-[14px] font-semibold mt-0.5 truncate">
                            {selectedEvent ? (selectedEvent.client_naam || selectedEvent.name || `Event #${selectedEvent.id}`) : 'Geen event geselecteerd'}
                            {' · '}
                            <span className="tabular-nums">{totalDone}/{totalAll}</span>
                            {' · '}
                            <span style={{ color: allDone ? '#22c55e' : '#FFBF00' }}>{pct}%</span>
                        </div>
                    </div>
                </div>

                {/* Progress */}
                <div className="mt-2.5 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(130,130,130,.1)' }}>
                    <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: allDone ? '#22c55e' : 'linear-gradient(90deg, var(--brand-gold), var(--brand))',
                        transition: 'width .4s ease',
                    }} />
                </div>
            </div>

            {/* Event selector — alleen wanneer er meerdere zijn. */}
            {events.length > 1 && (
                <div className="px-3 py-2 flex gap-2 overflow-x-auto"
                    style={{ background: '#0e0e10', borderBottom: '1px solid rgba(130,130,130,.08)' }}>
                    {events.slice(0, 8).map(e => {
                        const active = e.id === selectedId;
                        const datum = e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : '';
                        return (
                            <button key={e.id} onClick={() => setSelectedId(e.id)}
                                className="px-3.5 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap"
                                style={{
                                    minHeight: 48,
                                    background: active ? 'var(--brand)' : '#1a1a1d',
                                    color: active ? '#000' : '#f8f8f8',
                                    border: active ? '2px solid var(--brand)' : '1px solid rgba(130,130,130,.15)',
                                }}>
                                <span className="font-bold">{datum}</span>{' '}
                                <span className="opacity-80">{e.client_naam || e.name || `#${e.id}`}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* MEGA-button */}
            {items.length > 0 && (
                <div className="px-4 pt-3">
                    <button onClick={markAllOk} className="w-full rounded-2xl font-extrabold text-[18px] tracking-[0.02em] flex items-center justify-center gap-3"
                        style={{
                            minHeight: 72,
                            background: allDone ? '#22c55e' : 'var(--brand)',
                            color: '#000',
                            boxShadow: allDone ? '0 6px 24px rgba(34,197,94,.4)' : '0 6px 24px rgba(255,191,0,.35), inset 0 1px 0 rgba(255,255,255,.2)',
                        }}>
                        {allDone ? <><CheckCircle2 size={24} /> ALLES KLAAR — VERTREK!</>
                                : <><Truck size={24} /> ALLES OK — VINK ALLES</>}
                    </button>
                </div>
            )}

            {/* Sections */}
            <div className="flex-1 px-4 pt-2 pb-32 flex flex-col gap-2">
                {LOGISTIEK_SECTIONS.map(sec => {
                    const list = grouped[sec.id];
                    if (list.length === 0) return null;
                    const doneCount = list.filter(c => c.done).length;
                    const sectionPct = Math.round((doneCount / list.length) * 100);
                    const sectionDone = doneCount === list.length;
                    const isExpanded = expanded[sec.id];

                    return (
                        <div key={sec.id} className="rounded-2xl overflow-hidden"
                            style={{
                                background: '#141416',
                                border: '1px solid rgba(130,130,130,.12)',
                                borderLeft: sectionDone ? '3px solid #22c55e' : '3px solid transparent',
                            }}>
                            <div className="flex items-center gap-3 px-4"
                                style={{ minHeight: 64, cursor: 'pointer' }}
                                onClick={() => toggleSection(sec.id)}>
                                <span className="text-[24px]">{sec.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.02em]">
                                        {sec.label}
                                        {sectionDone && <Check size={16} style={{ color: '#22c55e' }} />}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[13px] font-semibold tabular-nums"
                                            style={{ color: sectionDone ? '#22c55e' : '#f8f8f8' }}>
                                            {doneCount}/{list.length}
                                        </span>
                                        <div className="flex-1 max-w-[120px] h-1.5 rounded-full overflow-hidden"
                                            style={{ background: 'rgba(130,130,130,.12)' }}>
                                            <div style={{
                                                width: `${sectionPct}%`,
                                                height: '100%',
                                                background: sectionDone ? '#22c55e' : '#FFBF00',
                                                transition: 'width .3s',
                                            }} />
                                        </div>
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); markAllForCat(sec.id); }}
                                    className="px-3 py-1.5 rounded-md text-[11px] font-bold"
                                    style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', color: '#22c55e' }}>
                                    Alles
                                </button>
                                {isExpanded ? <ChevronUp size={20} style={{ color: '#888' }} /> : <ChevronDown size={20} style={{ color: '#888' }} />}
                            </div>

                            {isExpanded && list.map(item => (
                                <FieldRow key={item.id} item={item} onToggle={toggleItem} flash={flashId === item.id} />
                            ))}
                        </div>
                    );
                })}

                {items.length === 0 && (
                    <div className="rounded-2xl px-6 py-12 text-center" style={{ background: '#141416', border: '1px solid rgba(130,130,130,.12)' }}>
                        <div className="text-[15px] font-bold mb-1">Geen checklist voor dit event</div>
                        <div className="text-[12px]" style={{ color: '#888' }}>
                            Vraag eerst een AI-voorstel via /logistiek, of voeg items handmatig toe in event-hub.
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky bottom — Bel klant / Maps */}
            <div className="sticky bottom-0 z-20 px-4 py-2.5 flex gap-2.5 backdrop-blur-md"
                style={{ background: 'rgba(10,10,12,.95)', borderTop: '1px solid rgba(130,130,130,.12)' }}>
                <a href="tel:+31612345678"
                    className="flex-1 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2"
                    style={{ minHeight: 56, background: 'rgba(30,30,34,.8)', border: '1px solid rgba(130,130,130,.12)', color: '#f8f8f8' }}>
                    <PhoneIcon size={18} /> Bel klant
                </a>
                <a href={selectedEvent?.location ? `https://maps.google.com/?q=${encodeURIComponent(selectedEvent.location)}` : '#'}
                    target="_blank" rel="noreferrer noopener"
                    className="flex-1 rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2"
                    style={{ minHeight: 56, background: 'rgba(30,30,34,.8)', border: '1px solid rgba(130,130,130,.12)', color: '#f8f8f8' }}>
                    <MapIcon size={18} /> Open in Maps
                </a>
                <Link href={selectedEvent ? `/events/${selectedEvent.id}/logistiek` : '/logistiek'}
                    className="rounded-2xl font-bold text-[14px] flex items-center justify-center gap-2 px-4"
                    style={{ minHeight: 56, background: 'rgba(30,30,34,.8)', border: '1px solid rgba(130,130,130,.12)', color: '#f8f8f8' }}>
                    <Smartphone size={18} />
                </Link>
            </div>
        </div>
    );
}

/* ────────────────────────── Field row ────────────────────────── */

function FieldRow({ item, onToggle, flash }: { item: DbChecklistItem; onToggle: (id: string) => void; flash: boolean }) {
    const [swipeX, setSwipeX] = useState(0);
    const startRef = useRef(0);
    const swipingRef = useRef(false);

    const onStart = (clientX: number) => { startRef.current = clientX; swipingRef.current = true; };
    const onMove = (clientX: number) => {
        if (!swipingRef.current) return;
        const dx = clientX - startRef.current;
        if (dx > 0) setSwipeX(Math.min(dx, 140));
    };
    const onEnd = () => {
        if (swipeX > 80) onToggle(item.id);
        setSwipeX(0);
        swipingRef.current = false;
    };

    return (
        <div
            className="relative overflow-hidden flex items-center gap-4 px-4 cursor-pointer"
            style={{
                minHeight: 72,
                paddingTop: 8, paddingBottom: 8,
                borderBottom: '1px solid rgba(130,130,130,.06)',
                background: flash ? 'rgba(34,197,94,.12)' : item.done ? 'rgba(34,197,94,.03)' : 'transparent',
                transform: swipeX ? `translateX(${swipeX}px)` : undefined,
                transition: swipeX ? 'none' : 'background .3s, transform .2s',
            }}
            onTouchStart={(e) => onStart(e.touches[0].clientX)}
            onTouchMove={(e) => onMove(e.touches[0].clientX)}
            onTouchEnd={onEnd}
            onClick={() => onToggle(item.id)}
        >
            {swipeX > 20 && (
                <div className="absolute top-0 bottom-0 grid place-items-center"
                    style={{ left: -swipeX, width: swipeX, background: 'rgba(34,197,94,.15)' }}>
                    <Check size={28} style={{ color: '#22c55e' }} />
                </div>
            )}

            <div className="w-9 h-9 rounded-xl grid place-items-center shrink-0 transition-all"
                style={{
                    border: item.done ? 'none' : '2.5px solid rgba(255,191,0,.5)',
                    background: item.done ? '#22c55e' : 'transparent',
                }}>
                {item.done && <Check size={22} color="#000" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="text-[17px] font-semibold"
                    style={{
                        color: item.done ? '#888' : '#f8f8f8',
                        textDecoration: item.done ? 'line-through' : 'none',
                    }}>
                    {item.label}
                </div>
                {typeof item.qty === 'number' && item.qty > 0 && (
                    <div className="text-[13px] tabular-nums mt-0.5" style={{ color: '#888' }}>
                        {item.qty}{item.unit ? ` ${item.unit}` : ''}
                    </div>
                )}
            </div>

            <div className="w-3 h-3 rounded-full shrink-0"
                style={{ background: item.done ? '#22c55e' : '#FFBF00' }} />
        </div>
    );
}

/* ────────────────────────── Offline queue drain ────────────────────────── */

/**
 * Lees alle queued writes voor dit event en pusht ze in volgorde naar Supabase.
 * Last-write-wins per (item_id, field) — als een item meerdere keren ge-toggled
 * is voordat reconnect, sturen we alleen de uitkomst van de laatste mutatie.
 */
async function drainQueueFor(eventId: number | null, onDone: () => void) {
    if (!eventId || !supabase) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const queue = await readQueue(eventId);
    if (queue.length === 0) return;

    /* Collapse per (table, row.id, field-key) — last write wins. */
    const collapsed = new Map<string, { entryId: number; tableName: string; rowId: string; payload: Record<string, unknown> }[]>();
    for (const q of queue) {
        const row = q.row as Record<string, unknown>;
        const rowId = row.id as string | undefined;
        if (!rowId) {
            /* Mutatie zonder id (zelden) — skip + remove. */
            if (q.id) await removeQueueEntry(q.id);
            continue;
        }
        const key = `${q.table}|${rowId}`;
        if (!collapsed.has(key)) collapsed.set(key, []);
        collapsed.get(key)!.push({
            entryId: q.id!,
            tableName: q.table as unknown as string,
            rowId,
            payload: row,
        });
    }

    for (const entries of collapsed.values()) {
        /* Pak laatste payload — last-write-wins. Bouw nieuwe patch zonder
           de `id`-key zodat we niet proberen de primary-key te overschrijven. */
        const last = entries[entries.length - 1];
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(last.payload)) {
            if (k === 'id') continue;
            patch[k] = v;
        }

        const { error } = await supabase
            .from(last.tableName)
            .update(patch)
            .eq('id', last.rowId);
        if (error) {
            console.warn('[field] drain failed for', last.tableName, last.rowId, error.message);
            continue;
        }
        /* Bij succes: verwijder ALLE queue-entries voor deze key. */
        for (const e of entries) {
            await removeQueueEntry(e.entryId);
        }
    }

    emitQueueChange();
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(REFRESH_AFTER_SYNC));
    }
    onDone();
}
