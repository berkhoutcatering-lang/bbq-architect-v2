'use client';
// ─── Global App Context ───────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { DbEvent, Offerte, InventoryItem, Factuur, Notification, KPIs, AppContextValue } from '@/types';

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
    const [upcomingEvents, setUpcomingEvents] = useState<DbEvent[]>([]);
    const [activeOffertes, setActiveOffertes] = useState<Offerte[]>([]);
    const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
    const [openFacturen, setOpenFacturen] = useState<Factuur[]>([]);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loaded, setLoaded] = useState(false);
    const notifIdRef = useRef(0);

    const loadGlobalData = useCallback(async function () {
        if (!supabase) return;
        const today = new Date().toISOString().slice(0, 10);

        const [evRes, offRes, invRes, facRes] = await Promise.all([
            supabase.from('events').select('id,name,date,guests,status,client_naam,location').gte('date', today).order('date').limit(10),
            supabase.from('offertes').select('id,nummer,status,client_naam,datum,aantal_gasten,basis_prijs_pp,items,korting,event_id').in('status', ['concept', 'geaccepteerd', 'verzonden']).order('datum', { ascending: false }).limit(20),
            supabase.from('inventory').select('id,naam,current_stock,min_stock,unit').lte('current_stock', supabase.rpc ? undefined : 999999),
            supabase.from('facturen').select('id,nummer,status,client_naam,vervaldatum,items').in('status', ['concept', 'verzonden', 'verlopen']).limit(10),
        ]);

        setUpcomingEvents((evRes.data || []) as DbEvent[]);
        setActiveOffertes((offRes.data || []) as Offerte[]);

        const inv = (invRes.data || []) as InventoryItem[];
        setLowStockItems(inv.filter(function (i) { return i.current_stock <= i.min_stock; }));
        setOpenFacturen((facRes.data || []) as Factuur[]);
        setLoaded(true);
    }, []);

    useEffect(function () {
        loadGlobalData();
    }, [loadGlobalData]);

    useEffect(function () {
        if (!supabase) return;

        const tables = ['events', 'offertes', 'facturen', 'inventory', 'prep_tasks'];
        const channels = tables.map(function (table) {
            return supabase
                .channel('global_rt_' + table)
                .on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
                    console.log('[AppContext RT]', table, 'change detected');
                    loadGlobalData();
                })
                .subscribe();
        });

        return function () {
            channels.forEach(function (ch) { supabase!.removeChannel(ch); });
        };
    }, [loadGlobalData]);

    const pushNotification = useCallback(function (message: string, type?: string, duration?: number): number {
        const notifType = (type || 'info') as Notification['type'];
        const notifDuration = duration || 4000;
        const id = ++notifIdRef.current;
        setNotifications(function (prev) {
            return prev.concat([{ id, message, type: notifType }]);
        });
        setTimeout(function () {
            setNotifications(function (prev) { return prev.filter(function (n) { return n.id !== id; }); });
        }, notifDuration);
        return id;
    }, []);

    const dismissNotification = useCallback(function (id: number) {
        setNotifications(function (prev) { return prev.filter(function (n) { return n.id !== id; }); });
    }, []);

    const kpis: KPIs = {
        actieveOffertes: activeOffertes.length,
        aankomendEvents: upcomingEvents.length,
        wachtOpAkkoord: activeOffertes.filter(function (o) { return o.status === 'concept' || o.status === 'verzonden'; }).length,
        totaalOffertesExBtw: activeOffertes.reduce(function (sum, o) {
            let items = o.items as unknown;
            if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
            const sub = (Array.isArray(items) ? items : []).reduce(function (s: number, i: Record<string, unknown>) { return s + (parseFloat(String(i.prijs || 0)) * parseFloat(String(i.qty || 1))); }, 0);
            const kor = parseFloat(String(o.korting || 0));
            return sum + Math.max(0, sub - kor);
        }, 0),
        lowStock: lowStockItems.length,
        openFacturen: openFacturen.length,
    };

    return (
        <AppContext.Provider value={{
            upcomingEvents,
            activeOffertes,
            lowStockItems,
            openFacturen,
            notifications,
            kpis,
            loaded,
            refetch: loadGlobalData,
            pushNotification,
            dismissNotification,
        }}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) {
        return {
            upcomingEvents: [],
            activeOffertes: [],
            lowStockItems: [],
            openFacturen: [],
            notifications: [],
            kpis: { actieveOffertes: 0, aankomendEvents: 0, wachtOpAkkoord: 0, totaalOffertesExBtw: 0, lowStock: 0, openFacturen: 0 },
            loaded: false,
            refetch: function () { },
            pushNotification: function () { return 0; },
            dismissNotification: function () { },
        };
    }
    return ctx;
}
