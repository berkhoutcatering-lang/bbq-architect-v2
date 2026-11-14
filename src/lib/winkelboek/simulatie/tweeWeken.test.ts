/**
 * Twee nagemaakte winkelweken door de hele keten: de echte laders tegen een
 * database in het geheugen, de echte rekenregels, en de uitkomst naast wat de
 * simulatie zelf heeft bijgehouden.
 *
 * Een test die met `it.fails` begint legt een BEVINDING vast: zo zou het
 * moeten zijn, en zo is het nu nog niet. De suite blijft groen; wordt de
 * bevinding opgelost, dan slaat die test om en moet `it.fails` weer `it`
 * worden.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { laadToonbank } from '@/lib/btwAangifteBronnen';
import { verzamelPunten } from '../aandacht';
import { maakDagboeking, type DagStand } from '../dagboeking';
import { DAG_GEBOEKT_TYPE, meldDagGeboekt } from '../dagMelding';
import { maakLeveringen } from '../inkoop';
import { maakKasboek } from '../kasboek';
import {
    laadAfdelingVanProduct, laadDagBonnen, laadDagstaten, laadDerving, laadInkoopBonnen, laadKasBegin, laadKasMutaties, laadLoperInvoer,
    laadOntvangsten, laadUitsluitingen, laadVerkoopRegels, laadVoorraadwaarde, zonderProefdagen,
} from '../laden';
import { deelLopersIn } from '../lopers';
import { maandSlot } from '../maandslot';
import { periodeVan } from '../periode';
import { periodeMarge, verkoopPerArtikel } from '../verkoop';
import { kassaCijfers } from '../weergave';
import { geheugenDb } from './geheugenDb';
import { maakTweeWeken, SIM_DAGEN, SIM_NU, SIM_ORG, SIM_PRODUCTEN, SIM_PROEFDAG, type ArtikelWaarheid } from './tweeWeken';

const sim = maakTweeWeken();
const db = geheugenDb(sim.tabellen);
const sb = db.sb;
const w = sim.waarheid;

const dienst: { sb: SupabaseClient | null } = { sb: null };
vi.mock('@/lib/supabase-server', () => ({ createServiceSupabase: () => dienst.sb }));

const btwUitIncl = (incl: number, pct: number) => Math.sign(incl) * Math.round((Math.abs(incl) * pct) / (100 + pct));
const som = (getallen: number[]) => getallen.reduce((s, n) => s + n, 0);
const dagenIn = (start: string, eind: string) => SIM_DAGEN.filter((d) => d >= start && d <= eind);

const PERIODES = ['2026-W48', '2026-W49', '2026-11', '2026-12'];

/** Zoals src/app/winkelboek/page.tsx laadt en OverzichtScherm rekent. */
async function overzicht(sleutel: string) {
    const periode = periodeVan(sleutel, '2026-12-05');
    const { start, eind } = periode;
    const proef = await laadUitsluitingen(sb, SIM_ORG, start, eind);
    const [bonnen, staten, kas, kasBegin, toonbank, verkoop, afdelingen, derving] = await Promise.all([
        laadDagBonnen(sb, SIM_ORG, start, eind), laadDagstaten(sb, SIM_ORG, start, eind), laadKasMutaties(sb, SIM_ORG, start, eind),
        laadKasBegin(sb, SIM_ORG, start), laadToonbank(sb, SIM_ORG, start, eind), laadVerkoopRegels(sb, SIM_ORG, start, eind, proef.dagen),
        laadAfdelingVanProduct(sb, SIM_ORG), laadDerving(sb, SIM_ORG, start, eind),
    ]);
    const fout = bonnen.fout ?? staten.fout ?? toonbank.fout ?? verkoop.fout ?? proef.fout ?? kas.fout ?? kasBegin.fout ?? afdelingen.fout ?? derving.fout;
    const dagBonnen = zonderProefdagen(bonnen.bonnen, proef.dagen);
    const dagstaten = zonderProefdagen(staten.dagstaten, proef.dagen);
    const eigenTijdens = (dag: string) => som(kas.mutaties.filter((m) => m.datum === dag && m.moment === 'tijdens').map((m) => m.bedrag_cents));
    const dagen = [...new Set([...dagBonnen.filter((b) => b.status === 'afgerond').map((b) => b.bedrijfsdag), ...dagstaten.map((s) => s.bedrijfsdag)])].sort();
    const boekingen = dagen.map((d) => maakDagboeking(d, dagBonnen.filter((b) => b.bedrijfsdag === d), dagstaten.filter((s) => s.bedrijfsdag === d), eigenTijdens(d)));
    const kasboek = maakKasboek(dagstaten, kas.mutaties, undefined, kasBegin.begin);
    const artikelen = verkoopPerArtikel(verkoop.regels, afdelingen.afdelingen);
    const marge = periodeMarge(artikelen);
    return {
        periode, fout, boekingen, kasboek, artikelen, marge, derving,
        punten: verzamelPunten(boekingen, kasboek, marge.zonder_inkoopprijs),
        kassa: kassaCijfers(toonbank.regels, toonbank.dagen),
        dagen: dagenIn(start, eind),
    };
}

