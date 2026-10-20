'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { dedupe } from '@/lib/requestDedupe';
import { VERS_MS, tableCache, settingsCache, cacheKey } from '@/lib/dataCache';
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
    /**
     * Welke kolommen ophalen. Standaard `*` — alles. Gebruik dit op tabellen
     * met zware kolommen die de pagina toch niet toont. Concreet geval: oude
     * `bonnen`-rijen hebben de bonfoto als base64 in `image_url` staan, goed
     * voor 130 KB op de startpagina terwijl daar alleen bedragen en datums
     * worden gebruikt.
     *
     * Neem `id` altijd mee — insert/update/remove en de realtime-refresh
     * rekenen erop.
     */
    columns?: string;
}

/* id mag number (bigserial-tabellen) of string (uuid-tabellen zoals
   floor_plans/service_zones) zijn — Supabase .eq('id', …) accepteert beide. */
export function useSupabase<T extends { id: number | string }>(
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
    update: (id: number | string, row: Partial<T>) => Promise<T | null>;
    remove: (id: number | string) => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<T[]>>;
} {
    const skipInitialFetch = options?.skipInitialFetch ?? false;
    const columns = options?.columns ?? '*';
    const { orgId } = useOrg();
    const key = orgId ? cacheKey(table, orgId, columns) : null;
    /* Volgorde van voorrang bij de eerste weergave: servergegevens (vers,
       meegegeven met skipInitialFetch) → geheugen van een vorige pagina →
       de meegegeven standaardwaarde. */
    const [data, setData] = useState<T[]>(function () {
        if (skipInitialFetch && defaultVal) return defaultVal;
        const hit = key ? tableCache.get(key) : undefined;
        return hit ? (hit.rows as T[]) : (defaultVal || []);
    });
    /* Laden alleen als er nog níets te tonen is: geen servergegevens en niets
       in het geheugen. Anders tonen we wat er is en verversen we stil. */
    const [loading, setLoading] = useState(function () {
        if (skipInitialFetch) return false;
        return !(key && tableCache.has(key));
    });
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeOffline = useActiveOfflineState();
    const offlineMode = activeOffline !== null && isOfflineEnabledTable(table);
    /* Mag `data` naar het geheugen? Pas na een echte fetch of servergegevens —
       anders zou de lege standaardwaarde als "opgehaald" in het geheugen
       belanden en toont de volgende pagina ten onrechte een lege lijst. */
    const syncedRef = useRef<boolean>(skipInitialFetch && !!defaultVal);
    const hasRowsRef = useRef<boolean>(!loading);

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
        if (!hasRowsRef.current) setLoading(true);
        setError(null);
        /* Meerdere componenten op dezelfde pagina vragen dezelfde tabel op
           zonder van elkaar te weten — op de startpagina gingen `gerechten` en
           `offertes` er zo drie keer uit. Gelijktijdige identieke verzoeken
           delen nu één ronde; na afloop wordt er niets bewaard, dus een
           refetch (ook die van realtime) haalt gewoon verse data op. */
        dedupe('tbl:' + table + ':' + orgId + ':' + columns, function () {
            return supabase!
                .from(table)
                .select(columns)
                .eq('organization_id', orgId)
                .order('id', { ascending: true });
        })
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
                /* Dubbele cast: met een dynamische kolom-string kan Supabase
                   de rij-vorm niet afleiden en valt hij terug op
                   GenericStringError[]. De echte vorm bewaakt de consumer via
                   het type-argument van useSupabase<T>. */
                if (res.data) {
                    tableCache.set(cacheKey(table, orgId, columns), { rows: res.data as unknown[], at: Date.now() });
                    syncedRef.current = true;
                    hasRowsRef.current = true;
                    setData(res.data as unknown as T[]);
                }
                setLoading(false);
            });
    }, [table, orgId, offlineMode, activeOffline, columns]);

    /* Optimistische wijzigingen (insert/update/remove/setData) ook in het
       geheugen zetten, zodat een volgende pagina niet de oude stand toont.
       Het ophaal-tijdstip blijft staan: een wijziging is geen verse fetch. */
    useEffect(function () {
        if (!key || offlineMode || !syncedRef.current) return;
        const prev = tableCache.get(key);
        tableCache.set(key, { rows: data as unknown[], at: prev?.at ?? Date.now() });
    }, [data, key, offlineMode]);

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
        /* Altijd verversen bij openen, ook als er iets in het geheugen staat:
           dat geheugen wordt alleen getoond (geen laadicoon), niet vertrouwd.
           Een pagina die net iets opsloeg buiten deze hook om (server-actie,
           wizard) mag hier nooit een oude stand achterlaten. Gelijktijdige
           identieke vragen deelt dedupe() al. */
        fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }, [table, orgId, offlineMode, activeOffline, columns]);

    const update = useCallback(function (id: number | string, row: Partial<T>): Promise<T | null> {
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
                /* Offline-queue werkt alleen voor bigserial-tabellen — uuid-ids
                   komen hier in de praktijk nooit (niet offline-enabled). */
                rowId: typeof id === 'number' ? id : null,
            })
                .then(function () {
                    if (merged) return applyLocalMutation(table as OfflineTable, 'update', merged as unknown as Record<string, unknown>, typeof id === 'number' ? id : null);
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
    }, [table, orgId, offlineMode, activeOffline, columns]);

    const remove = useCallback(function (id: number | string): Promise<void> {
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
                rowId: typeof id === 'number' ? id : null,
            })
                .then(function () {
                    return applyLocalMutation(table as OfflineTable, 'delete', { id }, typeof id === 'number' ? id : null);
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
    }, [table, orgId, offlineMode, activeOffline, columns]);

    return { data, loading, error, refetch: fetchData, insert, update, remove, setData };
}

