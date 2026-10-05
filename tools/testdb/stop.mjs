// Stopt de lokale testdatabase (de gegevens blijven staan in .data).

import { execFileSync } from 'node:child_process';
import { binaries, CLUSTER, draait, isHoofd } from './lib.mjs';

export async function stop() {
    if (!draait()) {
        console.log('De testdatabase draait niet.');
        return;
    }
    const { pg_ctl } = await binaries();
    execFileSync(pg_ctl, ['-D', CLUSTER, '-m', 'fast', '-w', 'stop'], { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log('De testdatabase is gestopt.');
}

if (isHoofd(import.meta.url)) {
    stop().catch((e) => {
        console.error(e.message);
        process.exit(1);
    });
}