describe('de simulatie zelf', () => {
    it('is groot genoeg om het bladeren per duizend rijen te raken', () => {
        expect(sim.tabellen.toonbank_bonnen.length).toBeGreaterThan(500);
        expect(sim.tabellen.toonbank_bon_regels.filter((r) => r.soort === 'verkoop').length).toBeGreaterThan(1000);
        expect(sim.tabellen.winkel_voorraad_mutaties.length).toBeGreaterThan(1000);
    });
    it('heeft tien kassadagen', () => {
        expect([...w.dagen.keys()].sort()).toEqual(SIM_DAGEN);
    });
});

describe('elke dag in hokjes', () => {
    const verwacht: Record<string, DagStand> = {
        '2026-11-24': 'geboekt', '2026-11-25': 'te_controleren', '2026-11-26': 'te_controleren', '2026-11-27': 'geboekt', '2026-11-28': 'geboekt',
        '2026-12-01': 'geboekt', '2026-12-02': 'geboekt', '2026-12-03': 'geboekt', '2026-12-04': 'te_controleren', '2026-12-05': 'te_controleren',
    };
    /** Zoals src/app/winkelboek/dag/[datum]/page.tsx. */
    async function dag(datum: string) {
        const [proef, bonnen, staten, kas] = await Promise.all([
            laadUitsluitingen(sb, SIM_ORG, datum, datum), laadDagBonnen(sb, SIM_ORG, datum, datum), laadDagstaten(sb, SIM_ORG, datum, datum), laadKasMutaties(sb, SIM_ORG, datum, datum),
        ]);
        const eigen = som(kas.mutaties.filter((m) => m.moment === 'tijdens').map((m) => m.bedrag_cents));
        return { proefdag: proef.dagen.has(datum), fout: bonnen.fout ?? staten.fout ?? proef.fout ?? kas.fout, boeking: maakDagboeking(datum, bonnen.bonnen, staten.dagstaten, eigen) };
    }

    for (const datum of SIM_DAGEN) {
        it(`${datum}: wat binnenkwam en waar het geboekt is, op de cent`, async () => {
            const { boeking, fout, proefdag } = await dag(datum);
            const t = w.dagen.get(datum)!;
            expect(fout).toBeNull();
            expect(proefdag).toBe(false);
            expect(boeking.binnen).toEqual({ pin: t.pin, contant: t.contant, cadeaubon: t.cadeaubon, totaal: t.pin + t.contant + t.cadeaubon });
            const hokjes = Object.fromEntries(boeking.hokjes.map((h) => [h.sleutel, h.cents]));
            for (const pct of Object.keys(t.incl).map(Number)) {
                expect(hokjes[`omzet_${pct}`], `omzet ${pct}%`).toBe(t.incl[pct] - t.btw[pct]);
                expect(hokjes[`btw_${pct}`], `btw ${pct}%`).toBe(t.btw[pct]);
            }
            expect(hokjes.statiegeld ?? 0).toBe(t.statiegeld);
            expect(hokjes.webshop_afgehaald ?? 0).toBe(t.order_rest);
            expect(hokjes.afronding ?? 0).toBe(t.afronding);
            expect(boeking.sluit).toBe(true);
            expect(boeking.aantal_bonnen).toBe(t.bonnen);
            expect(boeking.stand, boeking.punten.join(' | ')).toBe(verwacht[datum]);
        });
    }

    it('de punten zeggen wat er aan de hand is', async () => {
        expect((await dag('2026-11-25')).boeking.punten).toEqual([expect.stringMatching(/Kasverschil: .*2,00 te weinig in de la, nog niet goedgekeurd/)]);
        expect((await dag('2026-11-26')).boeking.punten).toEqual([expect.stringMatching(/9,00 te weinig in de la, verklaard door je eigen kasregel/)]);
        expect((await dag('2026-12-04')).boeking.punten).toEqual([expect.stringContaining('voorlopig'), expect.stringContaining('in geen dagafsluiting')]);
        expect((await dag('2026-12-05')).boeking.punten).toEqual([expect.stringMatching(/myPOS toont .*3,50 minder dan de kassa/)]);
    });

    it('de proefdag heet proefdag', async () => {
        expect((await dag(SIM_PROEFDAG)).proefdag).toBe(true);
    });
});

