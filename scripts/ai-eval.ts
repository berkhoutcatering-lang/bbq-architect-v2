/**
 * AI Evaluation Script — Playbook §I
 *
 * Draait de cases uit docs/ai-evals/<endpoint>/*.json tegen een lopende
 * BBQ Architect server en meldt accuracy per endpoint.
 *
 * Gebruik:
 *   npm run dev               # in een andere terminal
 *   BBQ_EVAL_BASE=http://localhost:3000 npx tsx scripts/ai-eval.ts
 *
 * Exit codes:
 *   0 = alle eval-sets ≥ threshold (default 90%)
 *   1 = ten minste één eval-set onder threshold (regressie)
 *   2 = technische fout (geen server, geen API key, ...)
 *
 * Toevoegen van cases: zie docs/ai-evals/README.md
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface TestCase {
  id: string;
  description: string;
  request: {
    path: string; // e.g. "/api/recipe-generate"
    body: Record<string, unknown>;
  };
  expectations: ExpectationRule[];
}

type ExpectationRule =
  | { type: 'has_path'; path: string; description?: string }
  | { type: 'array_min_length'; path: string; min: number; description?: string }
  | { type: 'number_gte'; path: string; min: number; description?: string }
  | { type: 'number_lte'; path: string; max: number; description?: string }
  | { type: 'string_contains'; path: string; substring: string; caseInsensitive?: boolean; description?: string };

interface CaseResult {
  id: string;
  description: string;
  passed: boolean;
  failures: string[];
  durationMs: number;
  httpStatus: number;
}

const BASE = process.env.BBQ_EVAL_BASE || 'http://localhost:3000';
const THRESHOLD = Number(process.env.BBQ_EVAL_THRESHOLD ?? '0.9');
const EVALS_DIR = resolve(process.cwd(), 'docs/ai-evals');

/* APK-finding #34: zonder Supabase-sessie krijgt elke /api/* call een
   redirect naar /login = HTML response = JSON-parse-fout = 0% pass-rate.
   Auth-flow: log een test-user in via Supabase REST, vang de access_token,
   stuur die als Bearer-header mee. Bearer-tokens worden door @supabase/ssr
   serverComponentClient herkend, dus de API-routes zien een ingelogde user
   en RLS-policies werken normaal. Env-vars vereist:
     BBQ_EVAL_USER_EMAIL    — test-user in dezelfde org als de eval-data
     BBQ_EVAL_USER_PASSWORD — wachtwoord van die user
   Optioneel:
     NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (al in CI). */
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const EVAL_EMAIL = process.env.BBQ_EVAL_USER_EMAIL || '';
const EVAL_PWD = process.env.BBQ_EVAL_USER_PASSWORD || '';
let bearerToken: string | null = null;

async function authenticate(): Promise<void> {
  if (!EVAL_EMAIL || !EVAL_PWD) {
    console.warn('[ai-eval] BBQ_EVAL_USER_EMAIL/PASSWORD ontbreken — endpoints zullen 401/redirect retourneren');
    return;
  }
  if (!SB_URL || !SB_ANON) {
    console.error('[ai-eval] NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ontbreken — auth onmogelijk');
    process.exit(2);
  }
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON },
    body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PWD }),
  });
  if (!res.ok) {
    console.error(`[ai-eval] auth failed: ${res.status} ${await res.text()}`);
    process.exit(2);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) {
    console.error('[ai-eval] auth response zonder access_token');
    process.exit(2);
  }
  bearerToken = data.access_token;
  console.log('[ai-eval] authenticated as ' + EVAL_EMAIL);
}

