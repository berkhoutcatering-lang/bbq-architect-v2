import { describe, it, expect } from 'vitest';
import { voegTakenSamen, onderwerpVan, BRON_LABEL, type Taak } from './taken-samenvoegen';
import { wegzetTakenNaarTaken } from './wegzet-taken';

function taak(p: Partial<Taak> & { id: string; titel: string }): Taak {
  return {
    urgentie: 'vandaag', tijd: '', detail: '', actie: 'Open',
    href: '/', bron: 'shift', ...p,
  };
}

describe('onderwerpVan', () => {
    it('herkent dezelfde zaak in drie bewoordingen', () => {
        /* Precies de drie regels die op het dashboard naast elkaar stonden. */
        const a = onderwerpVan('3 facturen vervallen', '€3.608');
        const b = onderwerpVan('3 facturen > 30 dagen', 'miranda Berkhout € 1.733');
        const c = onderwerpVan('3 facturen herinneren', 'miranda Berkhout (€ 1.733)');
        expect(a).toBe(b);
        expect(b).toBe(c);
    });

    it('houdt verschillende aantallen uit elkaar', () => {
        expect(onderwerpVan('3 facturen vervallen', '')).not.toBe(
            onderwerpVan('2 facturen versturen', ''),
        );
    });

    it('houdt verschillende onderwerpen uit elkaar', () => {
        expect(onderwerpVan('3 facturen vervallen', '')).not.toBe(
            onderwerpVan('3 offertes met lage marge', ''),
        );
    });

    it('valt terug op de titel bij een onbekend onderwerp', () => {
        expect(onderwerpVan('Zonnescherm ophalen', '')).toBe('overig:zonnescherm ophalen');
    });
});

describe('voegTakenSamen', () => {
    it('maakt van drie meldingen over dezelfde facturen één regel', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '3 facturen vervallen', detail: '€3.608', bron: 'dagbriefing', urgentie: 'nu' })],
            aandacht: [taak({ id: 'a1', titel: '3 facturen > 30 dagen', detail: 'miranda Berkhout', bron: 'aandacht' })],
            shift: [taak({ id: 's1', titel: '3 facturen herinneren', detail: 'miranda Berkhout', tijd: '5 min', actie: 'Verstuur', bron: 'shift' })],
        });
        expect(uit).toHaveLength(1);
        /* De shift-versie wint: die heeft een tijdsindicatie en een werkwoord. */
        expect(uit[0].actie).toBe('Verstuur');
        expect(uit[0].tijd).toBe('5 min');
        /* Maar de hoogste urgentie van de drie telt. */
        expect(uit[0].urgentie).toBe('nu');
    });

    it('gooit niets weg wat niet dubbel is', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '3 facturen vervallen' })],
            aandacht: [taak({ id: 'a1', titel: '1 item onder minimum', detail: 'gerookte Bavette' })],
            shift: [taak({ id: 's1', titel: '21 bonnen verwerken' })],
        });
        expect(uit).toHaveLength(3);
    });

    it('sorteert op urgentie, niet op bron', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: 'BTW-aangifte', urgentie: 'later' })],
            aandacht: [taak({ id: 'a1', titel: '1 item onder minimum', urgentie: 'nu' })],
            shift: [taak({ id: 's1', titel: '21 bonnen verwerken', urgentie: 'deze-week' })],
        });
        expect(uit.map((t) => t.urgentie)).toEqual(['nu', 'deze-week', 'later']);
    });

    it('vult ontbrekende velden aan uit de verliezer', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '2 concept-facturen', detail: 'cor en miranda', bron: 'dagbriefing' })],
            aandacht: [],
            shift: [taak({ id: 's1', titel: '2 concept-facturen versturen', detail: '', tijd: '8 min', bron: 'shift' })],
        });
        expect(uit).toHaveLength(1);
        expect(uit[0].tijd).toBe('8 min');
        expect(uit[0].detail).toBe('cor en miranda');
    });

    it('kan met lege stromen om', () => {
        expect(voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [] })).toEqual([]);
        expect(voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [], winkel: [] })).toEqual([]);
    });
});

