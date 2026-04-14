'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

// Shared channel registry — prevents duplicate subscriptions for the same table+org
const channelRegistry = new Map<string, { refCount: number; channel: ReturnType<typeof supabase.channel> }>();

export function useSupabase<T extends { id: number }>(table: string, defaultVal?: T[]): {
    data: T[];
    loading: boolean;
    refetch: () => void;
    insert: (row: Partial<T>) => Promise<T | null>;
    update: (id: number, row: Partial<T>) => Promise<T | null>;
    remove: (id: number) => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<T[]>>;
} {
    const [data, setData] = useState<T[]>(defaultVal || []);
    const [loading, setLoading] = useState(true);
    const { orgId } = useOrg();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fetchData = useCallback(function () {
        if (!supabase || !orgId) { setLoading(false); return; }
        setLoading(true);
        supabase
            .from(table)
            .select('*')
            .eq('organization_id', orgId)
            .order('id', { ascending: true })
            .then(function (res) {
                if (res.error) { console.warn('[DB] Fetch warning on ' + table + ':', res.error.message || res.error.code || 'unknown'); }
                if (res.data) setData(res.data as T[]);
                setLoading(false);
            });
    }, [table, orgId]);

    // Debounced refetch — coalesces rapid-fire realtime events (e.g. bulk inserts)
    const debouncedFetch = useCallback(function () {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(fetchData, 300);
    }, [fetchData]);

    useEffect(function () { fetchData(); }, [fetchData]);

    // Supabase Realtime — shared channel per table+org, debounced refresh
    useEffect(function () {
        if (!supabase || !orgId) return;
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
    }, [table, orgId, debouncedFetch]);

    const insert = useCallback(function (row: Partial<T>): Promise<T | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        const tempId = -(Date.now());
        const rowWithOrg = { ...row, id: tempId, organization_id: orgId } as unknown as T;
        // Optimistic: add temp row immediately
        setData(function (prev) { return prev.concat([rowWithOrg]); });
        return Promise.resolve(supabase.from(table).insert({ ...row, organization_id: orgId } as Record<string, unknown>).select().single()).then(function (res) {
            if (res.error) {
                setData(function (prev) { return prev.filter(function (item) { return item.id !== tempId; }); });
                console.error('[DB] Insert error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
            setData(function (prev) { return prev.map(function (item) { return item.id === tempId ? res.data as T : item; }); });
            return res.data as T;
        });
    }, [table, orgId]);

    const update = useCallback(function (id: number, row: Partial<T>): Promise<T | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        let previousRow: T | undefined;
        // Optimistic: apply update immediately
        setData(function (prev) {
            return prev.map(function (item) {
                if (item.id === id) { previousRow = item; return { ...item, ...row } as T; }
                return item;
            });
        });
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
    }, [table, orgId]);

    const remove = useCallback(function (id: number): Promise<void> {
        if (!supabase || !orgId) return Promise.resolve();
        let removedRow: T | undefined;
        // Optimistic: remove immediately
        setData(function (prev) {
            removedRow = prev.find(function (item) { return item.id === id; });
            return prev.filter(function (item) { return item.id !== id; });
        });
        return Promise.resolve(supabase.from(table).delete().eq('id', id).eq('organization_id', orgId)).then(function (res) {
            if (res.error) {
                if (removedRow) setData(function (prev) { return prev.concat([removedRow!]); });
                console.error('[DB] Delete error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
        });
    }, [table, orgId]);

    return { data, loading, refetch: fetchData, insert, update, remove, setData };
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