describe('het overzicht per periode', () => {
    for (const sleutel of PERIODES) {
        it(`${sleutel}: omzet, btw en bonnen zijn gelijk aan wat de kassa aansloeg`, async () => {
            const o = await overzicht(sleutel);
            const dagen = o.dagen.map((d) => w.dagen.get(d)!);
            expect(o.fout).toBeNull();
            expect(o.boekingen.map((b) => b.datum)).toEqual(o.dagen);
            expect(o.kassa.omzet_cents).toBe(som(dagen.flatMap((d) => Object.keys(d.incl).map((pct) => d.incl[Number(pct)] - d.btw[Number(pct)]))));
            expect(o.kassa.btw_cents).toBe(som(dagen.flatMap((d) => Object.values(d.btw))));
            expect(o.kassa.bonnen).toBe(som(dagen.map((d) => d.bonnen)));
            expect(o.kassa.dagen.map((d) => d.datum)).toEqual(o.dagen);
        });
    }

    it('week 47 met alleen de proefdag is leeg', async () => {
        const o = await overzicht('2026-W47');
        expect(o.boekingen).toEqual([]);
        expect(o.kassa).toMatchObject({ omzet_cents: 0, bonnen: 0, dagen: [] });
        expect(o.kasboek.regels).toEqual([]);
    });

    it('om naar te kijken: precies wat er open staat', async () => {
        const w48 = (await overzicht('2026-W48')).punten.map((p) => p.tekst);
        expect(w48).toEqual([
            expect.stringMatching(/^do 26 nov: Kasverschil: .*9,00 te weinig in de la, verklaard/),
            expect.stringMatching(/^Kasverschil op wo 25 nov: .*2,00 te weinig in de la/),
            expect.stringContaining('zonder inkoopprijs'),
        ]);
        const w49 = (await overzicht('2026-W49')).punten.map((p) => p.tekst);
        expect(w49).toEqual([
            expect.stringMatching(/^vr 4 dec: .*voorlopig/),
            expect.stringMatching(/^vr 4 dec: .*in geen dagafsluiting/),
            expect.stringMatching(/^za 5 dec: Pinverschil: myPOS toont .*3,50 minder/),
            expect.stringMatching(/di 1 dec ging er .*10,00 uit de la zonder regel/),
            expect.stringContaining('zonder inkoopprijs'),
        ]);
    });
});

