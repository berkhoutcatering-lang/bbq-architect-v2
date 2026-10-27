// PostgREST voor de api-stand (api.mjs): de officiële release-binary van
// GitHub (github.com/PostgREST/postgrest/releases), vastgepind op versie en
// SHA-256, gedownload naar tools/testdb/.bin (git-ignored). Eén keer; daarna
// staat hij er. Een download die niet klopt met de hash wordt weggegooid.
//
//   node postgrest.mjs        downloaden als hij er nog niet is, en het pad tonen

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BIN, binaries, isHoofd } from './lib.mjs';

export const POSTGREST_VERSIE = 'v14.18';

// Per platform het release-bestand en zijn SHA-256 (uit de GitHub-release, veld digest).
const BESTANDEN = {
    'darwin-arm64': { naam: 'macos-aarch64', sha256: 'e38374c68b927c565b62eebfd32f7b3ce4fe8801cac41c21565a1ce7dbac85b6' },
    'darwin-x64': { naam: 'macos-x86-64', sha256: '2209bae7c7d4b4e5b931c24febccbdf9dcfa685112bff1a2a21bbb2cb4e5be13' },
    'linux-x64': { naam: 'linux-static-x86-64', sha256: '98de1c0be7787aea5f5e11a25f303ea0077634d6fc1000b687bfa825fd27d299' },
    'linux-arm64': { naam: 'ubuntu-aarch64', sha256: '960676de3fb8102393adfff7f74d40aa131b52abe0ba63b6a5594c44c3a67569' },
};

export function postgrestPad() {
    return path.join(BIN, `postgrest-${POSTGREST_VERSIE}`, 'postgrest');
}

/**
 * De omgeving voor het PostgREST-proces. De macOS-release is gelinkt tegen
 * libpq van Homebrew (/opt/homebrew/opt/libpq); die hoeft er niet te zijn:
 * embedded-postgres levert dezelfde libpq.5.dylib mee, en dyld zoekt hem via
 * DYLD_FALLBACK_LIBRARY_PATH als het vaste pad ontbreekt. Linux: statisch.
 */
export async function postgrestOmgeving(basis = process.env) {
    const env = { ...basis };
    if (os.platform() === 'darwin') {
        // native/bin/pg_ctl → native/lib
        const { pg_ctl } = await binaries();
        const lib = path.join(path.dirname(path.dirname(pg_ctl)), 'lib');
        env.DYLD_FALLBACK_LIBRARY_PATH = [lib, basis.DYLD_FALLBACK_LIBRARY_PATH].filter(Boolean).join(':');
    }
    return env;
}

export async function zorgVoorPostgrest({ stil = false } = {}) {
    const pad = postgrestPad();
    if (fs.existsSync(pad)) return pad;

    const platform = `${os.platform()}-${os.arch()}`;
    const b = BESTANDEN[platform];
    if (!b) throw new Error(`Geen PostgREST-release vastgelegd voor ${platform}. Voeg hem toe in tools/testdb/postgrest.mjs.`);
    const bestand = `postgrest-${POSTGREST_VERSIE}-${b.naam}.tar.xz`;
    const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSIE}/${bestand}`;
    if (!stil) console.log(`PostgREST ${POSTGREST_VERSIE} downloaden (${bestand}) naar tools/testdb/.bin …`);

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download van ${url} mislukt: HTTP ${res.status}`);
    const inhoud = Buffer.from(await res.arrayBuffer());
    const hash = createHash('sha256').update(inhoud).digest('hex');
    if (hash !== b.sha256) {
        throw new Error(`De download van ${bestand} klopt niet met de vastgelegde SHA-256 (verwacht ${b.sha256}, kreeg ${hash}). Niets uitgepakt.`);
    }

    const doel = path.dirname(pad);
    fs.mkdirSync(doel, { recursive: true });
    const archief = path.join(BIN, bestand);
    fs.writeFileSync(archief, inhoud);
    try {
        execFileSync('tar', ['-xJf', archief, '-C', doel], { stdio: ['ignore', 'ignore', 'inherit'] });
    } finally {
        fs.rmSync(archief, { force: true });
    }
    if (!fs.existsSync(pad)) throw new Error(`Na het uitpakken staat er geen ${pad}.`);
    fs.chmodSync(pad, 0o755);
    if (!stil) console.log(`PostgREST staat klaar: ${path.relative(process.cwd(), pad)}`);
    return pad;
}

if (isHoofd(import.meta.url)) {
    zorgVoorPostgrest()
        .then(async (pad) => {
            console.log(execFileSync(pad, ['--version'], { encoding: 'utf8', env: await postgrestOmgeving() }).trim());
        })
        .catch((e) => {
            console.error(e.message);
            process.exit(1);
        });
}
