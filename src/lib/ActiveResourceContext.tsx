'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Active resource: een event/klant/offerte/klantgesprek waar de gebruiker
 * "in zit". Reist mee tussen pagina's zodat AI en sub-flows context houden.
 *
 * Persisteert in localStorage met TTL van 4 uur — daarna verdampt het stilletjes
 * zodat verlaten contexten niet voor altijd plakken.
 */

export type ActiveResourceKind = 'event' | 'klant' | 'offerte' | 'klantgesprek';

export interface ActiveResource {
  kind: ActiveResourceKind;
  id: string | number;
  label: string;       // "Bruiloft Familie Jansen — 14/06"
  href: string;        // "/events/123/hub"
  meta?: string;       // Optioneel: extra regel ("28 gasten, €70 pp")
  since: number;       // Epoch ms van laatste set
}

const STORAGE_KEY = 'bbq.activeResource';
const TTL_MS = 4 * 60 * 60 * 1000; // 4 uur

interface ActiveResourceContextValue {
  active: ActiveResource | null;
  setActive: (r: Omit<ActiveResource, 'since'>) => void;
  clear: () => void;
}

const ActiveResourceContext = createContext<ActiveResourceContextValue | null>(null);

/**
 * Lees de active resource buiten een React-context — handig voor chat-payload
 * builders die geen hook kunnen aanroepen. Geeft `null` als verlopen of leeg.
 */
export function getActiveResourceSnapshot(): ActiveResource | null {
  return readFromStorage();
}

function readFromStorage(): ActiveResource | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveResource;
    if (!parsed || typeof parsed.since !== 'number') return null;
    if (Date.now() - parsed.since > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function ActiveResourceProvider({ children }: { children: ReactNode }) {
  const [active, setActiveState] = useState<ActiveResource | null>(null);

  // Hydrate na mount (localStorage is client-only)
  useEffect(() => {
    setActiveState(readFromStorage());
  }, []);

  // Sync tussen tabs: als andere tab pill set/clear-t, ook hier updaten
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setActiveState(readFromStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setActive = useCallback((r: Omit<ActiveResource, 'since'>) => {
    const next: ActiveResource = { ...r, since: Date.now() };
    // Skip update als zelfde kind+id al actief is — voorkom unnodige re-renders
    setActiveState(prev => {
      if (prev && prev.kind === next.kind && String(prev.id) === String(next.id) && prev.label === next.label) {
        return prev;
      }
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    setActiveState(null);
  }, []);

  // Zelfherstel: als de actieve resource intussen verwijderd is (bv. event
  // gewist), wis de context zodat de pill geen dode link toont. Eén lichte
  // query per actieve resource; alléén wissen als de rij écht weg is —
  // niet bij een netwerk-/RLS-fout (dan houden we de context vast).
  useEffect(() => {
    if (!active) return;
    const table =
      active.kind === 'event' ? 'events'
      : active.kind === 'klant' ? 'klanten'
      : active.kind === 'offerte' ? 'offertes'
      : null;
    if (!table) return;
    let cancelled = false;
    supabase.from(table).select('id').eq('id', active.id).maybeSingle().then(({ data, error }) => {
      if (!cancelled && !error && data === null) clear();
    });
    return () => { cancelled = true; };
  }, [active, clear]);

  return (
    <ActiveResourceContext.Provider value={{ active, setActive, clear }}>
      {children}
    </ActiveResourceContext.Provider>
  );
}

export function useActiveResource(): ActiveResourceContextValue {
  const ctx = useContext(ActiveResourceContext);
  if (!ctx) {
    // Buiten provider: no-op fallback zodat consumers nooit crashen
    return {
      active: null,
      setActive: () => { /* no provider */ },
      clear: () => { /* no provider */ },
    };
  }
  return ctx;
}