/* ── Instellingen: één rij per bedrijf, gedeeld ─────────────────────────
   Werd per component apart opgehaald: thema, logo, persona-quiz, offertes en
   de afspraak-wizard vroegen allemaal `settings` — 3 à 4 keer per pagina
   (meting 2026-10-20). Nu één gedeelde kopie per bedrijf: iedere nieuwe
   gebruiker toont die direct en ververst op de achtergrond; gelijktijdige
   vragen gaan als één de deur uit (dedupe). */
type SettingsRow = import('@/types').Settings;
const settingsListeners = new Set<(orgId: string) => void>();

function publishSettings(orgId: string, value: SettingsRow | null) {
    settingsCache.set(orgId, { value, at: Date.now() });
    settingsListeners.forEach(function (fn) { fn(orgId); });
}

/** Haalt de instellingen-rij op via de gedeelde kopie. Voor code buiten
 *  React-hooks (bv. een eenmalige check); `force` slaat het geheugen over. */
export function fetchSettingsShared(orgId: string, force = false): Promise<SettingsRow | null> {
    const hit = settingsCache.get(orgId);
    if (hit && !force && Date.now() - hit.at < VERS_MS) return Promise.resolve(hit.value);
    if (!supabase) return Promise.resolve(hit?.value ?? null);
    return dedupe('settings:' + orgId, function () {
        return supabase!.from('settings').select('*').eq('organization_id', orgId).maybeSingle();
    }).then(function (res) {
        if (res.error) return hit?.value ?? null;
        const value = (res.data as SettingsRow | null) ?? null;
        publishSettings(orgId, value);
        return value;
    });
}

/** Na een wijziging buiten useSettings().save om (bv. een server-actie):
 *  vers ophalen en alle gebruikers bijwerken. */
export function refreshSettings(orgId: string): Promise<SettingsRow | null> {
    return fetchSettingsShared(orgId, true);
}

// Single-row table (settings) — scoped by organization
export function useSettings(): {
    settings: SettingsRow | null;
    loading: boolean;
    save: (data: Partial<SettingsRow>) => Promise<SettingsRow | null>;
} {
    const { orgId } = useOrg();
    const [settings, setSettings] = useState<SettingsRow | null>(function () {
        return orgId ? settingsCache.get(orgId)?.value ?? null : null;
    });
    const [loading, setLoading] = useState(function () {
        return !(orgId && settingsCache.has(orgId));
    });

    useEffect(function () {
        if (!supabase || !orgId) { setLoading(false); return; }
        function onPublish(changed: string) {
            if (changed !== orgId) return;
            setSettings(settingsCache.get(changed)?.value ?? null);
            setLoading(false);
        }
        settingsListeners.add(onPublish);
        /* Bij openen altijd vers (gelijktijdige vragen deelt dedupe); het
           geheugen zorgt alleen dat er meteen iets staat. */
        fetchSettingsShared(orgId, true).then(function (value) {
            setSettings(value);
            setLoading(false);
        });
        return function () { settingsListeners.delete(onPublish); };
    }, [orgId]);

    const save = useCallback(function (data: Partial<SettingsRow>): Promise<SettingsRow | null> {
        if (!supabase || !orgId) return Promise.resolve(null);
        return Promise.resolve(
            supabase.from('settings').update(data).eq('organization_id', orgId).select().single()
        ).then(function (res) {
            if (res.data) publishSettings(orgId, res.data as SettingsRow);
            return res.data as SettingsRow;
        });
    }, [orgId]);

    return { settings, loading, save };
}
