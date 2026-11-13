import { describe, expect, it } from 'vitest';
import { exclUitIncl, filterArtikelen, inkoopVanRegel, periodeMarge, verkoopPerArtikel, type ArtikelCijfers, type VerkoopRegel } from './verkoop';

const regel = (r: Partial<VerkoopRegel>): VerkoopRegel => ({
    regel_id: 1, bedrijfsdag: '2026-11-28', op: '2026-11-28T12:00:00Z', artikel_id: 'a-worst', naam: 'Droge worst naturel',
    open_prijs_groep: null, aantal: 1, bedrag_cents: 600, btw: [{ pct: 9, incl_cents: 600 }],
    onderdelen: [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }], goederen_terug: null,
    inkoop_cents: 310, inkoop_bron: 'logboek', ...r,
});
const afdeling = new Map([['p-worst', 'Worst'], ['p-bier', 'Bier']]);

describe('exclUitIncl', () => {
    it('haalt de btw eruit en rondt één keer af', () => {
        expect(exclUitIncl(109000, 9)).toBe(100000);
        expect(exclUitIncl(395, 21)).toBe(326);
        expect(exclUitIncl(-1090, 9)).toBe(-1000);
        expect(exclUitIncl(500, 0)).toBe(500);
    });
});

describe('inkoopVanRegel', () => {
    const prijzen = new Map([
        ['p-worst', { inkoop_excl_cents: 310, prijs_per: 1 }],
        ['p-noot', { inkoop_excl_cents: 1400, prijs_per: 100 }],
        ['p-bier', { inkoop_excl_cents: 145, prijs_per: 1 }],
    ]);
    const worst = [{ product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }];
    const r = { regel_id: 7, aantal: 2, goederen_terug: null, onderdelen: worst };
    const mut = (regelId: number, product: string, type: string, waarde: number | null) =>
        ({ toonbank_bon_regel_id: regelId, winkel_product_id: product, type, waarde_cents: waarde });

    it('neemt de waarde uit het voorraadlogboek', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', -620)], prijzen)).toEqual({ inkoop_cents: 620, inkoop_bron: 'logboek' });
    });
    it('een tekortcorrectie en de mutaties van een andere regel tellen niet mee', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', -620), mut(7, 'p-worst', 'tekort_correctie', 310), mut(8, 'p-worst', 'verkoop_kassa', -310)], prijzen).inkoop_cents).toBe(620);
    });
    it('een tegenbon met goederen terug haalt de inkoopwaarde eraf', () => {
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: true, onderdelen: worst }, [mut(8, 'p-worst', 'retour', 310)], prijzen)).toEqual({ inkoop_cents: -310, inkoop_bron: 'logboek' });
    });
    it('een tegenbon zonder goederen terug laat de inkoop staan', () => {
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: false, onderdelen: worst }, [], prijzen)).toEqual({ inkoop_cents: 0, inkoop_bron: 'logboek' });
        expect(inkoopVanRegel({ regel_id: 8, aantal: -1, goederen_terug: null, onderdelen: worst }, [], prijzen).inkoop_cents).toBe(0);
    });
    it('een mutatie zonder waarde maakt de regel onbekend', () => {
        expect(inkoopVanRegel(r, [mut(7, 'p-worst', 'verkoop_kassa', null)], prijzen)).toEqual({ inkoop_cents: null, inkoop_bron: null });
    });
    it('zonder mutatie: de inkoopprijs van nu, per onderdeel', () => {
        expect(inkoopVanRegel(r, [], prijzen)).toEqual({ inkoop_cents: 620, inkoop_bron: 'prijs_nu' });
        expect(inkoopVanRegel({ regel_id: 9, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-noot', hoeveelheid: 150, eenheid: 'gram' }] }, [], prijzen)).toEqual({ inkoop_cents: 2100, inkoop_bron: 'prijs_nu' });
    });
    it('een pakket met één geteld en één ongeteld product mengt logboek en de prijs van nu', () => {
        const pakket = { regel_id: 10, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-bier', hoeveelheid: 4, eenheid: 'stuk' }, ...worst] };
        expect(inkoopVanRegel(pakket, [mut(10, 'p-bier', 'verkoop_kassa', -580)], prijzen)).toEqual({ inkoop_cents: 890, inkoop_bron: 'prijs_nu' });
    });
    it('een open prijs of een product zonder inkoopprijs: onbekend, nooit nul', () => {
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: [] }, [], prijzen)).toEqual({ inkoop_cents: null, inkoop_bron: null });
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: null }, [], prijzen).inkoop_cents).toBeNull();
        expect(inkoopVanRegel({ regel_id: 11, aantal: 1, goederen_terug: null, onderdelen: [{ product_id: 'p-onbekend', hoeveelheid: 1, eenheid: 'stuk' }] }, [], prijzen).inkoop_cents).toBeNull();
    });
});

