import { test, expect } from '@playwright/test';

/**
 * De bewaking op de bestelknop.
 *
 * Aanleiding: de knop was onzichtbaar. `.hb button { background: none }` woog
 * zwaarder dan `.hb-knop { background: var(--vuur) }`, dus de enige actie op
 * het scherm verdween in het zwart. Alle 1191 unit-tests stonden groen en
 * `tsc` was schoon — geen van beide rekent een cascade uit.
 *
 * Deze test doet dat wel: hij vraagt de browser om de berekende kleuren en
 * eist vuur op matzwart. Faalt hij, dan is er iets aan de opmaak veranderd dat
 * de klant niet kan zien maar wel raakt.
 *
 * Draait tegen /e2e-test/bestelstroom — geen database, geen login.
 */

/* Uit briefing §1, en doorgemeten in het plan §7:
   vuur op matzwart = 5,8 : 1. Crème op vuur haalt 2,6 : 1 en leest als een
   uitgezette knop, en dat mag dus niet. */
const VUUR = 'rgb(232, 106, 44)';      // #E86A2C
const MATZWART = 'rgb(20, 19, 17)';    // #141311

test.describe('bestelknop', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/e2e-test/bestelstroom');
        await page.waitForLoadState('networkidle');
    });

    test('staat in vuur, met matzwarte letters', async ({ page }) => {
        const knop = page.locator('.hb-knop').first();
        await expect(knop).toBeVisible();

        const kleuren = await knop.evaluate((el) => {
            const s = getComputedStyle(el);
            return { achtergrond: s.backgroundColor, tekst: s.color, opacity: s.opacity };
        });

        expect(kleuren.achtergrond, 'de bestelknop hoort vuur te zijn').toBe(VUUR);
        expect(kleuren.tekst, 'op vuur hoort matzwart, geen crème — crème haalt maar 2,6 : 1').toBe(MATZWART);
    });

    test('is groot genoeg om op een telefoon te raken', async ({ page }) => {
        const doos = await page.locator('.hb-knop').first().boundingBox();
        expect(doos, 'knop niet gevonden').not.toBeNull();
        expect(doos!.height).toBeGreaterThanOrEqual(44);
    });

    test('er staat maar één oranje ding op het scherm', async ({ page }) => {
        /* Briefing §1: vuur is gereserveerd voor de enige actie. Staat er een
           tweede oranje ding, dan is er iets fout. */
        const aantal = await page.evaluate((vuur) => {
            const alles = Array.from(document.querySelectorAll('*'));
            return alles.filter((el) => getComputedStyle(el).backgroundColor === vuur).length;
        }, VUUR);
        expect(aantal).toBe(1);
    });
});

test.describe('uitverkocht-scherm', () => {
    test('zegt waarom, en belooft één bericht', async ({ page }) => {
        await page.goto('/e2e-test/bestelstroom');
        await expect(page.getByText('De dozen zijn op')).toBeVisible();
        await expect(page.getByText('één paar handen')).toBeVisible();
        await expect(page.getByText('Verder niets.')).toBeVisible();
        /* Geen wachtlijst zonder AVG-akkoord. */
        await expect(page.getByRole('link', { name: 'privacyvoorwaarden' })).toBeVisible();
    });
});
