/**
 * De kassacatalogus van Hop & Bites (27 oktober 2026, 139 artikelen) naar
 * BBQ Architect. Opvolger van scripts/importeer-catalogus.ts (C4); de regels
 * staan in src/lib/winkel/kassaCatalogus.ts.
 *
 *   npx tsx scripts/importeer-kassa-catalogus.ts <KASSA-CATALOGUS-map>                    # droog: laat zien wat er gebeurt
 *   npx tsx scripts/importeer-kassa-catalogus.ts <KASSA-CATALOGUS-map> --rapport <pad.md>  # droog, en het overzicht als bestand
 *   npx tsx scripts/importeer-kassa-catalogus.ts <KASSA-CATALOGUS-map> --echt              # schrijft echt
 *
 * Keuzes (standaard zoals in STANDAARD_KEUZES):
 *   --alcohol             bier, wijn en pakketten met alcohol ook actief en op de Toonbank
 *   --behoud=a,b          deze slugs blijven actief, ook al staan ze niet in de lijst
 *                         (standaard kerst-cremant,kerst-champagne; --behoud= voor geen)
 *   --geen-statiegeld     geen € 0,15 op blik zetten
 *
 * Upsert op slug; niets wordt verwijderd. Foto's alleen voor een product dat
 * er nog geen heeft: 640, 960 en 1024 breed, avif en webp (zelfde maten als C4)
 * naar de bucket winkel-fotos.
 *
 * Vereist .env.local (of ENV_BESTAND=<pad>) met NEXT_PUBLIC_SUPABASE_URL en
 * SUPABASE_SERVICE_ROLE_KEY. Buiten de sandbox draaien (TLS).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
    STANDAARD_KEUZES, leesCatalogus, maakPlan,
    type Actie, type FotoTaak, type Keuzes, type LiveStand, type Plan, type Rij,
} from '../src/lib/winkel/kassaCatalogus';

const args = process.argv.slice(2);
const waarde = (naam: string) => {
    const i = args.findIndex((a) => a === naam || a.startsWith(naam + '='));
    if (i < 0) return undefined;
    return args[i].includes('=') ? args[i].split('=').slice(1).join('=') : args[i + 1];
};
const map = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--rapport');
const ECHT = args.includes('--echt');
const rapportPad = waarde('--rapport');
const behoud = waarde('--behoud');
const keuzes: Keuzes = {
    alcohol: args.includes('--alcohol'),
    behoud: behoud === undefined ? STANDAARD_KEUZES.behoud : behoud.split(',').map((s) => s.trim()).filter(Boolean),
    statiegeldBlikCents: args.includes('--geen-statiegeld') ? null : STANDAARD_KEUZES.statiegeldBlikCents,
};
if (!map) {
    console.error('Gebruik: npx tsx scripts/importeer-kassa-catalogus.ts <KASSA-CATALOGUS-map> [--rapport pad.md] [--echt] [--alcohol] [--behoud=a,b] [--geen-statiegeld]');
    process.exit(1);
}

const envBestand = process.env.ENV_BESTAND ?? '.env.local';
for (const line of fs.readFileSync(envBestand, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const MATEN = [640, 960, 1024];
const FORMATEN = ['avif', 'webp'] as const;

async function alles<T>(tabel: string, kolommen: string, org: string): Promise<T[]> {
    const uit: T[] = [];
    for (let van = 0; ; van += 1000) {
        const { data, error } = await sb.from(tabel).select(kolommen).eq('organization_id', org).order('id').range(van, van + 999);
        if (error) throw new Error(`${tabel}: ${error.message}`);
        uit.push(...((data ?? []) as T[]));
        if (!data || data.length < 1000) return uit;
    }
}

/** De foto in drie breedtes en twee formaten; geeft de foto-jsonb voor het product. */
async function zetFoto(f: FotoTaak, echt: boolean) {
    const bestand = path.join(map!, f.bron);
    if (!fs.existsSync(bestand)) throw new Error(`${f.bron} ontbreekt in ${map}`);
    const bron = sharp(fs.readFileSync(bestand)).rotate();
    const meta = await bron.metadata();
    if (!meta.width || !meta.height) throw new Error(`${f.bron}: geen afmetingen`);
    const maten = MATEN.filter((w) => w <= meta.width!).map((w) => ({ w, h: Math.round((meta.height! * w) / meta.width!) }));
    if (!maten.length) maten.push({ w: meta.width, h: meta.height });
    if (echt) {
        for (const m of maten) {
            for (const formaat of FORMATEN) {
                const buf = await bron.clone().resize(m.w, m.h)[formaat]({ quality: formaat === 'avif' ? 55 : 80 }).toBuffer();
                const { error } = await sb.storage.from('winkel-fotos').upload(`${f.basis}-${m.w}.${formaat}`, buf, { contentType: `image/${formaat}`, upsert: true });
                if (error) throw new Error(`${f.bron}: upload ${m.w}.${formaat}: ${error.message}`);
            }
        }
    }
    const grootste = maten[maten.length - 1];
    return { basis: f.basis, breedte: grootste.w, hoogte: grootste.h, maten, formaten: [...FORMATEN] };
}

