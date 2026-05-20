'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ComponentFolderRow {
    id: string;
    organization_id: string;
    parent_id: string | null;
    name: string;
    icon: string;
    color: string | null;
    sort_order: number;
}

/* Lichtgewicht hook: laadt component_folders + realtime sub.
   Gracefully degraderen: als tabel niet bestaat (migration nog niet gedraaid)
   → available=false, lege rows. Page rendert dan zonder folder-rij. */
export function useComponentFolders(): {
    rows: ComponentFolderRow[];
    loading: boolean;
    available: boolean;
    refetch: () => Promise<void>;
} {
    const [rows, setRows] = useState<ComponentFolderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    const refetch = useCallback(async function () {
        const { data, error } = await supabase
            .from('component_folders')
            .select('id, organization_id, parent_id, name, icon, color, sort_order')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        if (error) {
            if (error.code === '42P01') {
                setAvailable(false);
                setRows([]);
            } else {
                console.warn('[componenten] kon folders niet laden:', error.message);
                setRows([]);
            }
        } else {
            setRows((data ?? []) as ComponentFolderRow[]);
            setAvailable(true);
        }
        setLoading(false);
    }, []);

    useEffect(function () {
        refetch();
        const ch = supabase
            .channel('component_folders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'component_folders' }, function () {
                refetch();
            })
            .subscribe();
        return function () { supabase.removeChannel(ch); };
    }, [refetch]);

    return { rows, loading, available, refetch };
}
