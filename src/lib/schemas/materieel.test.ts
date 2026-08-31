/**
 * Regressietest voor een stille bug: het schema kende `kleur`, `materiaal` en
 * `afmetingen` niet, terwijl de AI-scan ze wél teruggaf. Zod gooit onbekende
 * sleutels standaard weg, dus die velden verdwenen bij elke opslag zonder dat
 * er ergens een fout verscheen.
 *
 * Deze test faalt zodra iemand een scan-veld uit het schema haalt.
 */
import { describe, it, expect } from 'vitest';
import { MaterieelSchema } from './materieel';

describe('MaterieelSchema', () => {
    it('behoudt de velden die de AI-scan teruggeeft', () => {
        const uit = MaterieelSchema.parse({
            naam: 'IKEA OFTAST eetbord wit 25cm',
            type: 'Servies',
            kleur: 'wit matt',
            materiaal: 'porselein',
            afmetingen: '25cm rond',
            geschikt_voor_gangen: ['voorgerecht', 'dessert'],
            ai_styling_hint: 'Past bij strakke, lichte borden.',
            scan_source: 'claude-vision/claude-haiku-4-5',
            scan_data: { iets: 'ruws' },
        });

        expect(uit.kleur).toBe('wit matt');
        expect(uit.materiaal).toBe('porselein');
        expect(uit.afmetingen).toBe('25cm rond');
        expect(uit.geschikt_voor_gangen).toEqual(['voorgerecht', 'dessert']);
        expect(uit.ai_styling_hint).toContain('strakke');
        expect(uit.scan_source).toContain('haiku');
    });

    it('behoudt de apparatuur-velden uit de link-lezer', () => {
        const uit = MaterieelSchema.parse({
            naam: 'Robot Coupe CL50 Gourmet',
            type: 'Overig',
            soort: 'apparatuur',
            merk: 'Robot Coupe',
            model: 'CL50 Gourmet',
            product_url: 'https://www.robot-coupe.com/nl-be/cl-50-gourmet',
            breedte_mm: 350,
            diepte_mm: 590,
            hoogte_mm: 580,
            capaciteit_waarde: 250,
            capaciteit_eenheid: 'kg_per_uur',
            hulpstukken_aanwezig: ['schijf 2mm', 'raspschijf'],
            min_porties_rendabel: 20,
        });

        expect(uit.merk).toBe('Robot Coupe');
        expect(uit.breedte_mm).toBe(350);
        expect(uit.capaciteit_eenheid).toBe('kg_per_uur');
        expect(uit.hulpstukken_aanwezig).toHaveLength(2);
        expect(uit.min_porties_rendabel).toBe(20);
    });

    it('laat een ontbrekende maat leeg in plaats van nul', () => {
        // Een verzonnen of weggeronde maat laat later een bak niet in de
        // koeling passen. Leeg moet leeg blijven.
        const uit = MaterieelSchema.parse({ naam: 'Onbekende plank', breedte_mm: null });
        expect(uit.breedte_mm).toBeNull();
        expect(uit.diepte_mm).toBeUndefined();
    });

    it('weigert een product_url die geen webadres is', () => {
        const uit = MaterieelSchema.safeParse({ naam: 'Plank', product_url: 'zomaar tekst' });
        expect(uit.success).toBe(false);
    });

    it('houdt naam verplicht', () => {
        expect(MaterieelSchema.safeParse({ naam: '' }).success).toBe(false);
    });
});