describe('het kasboek', () => {
    const laNa = (dag: string) => w.dagen.get(dag)!.la_na;
    const inDeLa: Record<string, number> = {
        '2026-W48': laNa('2026-11-28'),
        '2026-11': laNa('2026-11-28') + 5000,
        '2026-W49': laNa('2026-12-05'),
        '2026-12': laNa('2026-12-05'),
    };
    /** Zoals src/app/winkelboek/kasboek/page.tsx. */
    async function kasboek(sleutel: string) {
        const periode = periodeVan(sleutel, '2026-12-05');
        const [proef, staten, kas, begin] = await Promise.all([
            laadUitsluitingen(sb, SIM_ORG, periode.start, periode.eind), laadDagstaten(sb, SIM_ORG, periode.start, periode.eind),
            laadKasMutaties(sb, SIM_ORG, periode.start, periode.eind), laadKasBegin(sb, SIM_ORG, periode.start),
        ]);
        return { fout: staten.fout ?? proef.fout ?? kas.fout ?? begin.fout, begin: begin.begin, boek: maakKasboek(staten.dagstaten, kas.mutaties, proef.dagen, begin.begin) };
    }

    for (const sleutel of PERIODES) {
        it(`${sleutel}: eindigt op wat er echt in de la ligt, en het Overzicht zegt hetzelfde`, async () => {
            const k = await kasboek(sleutel);
            expect(k.fout).toBeNull();
            expect(k.boek.in_de_la_cents).toBe(inDeLa[sleutel]);
            expect((await overzicht(sleutel)).kasboek.in_de_la_cents).toBe(inDeLa[sleutel]);
        });
    }

    it('elke dag eindigt in het boek op wat er na het afromen in de la lag', async () => {
        for (const sleutel of ['2026-11', '2026-12']) {
            const { boek } = await kasboek(sleutel);
            for (const dag of dagenIn(`${sleutel}-01`, `${sleutel}-31`)) {
                const laatste = boek.regels.filter((r) => r.datum === dag).at(-1);
                expect(laatste?.saldo_cents, dag).toBe(laNa(dag));
            }
        }
    });

    it('november: begint bij de eerste telling, niet bij de proefdag, en kent één open kasverschil', async () => {
        const { boek, begin } = await kasboek('2026-11');
        expect(begin).toBeNull();
        expect(boek.regels[0]).toMatchObject({ soort: 'beginstand', datum: '2026-11-24', saldo_cents: 15000 });
        expect(boek.regels.filter((r) => r.soort === 'kasverschil').map((r) => [r.datum, r.bedrag_cents, r.goedgekeurd])).toEqual([['2026-11-25', -200, false]]);
        expect(boek.regels.filter((r) => r.soort === 'tussen_dagen')).toEqual([]);
        expect(boek.regels.filter((r) => r.soort === 'eigen').map((r) => [r.datum, r.bedrag_cents])).toEqual([['2026-11-26', -900], ['2026-11-30', 5000]]);
        expect(boek.punten).toEqual([expect.stringMatching(/^Kasverschil op wo 25 nov/)]);
    });

    it('december: begint waar november eindigde, meldt de € 10,00 die verdween en het goedgekeurde verschil', async () => {
        const { boek, begin } = await kasboek('2026-12');
        expect(begin).toEqual({ datum: '2026-12-01', saldo_cents: inDeLa['2026-11'] });
        expect(boek.regels.filter((r) => r.soort === 'tussen_dagen').map((r) => [r.datum, r.bedrag_cents])).toEqual([['2026-12-01', -1000]]);
        expect(boek.regels.filter((r) => r.soort === 'kasverschil').map((r) => [r.datum, r.bedrag_cents, r.goedgekeurd])).toEqual([['2026-12-02', 100, true]]);
        expect(boek.regels.filter((r) => r.soort === 'eigen').map((r) => [r.datum, r.bedrag_cents])).toEqual([['2026-12-03', -2000]]);
        expect(boek.punten).toEqual([expect.stringMatching(/di 1 dec ging er .*10,00 uit de la zonder regel/)]);
    });

    it.fails('BEVINDING 3: aan het begin van een periode zegt het kasboek niet sinds wanneer er geld weg is', async () => {
        /* Nu: "Vóór di 1 dec ging er € 10,00 uit de la". De vorige afsluiting (za 28 nov) is bekend en hoort erbij. */
        const { boek } = await kasboek('2026-12');
        expect(boek.punten[0]).toMatch(/^Tussen za 28 nov en di 1 dec ging er/);
    });

    it('week 49: het wisselgeld van maandag staat erin en verklaart de hogere beginstand', async () => {
        const { boek, begin } = await kasboek('2026-W49');
        expect(begin).toEqual({ datum: '2026-11-30', saldo_cents: laNa('2026-11-28') });
        expect(boek.regels.slice(0, 3).map((r) => [r.soort, r.datum, r.bedrag_cents])).toEqual([
            ['beginstand', '2026-11-30', 0], ['eigen', '2026-11-30', 5000], ['tussen_dagen', '2026-12-01', -1000],
        ]);
    });
});