function euro(c: unknown): string {
    return typeof c === 'number' ? `€ ${(c / 100).toFixed(2).replace('.', ',')}` : 'geen prijs';
}

function rapport(plan: Plan, k: Keuzes, org: string): string {
    const r: string[] = [];
    const tel = (w: string) => plan.regels.filter((x) => x.wat === w).length;
    const uit = plan.acties.filter((a): a is Extract<Actie, { soort: 'niet-actief' }> => a.soort === 'niet-actief');
    r.push(`# Kassacatalogus: ${ECHT ? 'import' : 'droge run'} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`, '');
    r.push(`Organisatie ${org}. Keuzes: alcohol ${k.alcohol ? 'aan' : 'uit'}, behoud ${k.behoud.join(', ') || 'niets'}, statiegeld blik ${k.statiegeldBlikCents == null ? 'niet zetten' : euro(k.statiegeldBlikCents)}.`, '');
    r.push(`- **${tel('nieuw')} nieuw**, **${tel('bijwerken')} bijgewerkt**, ${tel('gelijk')} al gelijk`);
    r.push(`- **${uit.length} gaan op niet actief** (staan er wel, niet in de lijst; niets wordt verwijderd)`);
    r.push(`- ${plan.alUit.length} staan er, niet in de lijst, en zijn al niet actief`);
    r.push(`- ${plan.behouden.length} blijven actief hoewel niet in de lijst: ${plan.behouden.join(', ') || '—'}`);
    r.push(`- ${plan.regels.filter((x) => x.opToonbank).length} van ${plan.regels.length} artikelen staan daarna op de Toonbank`);
    r.push(`- ${plan.acties.filter((a) => a.soort !== 'niet-actief' && a.foto).length} foto's om te uploaden`, '');

    const concept = plan.regels.filter((x) => x.prijsStatus === 'voorstel');
    r.push(`## Na te kijken: ${concept.length} voorstelprijzen (concept)`, '', '| Slug | Naam | Prijs | Actief |', '| --- | --- | --- | --- |');
    for (const x of concept) r.push(`| ${x.slug} | ${x.naam} | ${euro(x.prijsCents)} | ${x.actief ? 'ja (stond al aan)' : 'nee'} |`);
    r.push('');

    r.push('## Meldingen', '');
    for (const m of plan.meldingen) r.push(`- **${m.slug}**: ${m.tekst}`);
    r.push('');

    r.push('## Gaan op niet actief', '');
    for (const a of uit) r.push(`- ${a.slug} (${a.naam})`);
    if (plan.alUit.length) r.push('', `Al niet actief: ${plan.alUit.join(', ')}.`);
    r.push('');

    r.push('## Per artikel', '', '| Groep | Slug | Wat | Prijs | Status | Actief | Toonbank | Wijzigingen |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const x of plan.regels) {
        r.push(`| ${x.kassagroep} | ${x.slug} | ${x.wat} | ${euro(x.prijsCents)} | ${x.prijsStatus} | ${x.actief ? 'ja' : 'nee'} | ${x.opToonbank ? 'ja' : 'nee'} | ${x.wijzigingen.join('; ').replace(/\|/g, '/')} |`);
    }
    return r.join('\n') + '\n';
}

