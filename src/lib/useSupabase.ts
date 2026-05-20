'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import {
  getActiveOfflineEvent,
  readLocal,
  enqueueWrite,
  applyLocalMutation,
  emitQueueChange,
  EVENT_SCOPED_TABLES,
  STAM_TABLES,
  OFFLINE_EVENT_CHANGE,
  type ActiveOfflineEvent,
  type OfflineTable,
} from './offlineStorage';

// Shared channel registry — prevents duplicate subscriptions for the same table+org
const channelRegistry = new Map<string, { refCount: number; channel: ReturnType<typeof supabase.channel> }>();

/** Set van tabellen die offline-mode ondersteunen — anders gewoon online-only. */
const OFFLINE_TABLES = new Set<string>([...EVENT_SCOPED_TABLES, ...STAM_TABLES]);

function isOfflineEnabledTable(table: string): table is OfflineTable {
  return OFFLINE_TABLES.has(table);
}

/** Hook leest active-offline-event reactive zodat fetchData + writes weten welk
 *  pad ze moeten kiezen. Update bij OFFLINE_EVENT_CHANGE custom events. */
function useActiveOfflineState(): ActiveOfflineEvent | null {
    const [state, setState] = useState<ActiveOfflineEvent | null>(null);
    useEffect(function () {
        if (typeof window === 'undefined') return;
        function refresh() { setState(getActiveOfflineEvent()); }
        refresh();
        window.addEventListener(OFFLINE_EVENT_CHANGE, refresh);
        return function () { window.removeEventListener(OFFLINE_EVENT_CHANGE, refresh); };
    }, []);
    return state;
}

export interface UseSupabaseOptions {
    /**
     * Skip de initiële client-side fetch — gebruik dit als de Server
     * Component al data heeft prefetched en via `defaultVal` doorgaf.
     * Vermijdt de "refetch-flash": loading-flicker op pagina's waar
     * data al server-side beschikbaar is. Realtime subscriptions
     * blijven gewoon werken zodat updates op andere tabs/devices
     * meekomen.
     */
    skipInitialFetch?: boolean;
}