describe('verkoop per artikel', () => {
    function waarheid(dagen: string[]): Map<string, ArtikelWaarheid> {
        const uit = new Map<string, ArtikelWaarheid>();
        for (const d of dagen) for (const [sleutel, a] of w.artikelen.get(d) ?? []) {
            const x = uit.get(sleutel) ?? { naam: a.naam, aantal: 0, incl: {}, inkoop: 0, geschat: false };
            x.aantal += a.aantal;
            for (const [pct, n] of Object.entries(a.incl)) x.incl[Number(pct)] = (x.incl[Number(pct)] ?? 0) + n;
            x.inkoop = x.inkoop === null || a.inkoop === null ? null : x.inkoop + a.inkoop;
            x.geschat = x.geschat || a.geschat;
            uit.set(sleutel, x);
        }
        return uit;
    }

    for (const sleutel of PERIODES) {
        it(`${sleutel}: aantal, omzet, inkoop en marge per artikel`, async () => {
            const o = await overzicht(sleutel);
            const echt = waarheid(o.dagen);
            expect(o.artikelen.map((a) => a.sleutel).sort()).toEqual([...echt.keys()].sort());
            for (const a of o.artikelen) {
                const t = echt.get(a.sleutel)!;
                const omzet = som(Object.entries(t.incl).map(([pct, incl]) => incl - btwUitIncl(incl, Number(pct))));
                expect(a.aantal, `${a.naam} aantal`).toBe(t.aantal);
                expect(a.omzet_excl_cents, `${a.naam} omzet`).toBe(omzet);
                expect(a.inkoop_cents, `${a.naam} inkoop`).toBe(t.inkoop);
                expect(a.marge_cents, `${a.naam} marge`).toBe(t.inkoop === null ? null : omzet - t.inkoop);
                expect(a.geschat, `${a.naam} geschat`).toBe(t.inkoop !== null && t.geschat);
            }
        });

        it(`${sleutel}: de artikelen samen liggen binnen een paar cent van de officiële omzet`, async () => {
            const o = await overzicht(sleutel);
            const verschil = Math.abs(som(o.artikelen.map((a) => a.omzet_excl_cents)) - o.kassa.omzet_cents);
            expect(verschil).toBeLessThanOrEqual(o.kassa.bonnen);
            expect(o.marge.omzet_cents).toBe(som(o.artikelen.map((a) => a.omzet_excl_cents)));
        });
    }

    it('afdelingen komen uit de eigen winkel, niet uit die van een ander', async () => {
        const o = await overzicht('2026-11');
        const afdeling = (sleutel: string) => o.artikelen.find((a) => a.sleutel === sleutel)?.afdeling;
        expect(afdeling('a-p-worst')).toBe('Worst');
        expect(afdeling('a-p-kaas')).toBe('Kaas');
        expect(afdeling('a-p-glas')).toBe('Zonder afdeling');
        expect(afdeling('a-borrel')).toBe('Pakketten');
        expect(afdeling('open:diversen')).toBe('Open prijs');
        expect(o.artikelen.some((a) => a.afdeling === 'Andere winkel' || a.naam === 'Van een ander')).toBe(false);
    });

    it('de marge van de periode telt alleen wat een inkoopprijs heeft', async () => {
        const o = await overzicht('2026-12');
        const bekend = o.artikelen.filter((a) => a.marge_cents !== null);
        expect(o.marge.marge_cents).toBe(som(bekend.map((a) => a.marge_cents ?? 0)));
        expect(o.marge.zonder_inkoopprijs).toBe(o.artikelen.length - bekend.length);
        expect(o.artikelen.filter((a) => a.marge_cents === null).map((a) => a.sleutel).sort()).toEqual(['a-p-saus', 'open:diversen']);
        expect(o.artikelen.filter((a) => a.geschat).map((a) => a.sleutel)).toEqual(['a-p-glas']);
    });

    it.fails('BEVINDING 5: verkoop met een open prijs telt als "artikel zonder inkoopprijs" en is nooit weg te werken', async () => {
        /* Alleen de saus mist een inkoopprijs die je kunt invullen. Een open prijs heeft er geen, en blijft zo voor altijd in "Om naar te kijken" staan. */
        const o = await overzicht('2026-12');
        expect(o.marge.zonder_inkoopprijs).toBe(1);
    });
});

