import { describe, expect, it } from 'vitest';
import { afhaaldagVoluit, euroKerst, kerstMailInhoud, veldenUitOrder, type KerstMailVelden } from './kerstMail';

const v: KerstMailVelden = { voornaam: 'Anne', nummer: 'HB-2026-0042', personen: 6, vegetarisch: 2, bier: 0, wijn: 0, afhaaldag: '2026-12-24', totaalCenten: 14100 };

describe('kerstMail', () => {
    it('afhaaldag voluit zonder jaartal, totaal met euroteken en komma', () => {
        expect(afhaaldagVoluit('2026-12-24')).toBe('donderdag 24 december');
        expect(afhaaldagVoluit('2026-12-26')).toBe('zaterdag 26 december');
        expect(euroKerst(14100)).toBe('€ 141,00');
        expect(euroKerst(123450)).toBe('€ 1.234,50');
    });

    it('de bevestiging: onderwerp, velden ingevuld, geen losse accolades', () => {
        const m = kerstMailInhoud('ontvangen', v);
        expect(m.subject).toBe('Je Kerst-Box-bestelling staat vast');
        expect(m.html).toContain('Je bestelling is binnen, Anne.');
        expect(m.html).toContain('Kerst-Box voor 6 personen');
        expect(m.html).toContain('donderdag 24 december, tussen 10:00 en 18:00');
        expect(m.html).toContain('€ 141,00');
        expect(m.html).toContain('HB-2026-0042');
        expect(m.html).toContain('>Waarvan vegetarisch<');
        expect(m.html).not.toMatch(/\{\{|\}\}/);
        expect(m.text).toContain('Kerst-Box voor 6 personen');
        expect(m.text).toContain('Waarvan vegetarisch  2');
        expect(m.text).toContain('€ 141,00');
    });

    it('zonder vegetarisch geen vega-rij', () => {
        const m = kerstMailInhoud('ontvangen', { ...v, vegetarisch: 0 });
        expect(m.html).not.toContain('>Waarvan vegetarisch<');
        expect(m.text).not.toContain('Waarvan vegetarisch');
    });

    it('proeverijen krijgen een eigen rij, ook zonder vega', () => {
        const m = kerstMailInhoud('ontvangen', { ...v, vegetarisch: 0, bier: 4, wijn: 2 });
        expect(m.html).toContain('>Bierproeverij<');
        expect(m.html).toContain('4 × (voor 4 personen)');
        expect(m.html).toContain('>Wijnproeverij<');
        expect(m.html).toContain('2 × (voor 4 personen)');
        expect(m.html.indexOf('Bierproeverij')).toBeGreaterThan(m.html.indexOf('>Wat<'));
        expect(m.html.indexOf('Bierproeverij')).toBeLessThan(m.html.indexOf('>Afhalen<'));
    });

    it('de herinnering en de navraag', () => {
        const h = kerstMailInhoud('herinnering', v);
        expect(h.subject).toBe('Morgen staat je Kerst-Box klaar');
        expect(h.html).toContain('Morgen staat hij klaar, Anne.');
        const n = kerstMailInhoud('navraag', v);
        expect(n.html).toContain('Hoeveel worden jullie, Anne?');
        expect(n.html).toContain('dan maken we hem voor 6 personen');
        expect(n.html).not.toMatch(/\{\{|\}\}/);
    });

    it('tekens uit de naam worden ontsnapt', () => {
        expect(kerstMailInhoud('ontvangen', { ...v, voornaam: '<b>x' }).html).toContain('&lt;b&gt;x');
    });

    it('velden uit de order: de regels zijn de waarheid', () => {
        const regels = [
            { slug: 'kerst-box', aantal: 4, klaar_op: '2026-12-23' },
            { slug: 'kerst-box-vegetarisch', aantal: 2, klaar_op: '2026-12-23' },
            { slug: 'kerst-bierproeverij', aantal: 3, klaar_op: '2026-12-23' },
        ];
        expect(veldenUitOrder({ contact_naam: 'Anne de Vries', nummer: 'HB-1', totaal_cents: 100, opmerking: null }, regels)).toEqual({
            voornaam: 'Anne', nummer: 'HB-1', personen: 6, vegetarisch: 2, bier: 3, wijn: 0, afhaaldag: '2026-12-23', totaalCenten: 100,
        });
        /* Geen vega-artikel: uit de opmerking. */
        expect(veldenUitOrder({ contact_naam: 'Bo', nummer: 'HB-2', totaal_cents: 100, opmerking: 'Waarvan vegetarisch: 1\nhoi' }, [{ slug: 'kerst-box', aantal: 3, klaar_op: '2026-12-24' }]).vegetarisch).toBe(1);
    });
});
