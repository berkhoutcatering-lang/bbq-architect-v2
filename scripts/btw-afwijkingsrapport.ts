/**
 * BTW-afwijkingsrapport — veiligheidsfase F7
 *
 * De correcties uit de veiligheidsfase veranderen bedragen. Verzonden facturen
 * mogen NIET stilzwijgend meeveranderen — dat is precies de onveranderbaarheid
 * die de audit mist. Dit script wijzigt daarom niets. Het leest alleen, en laat
 * zien welke documenten onder de oude regels een ander bedrag kregen dan ze
 * onder de nieuwe zouden krijgen, zodat een mens kan beslissen over creditnota
 * of suppletie.
 *
 * Gebruik:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/btw-afwijkingsrapport.ts [--json] [--jaar 2026]
 *
 * Exit codes:
 *   0 = klaar (ook als er afwijkingen zijn — dit is een rapport, geen poort)
 *   2 = technische fout (geen env, geen verbinding)
 */

import { createClient } from '@supabase/supabase-js';
import { isMissingBtwPct } from '../src/lib/btw-rules';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const jaarIdx = args.indexOf('--jaar');
const jaar = jaarIdx >= 0 ? Number(args[jaarIdx + 1]) : null;

/** Statussen waarvan het document het pand al heeft verlaten. */
const VERZONDEN = ['verzonden', 'betaald', 'verlopen', 'vervallen'];

/** Het OUDE gedrag: `item.btw || 21` — 0 en ontbrekend werden allebei 21. */
function oudPct(raw: unknown): number {
    const n = Number(raw);
    return n || 21;
}

interface Afwijking {
    factuur: string;
    datum: string;
    klant: string;
    status: string;
    regel: string;
    netto: number;
    oud_pct: number;
    nieuw_pct: number | null;
    oud_btw: number;
    nieuw_btw: number | null;
    verschil: number | null;
    reden: string;
}

