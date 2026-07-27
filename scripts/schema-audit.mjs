/**
 * Schema-audit — vindt queries die om een kolom vragen die niet bestaat.
 *
 * Zo'n fout faalt niet stil: PostgREST weigert de HÉLE query, dus één verkeerde
 * kolomnaam sloopt een compleet scherm. Op 2026-07-26 kwamen er twee boven water
 * doordat een gebruiker ertegenaan liep (gerechten.prijs, gerecht_components.id);
 * dit script vond er nog 38 die niemand had gemeld.
 *
 * Draaien:  node scripts/schema-audit.mjs
 * Vereist:  .env.local met SUPABASE_SERVICE_ROLE_KEY (leest alleen, schrijft niets).
 *
 * Lege tabellen worden overgeslagen — daar valt geen kolomlijst uit af te leiden.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const env = Object.fromEntries(
  readFileSync('./.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/* 1. Alle .from('x').select('...') uit de broncode halen. */
const files = execSync(`grep -rl "\\.from(" src --include=*.ts --include=*.tsx`, { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const calls = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  /* .from('tabel') … .select('kolommen') — select mag op een volgende regel staan,
     maar het tussenstuk mag GEEN nieuwe .from( bevatten. Zonder die eis sprong de
     match over een statement heen naar de select van de vólgende query, wat een
     fout-positief opleverde (organization_members ← organizations.name). */
  const re = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)((?:(?!\.from\()[\s\S]){0,200}?)\.select\(\s*(['"`])([\s\S]*?)\3/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    calls.push({ file: f, line, table: m[1], sel: m[4] });
  }
}

/* 2. Kolommen per tabel ophalen (1 rij volstaat; lege tabel = overslaan). */
const tables = [...new Set(calls.map(c => c.table))].sort();
const cols = {};
for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  if (error) { cols[t] = null; continue; }
  cols[t] = data?.[0] ? new Set(Object.keys(data[0])) : null;   // null = onbekend
}

/* 3. Selectstring ontleden. Top-level velden + genest blok(tabel(velden)). */
function parse(sel) {
  const top = [];
  const nested = [];
  let depth = 0, buf = '', name = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '(') {
      if (depth === 0) { name = buf.trim(); buf = ''; } else buf += ch;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) { nested.push({ name, inner: buf }); buf = ''; name = ''; }
      else buf += ch;
    } else if (ch === ',' && depth === 0) {
      if (buf.trim()) top.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) top.push(buf.trim());
  return { top, nested };
}

/* 'naam:kolom' → kolom ; 'tabel!fk' → tabel ; count/aggregaten overslaan */
const fieldName = (f) => {
  const s = f.includes(':') ? f.split(':').pop() : f;
  return s.split('!')[0].trim();
};

const problems = [];
function check(table, sel, where) {
  const known = cols[table];
  const { top, nested } = parse(sel);
  if (known) {
    for (const f of top) {
      const c = fieldName(f);
      if (!c || c === '*' || c.includes('.') || c.startsWith('count')) continue;
      if (!known.has(c)) problems.push({ ...where, table, column: c });
    }
  }
  for (const n of nested) {
    const t = fieldName(n.name);
    if (t && cols[t] === undefined) continue;      // andere tabel, niet opgehaald
    check(t, n.inner, where);
  }
}

for (const c of calls) check(c.table, c.sel, { file: c.file, line: c.line });

console.log(`onderzochte queries: ${calls.length} · tabellen: ${tables.length}`);
const unknown = tables.filter(t => !cols[t]);
if (unknown.length) console.log(`(niet te controleren — leeg of geen toegang: ${unknown.join(', ')})`);

console.log(`\n=== KOLOMMEN DIE NIET BESTAAN: ${problems.length} ===`);
for (const p of problems) console.log(`  ${p.file}:${p.line}  →  ${p.table}.${p.column}`);
if (!problems.length) console.log('  geen — alle gevraagde kolommen bestaan');
