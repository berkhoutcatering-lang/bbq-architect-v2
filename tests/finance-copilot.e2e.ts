/**
 * Finance Copilot E2E — Bucket J P0.15
 *
 * Flow getest:
 *   1. /financien → FinanceSummaryStrip rendert met denk-zin + 4 chips
 *   2. Klik chip "Kan ik investeren?" → KiaScenarioModal opent
 *   3. Modal toont 3 scenarios (via kia.ts berekend, geen AI in loop)
 *   4. Klik "Stuur naar boekhouder" op middelste scenario
 *   5. Redirect naar /geld/boekhouder?from=finance_copilot
 *   6. Pakket-entry zichtbaar via from-param
 *
 * Strategie:
 *   - API-routes worden gemockt via page.route() — geen Supabase nodig.
 *   - Page-load gebruikt placeholder-auth (NEXT_PUBLIC_E2E=1).
 *
 * Run:
 *   npx playwright test --config=playwright.finance.config.ts
 *
 * Of voeg dit bestand toe aan de standaard config met testDir-uitbreiding.
 */

import { test, expect, Route } from '@playwright/test';

const SUMMARY_RESPONSE = {
    summary: {
        date: '2026-05-27',
        summary_md:
            'April liep €4.200 boven forecast door 3 bedrijfslunches. Wil je weten waar de marge bleef?',
        chips_json: [
            { label: 'Waar bleef de marge?', prompt: 'Waar bleef de marge in april?', action: 'chat' },
            { label: 'Stille maanden?', prompt: 'Welke maanden waren stil?', action: 'chat' },
            { label: 'Kan ik investeren?', prompt: 'Welke ruimte heb ik nog voor KIA?', action: 'kia_modal' },
            { label: 'Stuur naar boekhouder', prompt: 'Maak een pakket voor de boekhouder', action: 'send_bookkeeper' },
        ],
        generated_at: '2026-05-27T06:00:00Z',
    },
};

const KIA_SCENARIO_RESPONSE = {
    kia_aftrek: 8820,
    bracket_hit: 'percentueel',
    bracket_label: '28% van investering',
    indicative_tax_saving: 3263,
    message: '€31.500 × 28% = €8.820 aftrek.',
    scenarios: [
        {
            label: 'Niets doen',
            description: 'Huidige situatie — geen extra investering',
            investment_amount: 31500,
            kia_aftrek: 8820,
            bracket: 'percentueel',
            indicative_tax_saving: 3263,
            extra_investment: 0,
            extra_tax_saving: 0,
            message: '€31.500 × 28% = €8.820 aftrek.',
        },
        {
            label: 'Tot €71.684 optimaal',
            description: 'Maximale aftrek bereiken',
            investment_amount: 71684,
            kia_aftrek: 20072,
            bracket: 'vast_maximum',
            indicative_tax_saving: 7427,
            extra_investment: 40184,
            extra_tax_saving: 4164,
            message: 'Maximale KIA-aftrek bereikt: €20.072.',
        },
        {
            label: 'Tot €132.746 topgrens',
            description: 'Bovengrens vast-maximum bracket',
            investment_amount: 132746,
            kia_aftrek: 20072,
            bracket: 'vast_maximum',
            indicative_tax_saving: 7427,
            extra_investment: 101246,
            extra_tax_saving: 4164,
            message: 'Maximale KIA-aftrek bereikt: €20.072.',
        },
    ],
};

const SEND_RESPONSE = {
    packet_id: 'pkt-test-001',
    redirect: '/geld/boekhouder?from=finance_copilot&packet_id=pkt-test-001',
};

test.describe('Finance Copilot — /financien', () => {
    test.beforeEach(async ({ page }) => {
        // Mock summary endpoint (GET)
        await page.route('**/api/financien/summary', async (route: Route) => {
            if (route.request().method() !== 'GET') return route.continue();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMARY_RESPONSE) });
        });
        // Mock KIA scenario endpoint (POST)
        await page.route('**/api/financien/kia-scenario', async (route: Route) => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KIA_SCENARIO_RESPONSE) });
        });
        // Mock send-to-bookkeeper endpoint (POST)
        await page.route('**/api/financien/send-to-bookkeeper', async (route: Route) => {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEND_RESPONSE) });
        });
        // Clear dismiss-state from prior runs
        await page.addInitScript(() => localStorage.removeItem('finance_copilot_dismissed_at'));
    });

    test('summary-strip rendert + chip opent KIA-modal + scenario doorsturen redirect', async ({ page }) => {
        await page.goto('/financien');

        // Step 1 — Summary visible
        const strip = page.getByTestId('finance-summary-strip');
        await expect(strip).toBeVisible({ timeout: 10_000 });
        await expect(strip).toContainText('April liep €4.200 boven forecast');

        // Step 2 — Klik chip "Kan ik investeren?"
        const kiaChip = page.getByTestId('finance-chip-kia_modal');
        await expect(kiaChip).toBeVisible();
        await kiaChip.click();

        // Step 3 — KIA modal opens with 3 scenarios
        const modal = page.getByTestId('kia-scenario-modal');
        await expect(modal).toBeVisible({ timeout: 5_000 });
        await expect(page.getByTestId('kia-scenario-0')).toBeVisible();
        await expect(page.getByTestId('kia-scenario-1')).toBeVisible();
        await expect(page.getByTestId('kia-scenario-2')).toBeVisible();

        // Sanity: scenarios bevatten verwachte bedragen
        await expect(modal).toContainText('€8.820');
        await expect(modal).toContainText('€20.072');

        // Step 4 — Klik "Stuur naar boekhouder" op middelste (idx=1) scenario
        const sendBtn = page.getByTestId('kia-send-1');
        await expect(sendBtn).toBeVisible();
        await sendBtn.click();

        // Step 5 — Redirect naar /geld/boekhouder met from=finance_copilot
        await page.waitForURL(/\/geld\/boekhouder.*from=finance_copilot/, { timeout: 5_000 });
        expect(page.url()).toMatch(/from=finance_copilot/);

        // Step 6 — Verify URL contains the expected query param (proxy voor pakket-entry zichtbaar)
        const url = new URL(page.url());
        expect(url.pathname).toBe('/geld/boekhouder');
        expect(url.searchParams.get('from')).toBe('finance_copilot');
    });

    test('strip dismiss persist in localStorage', async ({ page }) => {
        await page.goto('/financien');

        const strip = page.getByTestId('finance-summary-strip');
        await expect(strip).toBeVisible({ timeout: 10_000 });

        // Klik X-knop
        await strip.getByRole('button', { name: 'Sluiten' }).click();
        await expect(strip).toBeHidden();

        // localStorage zou nu finance_copilot_dismissed_at moeten hebben
        const lsValue = await page.evaluate(() => localStorage.getItem('finance_copilot_dismissed_at'));
        expect(lsValue).not.toBeNull();
    });
});
