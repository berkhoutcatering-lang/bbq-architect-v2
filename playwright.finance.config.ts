/**
 * Playwright config voor Finance Copilot E2E (Bucket J P0.15).
 *
 * Scope: tests/finance-copilot.e2e.ts. Geïsoleerd van menukaart visual-regression
 * config — verschillende baseURL, geen visual-snapshots.
 *
 * Run:
 *   PLAYWRIGHT_USE_DEV=1 npx playwright test --config=playwright.finance.config.ts
 *
 * In CI: zonder PLAYWRIGHT_USE_DEV doet hij build + start (productie-runtime).
 */

import { defineConfig, devices } from '@playwright/test';

const useDev = process.env.PLAYWRIGHT_USE_DEV === '1';

export default defineConfig({
    testDir: './tests',
    testMatch: /finance-copilot\.e2e\.ts$/,
    timeout: 60_000,
    expect: { timeout: 10_000 },

    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,

    reporter: process.env.CI ? [['line']] : 'list',

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3002',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],

    webServer: {
        command: useDev
            ? 'NEXT_PUBLIC_E2E=1 NODE_ENV=test npm run dev -- -p 3002'
            : 'NEXT_PUBLIC_E2E=1 NODE_ENV=test npm run build && NEXT_PUBLIC_E2E=1 npm start -- -p 3002',
        url: 'http://localhost:3002',
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: {
            NEXT_PUBLIC_E2E: '1',
            NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
        },
    },
});
