/**
 * Geocoding (PDOK Locatieserver — gratis, geen API key, NL-only) +
 * routing (OSRM public demo — gratis, fair-use). Beide met localStorage cache
 * zodat herhaaldelijk dezelfde rit zien geen extra calls maakt.
 *
 * Privacy: PDOK is een Nederlandse overheid-service, draait in NL. Geen
 * Google/Mapbox involved. Voor adressen buiten NL fail-fast we naar null.
 */

export interface LngLat {
  lng: number;
  lat: number;
}

const GEOCODE_KEY = 'bbq.geocode.v1';
const OSRM_KEY = 'bbq.osrm.v1';

interface CacheEntry<T> {
  v: T;
  t: number; // timestamp ms
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days — adressen verhuizen zelden

function readCache<T>(key: string, sub: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const all: Record<string, CacheEntry<T>> = JSON.parse(raw);
    const entry = all[sub];
    if (!entry) return null;
    if (Date.now() - entry.t > CACHE_TTL) return null;
    return entry.v;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, sub: string, v: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(key);
    const all: Record<string, CacheEntry<T>> = raw ? JSON.parse(raw) : {};
    all[sub] = { v, t: Date.now() };
    localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // quota exceeded — ignore
  }
}

/** Parse "Sligro Emmen, James Wattstraat 12" → ['Sligro Emmen', 'James Wattstraat 12'] */
function splitAdres(adres: string): { city: string | null; street: string | null } {
  const cleaned = adres.trim();

  // Extract a Dutch city name we recognize. PDOK kan goed met "James Wattstraat 12"
  // wanneer we hem expliciet vertellen welke woonplaats — maar zonder die hint
  // val hij vaak naar Amsterdam of een willekeurige andere fuzzy-match.
  // Slim parsen: zoek naar bekende stedeen of laatste komma-segment.
  const KNOWN_CITIES = [
    'amsterdam','rotterdam','den haag','utrecht','eindhoven','groningen','tilburg',
    'almere','breda','nijmegen','enschede','apeldoorn','haarlem','arnhem','zaanstad',
    'amersfoort','den bosch','hoofddorp','leiden','zoetermeer','zwolle','deventer',
    'borger','emmen','assen','meppel','hoogeveen','coevorden','westerbork','beilen',
    'borne','denekamp','delden','markelo','haaksbergen','goor','almelo','hengelo',
    'oldenzaal','rijssen','wierden','holten','odoorn','exloo','rolde','klazienaveen',
  ];

  const lower = cleaned.toLowerCase();
  let foundCity: string | null = null;
  for (const c of KNOWN_CITIES) {
    if (lower.includes(c)) {
      foundCity = c.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      break;
    }
  }

  // Strip the city part out to isolate the street segment
  let street: string | null = cleaned;
  if (foundCity) {
    const re = new RegExp('\\b' + foundCity.replace(/\s+/g, '\\s+') + '\\b', 'i');
    street = cleaned.replace(re, '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();
    // Strip business prefixes ("Sligro", "Hop & Bites HQ") to keep only street+nr
    // Note: no leading \b so "Wattstraat" matches via "straat" suffix
    const STREET_KEYWORDS = /(?:straat|laan|weg|plein|park|hof|kade|dijk|singel|gracht|baan|dreef)\b/i;
    if (street && !STREET_KEYWORDS.test(street)) {
      street = null; // can't extract a real street — just use city
    }
  }
  return { city: foundCity, street };
}

async function pdokSearch(q: string, fq?: string): Promise<LngLat | null> {
  const url = new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
  url.searchParams.set('q', q);
  url.searchParams.set('fl', 'centroide_ll,weergavenaam,type');
  url.searchParams.set('rows', '1');
  if (fq) url.searchParams.set('fq', fq);

  try {
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const j = await r.json();
    const doc = j?.response?.docs?.[0];
    if (!doc?.centroide_ll) return null;
    const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(doc.centroide_ll);
    if (!m) return null;
    return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  } catch {
    return null;
  }
}

/**
 * Geocode een Nederlands adres via PDOK Locatieserver.
 * Strategy (fallback chain om foutieve fuzzy-matches op andere steden te
 * voorkomen — bv. "James Wattstraat 12, Emmen" matcht zonder hint naar
 * Amsterdam):
 *   1. Als we een city + street kunnen parsen: zoek straat met
 *      `woonplaatsnaam:<city>`-filter (huisnummer-precies)
 *   2. Anders: zoek alleen op stadnaam (gemeente-centroïde)
 *   3. Laatste poging: hele query zonder filter
 */
export async function geocodeNL(adres: string): Promise<LngLat | null> {
  if (!adres || !adres.trim()) return null;
  const cacheKey = adres.trim().toLowerCase();
  const cached = readCache<LngLat>(GEOCODE_KEY, cacheKey);
  if (cached) return cached;

  const { city, street } = splitAdres(adres);

  let result: LngLat | null = null;

  if (city && street) {
    result = await pdokSearch(street, `type:adres AND woonplaatsnaam:${city}`);
  }
  if (!result && city) {
    result = await pdokSearch(city, 'type:woonplaats');
  }
  if (!result) {
    result = await pdokSearch(adres);
  }

  if (result) writeCache(GEOCODE_KEY, cacheKey, result);
  return result;
}

export interface OsrmRoute {
  /** GeoJSON LineString coordinates: [lng, lat][] */
  coordinates: [number, number][];
  /** Distance in meters */
  distance: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Haal echte rij-route op tussen twee coords via OSRM public demo.
 * Cached per `from-to` paar. Gracefully returnt null bij timeout/error.
 */
export async function getOsrmRoute(from: LngLat, to: LngLat): Promise<OsrmRoute | null> {
  const sub = `${from.lng.toFixed(4)},${from.lat.toFixed(4)}-${to.lng.toFixed(4)},${to.lat.toFixed(4)}`;
  const cached = readCache<OsrmRoute>(OSRM_KEY, sub);
  if (cached) return cached;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000); // 8s timeout — public demo kan traag zijn
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!r.ok) return null;
    const j = await r.json();
    const route = j?.routes?.[0];
    if (!route?.geometry?.coordinates) return null;

    const result: OsrmRoute = {
      coordinates: route.geometry.coordinates,
      distance: route.distance,
      duration: route.duration,
    };
    writeCache(OSRM_KEY, sub, result);
    return result;
  } catch {
    return null;
  }
}

/** Bereken bbox uit een set lng/lat punten — voor `map.fitBounds`. */
export function computeBounds(points: LngLat[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const p of points) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
