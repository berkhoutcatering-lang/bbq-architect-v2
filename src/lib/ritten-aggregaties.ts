/**
 * Helpers voor Rittenregistratie — formatters + maand-aggregaten.
 * Tarieven (€/km, BTW) staan NOOIT hier — die zijn in src/lib/ritten-tarieven.ts.
 */

import type { Rit } from '@/types';
import { tariefVoorJaar } from './ritten-tarieven';

export const fmtKm = (n: number): string =>
  n.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';

export const fmtEur = (n: number): string =>
  '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDateR = (d: Date): string => {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
};

export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const sameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

export interface Aggregaat {
  count: number;
  totaalKm: number;
  aftrekKm: number;
  aftrekEur: number;
}

/**
 * Bereken totalen voor een set ritten.
 * - aftrekKm = som van km voor zakelijke ritten minus privé-omleiding
 * - aftrekEur = aftrekKm * tarief van het jaar van die rit
 */
export function aggregeer(ritten: Rit[]): Aggregaat {
  let aftrekKm = 0;
  let aftrekEur = 0;
  let totaalKm = 0;
  for (const r of ritten) {
    const km = r.kilometers ?? r.km_eind - r.km_begin;
    totaalKm += km;
    if (r.zakelijk) {
      const z = Math.max(0, km - (r.prive_omleiding_km ?? 0));
      aftrekKm += z;
      const jaar = new Date(r.datum).getFullYear();
      aftrekEur += z * tariefVoorJaar(jaar);
    }
  }
  return {
    count: ritten.length,
    totaalKm: Math.round(totaalKm * 10) / 10,
    aftrekKm: Math.round(aftrekKm * 10) / 10,
    aftrekEur: Math.round(aftrekEur * 100) / 100,
  };
}

export type Periode = 'Week' | 'Maand' | 'Kwartaal' | 'Jaar';

/** Filter ritten op een periode rond `now`. */
export function filterPeriode(ritten: Rit[], periode: Periode, now: Date = new Date()): Rit[] {
  const cutoff = new Date(now);
  switch (periode) {
    case 'Week':
      cutoff.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      cutoff.setHours(0, 0, 0, 0);
      break;
    case 'Maand':
      cutoff.setDate(1);
      cutoff.setHours(0, 0, 0, 0);
      break;
    case 'Kwartaal': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      cutoff.setMonth(qStart, 1);
      cutoff.setHours(0, 0, 0, 0);
      break;
    }
    case 'Jaar':
      cutoff.setMonth(0, 1);
      cutoff.setHours(0, 0, 0, 0);
      break;
  }
  return ritten.filter((r) => new Date(r.datum) >= cutoff);
}

/** Mappert vertrek-/aankomst-adres op een ruwe categorie voor filter-chips + kleur. */
export type Categorie = 'event' | 'inkoop' | 'sales' | 'tanken' | 'woon-werk' | 'prive';

export interface CatMeta {
  id: Categorie;
  label: string;
  icon: string;
  color: string;
}

export const CATEGORIEEN: CatMeta[] = [
  { id: 'event', label: 'Event / Catering', icon: 'party-popper', color: '#FFBF00' },
  { id: 'inkoop', label: 'Inkoop', icon: 'shopping-cart', color: '#60a5fa' },
  { id: 'sales', label: 'Sales / Bezoek', icon: 'heart-handshake', color: '#a78bfa' },
  { id: 'tanken', label: 'Tanken / Service', icon: 'fuel', color: '#10b981' },
  { id: 'woon-werk', label: 'Woon-werk', icon: 'home', color: '#888888' },
  { id: 'prive', label: 'Privé', icon: 'user-round', color: '#5a5a5e' },
];

export const CAT_BY_ID: Record<Categorie, CatMeta> = Object.fromEntries(
  CATEGORIEEN.map((c) => [c.id, c]),
) as Record<Categorie, CatMeta>;

/**
 * Categoriseer een rit op basis van event_id, zakelijk-flag en doel-tekst.
 * Heuristisch — voor v1 simpel; later kan dit een aparte `categorie` kolom worden.
 */
export function categoriseerRit(rit: Pick<Rit, 'event_id' | 'zakelijk' | 'doel' | 'aankomst_adres'>): Categorie {
  if (!rit.zakelijk) return 'prive';
  if (rit.event_id) return 'event';
  const doel = (rit.doel || '').toLowerCase();
  const adres = (rit.aankomst_adres || '').toLowerCase();
  if (/tank|shell|bp|esso|total/i.test(doel + ' ' + adres)) return 'tanken';
  if (/sligro|hanos|makro|inkoop|bestelling|leverancier|slagerij/i.test(doel + ' ' + adres)) return 'inkoop';
  if (/sales|bezoek|locatie|kennismaking/i.test(doel)) return 'sales';
  if (/woon|huis/i.test(doel)) return 'woon-werk';
  return 'inkoop';
}

/** Snelle reverse-geocode helpers voor map-preview (heuristisch op postcode/stad). */
export interface CoordHint {
  lat: number;
  lng: number;
}

const STAD_COORDS: Record<string, CoordHint> = {
  borger: { lat: 52.917, lng: 6.799 },
  emmen: { lat: 52.785, lng: 6.897 },
  assen: { lat: 52.995, lng: 6.564 },
  groningen: { lat: 53.222, lng: 6.566 },
  hoogeveen: { lat: 52.722, lng: 6.48 },
  westerbork: { lat: 52.851, lng: 6.609 },
  markelo: { lat: 52.25, lng: 6.48 },
  borne: { lat: 52.299, lng: 6.745 },
  delden: { lat: 52.27, lng: 6.73 },
  denekamp: { lat: 52.378, lng: 6.971 },
  odoorn: { lat: 52.852, lng: 6.87 },
  meppel: { lat: 52.696, lng: 6.193 },
};

/** Probeer een rough lat/lng te raden op basis van een vrije adres-string (alleen voor map-preview). */
export function adresNaarCoord(adres: string | null | undefined): CoordHint | null {
  if (!adres) return null;
  const lower = adres.toLowerCase();
  for (const [key, coord] of Object.entries(STAD_COORDS)) {
    if (lower.includes(key)) return coord;
  }
  return null;
}
