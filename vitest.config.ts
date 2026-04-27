import { defineConfig } from 'vitest/config';
import path from 'node:path';

/* Vitest config — pure unit tests voor lib/* helpers zonder DB/JSX.
   Test-bestanden staan naast de source: src/lib/<name>.test.ts. */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        globals: false,
    },
    resolve: {
        alias: {
            /* Mirror tsconfig.json paths zodat `@/lib/foo` ook in tests werkt. */
            '@': path.resolve(__dirname, 'src'),
        },
    },
});
