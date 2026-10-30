/**
 * BTW-kwartaalcontrole — rekent de aangifte uit met PRECIES dezelfde code als
 * het aangiftescherm (lib/btwAangifteBronnen + computeBtwAangifte) en zet de
 * uitkomst naast de handmatig nagerekende cijfers.
 *
 * Wijzigt niets. Alleen lezen.
 *
 * Gebruik:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/btw-kwartaal-controle.ts [--jaar 2026] [--kwartaal 3]
 *
 * Zonder --jaar/--kwartaal: Q3 2026, met de verwachte cijfers uit de
 * handmatige controle van 2026-10-26 ernaast.
 *
 * Exit codes: 0 = klaar, 1 = wijkt af van verwacht, 2 = technische fout.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { computeBtwAangifte, quarterPeriod } from '../src/lib/financeAnalytics';
import { laadAangifteBronnen } from '../src/lib/btwAangifteBronnen';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const args = process.argv.slice(2);
const arg = (naam: string) => {
    const i = args.indexOf(naam);
    return i >= 0 ? Number(args[i + 1]) : null;
};
const jaar = arg('--jaar') ?? 2026;
const kwartaal = (arg('--kwartaal') ?? 3) as 1 | 2 | 3 | 4;
const isQ3_2026 = jaar === 2026 && kwartaal === 3;

const eur = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
    if (!URL || !KEY) {
        console.error('[btw-controle] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ontbreken');
        process.exit(2);
    }
    const sb = createClient(URL, KEY, { auth: { persistSession: false } }) as SupabaseClient;
    const period = quarterPeriod(jaar, kwartaal);

    /* Alle organisaties met facturen of bonnen in de periode. */
    const [{ data: f }, { data: b }] = await Promise.all([
        sb.from('facturen').select('organization_id').gte('datum', period.start_date).lte('datum', period.end_date),
        sb.from('bonnen').select('organization_id').gte('datum', period.start_date).lte('datum', period.end_date),
    ]);
    const orgs = [...new Set([...(f ?? []), ...(b ?? [])].map(r => r.organization_id as string))];
    if (orgs.length === 0) {
        console.log(`Geen facturen of bonnen in Q${kwartaal} ${jaar}.`);
        return;
    }

    let afwijking = false;
    for (const orgId of orgs) {
        const bronnen = await laadAangifteBronnen(sb, orgId, period.start_date, period.end_date);
        if (bronnen.fout) {
            console.error(`[${orgId}] ophalen faalde: ${bronnen.fout}`);
            process.exit(2);
        }
        const r = computeBtwAangifte(bronnen.facturen, bronnen.bonnen, period, bronnen.kassa);
        const bevestigdAantal = bronnen.bonnen
            .filter(x => x.voorbelasting_bevestigd === true)
            .length;

        console.log(`\n=== Q${kwartaal} ${jaar} — organisatie ${orgId} ===`);
        console.log(`1a  21%   omzet ${eur(r.rubriek_1a.omzet)}   btw ${eur(r.rubriek_1a.btw)}`);
        console.log(`1b   9%   omzet ${eur(r.rubriek_1b.omzet)}   btw ${eur(r.rubriek_1b.btw)}`);
        console.log(`    waarvan kassa: ${r.kassa.regels} regels, 9% ${eur(r.kassa.omzet_laag)} + ${eur(r.kassa.btw_laag)}, 21% ${eur(r.kassa.omzet_hoog)} + ${eur(r.kassa.btw_hoog)}`);
        console.log(`    kassabonnen per status: ${JSON.stringify(bronnen.kassa_statussen)}${bronnen.kassa_fout ? `   FOUT: ${bronnen.kassa_fout}` : ''}`);
        for (const d of bronnen.kassa_dagen) {
            console.log(`      ${d.datum}  ${String(d.orders).padStart(3)} bonnen (${d.betaald} betaald)  ${eur(d.omzet)} + ${eur(d.btw)} btw${d.uitgesloten ? '   [telt niet mee]' : ''}`);
        }
        if (!bronnen.kassa_uitsluiten_beschikbaar) console.log('      (tabel btw_kassa_uitsluitingen bestaat nog niet — alle kassadagen tellen mee)');
        console.log(`4a  verlegd buiten EU   ${eur(r.rubriek_4a.omzet)}   btw ${eur(r.rubriek_4a.btw)}${bronnen.verlegd_beschikbaar ? '' : '   (kolom btw_verlegd bestaat nog niet — migratie draaien)'}`);
        console.log(`4b  verlegd binnen EU   ${eur(r.rubriek_4b.omzet)}   btw ${eur(r.rubriek_4b.btw)}`);
        console.log(`5a  verschuldigd        ${eur(r.rubriek_5a)}`);
        console.log(`5b  voorbelasting       ${eur(r.rubriek_5b)}   (${bevestigdAantal} bevestigde bonnen; 9% ${eur(r.rubriek_5b_detail.laag)}, 21% ${eur(r.rubriek_5b_detail.hoog)}, verlegd ${eur(r.rubriek_5b_detail.verlegd)})`);
        console.log(`    wacht op bevestiging: ${eur(r.voorbelasting_onbevestigd)} op ${r.voorbelasting_onbevestigd_count} bonnen`);
        console.log(`    niet ingedeeld: ${r.gaten.length} regels, ${eur(r.gaten_bedrag)}${r.gaten.length ? ' — ' + [...new Set(r.gaten.map(g => g.referentie))].join(', ') : ''}`);
        console.log(`SALDO  ${r.saldo >= 0 ? 'te betalen' : 'terug'} ${eur(Math.abs(r.saldo))}`);

        if (isQ3_2026 && (r.rubriek_1b.omzet !== 0 || r.kassa.regels > 0)) {
            const check = (label: string, echt: number, verwacht: number) => {
                const ok = Math.abs(echt - verwacht) < 0.005;
                if (!ok) afwijking = true;
                console.log(`  ${ok ? '✓' : '✗'} ${label}: ${eur(echt)} (verwacht ${eur(verwacht)})`);
            };
            console.log('\nVergelijking met de handmatige aangifte:');
            check('1b omzet', r.rubriek_1b.omzet, 4042.16);
            check('1b btw', r.rubriek_1b.btw, 363.84);
            const verschil = Math.round((r.rubriek_1b.omzet - 4042.16) * 100) / 100;
            if (verschil !== 0) {
                /* De handmatige aangifte telde de kleine testbestellingen niet mee. Laat zien welke
                   kassadagen (naast 29-30 aug) meetellen, zodat duidelijk is waar het verschil zit. */
                const overig = bronnen.kassa_dagen.filter(d => !d.uitgesloten && d.datum !== '2026-08-29' && d.datum !== '2026-08-30');
                console.log(`    verschil 1b omzet: ${eur(verschil)}; meetellende kassadagen buiten de zomerfair: ${overig.map(d => `${d.datum} ${eur(d.omzet)}`).join(', ') || 'geen'}`);
            }
            check('4a omzet', r.rubriek_4a.omzet, 144);
            check('4a btw', r.rubriek_4a.btw, 30.24);
            if (r.rubriek_4a.btw === 0) {
                console.log('    (4a is pas goed nadat de Wispr-bon als "verlegd — buiten EU" is gemarkeerd)');
            }
        }
    }
    process.exit(afwijking ? 1 : 0);
}

main().catch((e) => {
    console.error('[btw-controle] onverwachte fout:', e);
    process.exit(2);
});