describe('inkoop', () => {
    /** Zoals src/app/winkelboek/inkoop/page.tsx. */
    async function inkoop(sleutel: string) {
        const { start, eind } = periodeVan(sleutel, '2026-12-05');
        const [ontvangsten, bonnen, voorraad] = await Promise.all([laadOntvangsten(sb, SIM_ORG, start, eind), laadInkoopBonnen(sb, SIM_ORG, start, eind), laadVoorraadwaarde(sb, SIM_ORG)]);
        return { fout: ontvangsten.fout ?? bonnen.fout ?? voorraad.fout, leveringen: maakLeveringen(ontvangsten.ontvangsten, bonnen.bonnen), voorraad };
    }

    it('week 48: drie leveringen, elk met het bedrag van wat er binnenkwam', async () => {
        const { leveringen, fout } = await inkoop('2026-W48');
        expect(fout).toBeNull();
        expect(leveringen.map((l) => [l.datum, l.leverancier, l.producten, l.bedrag_cents])).toEqual([
            ['2026-11-27', 'Slagerij', 1, 120 * 310],
            ['2026-11-25', 'Brouwerij', 3, 720 * 145 + 48 * 520 + 24 * 260],
            ['2026-11-24', 'Slagerij', 3, 200 * 310 + 90 * 380 + 30 * 350],
        ]);
    });

    it('week 49: vijf leveringen; zonder inkoopprijs geen bedrag, zonder leverancier of bon staat dat erbij', async () => {
        const { leveringen } = await inkoop('2026-W49');
        expect(leveringen.map((l) => [l.datum, l.leverancier, l.bedrag_cents, l.bon.soort])).toEqual([
            ['2026-12-04', 'Onbekend', 6 * 1350, 'ontbreekt'],
            ['2026-12-03', 'Kaasmakerij', 40500, 'gevonden'],
            ['2026-12-02', 'Brouwerij', 480 * 145 + 24 * 520, 'gevonden'],
            ['2026-12-01', 'Slagerij', 150 * 310 + 80 * 380, 'gevonden'],
            ['2026-11-30', 'Groothandel', null, 'ontbreekt'],
        ]);
    });

    it.fails('BEVINDING 1: bij een leverancier die elke week levert is de bon van de eerste levering niet meer te vinden', async () => {
        /* Elke levering in week 48 heeft precies één bon, op de dag zelf of twee dagen later, met hetzelfde bedrag.
           Nu: de bon van de vólgende levering valt ook binnen zeven dagen, dus staat er "2 of 3 bonnen gevonden". */
        const { leveringen } = await inkoop('2026-W48');
        expect(leveringen.map((l) => [l.datum, l.leverancier, l.bon.soort])).toEqual([
            ['2026-11-27', 'Slagerij', 'gevonden'],
            ['2026-11-25', 'Brouwerij', 'gevonden'],
            ['2026-11-24', 'Slagerij', 'gevonden'],
        ]);
    });

    it('de voorraadwaarde telt elk product met een telling en een inkoopprijs', async () => {
        const { voorraad } = await inkoop('2026-W49');
        const telt = SIM_PRODUCTEN.filter((p) => (w.voorraad.get(p.id) ?? null) !== null && p.inkoop !== null);
        expect(voorraad).toMatchObject({ producten: telt.length, zonder: SIM_PRODUCTEN.length - telt.length });
    });

    it.fails('BEVINDING 2a: een voorraad onder nul telt als negatieve waarde mee in "Voorraadwaarde nu"', async () => {
        /* De chutney staat op −16 omdat een levering niet is ingeboekt. Wat er niet ligt is niets waard, niet min iets. */
        const { voorraad } = await inkoop('2026-W49');
        expect(w.voorraad.get('p-chutney')).toBeLessThan(0);
        const echt = som(SIM_PRODUCTEN.map((p) => {
            const ligt = w.voorraad.get(p.id) ?? null;
            return ligt === null || p.inkoop === null || ligt <= 0 ? 0 : Math.round((ligt * p.inkoop) / p.prijs_per);
        }));
        expect(voorraad.cents).toBe(echt);
    });

    it('derving: week 49 heeft er twee, waarvan één zonder waarde', async () => {
        expect((await overzicht('2026-W49')).derving).toMatchObject({ cents: 700, aantal: 2, zonder_waarde: 1 });
        expect((await overzicht('2026-W48')).derving).toMatchObject({ cents: 0, aantal: 0, zonder_waarde: 0 });
    });
});