describe('verkoopPerArtikel', () => {
    it('telt per artikel en rekent de marge', () => {
        const [a] = verkoopPerArtikel([regel({}), regel({ regel_id: 2, aantal: 2, bedrag_cents: 1200, btw: [{ pct: 9, incl_cents: 1200 }], inkoop_cents: 620 })], afdeling);
        expect(a).toEqual({ sleutel: 'a-worst', naam: 'Droge worst naturel', afdeling: 'Worst', aantal: 3, omzet_excl_cents: 1651, inkoop_cents: 930, marge_cents: 721, marge_pct: 43.7, geschat: false });
    });
    it('een tegenbon trekt af', () => {
        const [a] = verkoopPerArtikel([regel({ aantal: 2, bedrag_cents: 1200, btw: [{ pct: 9, incl_cents: 1200 }], inkoop_cents: 620 }),
            regel({ regel_id: 3, aantal: -1, bedrag_cents: -600, btw: [{ pct: 9, incl_cents: -600 }], inkoop_cents: -310 })], afdeling);
        expect(a).toMatchObject({ aantal: 1, omzet_excl_cents: 550, inkoop_cents: 310 });
    });
    it('één regel zonder inkoopwaarde maakt de marge van het artikel onbekend', () => {
        const [a] = verkoopPerArtikel([regel({}), regel({ regel_id: 2, inkoop_cents: null, inkoop_bron: null })], afdeling);
        expect(a).toMatchObject({ inkoop_cents: null, marge_cents: null, marge_pct: null });
    });
    it('een geschatte regel maakt het artikel geschat', () => {
        expect(verkoopPerArtikel([regel({ inkoop_bron: 'prijs_nu' })], afdeling)[0].geschat).toBe(true);
    });
    it('pakket, open prijs en product zonder plek krijgen een eigen afdeling', () => {
        const uit = verkoopPerArtikel([
            regel({ artikel_id: 'a-pakket', naam: 'Bierpakket', onderdelen: [{ product_id: 'p-bier', hoeveelheid: 4, eenheid: 'stuk' }, { product_id: 'p-worst', hoeveelheid: 1, eenheid: 'stuk' }] }),
            regel({ regel_id: 2, artikel_id: null, naam: 'Los', open_prijs_groep: 'vlees', onderdelen: [], inkoop_cents: null, inkoop_bron: null }),
            regel({ regel_id: 3, artikel_id: 'a-los', naam: 'Chutney', onderdelen: [{ product_id: 'p-chutney', hoeveelheid: 1, eenheid: 'stuk' }] }),
        ], afdeling);
        expect(Object.fromEntries(uit.map((a) => [a.sleutel, a.afdeling]))).toEqual({ 'a-pakket': 'Pakketten', 'open:vlees': 'Open prijs', 'a-los': 'Zonder afdeling' });
    });
    it('sorteert op omzet, grootste eerst', () => {
        const uit = verkoopPerArtikel([regel({}), regel({ regel_id: 2, artikel_id: 'a-bier', naam: 'Blond', bedrag_cents: 2000, btw: [{ pct: 21, incl_cents: 2000 }] })], afdeling);
        expect(uit.map((a) => a.sleutel)).toEqual(['a-bier', 'a-worst']);
    });
});

describe('periodeMarge', () => {
    it('rekent alleen met artikelen die een marge hebben en zegt hoeveel omzet dat dekt', () => {
        const m = periodeMarge([
            { sleutel: 'a', naam: 'A', afdeling: 'x', aantal: 1, omzet_excl_cents: 9000, inkoop_cents: 5220, marge_cents: 3780, marge_pct: 42, geschat: false },
            { sleutel: 'b', naam: 'B', afdeling: 'x', aantal: 1, omzet_excl_cents: 1000, inkoop_cents: null, marge_cents: null, marge_pct: null, geschat: false },
        ]);
        expect(m).toEqual({ omzet_cents: 10000, inkoop_cents: 5220, marge_cents: 3780, marge_pct: 42, dekking_pct: 90, zonder_inkoopprijs: 1, geschat: 0 });
    });
    it('zonder omzet: geen percentage', () => {
        expect(periodeMarge([])).toMatchObject({ omzet_cents: 0, marge_pct: null, dekking_pct: null });
    });
});

describe('filterArtikelen', () => {
    const a = (naam: string, afdeling: string): ArtikelCijfers => ({ sleutel: naam, naam, afdeling, aantal: 1, omzet_excl_cents: 100, inkoop_cents: null, marge_cents: null, marge_pct: null, geschat: false });
    const lijst = [a('Droge worst naturel', 'Worst'), a('Fuet met truffel', 'Worst'), a('Naober Blond', 'Bier')];
    it('filtert op afdeling en op een stuk van de naam, zonder op hoofdletters te letten', () => {
        expect(filterArtikelen(lijst, undefined, 'Worst').map((x) => x.naam)).toEqual(['Droge worst naturel', 'Fuet met truffel']);
        expect(filterArtikelen(lijst, 'WORST', undefined).map((x) => x.naam)).toEqual(['Droge worst naturel']);
        expect(filterArtikelen(lijst, ' blond ', 'Bier')).toHaveLength(1);
        expect(filterArtikelen(lijst, 'blond', 'Worst')).toEqual([]);
    });
    it('zonder zoekwoord en zonder afdeling, of met "Alles": de hele lijst', () => {
        expect(filterArtikelen(lijst, undefined, undefined)).toHaveLength(3);
        expect(filterArtikelen(lijst, '', 'Alles')).toHaveLength(3);
    });
});
