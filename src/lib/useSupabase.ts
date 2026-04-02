'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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

    const fetchData = useCallback(function () {
        if (!supabase) { setLoading(false); return; }
        setLoading(true);
        supabase.from(table).select('*').order('id', { ascending: true }).then(function (res) {
            if (res.error) { console.warn('[DB] Fetch warning on ' + table + ':', res.error.message || res.error.code || 'unknown'); }
            if (res.data) setData(res.data as T[]);
            setLoading(false);
        });
    }, [table]);

    useEffect(function () { fetchData(); }, [fetchData]);

    // Supabase Realtime — auto-refresh on DB changes from other devices
    useEffect(function () {
        if (!supabase) return;
        const channel = supabase
            .channel('rt_' + table + '_' + Math.random().toString(36).slice(2, 6))
            .on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
                console.log('[REALTIME] ' + table + ': change detected');
                fetchData();
            })
            .subscribe();

        return function () {
            supabase.removeChannel(channel);
        };
    }, [table, fetchData]);

    const insert = useCallback(function (row: Partial<T>): Promise<T | null> {
        if (!supabase) return Promise.resolve(null);
        return Promise.resolve(supabase.from(table).insert(row).select().single()).then(function (res) {
            if (res.error) {
                console.error('[DB] Insert error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
            console.log('[DB] Inserted into ' + table + ', id=' + (res.data && (res.data as T).id));
            if (res.data) setData(function (prev) { return prev.concat([res.data as T]); });
            return res.data as T;
        });
    }, [table]);

    const update = useCallback(function (id: number, row: Partial<T>): Promise<T | null> {
        if (!supabase) return Promise.resolve(null);
        return Promise.resolve(supabase.from(table).update(row).eq('id', id).select().single()).then(function (res) {
            if (res.error) {
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
    }, [table]);

    const remove = useCallback(function (id: number): Promise<void> {
        if (!supabase) return Promise.resolve();
        return Promise.resolve(supabase.from(table).delete().eq('id', id)).then(function (res) {
            if (res.error) {
                console.error('[DB] Delete error on ' + table + ':', res.error.message, res.error);
                throw res.error;
            }
            setData(function (prev) { return prev.filter(function (item) { return item.id !== id; }); });
        });
    }, [table]);

    return { data, loading, refetch: fetchData, insert, update, remove, setData };
}

// Single-row table (settings)
export function useSettings(): {
    settings: import('@/types').Settings | null;
    loading: boolean;
    save: (data: Partial<import('@/types').Settings>) => Promise<import('@/types').Settings | null>;
} {
    const [settings, setSettings] = useState<import('@/types').Settings | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(function () {
        if (!supabase) { setLoading(false); return; }
        supabase.from('settings').select('*').single().then(function (res) {
            if (res.data) setSettings(res.data as import('@/types').Settings);
            setLoading(false);
        });
    }, []);

    const save = useCallback(function (data: Partial<import('@/types').Settings>): Promise<import('@/types').Settings | null> {
        if (!supabase) return Promise.resolve(null);
        return Promise.resolve(supabase.from('settings').update(data).eq('id', 1).select().single()).then(function (res) {
            if (res.data) setSettings(res.data as import('@/types').Settings);
            return res.data as import('@/types').Settings;
        });
    }, []);

    return { settings, loading, save };
}
