'use client';
// ─── Global App Context ───────────────────────────────────────────────────────
// Één centrale data hub voor het hele BBQ Architect ecosysteem.
// Laadt kritieke data één keer en maakt die realtime beschikbaar in alle modules.
// Gebruik: import { useApp } from '@/lib/AppContext';

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

var AppContext = createContext(null);

export function AppProvider({ children }) {
    // ── Globale data state ─────────────────────────────────────────────────
    var [upcomingEvents, setUpcomingEvents] = useState([]);
    var [activeOffertes, setActiveOffertes] = useState([]);
    var [lowStockItems, setLowStockItems] = useState([]);
    var [openFacturen, setOpenFacturen] = useState([]);
    var [notifications, setNotifications] = useState([]);
    var [loaded, setLoaded] = useState(false);
    var notifIdRef = useRef(0);

    // ── Ophalen van globale data ───────────────────────────────────────────
    var loadGlobalData = useCallback(async function () {
        if (!supabase) return;
        var today = new Date().toISOString().slice(0, 10);

        var [evRes, offRes, invRes, facRes] = await Promise.all([
            supabase.from('events').select('id,name,date,guests,status,client_naam,location').gte('date', today).order('date').limit(10),
            supabase.from('offertes').select('id,nummer,status,client_naam,datum,aantal_gasten,basis_prijs_pp,items,korting,event_id').in('status', ['concept', 'geaccepteerd', 'verzonden']).order('datum', { ascending: false }).limit(20),
            supabase.from('inventory').select('id,naam,current_stock,min_stock,unit').lte('current_stock', supabase.rpc ? undefined : 999999),
            supabase.from('facturen').select('id,nummer,status,client_naam,vervaldatum,items').in('status', ['concept', 'verzonden', 'verlopen']).limit(10),
        ]);

        setUpcomingEvents(evRes.data || []);
        setActiveOffertes(offRes.data || []);

        // Filter lage voorraad client-side
        var inv = invRes.data || [];
        setLowStockItems(inv.filter(function (i) { return i.current_stock <= i.min_stock; }));
        setOpenFacturen(facRes.data || []);
        setLoaded(true);
    }, []);

    useEffect(function () {
        loadGlobalData();
    }, [loadGlobalData]);

    // ── Realtime subscriptions op alle kritieke tabellen ──────────────────
    useEffect(function () {
        if (!supabase) return;

        var tables = ['events', 'offertes', 'facturen', 'inventory', 'prep_tasks'];
        var channels = tables.map(function (table) {
            return supabase
                .channel('global_rt_' + table)
                .on('postgres_changes', { event: '*', schema: 'public', table: table }, function (payload) {
                    console.log('[AppContext RT]', table, payload.eventType);
                    loadGlobalData();
                })
                .subscribe();
        });

        return function () {
            channels.forEach(function (ch) { supabase.removeChannel(ch); });
        };
    }, [loadGlobalData]);

    // ── Notification / Toast bus ───────────────────────────────────────────
    var pushNotification = useCallback(function (message, type, duration) {
        type = type || 'info';
        duration = duration || 4000;
        var id = ++notifIdRef.current;
        setNotifications(function (prev) {
            return prev.concat([{ id: id, message: message, type: type }]);
        });
        setTimeout(function () {
            setNotifications(function (prev) { return prev.filter(function (n) { return n.id !== id; }); });
        }, duration);
        return id;
    }, []);

    var dismissNotification = useCallback(function (id) {
        setNotifications(function (prev) { return prev.filter(function (n) { return n.id !== id; }); });
    }, []);

    // ── KPI helpers ────────────────────────────────────────────────────────
    var kpis = {
        actieveOffertes: activeOffertes.length,
        aankomendEvents: upcomingEvents.length,
        wachtOpAkkoord: activeOffertes.filter(function (o) { return o.status === 'concept' || o.status === 'verzonden'; }).length,
        totaalOffertesExBtw: activeOffertes.reduce(function (sum, o) {
            var items = o.items;
            if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
            var sub = (Array.isArray(items) ? items : []).reduce(function (s, i) { return s + (parseFloat(i.prijs || 0) * parseFloat(i.qty || 1)); }, 0);
            var kor = parseFloat(o.korting || 0);
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

export function useApp() {
    var ctx = useContext(AppContext);
    if (!ctx) {
        // Graceful fallback als buiten provider gebruikt
        return {
            upcomingEvents: [],
            activeOffertes: [],
            lowStockItems: [],
            openFacturen: [],
            notifications: [],
            kpis: {},
            loaded: false,
            refetch: function () { },
            pushNotification: function () { },
            dismissNotification: function () { },
        };
    }
    return ctx;
}
