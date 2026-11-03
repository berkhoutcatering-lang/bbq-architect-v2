/**
 * De winkel inrichten: de ruimte "Winkel" met de afdelingen (Bier, Wijn,
 * Nootjes, Kazen, Vlees, Broodbeleg, Uit de vriezer, Rubs & zouten), en elk
 * product uit de kassacatalogus op zijn afdeling (afdelingVoorArtikel). Regels: src/lib/winkel/plekken.ts.
 *
 *   npx tsx scripts/winkel-plekken-inrichten.ts <KASSA-CATALOGUS-map>          # droog: laat zien wat er gebeurt
 *   npx tsx scripts/winkel-plekken-inrichten.ts <KASSA-CATALOGUS-map> --echt   # schrijft echt
 *
 * Vereist migratie 20261102120000_winkel_plekken en eerst de bierimport
 * (scripts/importeer-kassa-catalogus.ts --alleen=Bier), anders ontbreken de
 * nieuwe bieren nog. Een bier zonder product wordt gemeld, niet aangemaakt.
 * Opnieuw draaien is veilig: niets wordt hernoemd, verplaatst of verwijderd.
 *
 * Vereist .env.local (of ENV_BESTAND=<pad>) met NEXT_PUBLIC_SUPABASE_URL en
 * SUPABASE_SERVICE_ROLE_KEY. Buiten de sandbox draaien (TLS).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { leesCatalogus } from '../src/lib/winkel/kassaCatalogus';
import {
    WINKEL_AFDELINGEN, afdelingVoorArtikel, planPlaatsingen, planWinkelPlekken,
    type LivePlaatsing, type LivePlek, type TePlaatsen,
} from '../src/lib/winkel/plekken';

const args = process.argv.slice(2);
const map = args.find((a) => !a.startsWith('--'));
const ECHT = args.includes('--echt');
if (!map) {
    console.error('Gebruik: npx tsx scripts/winkel-plekken-inrichten.ts <KASSA-CATALOGUS-map> [--echt]');
    process.exit(1);
}

const envBestand = process.env.ENV_BESTAND ?? '.env.local';
for (const line of fs.readFileSync(envBestand, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
    const catalogus = leesCatalogus(JSON.parse(fs.readFileSync(path.join(map!, 'catalogus.json'), 'utf8')));
    /* Per afdeling de artikelen (op kassagroep), op subgroep en naam. */
    const perAfdeling = new Map<string, typeof catalogus>();
    for (const a of catalogus) {
        const code = afdelingVoorArtikel(a);
        if (!code) continue;
        perAfdeling.set(code, [...(perAfdeling.get(code) ?? []), a]);
    }
    for (const lijst of perAfdeling.values()) {
        lijst.sort((a, b) => (a.subgroep ?? '').localeCompare(b.subgroep ?? '', 'nl') || a.naam.localeCompare(b.naam, 'nl'));
    }

    const { data: org } = await sb.from('organizations').select('id').eq('slug', 'hop-en-bites').single();
    if (!org) throw new Error('organisatie hop-en-bites niet gevonden');
    const o = org.id as string;

    const { error: kolom } = await sb.from('opslag_locaties').select('parent_id').limit(1);
    if (kolom) throw new Error(`opslag_locaties.parent_id ontbreekt: eerst migratie 20261102120000_winkel_plekken (${kolom.message})`);

    const { data: plekRijen, error: e1 } = await sb.from('opslag_locaties').select('id, code, naam, soort, parent_id, volgorde').eq('organization_id', o);
    if (e1) throw new Error(`opslag_locaties: ${e1.message}`);
    const plekken = (plekRijen ?? []) as LivePlek[];
    const plan = planWinkelPlekken(plekken);

    console.log(`# Winkel inrichten: ${ECHT ? 'echt' : 'droge run'}\n`);
    console.log(`Plekken nieuw: ${plan.nieuw.map((p) => `${p.naam} (${p.soort})`).join(', ') || 'geen'}`);
    for (const b of plan.bestaat) console.log(`Bestaat al: ${b.naam} [${b.code}]${b.melding ? ` — let op: ${b.melding}` : ''}`);

    /* De producten op slug. */
    const slugs = [...perAfdeling.values()].flat().map((a) => a.slug);
    const { data: prodRijen, error: e2 } = await sb.from('winkel_producten').select('id, slug, naam').eq('organization_id', o).in('slug', slugs);
    if (e2) throw new Error(`winkel_producten: ${e2.message}`);
    const opSlug = new Map((prodRijen ?? []).map((p) => [p.slug as string, p]));

    const { data: plRijen, error: e3 } = await sb.from('winkel_plaatsingen').select('id, product_id, locatie_id, rol, volgorde').eq('organization_id', o);
    if (e3) throw new Error(`winkel_plaatsingen: ${e3.message}`);
    const live = (plRijen ?? []) as LivePlaatsing[];

    const plannen = [...perAfdeling].map(([code, lijst]) => {
        const naam = WINKEL_AFDELINGEN.find((a) => a.code === code)?.naam ?? code;
        const plek = plekken.find((p) => p.code === code);
        const tePlaatsen: TePlaatsen[] = lijst.filter((a) => opSlug.has(a.slug)).map((a) => {
            const p = opSlug.get(a.slug)!;
            return { productId: p.id as string, slug: a.slug, naam: p.naam as string };
        });
        const ontbreekt = lijst.filter((a) => !opSlug.has(a.slug)).map((a) => a.slug);
        return { code, naam, ontbreekt, plaats: planPlaatsingen(tePlaatsen, plek?.id ?? `(nieuw ${code})`, live) };
    });

    for (const x of plannen) {
        console.log(`\n${x.naam}: ${x.plaats.nieuw.length} erbij, ${x.plaats.alDaar.length} staan er al.`);
        if (x.plaats.elders.length) console.log(`  Staan al ergens anders (niet verplaatst): ${x.plaats.elders.map((e) => e.slug).join(', ')}`);
        if (x.ontbreekt.length) console.log(`  Nog geen product (eerst de import draaien): ${x.ontbreekt.join(', ')}`);
    }

    if (!ECHT) {
        console.log('\nDroog gedraaid: er is niets geschreven. Met --echt schrijft het script.');
        return;
    }

    /* Eerst de ruimte, dan de afdelingen (ouder op code). */
    const idOp = new Map(plekken.map((p) => [p.code, p.id]));
    for (const p of plan.nieuw) {
        const parent_id = p.ouderCode ? idOp.get(p.ouderCode) : null;
        if (p.ouderCode && !parent_id) throw new Error(`${p.code}: ouder ${p.ouderCode} niet gevonden`);
        const { data, error } = await sb.from('opslag_locaties')
            .insert({ organization_id: o, code: p.code, naam: p.naam, soort: p.soort, parent_id, volgorde: p.volgorde })
            .select('id').single();
        if (error || !data) throw new Error(`${p.code}: ${error?.message}`);
        idOp.set(p.code, data.id as string);
    }

    let geplaatst = 0;
    for (const x of plannen) {
        const plekId = idOp.get(x.code);
        if (!plekId) throw new Error(`${x.code}: plek niet gevonden`);
        if (!x.plaats.nieuw.length) continue;
        const { error } = await sb.from('winkel_plaatsingen').insert(x.plaats.nieuw.map((p) => ({
            organization_id: o, product_id: p.productId, locatie_id: plekId, rol: 'verkoop', volgorde: p.volgorde,
        })));
        if (error) throw new Error(`plaatsingen ${x.naam}: ${error.message}`);
        geplaatst += x.plaats.nieuw.length;
    }
    console.log(`\nKlaar: ${plan.nieuw.length} plekken aangemaakt, ${geplaatst} producten op hun afdeling gezet.`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