describe('hardlopers en trage lopers', () => {
    it('telt per los product wat er verkocht is, en deelt in op omzet', async () => {
        const invoer = await laadLoperInvoer(sb, SIM_ORG, SIM_NU);
        expect(invoer.fout).toBeNull();
        expect(invoer.dagen).toEqual({ verkoopdagen: 10, dagen_open: 12 });
        expect(invoer.producten.map((p) => p.product_id).sort()).toEqual(SIM_PRODUCTEN.map((p) => p.id).sort());

        /* De waarheid per product over alle tien dagen. */
        const echt = new Map<string, { verkocht: number; omzet: number; incl: Record<number, number>; inkoop: number | null; geschat: boolean }>();
        for (const d of SIM_DAGEN) for (const [id, p] of w.producten.get(d) ?? []) {
            const x = echt.get(id) ?? { verkocht: 0, omzet: 0, incl: {}, inkoop: 0, geschat: false };
            x.verkocht += p.verkocht; x.omzet += p.omzet_incl;
            for (const [pct, n] of Object.entries(p.incl)) x.incl[Number(pct)] = (x.incl[Number(pct)] ?? 0) + n;
            x.inkoop = x.inkoop === null || p.inkoop === null ? null : x.inkoop + p.inkoop;
            x.geschat = x.geschat || p.geschat;
            echt.set(id, x);
        }
        for (const p of invoer.producten) {
            const t = echt.get(p.product_id);
            expect(p.verkocht, `${p.naam} verkocht`).toBe(t?.verkocht ?? 0);
            expect(p.omzet_cents, `${p.naam} omzet`).toBe(t?.omzet ?? 0);
            const excl = t ? som(Object.entries(t.incl).map(([pct, incl]) => incl - btwUitIncl(incl, Number(pct)))) : 0;
            expect(p.marge_cents, `${p.naam} marge`).toBe(!t || t.inkoop === null ? null : excl - t.inkoop);
            expect(p.voorraad, `${p.naam} voorraad`).toBe(w.voorraad.get(p.product_id) ?? null);
        }

        const lopers = deelLopersIn(invoer.producten, invoer.dagen);
        expect(lopers.voorlopig).toBe(true);

        /* Dezelfde indeling, hier los nagerekend: tot 80% hard, tot 95% midden, daarna traag. */
        const verkocht = [...echt.entries()].filter(([, p]) => p.verkocht > 0).sort((a, b) => b[1].omzet - a[1].omzet);
        const totaal = som(verkocht.map(([, p]) => p.omzet));
        let ervoor = 0;
        const groep = new Map<string, string>();
        for (const [id, p] of verkocht) {
            groep.set(id, ervoor / totaal < 0.8 ? 'hard' : ervoor / totaal < 0.95 ? 'midden' : 'traag');
            ervoor += p.omzet;
        }
        for (const l of lopers.lijst.filter((x) => x.groep !== 'stil')) expect(l.groep, l.naam).toBe(groep.get(l.product_id));
        expect(lopers.lijst.filter((x) => x.groep === 'stil').map((x) => x.product_id).sort()).toEqual(['p-barley', 'p-plank']);
        expect(lopers.lijst.some((x) => x.product_id === 'p-oud')).toBe(false);
    });

    it('wat bijna op is moet bijbesteld, en dat klopt met wat er ligt', async () => {
        const invoer = await laadLoperInvoer(sb, SIM_ORG, SIM_NU);
        const lopers = deelLopersIn(invoer.producten, invoer.dagen);
        for (const l of lopers.lijst.filter((x) => x.dagen_voorraad !== null && (x.voorraad ?? 0) >= 0)) {
            const perDag = l.verkocht / 10;
            expect(l.dagen_voorraad, l.naam).toBe(Math.floor((w.voorraad.get(l.product_id) ?? 0) / perDag));
            expect(l.krap, l.naam).toBe((l.dagen_voorraad ?? 99) < 3);
        }
        /* Kaas gaat op gewicht: bakjes en grammen zijn niet te delen. */
        expect(lopers.lijst.find((x) => x.product_id === 'p-kaas')?.dagen_voorraad).toBeNull();
        /* Aan het eind van een drukke zaterdag is bijna alles krap: dat hoort zo. */
        expect(lopers.lijst.filter((x) => x.actie === 'bijbestellen').map((x) => x.product_id)).toContain('p-blond');
    });

    it.fails('BEVINDING 2b: een voorraad onder nul geeft "genoeg voor −5 dagen"', async () => {
        const invoer = await laadLoperInvoer(sb, SIM_ORG, SIM_NU);
        const chutney = deelLopersIn(invoer.producten, invoer.dagen).lijst.find((x) => x.product_id === 'p-chutney')!;
        expect(chutney.voorraad).toBeLessThan(0);
        expect(chutney.dagen_voorraad === null || chutney.dagen_voorraad >= 0).toBe(true);
    });

    it.fails('BEVINDING 4: een trage loper die bijna op is krijgt het advies "afprijzen"', async () => {
        /* De zuurkoolworst is traag (weinig omzet) en er liggen er nog zes: er valt niets af te prijzen. */
        const invoer = await laadLoperInvoer(sb, SIM_ORG, SIM_NU);
        const worst = deelLopersIn(invoer.producten, invoer.dagen).lijst.find((x) => x.product_id === 'p-zuurkool')!;
        expect(worst).toMatchObject({ groep: 'traag', krap: true });
        expect(worst.actie).not.toBe('afprijzen');
    });
});

