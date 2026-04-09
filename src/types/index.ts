// =============================================
// BBQ Architect — Shared App Types
// =============================================

export * from './database.types';
import type { DbEvent, Offerte, InventoryItem, Factuur } from './database.types';

// ── Notification / Toast ──
export interface Notification {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

// ── KPI Dashboard ──
export interface KPIs {
  actieveOffertes: number;
  aankomendEvents: number;
  wachtOpAkkoord: number;
  totaalOffertesExBtw: number;
  lowStock: number;
  openFacturen: number;
}

// ── App Context ──
export interface AppContextValue {
  upcomingEvents: DbEvent[];
  activeOffertes: Offerte[];
  lowStockItems: InventoryItem[];
  openFacturen: Factuur[];
  notifications: Notification[];
  kpis: KPIs;
  badges: Record<string, number>;
  loaded: boolean;
  refetch: () => void;
  pushNotification: (message: string, type?: string, duration?: number) => number;
  dismissNotification: (id: number) => void;
}

// ── Line Totals ──
export interface LineTotals {
  subtotaal: number;
  btw: number;
  totaal: number;
}

// ── Marge Calculation ──
export interface MargeResult {
  omzet: number;
  foodcostTotaal: number;
  winst: number;
  nettoWinst: number;
  margePct: number;
}

// ── useSupabase Hook ──
export interface UseSupabaseReturn<T> {
  data: T[];
  loading: boolean;
  refetch: () => void;
  insert: (row: Partial<T>) => Promise<T | null>;
  update: (id: number, row: Partial<T>) => Promise<T | null>;
  remove: (id: number) => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T[]>>;
}

export interface UseSettingsReturn {
  settings: import('./database.types').Settings | null;
  loading: boolean;
  save: (data: Partial<import('./database.types').Settings>) => Promise<import('./database.types').Settings | null>;
}

// ── Email types ──
export interface Email {
  id: number;
  klant_id: number | null;
  aan_email: string;
  aan_naam: string | null;
  onderwerp: string;
  inhoud: string;
  type: string;
  status: string;
  created_at: string;
}

export interface EmailTemplate {
  id: number;
  naam: string;
  onderwerp: string;
  body: string;
  categorie: string;
  created_at: string;
}

// Re-export DbEvent as Event alias for backward compatibility
export type { DbEvent as Event } from './database.types';
