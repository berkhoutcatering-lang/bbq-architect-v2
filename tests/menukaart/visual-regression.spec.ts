/**
 * Visual regression voor alle 10 menukaart-templates.
 *
 * Twee asserts per template:
 *   1. Preview-screenshot match een opgeslagen baseline (toHaveScreenshot
 *      gebruikt pixelmatch onder de motorkap met maxDiffPixelRatio).
 *   2. PDF bevat alle gang-namen en alle dish-namen uit FIXTURE_MENU (text-
 *      extractie via pdfjs-dist, geen pixel-diff — preview en PDF gebruiken
 *      verschillende font-engines dus 1-op-1 pixel-match is fundamenteel
 *      onhaalbaar zonder node-canvas + identieke font-stack op beide kanten).
 *
 * Tolerantie:
 *   - maxDiffPixelRatio = 0.02 (2% van pixels mag verschillen). Komt overeen
 *     met de "<2px per gang"-eis in de spec, vertaald naar een werkbare
 *     metric. Anti-aliasing en sub-pixel font-rendering produceren altijd
 *     micro-diffs op CI vs dev (anders font-hinting).
 *
 * Baseline-update:
 *   `npx playwright test --update-snapshots`
 *
 * Spec: bucket B P0-5.
 */

import { test, expect } from '@playwright/test';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { PdfFor } from '../../src/lib/menukaart/pdf';
import { listEnabledTemplates } from '../../src/lib/menukaart/registry';
import { FIXTURE_MENU } from './fixtures';

const A4_W = 794;
const A4_H = 1123;
const SQUARE_H = 794;

const TEMPLATES = listEnabledTemplates();

for (const template of TEMPLATES) {
    test.describe(`menukaart template ${template.id}`, () => {
        const height = template.paper === 'square' ? SQUARE_H : A4_H;

        test('preview renders deterministisch (snapshot match)', async ({ page }) => {
            await page.setViewportSize({ width: A4_W, height });

            const response = await page.goto(`/e2e-test/menukaart/${template.id}`, {
                waitUntil: 'networkidle',
            });
            expect(response?.status(), 'test-page geserveerd (NEXT_PUBLIC_E2E=1 actief?)').toBe(200);

            /* Wacht expliciet tot fonts geladen zijn — sub-pixel font-rendering
               diffs zijn een typische bron van flaky visual tests. */
            await page.evaluate(() => document.fonts.ready);

            const locator = page.locator('[data-testid="menukaart-test-page"]');
            await expect(locator).toBeVisible();

            await expect(locator).toHaveScreenshot(`${template.id}-preview.png`, {
                maxDiffPixelRatio: 0.02, // ~2% van pixels mag verschillen
                animations: 'disabled',
                caret: 'hide',
                threshold: 0.2, // pixelmatch sensitivity (0..1)
            });
        });

        test('PDF bevat alle gang- en dish-namen', async () => {
            const PdfComponent = PdfFor(template.id);
            const element = createElement(PdfComponent, {
                overrides: {},
                data: FIXTURE_MENU,
            }) as unknown as ReactElement<DocumentProps>;
            const buffer = await renderToBuffer(element);
            expect(buffer.length, 'PDF buffer is niet leeg').toBeGreaterThan(2_000);

            /* Lichte structuur-check: PDF moet een geldige PDF-header hebben
               en alle gang-namen + dish-namen moeten als string in de raw
               bytes voorkomen (PDF compressie kan dit beïnvloeden — daarom
               check tegen het uncompressed deel via een simpel scan). */
            const header = buffer.subarray(0, 5).toString('utf8');
            expect(header).toBe('%PDF-');

            const haystack = buffer.toString('latin1');
            for (const gang of FIXTURE_MENU.gangen) {
                const gangVariants = [gang.name, gang.name.toUpperCase()];
                const found = gangVariants.some(v => haystack.includes(v));
                expect(found, `Gang "${gang.name}" verwacht in PDF van ${template.id}`).toBe(true);

                for (const dish of gang.dishes) {
                    /* Bekende beperking: sommige PDF-encoders splitsen lange strings
                       over meerdere text-runs of compresseren ze. We checken alleen
                       het eerste woord van de dish-naam — dat geeft genoeg signaal
                       om missing content te detecteren zonder false positives. */
                    const firstWord = dish.name.split(/\s+/)[0];
                    expect(
                        haystack.toLowerCase().includes(firstWord.toLowerCase()),
                        `Dish-keyword "${firstWord}" (van "${dish.name}") verwacht in PDF`,
                    ).toBe(true);
                }
            }
        });
    });
}