export function useSupabase<T extends { id: number }>(
    table: string,
    defaultVal?: T[],
    options?: UseSupabaseOptions,
): {
    data: T[];
    loading: boolean;
    /**
     * Laatste fetch-error als string, anders null. Consumer kan dit
     * gebruiken om een `<ErrorCard retry={refetch} />` te tonen i.p.v.
     * een lege data-array. Voorheen werd de error alleen via
     * `console.warn` gelogd — onzichtbaar voor de gebruiker.
     */
    error: string | null;
    refetch: () => void;
    insert: (row: Partial<T>) => Promise<T | null>;
    update: (id: number, row: Partial<T>) => Promise<T | null>;
    remove: (id: number) => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<T[]>>;
} {
    const skipInitialFetch = options?.skipInitialFetch ?? false;
    const [data, setData] = useState<T[]>(defaultVal || []);
    /* Loading start false als Server Component al data leverde — geen flash. */
    const [loading, setLoading] = useState(!skipInitialFetch);
    const [error, setError] = useState<string | null>(null);
    const { orgId } = useOrg();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeOffline = useActiveOfflineState();
    const offlineMode = activeOffline !== null && isOfflineEnabledTable(table);

    const fetchData = useCallback(function () {
        // Offline-mode pad: lees uit IndexedDB ipv Supabase REST.
        if (offlineMode && activeOffline) {
            const eventScoped = (EVENT_SCOPED_TABLES as readonly string[]).includes(table);
            setLoading(true);
            setError(null);
            readLocal<T>(table as OfflineTable, eventScoped ? activeOffline.eventId : undefined)
                .then(function (rows) {
                    setData(rows);
                    setLoading(false);
                })
                .catch(function (e) {
                    const msg = e instanceof Error ? e.message : 'offline-data niet beschikbaar';
                    console.warn('[offline] readLocal failed for ' + table, e);
                    setError(msg);
                    setLoading(false);
                });
            return;
        }

        if (!supabase || !orgId) { setLoading(false); return; }
        setLoading(true);
        setError(null);
        supabase
            .from(table)
            .select('*')
            .eq('organization_id', orgId)
            .order('id', { ascending: true })
            .then(function (res) {
                if (res.error) {
                    const msg = res.error.message || res.error.code || 'onbekende fout';
                    console.warn('[DB] Fetch warning on ' + table + ':', msg);
                    setError(msg);
                    /* Bewaar bestaande data (b.v. server-prefetched of vorige
                       fetch) zodat de page niet plots leeg wordt — consumer
                       kan via `error` tonen "live-refresh mislukt" zonder de
                       UI te wissen. */
                } else {
                    setError(null);
                }
                if (res.data) setData(res.data as T[]);
                setLoading(false);
            });
    }, [table, orgId, offlineMode, activeOffline]);

    // Debounced refetch — coalesces rapid-fire realtime events (e.g. bulk inserts)
    const debouncedFetch = useCallback(function () {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchData, 300);
    }, [fetchData]);

    /* Initial fetch — skip als Server Component al data leverde. Realtime
       subscription hieronder blijft wel actief, dus updates uit andere
       tabs/devices komen alsnog binnen. */
    useEffect(function () {
        if (skipInitialFetch) return;
        fetchData();
    }, [fetchData, skipInitialFetch]);

    // Supabase Realtime — shared channel per table+org, debounced refresh.
    // Offline-mode: skip subscribe — anders eindeloos reconnect-pogingen op
    // tablet zonder wifi, en bij offline werken we toch op IndexedDB.
    useEffect(function () {
        if (!supabase || !orgId) return;
        if (offlineMode) return;
        const key = table + ':' + orgId;
        let entry = channelRegistry.get(key);

        if (!entry) {
            const channel = supabase
                .channel('rt_' + table + '_' + orgId.substring(0, 8))
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: table,
                    filter: 'organization_id=eq.' + orgId,
                }, function () {
                    // Notify all subscribers for this table
                    window.dispatchEvent(new CustomEvent('supabase-change', { detail: key }));
                })
                .subscribe();
            entry = { refCount: 0, channel };
            channelRegistry.set(key, entry);
        }
        entry.refCount++;

        function handleChange(e: Event) {
            if ((e as CustomEvent).detail === key) debouncedFetch();
        }
        window.addEventListener('supabase-change', handleChange);

        return function () {
            window.removeEventListener('supabase-change', handleChange);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            const e = channelRegistry.get(key);
            if (e) {
                e.refCount--;
                if (e.refCount <= 0) {
                    supabase.removeChannel(e.channel);
                    channelRegistry.delete(key);
                }
            }
        };
    }, [table, orgId, debouncedFetch, offlineMode]);

    const insert = useCallback(function (row: Partial<T>): Promise<T | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        const tempId = -(Date.now());
        const rowWithOrg = { ...row, id: tempId, organization_id: orgId } as unknown as T;
        // Optimistic: add temp row immediately
        setData(function (prev) { return prev.concat([rowWithOrg]); });

        // Offline-mode pad: queue + apply lokaal, geen Supabase-call.
        if (offlineMode && activeOffline) {
            return enqueueWrite({
                eventId: activeOffline.eventId,
                table: table as OfflineTable,
                op: 'insert',
                row: rowWithOrg as unknown as Record<string, unknown>,
                rowId: null,
                tempId,
            })
                .then(function () {
                    return applyLocalMutation(table as OfflineTable, 'insert', rowWithOrg as unknown as Record<string, unknown>);
                })
                .then(function () {
                    emitQueueChange();
                    return rowWithOrg;
                })
                .catch(function (e) {
                    setData(function (prev) { return prev.filter(function (item) { return item.id !== tempId; }); });
                    console.error('[offline] enqueue insert failed', table, e);
                    throw e;
                });
        }

        return Promise.resolve(supabase.from(table).insert({ ...row, organization_id: orgId } as Record<string, unknown>).select().single()).then(function (res) {
            if (res.error) {
                setData(function (prev) { return prev.filter(function (item) { return item.id !== tempId; }); });
                console.error('[DB] Insert error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
            setData(function (prev) { return prev.map(function (item) { return item.id === tempId ? res.data as T : item; }); });
            return res.data as T;
        });
    }, [table, orgId, offlineMode, activeOffline]);

    const update = useCallback(function (id: number, row: Partial<T>): Promise<T | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        let previousRow: T | undefined;
        let merged: T | undefined;
        // Optimistic: apply update immediately
        setData(function (prev) {
            return prev.map(function (item) {
                if (item.id === id) {
                    previousRow = item;
                    merged = { ...item, ...row } as T;
                    return merged;
                }
                return item;
            });
        });

        // Offline-mode pad: queue + apply lokaal.
        if (offlineMode && activeOffline) {
            return enqueueWrite({
                eventId: activeOffline.eventId,
                table: table as OfflineTable,
                op: 'update',
                row: row as Record<string, unknown>,
                rowId: id,
            })
                .then(function () {
                    if (merged) return applyLocalMutation(table as OfflineTable, 'update', merged as unknown as Record<string, unknown>, id);
                })
                .then(function () {
                    emitQueueChange();
                    return merged ?? null;
                })
                .catch(function (e) {
                    if (previousRow) setData(function (prev) { return prev.map(function (item) { return item.id === id ? previousRow! : item; }); });
                    console.error('[offline] enqueue update failed', table, e);
                    throw e;
                });
        }

        return Promise.resolve(supabase.from(table).update(row as Record<string, unknown>).eq('id', id).eq('organization_id', orgId).select().single()).then(function (res) {
            if (res.error) {
                if (previousRow) setData(function (prev) { return prev.map(function (item) { return item.id === id ? previousRow! : item; }); });
                console.error('[DB] Update error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
            if (res.data) {
                setData(function (prev) {
                    return prev.map(function (item) { return item.id === id ? res.data as T : item; });
                });
            }
            return res.data as T;
        });
    }, [table, orgId, offlineMode, activeOffline]);

    const remove = useCallback(function (id: number): Promise<void> {
        if (!supabase || !orgId) return Promise.resolve();
        let removedRow: T | undefined;
        // Optimistic: remove immediately
        setData(function (prev) {
            removedRow = prev.find(function (item) { return item.id === id; });
            return prev.filter(function (item) { return item.id !== id; });
        });

        // Offline-mode pad: queue + apply lokaal.
        if (offlineMode && activeOffline) {
            return enqueueWrite({
                eventId: activeOffline.eventId,
                table: table as OfflineTable,
                op: 'delete',
                row: { id },
                rowId: id,
            })
                .then(function () {
                    return applyLocalMutation(table as OfflineTable, 'delete', { id }, id);
                })
                .then(function () {
                    emitQueueChange();
                })
                .catch(function (e) {
                    if (removedRow) setData(function (prev) { return prev.concat([removedRow!]); });
                    console.error('[offline] enqueue delete failed', table, e);
                    throw e;
                });
        }

        return Promise.resolve(supabase.from(table).delete().eq('id', id).eq('organization_id', orgId)).then(function (res) {
            if (res.error) {
                if (removedRow) setData(function (prev) { return prev.concat([removedRow!]); });
                console.error('[DB] Delete error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
        });
    }, [table, orgId, offlineMode, activeOffline]);

    return { data, loading, error, refetch: fetchData, insert, update, remove, setData };
}

// Single-row table (settings) — scoped by organization
export function useSettings(): {
    settings: import('@/types').Settings | null;
    loading: boolean;
    save: (data: Partial<import('@/types').Settings>) => Promise<import('@/types').Settings | null>;
} {
    const [settings, setSettings] = useState<import('@/types').Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const { orgId } = useOrg();

    useEffect(function () {
        if (!supabase || !orgId) { setLoading(false); return; }
        supabase
            .from('settings')
            .select('*')
            .eq('organization_id', orgId)
            .single()
            .then(function (res) {
                if (res.data) setSettings(res.data as import('@/types').Settings);
                setLoading(false);
            });
    }, [orgId]);

    const save = useCallback(function (data: Partial<import('@/types').Settings>): Promise<import('@/types').Settings | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        return Promise.resolve(
            supabase.from('settings').update(data).eq('organization_id', orgId).select().single()
        ).then(function (res) {
            if (res.data) setSettings(res.data as import('@/types').Settings);
            return res.data as import('@/types').Settings;
        });
    }, [orgId]);

    return { settings, loading, save };
}