async function main() {
    if (!URL || !KEY) {
        console.error('[afwijkingsrapport] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken');
        process.exit(2);
    }
    const sb = createClient(URL, KEY, { auth: { persistSession: false } });

    /* ── 1. Facturen ──────────────────────────────────────────────────── */

    let q = sb.from('facturen')
        .select('nummer,client_naam,datum,status,items')
        .in('status', VERZONDEN);
    if (jaar) q = q.gte('datum', `${jaar}-01-01`).lte('datum', `${jaar}-12-31`);

    const { data: facturen, error } = await q;
    if (error) {
        console.error('[afwijkingsrapport] facturen ophalen faalde:', error.message);
        process.exit(2);
    }

    const afwijkingen: Afwijking[] = [];

    for (const f of facturen ?? []) {
        const items = Array.isArray(f.items) ? f.items : [];
        items.forEach((it: Record<string, unknown>, idx: number) => {
            const netto = (Number(it.qty) || 0) * (Number(it.prijs) || 0);
            if (netto === 0) return;

            const ontbreekt = isMissingBtwPct(it.btw);
            const nieuw = ontbreekt ? null : Number(it.btw);
            const oud = oudPct(it.btw);
            if (nieuw !== null && nieuw === oud) return;

            afwijkingen.push({
                factuur: String(f.nummer ?? '?'),
                datum: String(f.datum ?? ''),
                klant: String(f.client_naam ?? ''),
                status: String(f.status ?? ''),
                regel: String(it.omschrijving ?? `regel ${idx + 1}`),
                netto,
                oud_pct: oud,
                nieuw_pct: nieuw,
                oud_btw: netto * (oud / 100),
                nieuw_btw: nieuw === null ? null : netto * (nieuw / 100),
                verschil: nieuw === null ? null : netto * ((nieuw - oud) / 100),
                reden: ontbreekt
                    ? 'Geen tarief in de data. Export rekende 21%, schermweergave 0% — twee verschillende bedragen voor dezelfde regel.'
                    : `Regel staat op ${nieuw}%, maar export rekende ${oud}%.`,
            });
        });
    }

    /* ── 2. Bonnen die uit 5b vallen ──────────────────────────────────── */

    let bq = sb.from('bonnen')
        .select('datum,winkel,btw_laag_bedrag,btw_hoog_bedrag,voorbelasting_bevestigd')
        .eq('voorbelasting_bevestigd', false);
    if (jaar) bq = bq.gte('datum', `${jaar}-01-01`).lte('datum', `${jaar}-12-31`);

    const { data: bonnen, error: bonErr } = await bq;
    if (bonErr) {
        console.error('[afwijkingsrapport] bonnen ophalen faalde:', bonErr.message);
        process.exit(2);
    }

    const bonRegels = (bonnen ?? [])
        .map(b => ({
            datum: String(b.datum ?? ''),
            winkel: String(b.winkel ?? '—'),
            btw: (Number(b.btw_laag_bedrag) || 0) + (Number(b.btw_hoog_bedrag) || 0),
        }))
        .filter(b => b.btw > 0)
        .sort((a, b) => b.btw - a.btw);

    const bonTotaal = bonRegels.reduce((s, b) => s + b.btw, 0);

    /* ── 3. Uitvoer ───────────────────────────────────────────────────── */

    if (asJson) {
        console.log(JSON.stringify({ facturen: afwijkingen, bonnen: bonRegels, bon_totaal: bonTotaal }, null, 2));
        return;
    }

    const eur = (n: number) => '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    console.log('\nBTW-afwijkingsrapport' + (jaar ? ` — ${jaar}` : ' — alle jaren'));
    console.log('='.repeat(72));

    console.log('\n1. VERZONDEN FACTUREN met een afwijkend BTW-bedrag');
    console.log('-'.repeat(72));
    if (afwijkingen.length === 0) {
        console.log('Geen. Elke verzonden factuurregel had een expliciet tarief dat gelijk is');
        console.log('aan wat de export ervan maakte.');
    } else {
        let totaal = 0;
        for (const a of afwijkingen) {
            console.log(`\n  ${a.factuur}  ${a.datum}  ${a.klant} [${a.status}]`);
            console.log(`    ${a.regel} — netto ${eur(a.netto)}`);
            console.log(`    export rekende ${a.oud_pct}% = ${eur(a.oud_btw)}`);
            console.log(a.nieuw_pct === null
                ? '    correct tarief: ONBEKEND — moet handmatig worden vastgesteld'
                : `    regel zegt ${a.nieuw_pct}% = ${eur(a.nieuw_btw!)}  →  verschil ${eur(a.verschil!)}`);
            console.log(`    ${a.reden}`);
            if (a.verschil !== null) totaal += a.verschil;
        }
        console.log(`\n  ${afwijkingen.length} regel(s), netto verschil ${eur(totaal)}`);
        console.log('  → Beoordeel per factuur: creditnota + nieuwe factuur, of suppletie.');
    }

    console.log('\n\n2. BONNEN die uit rubriek 5b vallen tot ze bevestigd zijn');
    console.log('-'.repeat(72));
    if (bonRegels.length === 0) {
        console.log('Geen openstaande bonnen met BTW.');
    } else {
        for (const b of bonRegels.slice(0, 25)) {
            console.log(`  ${b.datum}  ${eur(b.btw).padStart(12)}  ${b.winkel}`);
        }
        if (bonRegels.length > 25) console.log(`  … en ${bonRegels.length - 25} meer`);
        console.log(`\n  ${bonRegels.length} bon(nen), samen ${eur(bonTotaal)} aan voorbelasting.`);
        console.log('  Dit bedrag zat eerder automatisch in 5b. Loop de bonnen na in het');
        console.log('  archief en bevestig wat zakelijk is; de rest hoorde er nooit in.');
    }

    console.log('\n\n3. WAT NIET verandert');
    console.log('-'.repeat(72));
    console.log('Het gecorrigeerde drankentarief (alcoholvrij 21% → 9%) raakt GEEN bestaande');
    console.log('facturen: factuurregels slaan het percentage zelf op, niet de categorie.');
    console.log('De correctie werkt alleen vooruit, op nieuw aangemaakte regels.');
    console.log('');
}

main().catch(e => {
    console.error('[afwijkingsrapport]', e);
    process.exit(2);
});
