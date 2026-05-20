'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface AgendaCategoryRow {
    id: string;
    organization_id: string;
    name: string;
    color: string;
    icon: string;
    default_visible: boolean;
    sort_order: number;
}

/* Lichtgewicht hook: leest agenda_categories uit Supabase, blijft via realtime
   in sync. Geen offline-storage (categorieën zijn meta-data, niet kritisch in
   het veld). Gracefully degrade: als de tabel nog niet bestaat (migration niet
   gedraaid) returnen we een lege lijst zonder error. */
export function useAgendaCategories(): {
    rows: AgendaCategoryRow[];
    loading: boolean;
    available: boolean;
    refetch: () => Promise<void>;
} {
    const [rows, setRows] = useState<AgendaCategoryRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [available, setAvailable] = useState(true);

    const refetch = useCallback(async function () {
        const { data, error } = await supabase
            .from('agenda_categories')
            .select('id, organization_id, name, color, icon, default_visible, sort_order')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });
        if (error) {
            /* code 42P01 = undefined_table — migration nog niet gedraaid. */
            if (error.code === '42P01') {
                setAvailable(false);
                setRows([]);
            } else {
                /* Andere errors: log maar verberg voor user — categorieën zijn niet
                   kritiek voor agenda-rendering, de hardcoded 3 cals blijven werken. */
                console.warn('[agenda] kon custom categorieën niet laden:', error.message);
                setRows([]);
            }
        } else {
            setRows((data ?? []) as AgendaCategoryRow[]);
            setAvailable(true);
        }
        setLoading(false);
    }, []);

    useEffect(function () {
        refetch();
        const ch = supabase
            .channel('agenda_categories_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_categories' }, function () {
                refetch();
            })
            .subscribe();
        return function () { supabase.removeChannel(ch); };
    }, [refetch]);

    return { rows, loading, available, refetch };
}
