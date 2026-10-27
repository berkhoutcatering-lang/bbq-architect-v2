/**
 * Eenmalig (blok C4, 3 oktober 2026): de bieren, wijnen en het vlees van de
 * website naar BBQ Architect. Daarna wonen ze hier — met foto, tekst en prijs —
 * en haalt de website ze op bij elke build.
 *
 *   npx tsx scripts/importeer-catalogus.ts <website>/tests/fixtures/catalogus.json <website>/public/beeld          # droog: laat zien wat er gebeurt
 *   npx tsx scripts/importeer-catalogus.ts <website>/tests/fixtures/catalogus.json <website>/public/beeld --echt   # schrijft echt
 *
 * Idempotent op de slug: een bestaand product wordt bijgewerkt, een bestaand
 * artikel houdt zijn prijs en actief-stand (die zet Mathijs), een artikel dat
 * al slots heeft houdt die. Foto's: de bestanden die de website al heeft
 * ({basis}-{w}.avif en .webp) gaan ongewijzigd naar de bucket winkel-fotos.
 *
 * Vereist: de migratie 20261003120000_winkel_catalogus en .env.local met
 * NEXT_PUBLIC_SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fotoBasis, importRijen, type SiteProduct } from '../src/lib/winkel/catalogusImport';
import type { FotoOpslag } from '../src/lib/winkel/productsoorten';

const [fixturePad, beeldMap] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ECHT = process.argv.includes('--echt');
if (!fixturePad || !beeldMap) {
    console.error('Gebruik: npx tsx scripts/importeer-catalogus.ts <catalogus.json> <public/beeld> [--echt]');
    process.exit(1);
}

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
    const { data: org } = await sb.from('organizations').select('id').eq('slug', 'hop-en-bites').single();
    if (!org) throw new Error('organisatie hop-en-bites niet gevonden');
    const o = org.id as string;

    const { producten } = JSON.parse(fs.readFileSync(fixturePad, 'utf8')) as { producten: SiteProduct[] };
    console.log(`${ECHT ? 'ECHT' : 'DROOG'}: ${producten.length} producten naar organisatie ${o}`);

    const MIME = { avif: 'image/avif', webp: 'image/webp' } as const;

    async function zetFoto(p: SiteProduct): Promise<FotoOpslag | null> {
        if (!p.foto) return null;
        const basis = fotoBasis(o, p.slug);
        const bron = path.basename(p.foto.basis); // '/beeld/BIER-ROCHEFORT-8-02' → 'BIER-ROCHEFORT-8-02'
        for (const m of p.foto.maten) {
            for (const f of p.foto.formaten) {
                const bestand = path.join(beeldMap, `${bron}-${m.w}.${f}`);
                if (!fs.existsSync(bestand)) throw new Error(`${p.slug}: ${bestand} ontbreekt`);
                if (!ECHT) continue;
                const { error } = await sb.storage.from('winkel-fotos').upload(`${basis}-${m.w}.${f}`, fs.readFileSync(bestand), { contentType: MIME[f], upsert: true });
                if (error) throw new Error(`${p.slug}: upload ${bestand}: ${error.message}`);
            }
        }
        return { basis, breedte: p.foto.breedte, hoogte: p.foto.hoogte, maten: p.foto.maten, formaten: p.foto.formaten };
    }

    let nieuw = 0;
    let bijgewerkt = 0;
    for (const p of producten) {
        const foto = await zetFoto(p);
        const { product, artikel, slot } = importRijen(p, o, foto);
        if (!ECHT) {
            console.log(`  ${p.soort.padEnd(5)} ${p.slug} — ${product.type}, ${artikel.eenheid}, ${p.prijsCenten == null ? 'prijs volgt' : `€ ${(p.prijsCenten / 100).toFixed(2)}`}, foto ${foto ? foto.maten.length * foto.formaten.length + ' bestanden' : 'geen'}`);
            continue;
        }

        /* Het product, op slug. */
        const { data: bestaand } = await sb.from('winkel_producten').select('id').eq('organization_id', o).eq('slug', p.slug).maybeSingle();
        let productId: string;
        if (bestaand) {
            const { error } = await sb.from('winkel_producten').update(product).eq('id', bestaand.id);
            if (error) throw new Error(`${p.slug}: product: ${error.message}`);
            productId = bestaand.id;
            bijgewerkt++;
        } else {
            const { data, error } = await sb.from('winkel_producten').insert(product).select('id').single();
            if (error || !data) throw new Error(`${p.slug}: product: ${error?.message}`);
            productId = data.id;
            nieuw++;
        }

        /* Het artikel: nieuw, of de vaste velden bijwerken zonder prijs en actief aan te raken. */
        const { data: art } = await sb.from('winkel_artikelen').select('id, prijs_cents').eq('organization_id', o).eq('slug', p.slug).maybeSingle();
        let artikelId: string;
        if (art) {
            const { prijs_cents, actief, ...rest } = artikel;
            const update = art.prijs_cents == null && prijs_cents != null ? { ...rest, prijs_cents, actief } : rest;
            const { error } = await sb.from('winkel_artikelen').update(update).eq('id', art.id);
            if (error) throw new Error(`${p.slug}: artikel: ${error.message}`);
            artikelId = art.id;
        } else {
            const { data, error } = await sb.from('winkel_artikelen').insert(artikel).select('id').single();
            if (error || !data) throw new Error(`${p.slug}: artikel: ${error?.message}`);
            artikelId = data.id;
        }

        /* Eén slot naar het product, tenzij het artikel al een template heeft. */
        const { data: slots } = await sb.from('winkel_artikel_slots').select('id').eq('artikel_id', artikelId);
        if (!slots?.length) {
            const { error } = await sb.from('winkel_artikel_slots').insert({ ...slot, artikel_id: artikelId, standaard_product_id: productId });
            if (error) throw new Error(`${p.slug}: slot: ${error.message}`);
        }
    }

    console.log(ECHT ? `Klaar: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt.` : 'Droog gedraaid: er is niets geschreven. Met --echt schrijft het script.');
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
