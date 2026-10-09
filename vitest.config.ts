import { defineConfig } from 'vitest/config';
import path from 'node:path';

/* Vitest config — pure unit tests voor lib/* helpers zonder DB/JSX.
   Test-bestanden staan naast de source: src/lib/<name>.test.ts, en voor
   scripts naast het script: scripts/<name>.test.ts. */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'scripts/*.test.ts'],
        globals: false,
        /* Ruimer dan de standaard 5 s: tests met scrypt (inlogcodes, koppelcodes) en de
           winkel-opslag liepen onder belasting (parallelle runs, een E2E-keten ernaast)
           tegen de time-out aan (review M2, klein 12). Een test die zelf een kortere
           grens zet, houdt die. */
        testTimeout: 20_000,
    },
    resolve: {
        alias: {
            /* Mirror tsconfig.json paths zodat `@/lib/foo` ook in tests werkt. */
            '@': path.resolve(__dirname, 'src'),
            /* `server-only` is een Next-marker die buiten de Next-build niet
               bestaat. Zonder deze stub is elke module met die import (alles
               in lib/server/) onmogelijk te unit-testen. */
            'server-only': path.resolve(__dirname, 'src/test/server-only-stub.ts'),
        },
    },
});