function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cursor: unknown = obj;
  for (const p of parts) {
    if (cursor === null || cursor === undefined) return undefined;
    if (typeof cursor === 'object') {
      cursor = (cursor as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cursor;
}

function evaluateExpectation(resp: unknown, rule: ExpectationRule): string | null {
  const val = getByPath(resp, rule.path);
  const desc = rule.description ? ` (${rule.description})` : '';

  switch (rule.type) {
    case 'has_path':
      if (val === undefined || val === null) return `${rule.path} ontbreekt${desc}`;
      return null;
    case 'array_min_length':
      if (!Array.isArray(val)) return `${rule.path} is geen array${desc}`;
      if (val.length < rule.min) return `${rule.path} heeft ${val.length} items (min ${rule.min})${desc}`;
      return null;
    case 'number_gte':
      if (typeof val !== 'number') return `${rule.path} is geen number${desc}`;
      if (val < rule.min) return `${rule.path}=${val} (min ${rule.min})${desc}`;
      return null;
    case 'number_lte':
      if (typeof val !== 'number') return `${rule.path} is geen number${desc}`;
      if (val > rule.max) return `${rule.path}=${val} (max ${rule.max})${desc}`;
      return null;
    case 'string_contains': {
      if (typeof val !== 'string') return `${rule.path} is geen string${desc}`;
      const haystack = rule.caseInsensitive ? val.toLowerCase() : val;
      const needle = rule.caseInsensitive ? rule.substring.toLowerCase() : rule.substring;
      if (!haystack.includes(needle)) return `${rule.path} bevat niet "${rule.substring}"${desc}`;
      return null;
    }
  }
}

async function runCase(tc: TestCase): Promise<CaseResult> {
  const t0 = Date.now();
  const url = BASE + tc.request.path;
  let httpStatus = 0;
  let json: unknown = null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(tc.request.body),
    });
    httpStatus = res.status;
    json = await res.json();
  } catch (e) {
    return {
      id: tc.id,
      description: tc.description,
      passed: false,
      failures: [`HTTP fout: ${(e as Error).message}`],
      durationMs: Date.now() - t0,
      httpStatus,
    };
  }

  const failures: string[] = [];
  if (httpStatus < 200 || httpStatus >= 300) {
    failures.push(`HTTP ${httpStatus}`);
  }
  for (const rule of tc.expectations) {
    const fail = evaluateExpectation(json, rule);
    if (fail) failures.push(fail);
  }

  return {
    id: tc.id,
    description: tc.description,
    passed: failures.length === 0,
    failures,
    durationMs: Date.now() - t0,
    httpStatus,
  };
}

async function loadCases(endpointDir: string): Promise<TestCase[]> {
  const files = await readdir(endpointDir);
  const cases: TestCase[] = [];
  for (const f of files.filter(x => x.endsWith('.json')).sort()) {
    const raw = await readFile(join(endpointDir, f), 'utf-8');
    cases.push(JSON.parse(raw) as TestCase);
  }
  return cases;
}

async function main() {
  console.log(`[ai-eval] base=${BASE} threshold=${THRESHOLD}`);
  await authenticate();

  let entries: string[];
  try {
    entries = await readdir(EVALS_DIR);
  } catch {
    console.error(`[ai-eval] geen eval-map gevonden op ${EVALS_DIR}`);
    process.exit(2);
  }

  let hadFailure = false;
  const overall: Record<string, { total: number; passed: number }> = {};

  for (const entry of entries) {
    const dir = join(EVALS_DIR, entry);
    let cases: TestCase[];
    try {
      cases = await loadCases(dir);
    } catch {
      continue;
    }
    if (cases.length === 0) continue;

    console.log(`\n=== ${entry} (${cases.length} cases) ===`);
    let passed = 0;
    for (const tc of cases) {
      const r = await runCase(tc);
      if (r.passed) {
        passed++;
        console.log(`  PASS ${r.id} (${r.durationMs}ms) — ${r.description}`);
      } else {
        console.log(`  FAIL ${r.id} — ${r.description}`);
        for (const f of r.failures) console.log(`       · ${f}`);
      }
    }
    const total = cases.length;
    const ratio = passed / total;
    overall[entry] = { total, passed };
    console.log(`  → ${passed}/${total} (${(ratio * 100).toFixed(1)}%)`);
    if (ratio < THRESHOLD) hadFailure = true;
  }

  console.log('\n=== Samenvatting ===');
  for (const [k, v] of Object.entries(overall)) {
    const pct = (v.passed / v.total) * 100;
    console.log(`  ${k}: ${v.passed}/${v.total} (${pct.toFixed(1)}%)`);
  }

  process.exit(hadFailure ? 1 : 0);
}

main().catch(e => {
  console.error('[ai-eval] FATAL:', e);
  process.exit(2);
});
