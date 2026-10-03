#!/usr/bin/env node
/**
 * npm run dev:branch — start `next dev` alleen als BA lokaal NIET tegen de
 * live database praat. Plan v5, E2E-0 · docs/ecosysteem/stap-0-supabase.md
 *
 * Variabelen (alleen namen, waarden staan in .env.development.local):
 *   NEXT_PUBLIC_SUPABASE_URL  de database waar BA lokaal tegen praat (dev)
 *   LIVE_SUPABASE_REF         de project-ref van live; verplicht
 *
 * Weigert als LIVE_SUPABASE_REF ontbreekt of geen project-ref is, als
 * NEXT_PUBLIC_SUPABASE_URL ontbreekt, of als die URL de live-ref bevat.
 *
 * De check leest process.env, aangevuld met de .env-bestanden precies zoals
 * `next dev` ze laadt (loadEnvConfig uit @next/env, dev-modus). Zo ziet de
 * check dezelfde URL als de app. Er wordt nooit een waarde geprint.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Een Supabase-project-ref: kleine letters en cijfers, geen URL. */
const PROJECT_REF = /^[a-z0-9]{15,40}$/;

/**
 * Pure controle, zonder bijwerkingen.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: boolean, reden?: string }} ok false = niet starten; reden zegt waarom (zonder waarden)
 */
export function controleerDevDb(env) {
    const liveRef = (env.LIVE_SUPABASE_REF ?? '').trim().toLowerCase();
    const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().toLowerCase();

    if (!liveRef) {
        return {
            ok: false,
            reden: 'LIVE_SUPABASE_REF ontbreekt. Zet de project-ref van live in .env.development.local, dan kan ik controleren dat je niet tegen live draait.',
        };
    }
    if (!PROJECT_REF.test(liveRef)) {
        return {
            ok: false,
            reden: 'LIVE_SUPABASE_REF is geen project-ref (alleen kleine letters en cijfers, zonder https:// of .supabase.co).',
        };
    }
    if (!url) {
        return { ok: false, reden: 'NEXT_PUBLIC_SUPABASE_URL ontbreekt. Zet de URL van de dev-database in .env.development.local.' };
    }
    if (url.includes(liveRef)) {
        return {
            ok: false,
            reden: 'NEXT_PUBLIC_SUPABASE_URL wijst naar live. Zet de URL van de dev-database (branch of apart project) in .env.development.local.',
        };
    }
    return { ok: true };
}

function main() {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const require = createRequire(import.meta.url);

    /* next dev krijgt de omgeving zoals hij was, zodat hij zijn .env-bestanden
       zelf laadt (en herlaadt) zoals bij npm run dev. */
    const omgevingVoorNext = { ...process.env };

    const { loadEnvConfig } = require('@next/env');
    loadEnvConfig(root, true, { info: () => {}, error: (...a) => console.error(...a) });

    const uitkomst = controleerDevDb(process.env);
    if (!uitkomst.ok) {
        console.error(`dev:branch start niet: ${uitkomst.reden}`);
        process.exit(1);
    }
    console.log('dev:branch: de Supabase-URL wijst niet naar live. next dev start.');

    const nextBin = require.resolve('next/dist/bin/next');
    const kind = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
        cwd: root,
        env: omgevingVoorNext,
        stdio: 'inherit',
    });
    for (const signaal of ['SIGINT', 'SIGTERM']) {
        process.on(signaal, () => kind.kill(signaal));
    }
    kind.on('exit', (code, signaal) => process.exit(code ?? (signaal ? 1 : 0)));
}

const isHoofdscript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isHoofdscript) main();
