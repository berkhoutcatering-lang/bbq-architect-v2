// Sprint 2-deel-3 C8 — KvK Search lookup met dual-source.
// Primair: officiële KvK API (api.kvk.nl) ~€0.30/lookup, vereist KVK_API_KEY env-var.
// Fallback: OpenKvK (open-data, gratis, beperkter).
//
// Geen Anthropic / LLM-call in dit pad — alleen deterministische HTTP-fetches.
// Caller bepaalt caching (zie org_kvk_cache tabel in 20260522110100).

export interface KvkResult {
  kvk_nummer: string;
  bedrijfsnaam: string;
  straat?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
  btw_nummer?: string;
  vestiging_type?: string;
}

export interface KvkSearchOutput {
  source: 'kvk_official' | 'openkvk';
  results: KvkResult[];
}

// Module-level toggle voor tests — laat de e2e tests een fake fetcher injecteren.
type Fetcher = typeof fetch;
let _fetcher: Fetcher = fetch;
export function _setKvkFetcher(f: Fetcher) { _fetcher = f; }

const KVK_OFFICIAL_BASE = 'https://api.kvk.nl/api/v2/zoeken';
const OPENKVK_BASE = 'https://api.overheid.io/openkvk';

/**
 * Zoek bedrijven op naam of KvK-nummer. Returnt max 10 hits.
 * `q` = string (≥3 chars) of een 8-digit KvK-nummer.
 */
export async function searchKvk(q: string): Promise<KvkSearchOutput> {
  const trimmed = q.trim();
  if (trimmed.length < 3) {
    return { source: 'openkvk', results: [] };
  }

  const hasOfficialKey = !!process.env.KVK_API_KEY;
  if (hasOfficialKey) {
    try {
      return await searchOfficial(trimmed);
    } catch (err) {
      // Log to server console; fall back silently so tenant nog steeds bedrijven kan vinden
      console.error('[kvk] official lookup failed, falling back to openkvk:', err);
      return await searchOpenkvk(trimmed);
    }
  }
  return await searchOpenkvk(trimmed);
}

// ── Officiële KvK API ──────────────────────────────────────────────────────
// Docs: https://developers.kvk.nl/documentation/zoeken-api-v2

async function searchOfficial(q: string): Promise<KvkSearchOutput> {
  const isKvkNum = /^\d{8}$/.test(q);
  const url = new URL(KVK_OFFICIAL_BASE);
  if (isKvkNum) {
    url.searchParams.set('kvkNummer', q);
  } else {
    url.searchParams.set('naam', q);
  }
  url.searchParams.set('type', 'hoofdvestiging');

  const res = await _fetcher(url.toString(), {
    headers: { 'apikey': process.env.KVK_API_KEY! },
    // KvK enforce't TLS; geen extra timeout-config needed (Node defaults)
  });
  if (!res.ok) throw new Error(`KvK API status ${res.status}`);
  const data = await res.json() as { resultaten?: unknown[] };

  const results: KvkResult[] = (data.resultaten ?? []).slice(0, 10).map(parseKvkOfficial);
  return { source: 'kvk_official', results };
}

function parseKvkOfficial(raw: unknown): KvkResult {
  const r = raw as Record<string, unknown>;
  const adres = (r.adres as Record<string, unknown> | undefined);
  return {
    kvk_nummer: String(r.kvkNummer ?? ''),
    bedrijfsnaam: String(r.handelsnaam ?? r.naam ?? ''),
    straat: adres?.straatnaam as string | undefined,
    huisnummer: adres?.huisnummer != null ? String(adres.huisnummer) : undefined,
    postcode: adres?.postcode as string | undefined,
    plaats: adres?.plaats as string | undefined,
    vestiging_type: r.type as string | undefined,
  };
}

// ── OpenKvK / overheid.io ──────────────────────────────────────────────────
// Open-data proxy. Niet officieel, gratis, beperkte velden.

async function searchOpenkvk(q: string): Promise<KvkSearchOutput> {
  const isKvkNum = /^\d{8}$/.test(q);
  const url = new URL(OPENKVK_BASE);
  if (isKvkNum) {
    url.searchParams.set('filters[dossiernummer]', q);
  } else {
    url.searchParams.set('query', q);
  }
  url.searchParams.set('size', '10');

  const res = await _fetcher(url.toString(), {
    // overheid.io vraagt om een ovio-api-key voor heavy use; voor lage volumes
    // werkt het zonder. Tenant kan OPENKVK_API_KEY zetten als hij dat heeft.
    headers: process.env.OPENKVK_API_KEY ? { 'ovio-api-key': process.env.OPENKVK_API_KEY } : {},
  });
  if (!res.ok) {
    // OpenKvK rate-limits aggressief — geef lege resultaat terug bij failure
    return { source: 'openkvk', results: [] };
  }
  const data = await res.json() as { _embedded?: { rechtspersoon?: unknown[] }; resultaten?: unknown[] };
  const items = (data._embedded?.rechtspersoon ?? data.resultaten ?? []) as unknown[];

  const results: KvkResult[] = items.slice(0, 10).map(parseOpenkvk);
  return { source: 'openkvk', results };
}

function parseOpenkvk(raw: unknown): KvkResult {
  const r = raw as Record<string, unknown>;
  return {
    kvk_nummer: String(r.dossiernummer ?? r.kvk_nummer ?? ''),
    bedrijfsnaam: String(r.handelsnaam ?? r.naam ?? ''),
    straat: r.straatnaam as string | undefined,
    huisnummer: r.huisnummer != null ? String(r.huisnummer) : undefined,
    postcode: r.postcode as string | undefined,
    plaats: r.plaats as string | undefined,
  };
}
