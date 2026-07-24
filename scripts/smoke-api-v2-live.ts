/**
 * LIVE smoke-test — Extension API v2 end-to-end tegen een lokale dev-server
 * (die met je PROD-Supabase praat, waar de migratie al staat).
 *
 * Bewijst de HELE serverketen met echte Baktotaal-genormaliseerde data:
 *   adapter.normalize → API v2 guard/auth → checkpoint-route → RPC → DB.
 *
 * Maakt een TIJDELIJKE extension-key + testrun aan en RUIMT ALLES WEER OP
 * (finally): geen residu op prod. Test-account = 'live-smoke', test-SKU's
 * beginnen met 'LIVE-'.
 *
 *   BASE=http://localhost:3210 npx tsx scripts/smoke-api-v2-live.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { baktotaalAdapter } from '../chrome-extension/adapters/baktotaal.js';

/* .env.local laden (tsx doet dit niet automatisch). */
function loadEnv() {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!process.env[m[1]]) process.env[m[1]] = v;
    }
}
loadEnv();

const BASE = process.env.BASE || 'http://localhost:3210';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ACCOUNT = 'live-smoke';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function genKey() {
    const buf = randomBytes(20);
    let body = '';
    for (let i = 0; i < 24; i++) body += BASE32[buf[i % buf.length] % 32];
    const rawKey = `ext_${body}`;
    return { rawKey, keyHash: createHash('sha256').update(rawKey).digest('hex'), keyPrefix: `ext_${body.slice(0, 6)}…` };
}

async function api(path: string, opts: { method?: string; body?: unknown; key: string; idem?: string }) {
    const headers: Record<string, string> = { 'x-extension-key': opts.key };
    if (opts.body) headers['content-type'] = 'application/json';
    if (opts.idem) headers['idempotency-key'] = opts.idem;
    const res = await fetch(`${BASE}${path}`, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
}

const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); };