describe('de melding "Dag geboekt"', () => {
    beforeAll(() => { dienst.sb = sb; });
    afterAll(() => { dienst.sb = null; });
    const meldingen = () => sim.tabellen.notifications.filter((n) => n.organization_id === SIM_ORG && n.type === DAG_GEBOEKT_TYPE);

    it('één per kassadag, geen voor de proefdag, ook als de kassa twee keer meldt', async () => {
        const staten = sim.tabellen.toonbank_dagstaten.filter((s) => s.organization_id === SIM_ORG);
        for (const s of staten) await meldDagGeboekt(SIM_ORG, String(s.id));
        for (const s of staten) await meldDagGeboekt(SIM_ORG, String(s.id));
        expect(meldingen().map((n) => (n.metadata as { bedrijfsdag: string }).bedrijfsdag).sort()).toEqual(SIM_DAGEN);
        expect(meldingen().map((n) => n.link).sort()).toEqual(SIM_DAGEN.map((d) => `/winkelboek/dag/${d}`));
    });

    it('de tekst volgt de stand van de dag', () => {
        const tekst = (dag: string) => meldingen().find((n) => (n.metadata as { bedrijfsdag: string }).bedrijfsdag === dag);
        expect(tekst('2026-11-24')).toMatchObject({ title: 'Dag geboekt · di 24 nov', body: 'Alles klopt, je hoeft niets te doen.' });
        expect(tekst('2026-11-25')).toMatchObject({ title: 'Dag afgesloten · wo 25 nov', body: '1 punt om naar te kijken.' });
        expect(tekst('2026-12-04')).toMatchObject({ body: '2 punten om naar te kijken.' });
    });
});

describe('het maandslot', () => {
    it('een afgesloten maand van een ander zet de eigen maand niet op slot', async () => {
        expect(await maandSlot(sb, SIM_ORG, '2026-11-27')).toBe('open');
        expect(await maandSlot(sb, 'org-ander', '2026-11-27')).toBe('dicht');
    });
});
