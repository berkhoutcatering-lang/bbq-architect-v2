// Start de lokale testdatabase (maakt het cluster aan als het er nog niet is).
// Alleen 127.0.0.1, geen Unix-socket, op een vrije poort vanaf 54329.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { binaries, CLUSTER, DATA, draait, GEBRUIKER, isHoofd, leesPoort, LOG, POORTBESTAND, url, vrijePoort, WACHTWOORD } from './lib.mjs';

export async function start() {
    const { initdb, pg_ctl } = await binaries();
    fs.mkdirSync(DATA, { recursive: true });

    if (draait()) {
        console.log(`De testdatabase draait al: ${url()}`);
        return;
    }

    if (!fs.existsSync(path.join(CLUSTER, 'PG_VERSION'))) {
        console.log('Nieuw cluster aanmaken in tools/testdb/.data/pg …');
        const pwfile = path.join(os.tmpdir(), `testdb-pw-${process.pid}`);
        fs.writeFileSync(pwfile, WACHTWOORD + '\n', { mode: 0o600 });
        try {
            // C.UTF-8 (builtin) en UTF8, net als Supabase; tijdzone UTC.
            execFileSync(initdb, [
                '-D', CLUSTER,
                '-U', GEBRUIKER,
                `--pwfile=${pwfile}`,
                '--auth=scram-sha-256',
                '--encoding=UTF8',
                '--locale-provider=builtin',
                '--builtin-locale=C.UTF-8',
                '--locale=C',
            ], { stdio: ['ignore', 'ignore', 'inherit'] });
        } finally {
            fs.rmSync(pwfile, { force: true });
        }
        // Alleen localhost; geen Unix-socket (een lang pad past niet in sun_path).
        fs.appendFileSync(path.join(CLUSTER, 'postgresql.conf'), [
            '',
            '# ── tools/testdb ──',
            "listen_addresses = '127.0.0.1'",
            "unix_socket_directories = ''",
            "timezone = 'UTC'",
            "log_timezone = 'UTC'",
            'fsync = off',
            'synchronous_commit = off',
            'full_page_writes = off',
            'max_connections = 50',
            '',
        ].join('\n'));
    }

    const poort = await vrijePoort(leesPoort() ?? undefined);
    fs.writeFileSync(POORTBESTAND, String(poort));
    execFileSync(pg_ctl, ['-D', CLUSTER, '-l', LOG, '-o', `-p ${poort}`, '-w', '-t', '60', 'start'], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`De testdatabase draait: ${url()}`);
}

if (isHoofd(import.meta.url)) {
    start().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