describe('voegTakenSamen — wegzet-taken uit de winkel (BA-6)', () => {
    /* Order 1 met 1 Naober: zonder vast onderwerp zou "bestelling" in het
       detail hem 'voorraad:1' maken — net als "1 item onder minimum". */
    const wegzet = (orderId: number, aantal: number) => taak({
        id: `wegzet-${orderId}`, bron: 'winkel', urgentie: 'nu',
        titel: `Zet ${aantal} × Naober apart voor HB-2026-${String(orderId).padStart(4, '0')} (Jansen, za)`,
        detail: 'Webshopbestelling · ophalen za 21 nov 14:00', actie: 'Zet apart', href: '/verkoop/webshop#apartzetten',
        onderwerp: `wegzet:${orderId}`,
    });
    const bestelling = taak({ id: 'a1', bron: 'aandacht', titel: '1 bestelling nog niet geleverd', detail: 'Verstuurd, maar nog niet ontvangen', href: '/inkoop#onderweg' });
    const minimum = taak({ id: 'a2', bron: 'aandacht', titel: '4 items onder minimum', detail: 'Naober — tellen of bijwerken' });

    it('zonder vast onderwerp zou de wegzet-taak samenvallen met een bestel-taak', () => {
        const t = wegzet(1, 1);
        expect(onderwerpVan(t.titel, t.detail)).toBe(onderwerpVan(bestelling.titel, bestelling.detail));
    });

    it('een bestelling-taak wordt niet opgeslokt door een wegzet-taak, en andersom', () => {
        /* wegzet-1 zou 'voorraad:1' zijn (zoals a1), wegzet-2 'voorraad:4' (zoals a2). */
        const uit = voegTakenSamen({ dagbriefing: [], aandacht: [bestelling, minimum], shift: [], winkel: [wegzet(1, 1), wegzet(2, 4)] });
        expect(uit.map((t) => t.id).sort()).toEqual(['a1', 'a2', 'wegzet-1', 'wegzet-2']);
        /* Elk houdt zijn eigen tekst en link. */
        expect(uit.find((t) => t.id === 'a1')).toMatchObject({ titel: '1 bestelling nog niet geleverd', href: '/inkoop#onderweg', bron: 'aandacht' });
        expect(uit.find((t) => t.id === 'wegzet-1')).toMatchObject({ href: '/verkoop/webshop#apartzetten', bron: 'winkel', actie: 'Zet apart' });
    });

    it('een bestel-taak die eerder in de lijst staat, slokt de wegzet-taak ook niet op', () => {
        const uit = voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [taak({ id: 's1', titel: '1 bestelling klaarzetten', detail: '' })], winkel: [wegzet(1, 1)] });
        expect(uit).toHaveLength(2);
    });

    it('twee orders met hetzelfde aantal blijven twee taken; dezelfde order één', () => {
        expect(voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [], winkel: [wegzet(1, 4), wegzet(2, 4)] })).toHaveLength(2);
        expect(voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [], winkel: [wegzet(1, 4), wegzet(1, 4)] })).toHaveLength(1);
    });

    it('de winkel heeft een eigen label', () => {
        expect(BRON_LABEL.winkel).toBe('Winkel');
    });
});

describe('wegzetTakenNaarTaken — rijen uit winkel_wegzet_taken', () => {
    const NU = new Date('2026-11-20T12:00:00Z');
    const rij = (orderId: number, afhaalmoment: string | null, naam = 'Jansen') => ({
        id: orderId, order_id: orderId, organization_id: 'org-1', nummer: `HB-2026-${String(orderId).padStart(4, '0')}`, naam,
        afhaalmoment, ophalen_binnen_24u: false,
        regels: [{ regel_id: orderId * 10, artikel: 'Naober', aantal: 4, producten: [{ product_id: 'p-naober', naam: 'Naober', hoeveelheid: 4, eenheid: 'stuk' }] }],
    });

    it('maakt één taak per order, met bron winkel en onderwerp wegzet:{order_id}', () => {
        const [t] = wegzetTakenNaarTaken([rij(1042, '2026-11-21T13:00:00+00:00')], NU);
        expect(t).toEqual({
            id: 'wegzet-1042', urgentie: 'vandaag', tijd: '',
            titel: 'Zet 4 × Naober apart voor HB-2026-1042 (Jansen, za)',
            detail: 'Webshop · ophalen za 21 nov 14:00',
            actie: 'Zet apart', href: '/verkoop/webshop#apartzetten', bron: 'winkel', onderwerp: 'wegzet:1042',
        });
    });

    it('urgentie volgt het afhaalmoment; de vroegste ophaler eerst', () => {
        const uit = wegzetTakenNaarTaken([
            rij(4, '2026-12-05T09:00:00Z'),
            rij(3, '2026-11-25T09:00:00Z'),
            rij(2, '2026-11-22T09:00:00Z'),
            rij(1, '2026-11-21T09:00:00Z'),
            rij(5, '2026-11-19T09:00:00Z'),
        ], NU);
        expect(uit.map((t) => [t.id, t.urgentie])).toEqual([
            ['wegzet-5', 'nu'], ['wegzet-1', 'nu'], ['wegzet-2', 'vandaag'], ['wegzet-3', 'deze-week'], ['wegzet-4', 'later'],
        ]);
    });

    it('slaat onbruikbare rijen over', () => {
        expect(wegzetTakenNaarTaken([null, { nummer: 'x' }, rij(7, null)], NU).map((t) => t.id)).toEqual(['wegzet-7']);
    });
});
