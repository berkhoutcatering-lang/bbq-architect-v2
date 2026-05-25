/**
 * Playwright config voor visual regression van menukaart-templates.
 *
 * Scope is bewust nauw: alleen `tests/menukaart/` draait. Andere visual
 * tests kunnen later toegevoegd worden zonder dit bestand te raken.
 *
 * Webserver: gebruikt `npm run build && npm start` zodat de runtime
 * gelijk is aan productie (geen dev-only fast-refresh quirks die
 * snapshot-diffs introduceren). Lokaal kun je `PLAYWRIGHT_USE_DEV=1`
 * zetten om tegen `npm run dev` te draaien.
 */

import { defineConfig, devices } from '@playwright/test';

const useDev = process.env.PLAYWRIGHT_USE_DEV === '1';

export default defineConfig({
    testDir: './tests/menukaart',
    timeout: 60_000,
    expect: { timeout: 10_000 },

    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,

    reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Snapshot output naast de spec, scoped per template. */
    snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',

    /* Spawn de Next.js server vóór de tests. Test-mode flag schakelt de
       /_test/menukaart/* test-routes aan (anders geven die 404). */
    webServer: {
        command: useDev
            ? 'NEXT_PUBLIC_E2E=1 NODE_ENV=test npm run dev -- -p 3001'
            : 'NEXT_PUBLIC_E2E=1 NODE_ENV=test npm run build && NEXT_PUBLIC_E2E=1 npm start -- -p 3001',
        url: 'http://localhost:3001',
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: {
            NEXT_PUBLIC_E2E: '1',
            NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
        },
    },
});
