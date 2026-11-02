/**
 * De winkel inrichten: de ruimte "Winkel" met de afdelingen Bier, Wijn,
 * Nootjes, Kazen en Vlees (slager), en het bier uit de kassacatalogus op de
 * afdeling Bier. Regels: src/lib/winkel/plekken.ts.
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
    WINKEL_AFDELINGEN, planPlaatsingen, planWinkelPlekken,
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

const BIER = WINKEL_AFDELINGEN[0].code;

async function main() {
    const catalogus = leesCatalogus(JSON.parse(fs.readFileSync(path.join(map!, 'catalogus.json'), 'utf8')));
    const bier = catalogus
        .filter((a) => a.kassagroep === 'Bier')
        .sort((a, b) => (a.subgroep ?? '').localeCompare(b.subgroep ?? '', 'nl') || a.naam.localeCompare(b.naam, 'nl'));

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

    /* Het bier: de producten op slug. */
    const { data: prodRijen, error: e2 } = await sb.from('winkel_producten').select('id, slug, naam').eq('organization_id', o).in('slug', bier.map((a) => a.slug));
    if (e2) throw new Error(`winkel_producten: ${e2.message}`);
    const opSlug = new Map((prodRijen ?? []).map((p) => [p.slug as string, p]));
    const ontbreekt = bier.filter((a) => !opSlug.has(a.slug)).map((a) => a.slug);
    const tePlaatsen: TePlaatsen[] = bier.filter((a) => opSlug.has(a.slug)).map((a) => {
        const p = opSlug.get(a.slug)!;
        return { productId: p.id as string, slug: a.slug, naam: p.naam as string };
    });

    const { data: plRijen, error: e3 } = await sb.from('winkel_plaatsingen').select('id, product_id, locatie_id, rol, volgorde').eq('organization_id', o);
    if (e3) throw new Error(`winkel_plaatsingen: ${e3.message}`);
    const bierPlek = plekken.find((p) => p.code === BIER);
    const plaats = planPlaatsingen(tePlaatsen, bierPlek?.id ?? '(nieuw)', (plRijen ?? []) as LivePlaatsing[]);

    console.log(`\nBier op de afdeling Bier: ${plaats.nieuw.length} erbij, ${plaats.alDaar.length} staan er al.`);
    if (plaats.elders.length) console.log(`Staan al ergens anders (niet verplaatst): ${plaats.elders.map((x) => x.slug).join(', ')}`);
    if (ontbreekt.length) console.log(`Nog geen product (eerst de bierimport draaien): ${ontbreekt.join(', ')}`);
    for (const p of plaats.nieuw) console.log(`  ${String(p.volgorde).padStart(2)}. ${p.naam}`);

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

    const bierId = idOp.get(BIER)!;
    if (plaats.nieuw.length) {
        const { error } = await sb.from('winkel_plaatsingen').insert(plaats.nieuw.map((p) => ({
            organization_id: o, product_id: p.productId, locatie_id: bierId, rol: 'verkoop', volgorde: p.volgorde,
        })));
        if (error) throw new Error(`plaatsingen: ${error.message}`);
    }
    console.log(`\nKlaar: ${plan.nieuw.length} plekken aangemaakt, ${plaats.nieuw.length} bieren op de afdeling Bier gezet.`);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
});
