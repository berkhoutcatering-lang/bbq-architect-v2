/** Display-ready concept type for the new Brainstorm Studio UI. */
export interface Concept {
  /** Local id — generated client-side, stable across re-renders during a session */
  id: string;
  name: string;
  tagline: string;
  category: string; // 'Hoofd' | 'Side' | 'Borrel' | 'Dessert' etc
  cuisine: string; // 'BBQ · American' etc
  diet: string[]; // ['Vegan','Glutenvrij']
  portions: number;
  estCost: number; // €/portie
  estPrice: number; // €/portie verkoop
  margin: number; // 0-1
  prepTime: number; // minutes
  serveTemp: 'Warm' | 'Koud' | 'Kamer';
  confidence: number; // 0-1
  glyph: string; // emoji
  tone: string; // CSS gradient
  inspiredBy: { name: string; category?: string; price?: number; margin?: number; glyph?: string }[];
  ingredients: { name: string; qty: string; critical?: boolean }[];
  method: string[];
  allergens: string[];
  pairing: string;
  serviceTip: string;
  risk: 'low' | 'medium' | 'high';
  /** Saved-to-gerechten flag */
  saved?: boolean;
  /** Save state for UI */
  saveState?: 'idle' | 'saving' | 'saved' | 'error';
  saveError?: string;
  /** Pillar #1 (Provenance-first AI): per AI-claim de bron-attribution uit
   *  Anthropic Citations API. Aanvullend op inspiredBy (de hele recipe-bron). */
  citations?: Array<{ source_title: string; cited_text: string }>;
}

export interface HistoryItem {
  id: string;
  prompt: string;
  date: string; // ISO or display-string
  total: number;
  saved: number;
}

export const RISK_COLOR = (r: Concept['risk']): string =>
  r === 'low' ? '#22c55e' : r === 'medium' ? '#f59e0b' : '#ef4444';

export const RISK_LABEL = (r: Concept['risk']): string =>
  r === 'low' ? 'Laag risico' : r === 'medium' ? 'Mid complexiteit' : 'Hoog risico';
