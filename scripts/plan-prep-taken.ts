/**
 * Prep-taken genereren voor komende events — zelfde code-pad als de
 * "Taken plannen"-knop op het Kookbord (bulkScheduleEventPrep), maar dan
 * vanaf de command-line met de service-role key. Handig voor backfill en
 * voor het testen van de menu-resolver tegen echte data.
 *
 * Gebruik:
 *   npx tsx scripts/plan-prep-taken.ts --dry            # preview alle komende events
 *   npx tsx scripts/plan-prep-taken.ts                  # echt inserten (alle komende)
 *   npx tsx scripts/plan-prep-taken.ts --event 9        # één event
 *   npx tsx scripts/plan-prep-taken.ts --event 9 --force # verwijder server_recipe-taken eerst
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { bulkScheduleEventPrep } from '../src/lib/prep/bulkSchedule';

function loadEnvLocal(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
        for (const line of raw.split('\n')) {
            const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
            if (m) out[m[1]] = m[2].trim();
        }
    } catch {
        /* .env.local ontbreekt — val terug op process.env */
    }
    return out;
}

async function main() {
    const env = { ...loadEnvLocal(), ...process.env } as Record<string, string | undefined>;
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        console.error('FOUT: NEXT_PUBLIC_SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt (.env.local).');
        process.exit(2);
    }

    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry');
    const force = args.includes('--force');
    const eventIdx = args.indexOf('--event');
    const onlyEventId = eventIdx >= 0 ? Number(args[eventIdx + 1]) : null;

    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Events bepalen: één specifiek, of alle komende
    let events: Array<{ id: number; name: string; date: string; organization_id: string }> = [];
    if (onlyEventId != null && Number.isFinite(onlyEventId)) {
        const { data, error } = await supabase
            .from('events')
            .select('id, name, date, organization_id')
            .eq('id', onlyEventId);
        if (error) { console.error('DB-fout:', error.message); process.exit(2); }
        events = data ?? [];
    } else {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('events')
            .select('id, name, date, organization_id')
            .gte('date', today)
            .order('date', { ascending: true });
        if (error) { console.error('DB-fout:', error.message); process.exit(2); }
        events = data ?? [];
    }

    if (events.length === 0) {
        console.log('Geen events gevonden.');
        return;
    }

    console.log(`${dryRun ? '[DRY-RUN] ' : ''}${events.length} event(s) te verwerken${force ? ' (force)' : ''}\n`);

    for (const ev of events) {
        const result = await bulkScheduleEventPrep(supabase, ev.id, ev.organization_id, {
            dryRun,
            force,
            userId: null,
        });
        const label = `#${ev.id} ${ev.name} (${ev.date})`;
        if (!result.ok) {
            console.log(`✗ ${label} — ${result.reason}${result.error ? `: ${result.error}` : ''}`);
            continue;
        }
        if (result.reason === 'no_dishes' || result.reason === 'no_gerechten_match') {
            console.log(`– ${label} — geen gerechten te koppelen (${result.reason})`);
            continue;
        }
        console.log(
            `✓ ${label} — ${result.taskCount} taken` +
            ` (${result.matchedTemplates} template-match, ${result.fallbackCount} fallback` +
            `${result.deletedCount ? `, ${result.deletedCount} verwijderd` : ''})`,
        );
        if (dryRun && result.tasks.length > 0) {
            for (const t of result.tasks.slice(0, 30)) {
                console.log(`    · [${t.phase}] ${t.text} → ${t.scheduled_at?.slice(0, 16) ?? '?'} (station ${t.station_id ?? '–'})`);
            }
            if (result.tasks.length > 30) console.log(`    … +${result.tasks.length - 30} meer`);
        }
    }
}

main().catch((e) => { console.error(e); process.exit(2); });
