/**
 * Echte proef op de som: één receptfoto door de ontleder.
 *
 * Dit is het enige stuk dat geen unit-test kan dekken — of het model met een
 * echte kookboekpagina hetzelfde eruit haalt als wat een mens eruit haalt.
 * Draait tegen de echte API en kost dus echt geld (rond de tien cent), maar
 * gebruikt exact dezelfde prompt, hetzelfde schema en dezelfde controle als
 * de route. Wat hier goed gaat, gaat in de app ook goed.
 *
 * Run:  npx tsx scripts/test-ontleder.ts <pad-naar-foto> [nog-een-foto]
 */

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
    controleer, inventarisVoorPrompt, SYSTEEM, SCHEMA, magOpslaan, type Voorstel,
} from '../src/lib/keukenplanner/ontleder';
import { estimateAiCostCents } from '../src/lib/aiCost';
import type { ApparaatMetKundes } from '../src/lib/keukenplanner/estafette';

const MODEL = 'claude-opus-5';
const ORG = '3f6f7bfd-4f0d-407e-b505-7c6ab0c2c879';

for (const regel of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = regel.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const paden = process.argv.slice(2).filter((a, i, alle) => !a.startsWith('--') && alle[i - 1] !== '--bewaar');
if (paden.length === 0) {
    console.error('Geef minstens één foto mee.');
    process.exit(1);
}

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
);

function mediaType(pad: string): 'image/jpeg' | 'image/png' | 'image/webp' {
    if (/\.png$/i.test(pad)) return 'image/png';
    if (/\.webp$/i.test(pad)) return 'image/webp';
    return 'image/jpeg';
}

