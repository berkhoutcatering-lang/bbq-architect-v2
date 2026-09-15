import { describe, it, expect } from 'vitest';
import { isVervanging, korteProductnaam, vervangInTekst } from './ingredientVervangen';

describe('isVervanging — koppeling of ander product', () => {
    it('spiering voor procureur is een vervanging', () => {
        expect(isVervanging('procureur (varkensnek, am been)', 'Varkens spiering BL1')).toBe(true);
    });
    it('Mosterd fijn voor Dijon mosterd is een koppeling (zelfde product, andere pot)', () => {
        expect(isVervanging('Dijon mosterd', 'Mosterd fijn, fles 750 ml')).toBe(false);
    });
    it('slager-procureur voor procureur is een koppeling', () => {
        expect(isVervanging('procureur', 'Procureur slager (Echt Held)')).toBe(false);
    });
});

describe('korteProductnaam', () => {
    it('knipt de verpakking na de komma af', () => {
        expect(korteProductnaam('Varkens spiering BL1, stuk circa 2 kg')).toBe('Varkens spiering BL1');
    });
    it('laat een decimale komma heel', () => {
        expect(korteProductnaam('Rum Carta Negra 37,5%, fles 1 ltr')).toBe('Rum Carta Negra 37,5%');
    });
});

describe('vervangInTekst — de bereiding gaat mee', () => {
    it('vervangt de naam en het hoofdwoord, op woordgrens, ongeacht hoofdletters', () => {
        const uit = vervangInTekst('Wrijf de Procureur in met de rub. Leg de procureur (varkensnek, am been) op de smoker.', 'procureur (varkensnek, am been)', 'spiering');
        expect(uit).toBe('Wrijf de spiering in met de rub. Leg de spiering op de smoker.');
    });
    it('raakt andere woorden niet: "procureurs" en "procureurspek" blijven staan', () => {
        expect(vervangInTekst('twee procureurs en procureurspek', 'procureur', 'spiering')).toBe('twee procureurs en procureurspek');
    });
    it('doet niets als er niets te vinden is', () => {
        expect(vervangInTekst('Zout erover.', 'procureur', 'spiering')).toBe('Zout erover.');
    });
});