async function main() {
    const json = JSON.parse(fs.readFileSync(path.join(map!, 'catalogus.json'), 'utf8'));
    const catalogus = leesCatalogus(json);

    const { data: org } = await sb.from('organizations').select('id').eq('slug', 'hop-en-bites').single();
    if (!org) throw new Error('organisatie hop-en-bites niet gevonden');
    const o = org.id as string;

    const live: LiveStand = {
        producten: await alles('winkel_producten', 'id, slug, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, btw_pct, alcohol_pct, allergenen, ingredienten, bewaren, foto, statiegeld_cents', o),
        artikelen: await alles('winkel_artikelen', 'id, slug, naam, eenheid, prijs_cents, btw_pct, btw_verdeling, actief, kanalen, toonbank_groep, toonbank_volgorde', o),
        slots: await alles('winkel_artikel_slots', 'id, artikel_id, standaard_product_id', o),
    };
    const plan = maakPlan(catalogus, live, o, keuzes);

    /* Ook droog: elke foto openen, zodat een kapot bestand nu al opvalt. */
    for (const a of plan.acties) if (a.soort !== 'niet-actief' && a.foto) await zetFoto(a.foto, false);

    const tekst = rapport(plan, keuzes, o);
    if (rapportPad) fs.writeFileSync(rapportPad, tekst);
    console.log(tekst.split('\n## Per artikel')[0]);
    if (!ECHT) {
        console.log(`Droog gedraaid: er is niets geschreven.${rapportPad ? ` Overzicht: ${rapportPad}.` : ''} Met --echt schrijft het script.`);
        return;
    }

    let n = 0;
    for (const a of plan.acties) {
        if (a.soort === 'niet-actief') {
            const { error } = await sb.from('winkel_artikelen').update({ actief: false }).eq('id', a.artikelId);
            if (error) throw new Error(`${a.slug}: niet actief: ${error.message}`);
            n++;
            continue;
        }
        const foto = a.foto ? await zetFoto(a.foto, true) : null;
        let productId: string | null = a.productId;

        if (a.soort === 'nieuw' && a.product) {
            const { data, error } = await sb.from('winkel_producten').insert({ ...a.product, ...(foto ? { foto } : {}) }).select('id').single();
            if (error || !data) throw new Error(`${a.slug}: product: ${error?.message}`);
            productId = data.id as string;
        } else if (productId && (Object.keys(a.productPatch).length || foto)) {
            const patch: Rij = { ...a.productPatch, ...(foto ? { foto } : {}) };
            const { error } = await sb.from('winkel_producten').update(patch).eq('id', productId);
            if (error) throw new Error(`${a.slug}: product: ${error.message}`);
        }

        let artikelId: string;
        if (a.soort === 'nieuw') {
            const { data, error } = await sb.from('winkel_artikelen').insert(a.artikel).select('id').single();
            if (error || !data) throw new Error(`${a.slug}: artikel: ${error?.message}`);
            artikelId = data.id as string;
        } else {
            artikelId = a.artikelId;
            if (Object.keys(a.artikelPatch).length) {
                const { error } = await sb.from('winkel_artikelen').update(a.artikelPatch).eq('id', artikelId);
                if (error) throw new Error(`${a.slug}: artikel: ${error.message}`);
            }
        }

        if (a.slot && productId) {
            const { data: er } = await sb.from('winkel_artikel_slots').select('id').eq('artikel_id', artikelId).limit(1);
            if (!er?.length) {
                const { error } = await sb.from('winkel_artikel_slots').insert({ ...a.slot, artikel_id: artikelId, standaard_product_id: productId });
                if (error) throw new Error(`${a.slug}: slot: ${error.message}`);
            }
        }
        n++;
    }
    console.log(`Klaar: ${n} acties uitgevoerd.`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
