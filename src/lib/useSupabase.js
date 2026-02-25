'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export function useSupabase(table, defaultVal) {
    var [data, setData] = useState(defaultVal || []);
    var [loading, setLoading] = useState(true);

    var fetchData = useCallback(function () {
        if (!supabase) { setLoading(false); return; }
        setLoading(true);
        supabase.from(table).select('*').order('id', { ascending: true }).then(function (res) {
            if (res.data) setData(res.data);
            setLoading(false);
        });
    }, [table]);

    useEffect(function () { fetchData(); }, [fetchData]);

    var insert = useCallback(function (row) {
        if (!supabase) return Promise.resolve(null);
        return supabase.from(table).insert(row).select().single().then(function (res) {
            if (res.data) setData(function (prev) { return prev.concat([res.data]); });
            return res.data;
        });
    }, [table]);

    var update = useCallback(function (id, row) {
        if (!supabase) return Promise.resolve(null);
        return supabase.from(table).update(row).eq('id', id).select().single().then(function (res) {
            if (res.data) {
                setData(function (prev) {
                    return prev.map(function (item) { return item.id === id ? res.data : item; });
                });
            }
            return res.data;
        });
    }, [table]);

    var remove = useCallback(function (id) {
        if (!supabase) return Promise.resolve(null);
        return supabase.from(table).delete().eq('id', id).then(function () {
            setData(function (prev) { return prev.filter(function (item) { return item.id !== id; }); });
        });
    }, [table]);

    return { data, loading, refetch: fetchData, insert, update, remove, setData };
}

// Single-row table (settings)
export function useSettings() {
    var [settings, setSettings] = useState(null);
    var [loading, setLoading] = useState(true);

    useEffect(function () {
        if (!supabase) { setLoading(false); return; }
        supabase.from('settings').select('*').single().then(function (res) {
            if (res.data) setSettings(res.data);
            setLoading(false);
        });
    }, []);

    var save = useCallback(function (data) {
        if (!supabase) return Promise.resolve(null);
        return supabase.from('settings').update(data).eq('id', 1).select().single().then(function (res) {
            if (res.data) setSettings(res.data);
            return res.data;
        });
    }, []);

    return { settings, loading, save };
}