async function main() {
    const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });

    // Org + user + leverancier bepalen.
    const { data: mem } = await sb.from('organization_members').select('organization_id, user_id').eq('status', 'active').limit(1).single();
    if (!mem) throw new Error('Geen actief organization_member gevonden');
    const orgId = mem.organization_id as string;
    const userId = mem.user_id as string;
    const { data: lev } = await sb.from('leveranciers').select('id').eq('organization_id', orgId).limit(1).single();
    if (!lev) throw new Error('Geen leverancier gevonden voor org');
    const supplierId = lev.id as number;

    // Tijdelijke key aanmaken.
    const { rawKey, keyHash, keyPrefix } = genKey();
    const { data: keyRow, error: keyErr } = await sb.from('org_extension_api_keys')
        .insert({ organization_id: orgId, user_id: userId, key_hash: keyHash, key_prefix: keyPrefix, label: 'LIVE SMOKE (tijdelijk)' })
        .select('id').single();
    if (keyErr || !keyRow) throw new Error('Kon tijdelijke key niet aanmaken: ' + keyErr?.message);
    const keyId = keyRow.id as string;

    let runId: string | null = null;
    try {
        // 0) auth-check
        const auth = await api('/api/extension/auth', { key: rawKey });
        check('GET /auth 200', auth.status === 200, `status ${auth.status}`);

        // 1) run starten
        const run = await api('/api/extension/v2/runs', { method: 'POST', key: rawKey, body: {
            supplierId, mode: 'full', origin: 'https://zakelijk.baktotaal.nl',
            adapterKey: 'baktotaal', adapterVersion: '1.1.0', supplierAccountKey: ACCOUNT, scope: { mode: 'full' },
        }});
        runId = run.runId;
        check('POST /runs → runId', Boolean(runId) && run.status === 'running', JSON.stringify(run).slice(0, 160));

        // 2) taak registreren
        const reg = await api(`/api/extension/v2/runs/${runId}/tasks`, { method: 'POST', key: rawKey, body: {
            tasks: [{ idempotencyKey: 'live-smoke-task-1', taskType: 'category_page', sourceUrl: 'https://zakelijk.baktotaal.nl/grondstoffen-en-ingredienten/bloem-en-meel', sourceCursor: JSON.stringify({ slug: 'grondstoffen-en-ingredienten/bloem-en-meel', page: 1 }) }],
        }});
        check('POST /tasks → added 1', reg.added === 1, JSON.stringify(reg).slice(0, 160));

        // 3) taak claimen
        const claim = await api(`/api/extension/v2/runs/${runId}/tasks/claim`, { method: 'POST', key: rawKey, body: {} });
        const taskId = claim.task?.id;
        check('POST /claim → task', Boolean(taskId), JSON.stringify(claim).slice(0, 160));

        // 4) observations bouwen via de ECHTE adapter-normalize
        const ctx = { supplierId, supplierAccountKey: ACCOUNT, adapterKey: 'baktotaal', adapterVersion: '1.1.0', extractionMethod: 'dom_adapter', taxMode: 'ex_vat', currency: 'EUR', capturedAt: new Date().toISOString() };
        const records = [
            { name: 'LIVE-SMOKE Tarwebloem 405 (10 kg)', priceText: '13.20', url: 'https://zakelijk.baktotaal.nl/live-smoke-tarwebloem-405', sku: 'LIVE-16812' },
            { name: 'LIVE-SMOKE Franse Tarwebloem 1kg', priceText: '1.85', url: 'https://zakelijk.baktotaal.nl/live-smoke-franse-tarwebloem', sku: 'LIVE-16811' },
        ];
        const observations = records.flatMap((r) => baktotaalAdapter.normalize(r, ctx));

        // 5) transactioneel checkpoint
        const cp = await api(`/api/extension/v2/runs/${runId}/checkpoints`, { method: 'POST', key: rawKey, idem: 'live-smoke-cp-1', body: {
            taskId, observations, nextTasks: [], adapterDiagnostics: { durationMs: 5, httpStatus: 200 },
        }});
        check('POST /checkpoints → accepted 2', cp.checkpoint?.accepted === 2, JSON.stringify(cp).slice(0, 200));

        // 6) replay (zelfde idempotency-key) → duplicateReplay
        const replay = await api(`/api/extension/v2/runs/${runId}/checkpoints`, { method: 'POST', key: rawKey, idem: 'live-smoke-cp-1', body: {
            taskId, observations, nextTasks: [], adapterDiagnostics: {},
        }});
        check('checkpoint replay → duplicateReplay true', replay.checkpoint?.duplicateReplay === true, JSON.stringify(replay).slice(0, 160));

        // 7) actieve run + tellers
        const active = await api(`/api/extension/v2/runs/active?supplierId=${supplierId}&accountKey=${ACCOUNT}`, { key: rawKey });
        check('GET /active → accepted 2', active.run?.observations_accepted === 2, `accepted=${active.run?.observations_accepted}`);

        // 8) DB-verificatie via service-role
        const { data: prods } = await sb.from('supplier_products').select('id, unit, package_size, base_unit, current_price_id').eq('organization_id', orgId).eq('supplier_account_key', ACCOUNT);
        check('supplier_products = 2', (prods?.length ?? 0) === 2, `count=${prods?.length}`);
        const tarwe = (prods ?? []).find((p) => Number(p.package_size) === 10000); // 10 kg = 10000 g
        const { data: price } = tarwe?.current_price_id
            ? await sb.from('supplier_product_prices').select('price_per_kg_ex_vat, effective_price_ex_vat').eq('id', tarwe.current_price_id).single()
            : { data: null };
        check('10kg → per_kg 1.32', Number(price?.price_per_kg_ex_vat) === 1.32, `per_kg=${price?.price_per_kg_ex_vat}`);

        // 9) afronden — server bepaalt eindresultaat
        const done = await api(`/api/extension/v2/runs/${runId}/complete-request`, { method: 'POST', key: rawKey, body: {} });
        check('complete-request → completed', done.result?.status === 'completed', JSON.stringify(done).slice(0, 160));
    } finally {
        // Opruimen — ALTIJD, ook bij fout.
        try { await sb.from('supplier_products').delete().eq('organization_id', orgId).eq('supplier_account_key', ACCOUNT); } catch {}
        try { if (runId) await sb.from('leverancier_sync_runs').delete().eq('id', runId); } catch {}
        try { await sb.from('org_extension_api_keys').delete().eq('id', keyId); } catch {}
    }

    // Rapport
    console.log('\n── LIVE API v2 smoke-test ─────────────────');
    let allOk = true;
    for (const c of checks) { console.log(`${c.ok ? '✅' : '❌'} ${c.name}${c.ok ? '' : `  — ${c.detail}`}`); if (!c.ok) allOk = false; }
    console.log('───────────────────────────────────────────');
    console.log(allOk ? '🎉 ALLES GROEN — v2-keten werkt live, opgeruimd.' : '⚠️  Er faalde iets (zie hierboven). Testdata is opgeruimd.');
    process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error('FOUT:', e.message); process.exit(2); });
