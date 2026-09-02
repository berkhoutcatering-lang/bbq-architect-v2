/**
 * Haalt de bon-bestanden van deze organisatie uit Supabase Storage naar een
 * lokale map, samen met een index.json van wat er nu in de database staat.
 *
 * Doel: de bon-uitlezer kunnen meten op echte facturen zonder de live app te
 * hoeven bedienen. De bestanden zijn bedrijfsdocumenten — schrijf ze NOOIT
 * naar de repo. Geef een pad buiten de repo mee.
 *
 *   node scripts/bon-fixtures-download.mjs <doelmap>
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const out = process.argv[2];
if (!out) {
    console.error('Geef een doelmap mee (buiten de repo).');
    process.exit(1);
}
if (path.resolve(out).startsWith(path.resolve('.'))) {
    console.error('Doelmap ligt in de repo. Kies een pad daarbuiten — dit zijn echte facturen.');
    process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data: bonnen, error } = await sb
    .from('bonnen')
    .select('id,winkel,datum,totaal_bedrag,netto_bedrag,btw_laag_bedrag,btw_hoog_bedrag,file_path,file_mime,bon_items')
    .order('id');
if (error) {
    console.error('Kon bonnen niet lezen:', error.message);
    process.exit(1);
}

const index = [];
for (const b of bonnen) {
    if (!b.file_path) continue;
    const { data: file, error: dlErr } = await sb.storage.from('bonnen').download(b.file_path);
    if (dlErr) {
        console.log(`#${b.id} overgeslagen — ${dlErr.message}`);
        continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const name = `bon-${String(b.id).padStart(2, '0')}${path.extname(b.file_path) || '.pdf'}`;
    fs.writeFileSync(path.join(out, name), buf);
    index.push({
        bon_id: b.id,
        file: name,
        bytes: buf.length,
        mime: b.file_mime,
        /* Wat er NU in de database staat — het ijkpunt om tegen af te zetten.
           Let op: dit is AI-output van een eerdere scan, geen menselijke
           controle. Alle bonnen staan nog op 'pending'. */
        db: {
            winkel: b.winkel,
            datum: b.datum,
            totaal_bedrag: b.totaal_bedrag,
            netto_bedrag: b.netto_bedrag,
            btw_laag_bedrag: b.btw_laag_bedrag,
            btw_hoog_bedrag: b.btw_hoog_bedrag,
            items_count: Array.isArray(b.bon_items) ? b.bon_items.length : 0,
        },
    });
    console.log(`#${b.id} → ${name}  ${(buf.length / 1024).toFixed(0)} kB  ${b.winkel ?? '(geen naam)'}`);
}

fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\n${index.length} bestanden in ${out}`);