async function main() {
    /* Het echte materieel, precies zoals de route het ophaalt. */
    const { data: materieel } = await sb
        .from('materieel')
        .select('id, naam, korte_naam, maakt_mogelijk, temp_min_c, temp_max_c, capaciteit_waarde, capaciteit_eenheid, kookoppervlak_cm2, aanzet_min, opwarm_min, warm_blijft_min, schoonmaak_min, exclusief_bezet, concurrent_jobs')
        .eq('organization_id', ORG)
        .not('maakt_mogelijk', 'is', null);

    const apparaten: ApparaatMetKundes[] = (materieel ?? []).map((m: Record<string, unknown>) => ({
        id: m.id as number,
        /* De keukennaam, niet de typenaam: "inductieplaat" in plaats van
           "METRO Professional GIC3135 inductiekookplaat". Scheelt tokens in de
           prompt en zorgt dat wat de AI teruggeeft leest zoals jij het zegt. */
        naam: (m.korte_naam as string) || (m.naam as string) || 'Apparaat',
        kundes: (m.maakt_mogelijk as string[]) ?? [],
        aanzetMin: (m.aanzet_min as number) ?? 1,
        opwarmMin: (m.opwarm_min as number) ?? null,
        warmBlijftMin: (m.warm_blijft_min as number) ?? null,
        schoonmaakMin: (m.schoonmaak_min as number) ?? null,
        exclusiefBezet: (m.exclusief_bezet as boolean) ?? true,
        concurrentJobs: (m.concurrent_jobs as number) ?? null,
        capaciteitWaarde: (m.capaciteit_waarde as number) ?? null,
        capaciteitEenheid: (m.capaciteit_eenheid as string) ?? null,
        kookoppervlakCm2: (m.kookoppervlak_cm2 as number) ?? null,
        temp_min_c: (m.temp_min_c as number) ?? null,
        temp_max_c: (m.temp_max_c as number) ?? null,
        stationId: null,
    }));

    const { data: comps } = await sb.from('components').select('name').eq('organization_id', ORG);
    const bekendeComponenten = (comps ?? []).map((c: { name: string }) => c.name);

    console.log(`Materieel met kundes: ${apparaten.length} · componenten: ${bekendeComponenten.length}`);
    console.log(`Foto's: ${paden.length}\n`);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const inhoud: Anthropic.ContentBlockParam[] = [
        ...paden.map((p): Anthropic.ContentBlockParam => ({
            type: 'image',
            source: { type: 'base64', media_type: mediaType(p), data: readFileSync(p).toString('base64') },
        })),
        {
            type: 'text',
            text: [
                'Zet dit recept om naar onze werkwijze.',
                '',
                'DIT STAAT ER IN DE KEUKEN — kies alleen hieruit, met het id tussen haken:',
                inventarisVoorPrompt(apparaten),
            ].join('\n'),
        },
    ];

    const start = Date.now();
    const bericht = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: [{ type: 'text', text: SYSTEEM, cache_control: { type: 'ephemeral' } }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: inhoud }],
    });
    const seconden = ((Date.now() - start) / 1000).toFixed(0);

    const centen = estimateAiCostCents({
        model: MODEL,
        tokens_input: bericht.usage.input_tokens,
        tokens_output: bericht.usage.output_tokens,
        tokens_cache_read: bericht.usage.cache_read_input_tokens ?? 0,
        tokens_cache_creation: bericht.usage.cache_creation_input_tokens ?? 0,
    });

    console.log(`stop_reason: ${bericht.stop_reason} · ${seconden}s`);
    console.log(`tokens in ${bericht.usage.input_tokens} · uit ${bericht.usage.output_tokens} · € ${(centen / 100).toFixed(3)}\n`);

    const tekst = bericht.content.find((b) => b.type === 'text');
    if (!tekst || tekst.type !== 'text') {
        console.error('Geen tekstblok in het antwoord:', bericht.content.map((b) => b.type));
        process.exit(1);
    }

    const voorstel = JSON.parse(tekst.text) as Voorstel;
    const controle = controleer(voorstel, { apparaten, bekendeComponenten });

    console.log(`═══ ${controle.gerechtNaam} ═══`);
    console.log(`${controle.porties ?? '?'} porties · ${controle.samenvatting.stappen} stappen`);
    console.log(`${controle.samenvatting.actiefMin} min actief · ${controle.samenvatting.passiefMin} min passief\n`);

    for (const s of controle.stappen) {
        const tijd = [
            s.actiefMin != null ? `${s.actiefMin}a` : null,
            s.passiefMin != null ? `${s.passiefMin}p` : null,
        ].filter(Boolean).join('/') || '—';
        const waar = s.materieelNaam ? ` @ ${s.materieelNaam}` : '';
        const deel = s.voorComponent ? `  «${s.voorComponent}»` : '';
        const temp = [
            s.tempC != null ? `${s.tempC}°C` : null,
            s.kernTempC != null ? `kern ${s.kernTempC}°C` : null,
            s.herhaalIntervalMin != null ? `elke ${s.herhaalIntervalMin}min×${s.herhaalDuurMin ?? '?'}` : null,
        ].filter(Boolean).map((t) => ` ${t}`).join('');
        const vlag = s.oordeel === 'vraag' ? '  ⟵ ' + s.bezwaar
            : s.wachtOpKeuze ? '  ⟵ wacht op keuze' : '';
        console.log(`${String(s.volgnummer).padStart(2)}. [${tijd.padStart(9)}] ${s.tekst}${deel}${waar}${temp}${vlag}`);
    }

    if (controle.vervallen.length > 0) {
        console.log('\nVERVALLEN op deze apparatuur:');
        for (const v of controle.vervallen) console.log(`  · ${v.tekst}\n    → ${v.reden}`);
    }

    if (controle.ontbrekendeComponenten.length > 0) {
        console.log(`\nCOMPONENTEN die nog niet bestaan: ${controle.ontbrekendeComponenten.join(', ')}`);
    }

    if (controle.ingredienten.length > 0) {
        console.log(`\nINGREDIENTEN (${controle.ingredienten.length}):`);
        for (const i of controle.ingredienten) {
            const deel = i.voorComponent ? `  «${i.voorComponent}»` : '';
            console.log(`  ${String(i.hoeveelheid ?? '—').padStart(6)} ${(i.eenheid ?? '').padEnd(5)} ${i.naam}${deel}`);
        }
    }

    if (controle.anderRecept) {
        console.log(`\nOOK OP DEZE PAGINA: ${controle.anderRecept}`);
    }

    if (controle.vragen.length > 0) {
        console.log('\nVRAGEN aan de kok:');
        for (const v of controle.vragen) console.log(`  ? ${v}`);
    }

    const oordeel = magOpslaan(controle);
    console.log(`\nOpslaan: ${oordeel.mag ? 'mag' : 'nog niet'} — ${oordeel.reden}`);

    /* Met --bewaar <pad> valt het voorstel op schijf, zodat de opslagroute
       getest kan worden zonder er nog een keer voor te betalen. */
    const bewaarIdx = process.argv.indexOf('--bewaar');
    if (bewaarIdx !== -1 && process.argv[bewaarIdx + 1]) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(process.argv[bewaarIdx + 1], JSON.stringify(controle, null, 1));
        console.log(`Voorstel bewaard in ${process.argv[bewaarIdx + 1]}`);
    }
}

main().catch((e) => {
    console.error('Mislukt:', e instanceof Error ? e.message : e);
    process.exit(1);
});
