import { describe, it, expect } from 'vitest';
import { countPriceLikeLines, formatPageLinesForPrompt, type PdfPageLines } from './pdfTextLayer';

/* Regels zoals ze uit een echte groothandel-lijst komen (Van Engelandt-formaat:
   artikelnummer, omschrijving, prijs met 3 decimalen, eenheid). */
const pages: PdfPageLines[] = [
    {
        page: 1,
        lines: [
            'VAN ENGELANDT NV',
            'Artikel Omschrijving Prijs Eh.',
            '700870 BRASVAR COPPA. 21,950 KG',
            '7008701 BRASVAR COPPA MET KRUIDEN 22,550 KG',
            'Nancy 10/05/2026 19:39 Pag: 1 / 20',
        ],
    },
    {
        page: 2,
        lines: [
            '108351 RILLETTES COPPA BRASVAR 100 GR 4,450 ST',
            'MELKGEIT',
            '161 GEIT. 16,250 KG',
        ],
    },
];

describe('countPriceLikeLines', () => {
    it('telt alleen regels met een bedrag', () => {
        // 2 op pagina 1 + 2 op pagina 2 = 4; koppen/adres/paginavoet tellen niet
        expect(countPriceLikeLines(pages)).toBe(4);
    });
    it('telt een regel zonder decimalen niet mee', () => {
        expect(countPriceLikeLines([{ page: 1, lines: ['161 GEIT KG', 'Pag: 1 / 20'] }])).toBe(0);
    });
    it('accepteert zowel komma als punt als decimaalteken', () => {
        expect(countPriceLikeLines([{ page: 1, lines: ['A 21,95 KG', 'B 21.95 KG'] }])).toBe(2);
    });
    it('ziet een datum niet aan voor een prijs', () => {
        // 10/05/2026 en 19:39 hebben geen decimaal-patroon
        expect(countPriceLikeLines([{ page: 1, lines: ['Nancy 10/05/2026 19:39 Pag: 1 / 20'] }])).toBe(0);
    });
    it('lege invoer → 0', () => {
        expect(countPriceLikeLines([])).toBe(0);
    });
});

describe('formatPageLinesForPrompt', () => {
    it('zet pagina-koppen boven de regels', () => {
        const out = formatPageLinesForPrompt(pages);
        expect(out).toContain('--- pagina 1 ---');
        expect(out).toContain('--- pagina 2 ---');
        expect(out).toContain('700870 BRASVAR COPPA. 21,950 KG');
    });
    it('houdt elke regel op een eigen regel', () => {
        const out = formatPageLinesForPrompt([{ page: 3, lines: ['een', 'twee'] }]);
        expect(out).toBe('--- pagina 3 ---\neen\ntwee');
    });
    it('kapt af bij overschrijding en zegt dat er is afgekapt', () => {
        const big: PdfPageLines[] = [
            { page: 1, lines: ['x'.repeat(300)] },
            { page: 2, lines: ['y'.repeat(300)] },
        ];
        const out = formatPageLinesForPrompt(big, 320);
        expect(out).toContain('x'.repeat(300));
        expect(out).not.toContain('y'.repeat(300));
        expect(out).toContain('afgekapt');
    });
    it('zonder afkapping geen afkap-melding', () => {
        expect(formatPageLinesForPrompt(pages)).not.toContain('afgekapt');
    });
});
