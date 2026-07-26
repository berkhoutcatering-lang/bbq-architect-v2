import { describe, it, expect } from 'vitest';
import { buildChunkUserPrompt, withTextLayer, parseAndValidate, SYSTEM_PROMPT } from './pricelistPdfPrompt';

describe('buildChunkUserPrompt', () => {
    it('noemt de pagina-range en het bloknummer', () => {
        const p = buildChunkUserPrompt(11, 20, 1, 2);
        expect(p).toContain('pagina 11 t/m 20');
        expect(p).toContain('blok 2 van 2');
    });
});

describe('withTextLayer', () => {
    const text = '--- pagina 10 ---\n700870 BRASVAR COPPA. 21,950 KG';

    it('zet de opdracht bovenaan en de tekstlaag eronder', () => {
        const out = withTextLayer('Extract alles.', text, 793);
        expect(out.startsWith('Extract alles.')).toBe(true);
        expect(out).toContain('700870 BRASVAR COPPA. 21,950 KG');
    });
    it('geeft het verwachte aantal prijsregels mee als richtgetal', () => {
        expect(withTextLayer('x', text, 793)).toContain('793');
    });
    it('benoemt de tekstlaag expliciet als bron', () => {
        expect(withTextLayer('x', text, 1).toLowerCase()).toContain('tekstlaag');
    });
});

describe('SYSTEM_PROMPT', () => {
    it('instrueert om élke prijsregel uit de tekstlaag mee te nemen', () => {
        expect(SYSTEM_PROMPT).toContain('TEKSTLAAG');
        expect(SYSTEM_PROMPT.toLowerCase()).toContain('sla niets over');
    });
    it('houdt de bestaande verboden overeind (BTW + allergenen)', () => {
        expect(SYSTEM_PROMPT).toContain('NOOIT btw_pct');
        expect(SYSTEM_PROMPT).toContain('NOOIT allergens');
    });
});

describe('parseAndValidate', () => {
    const one = '[{"parsed_naam":"Brasvar Coppa","parsed_eenheid":"KG","parsed_prijs":21.95,"confidence":1}]';

    it('leest een kale JSON-array', () => {
        const r = parseAndValidate(one);
        expect(r).toHaveLength(1);
        expect(r[0].parsed_naam).toBe('Brasvar Coppa');
        expect(r[0].parsed_prijs).toBe(21.95);
    });
    it('strippt markdown-fences die het model soms toevoegt', () => {
        expect(parseAndValidate('```json\n' + one + '\n```')).toHaveLength(1);
    });
    it('strippt ook uitleg vóór en ná de array', () => {
        expect(parseAndValidate('Hier is het resultaat:\n' + one + '\nDat waren ze.')).toHaveLength(1);
    });
    it('houdt geneste arrays heel', () => {
        const nested = '[{"parsed_naam":"X","parsed_prijs":1,"confidence":1}]';
        expect(parseAndValidate('```\n' + nested + '\n```')).toHaveLength(1);
    });
    it('faalt luid bij onleesbare output', () => {
        expect(() => parseAndValidate('geen json')).toThrow(/PARSE_FAIL/);
    });
    it('weigert een regel zonder prijs', () => {
        expect(() => parseAndValidate('[{"parsed_naam":"X","confidence":1}]')).toThrow(/SCHEMA_FAIL/);
    });
});
