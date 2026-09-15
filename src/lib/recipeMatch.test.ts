import { describe, it, expect } from 'vitest';
import {
    extraWoorden,
    normalizeIngredientName,
    nameScore,
    pickBestMatch,
    confidenceFromScore,
    isTailOnlyMatch,
    toBaseUnit,
    lineCostCents,
    type CostCandidate,
    aliasSleutel,
    isGratis,
} from './recipeMatch';

describe('normalizeIngredientName', () => {
    it('haalt accenten, hoofdletters en leestekens weg', () => {
        expect(normalizeIngredientName('Crème Fraîche (biologisch)')).toBe('creme fraiche biologisch');
    });
    it('collapse dubbele spaties', () => {
        expect(normalizeIngredientName('  roomboter   ongezouten ')).toBe('roomboter ongezouten');
    });
});

describe('nameScore', () => {
    it('exacte match = 1', () => {
        expect(nameScore('roomboter', 'roomboter')).toBe(1);
    });
    it('ingrediënt volledig gedekt door langere kandidaat scoort hoog', () => {
        // "roomboter" zit in "Bidfood Roomboter ongezouten 250 g"
        expect(nameScore('roomboter', 'Bidfood Roomboter ongezouten 250 g')).toBeGreaterThan(0.7);
    });
    it('stopwoorden tellen niet mee (verse tijm ↔ tijm)', () => {
        expect(nameScore('verse tijm', 'tijm')).toBe(1);
    });
    it('geen overlap = 0', () => {
        expect(nameScore('zalmfilet', 'chocolade')).toBe(0);
    });
    it('substring-redding bij nul token-overlap', () => {
        // tokens verschillen maar hele string zit erin
        expect(nameScore('pastrami', 'huisgemaakte pastrami plakjes')).toBeGreaterThanOrEqual(0.6);
    });
});

describe('confidenceFromScore', () => {
    it('drempels kloppen', () => {
        expect(confidenceFromScore(0.9)).toBe('hoog');
        expect(confidenceFromScore(0.6)).toBe('middel');
        expect(confidenceFromScore(0.3)).toBe('laag');
    });
});

describe('isTailOnlyMatch — smaak-toevoeging vs het product zelf', () => {
    it('zeezout achteraan in een knäckebröd = staart-match', () => {
        // Echt voorval (2026-07-26): "zeezout fijn" matchte hierop met "hoog".
        expect(isTailOnlyMatch('zeezout fijn', 'Knäckebröd meergranen zeezout')).toBe(true);
    });
    it('hoofdwoord achter een merknaam is géén staart-match', () => {
        expect(isTailOnlyMatch('roomboter', 'Bidfood Roomboter ongezouten 250 g')).toBe(false);
    });
    it('hoofdwoord vooraan is géén staart-match', () => {
        expect(isTailOnlyMatch('pastrami', 'Pastrami plakjes huisgemaakt')).toBe(false);
    });
    it('korte namen worden niet beoordeeld', () => {
        expect(isTailOnlyMatch('tijm', 'verse tijm')).toBe(false);
    });
    it('geen enkele overlap → geen staart-match (score vangt dat al af)', () => {
        expect(isTailOnlyMatch('zalm', 'Knäckebröd meergranen zeezout')).toBe(false);
    });
});

describe('pickBestMatch', () => {
    const cands: CostCandidate[] = [
        { source: 'supplier', ref_id: 1, name: 'Bidfood Roomboter ongezouten 250 g', centsPerBaseUnit: 1, baseUnit: 'g' },
        { source: 'component', ref_id: 2, name: 'Roomboter', centsPerBaseUnit: 1, baseUnit: 'g' },
        { source: 'inventory', ref_id: 3, name: 'Roomboter ongezouten', centsPerBaseUnit: 1, baseUnit: 'g' },
    ];
    it('bij gelijke score wint de bron-prioriteit (component > inventory > supplier)', () => {
        const r = pickBestMatch('roomboter', cands);
        expect(r?.candidate.source).toBe('component');
    });
    it('onder de floor → null (liever geen match dan een gok)', () => {
        const r = pickBestMatch('sojasaus', cands);
        expect(r).toBeNull();
    });
});

describe('pickBestMatch — middelste prijs bij even goede kandidaten (golf 1)', () => {
    const mayo = (id: number, cents: number, name = 'Mayonaise emmer 5 kg'): CostCandidate =>
        ({ source: 'supplier_product', ref_id: id, name, centsPerBaseUnit: cents, baseUnit: 'g' });

    it('vijf even goede mayonaises → de middelste prijs, niet de goedkoopste of duurste', () => {
        const r = pickBestMatch('mayonaise', [mayo(1, 0.9), mayo(2, 0.3), mayo(3, 1.4), mayo(4, 0.6), mayo(5, 2.1)]);
        expect(r?.candidate.ref_id).toBe(1);   // 0,3 · 0,6 · [0,9] · 1,4 · 2,1
    });
    it('even aantal → de onderste van de twee middelste', () => {
        const r = pickBestMatch('mayonaise', [mayo(1, 0.9), mayo(2, 0.3), mayo(3, 1.4), mayo(4, 0.6)]);
        expect(r?.candidate.ref_id).toBe(4);   // 0,3 · [0,6] · 0,9 · 1,4
    });
    it('een duidelijk betere naam wint nog steeds van een goedkopere bijna-match', () => {
        const r = pickBestMatch('zure room', [
            { source: 'supplier_product', ref_id: 1, name: 'Room 35% 1 l', centsPerBaseUnit: 0.1, baseUnit: 'ml' },
            { source: 'supplier_product', ref_id: 2, name: 'Zure room 10% 1 l', centsPerBaseUnit: 0.5, baseUnit: 'ml' },
        ]);
        expect(r?.candidate.ref_id).toBe(2);
    });
    it('een smaakvariant hoort niet in de groep: "Mayonaise" wint van "Truffel mayonaise", ook al is die goedkoper', () => {
        const r = pickBestMatch('mayonaise', [
            { source: 'supplier_product', ref_id: 1, name: 'Truffel mayonaise, pot 500 ml', centsPerBaseUnit: 0.2, baseUnit: 'ml' },
            { source: 'supplier_product', ref_id: 2, name: 'Mayonaise, fles 1 ltr', centsPerBaseUnit: 0.9, baseUnit: 'ml' },
            { source: 'supplier_product', ref_id: 3, name: 'Mayonaise, emmer 10 ltr', centsPerBaseUnit: 0.4, baseUnit: 'ml' },
        ]);
        expect([2, 3]).toContain(r?.candidate.ref_id);   // middelste van de twee echte mayonaises
        expect(r?.candidate.ref_id).not.toBe(1);
    });
    it('één kort gedeeld woord ("wit") is geen match', () => {
        const r = pickBestMatch('basterdsuiker (wit)', [
            { source: 'supplier_product', ref_id: 1, name: 'Molenaarsbrood wit 600 gr per stuk, doos 12 stuks', centsPerBaseUnit: 0.3, baseUnit: 'g' },
        ]);
        expect(r).toBeNull();
    });
    it('uitschieter-rem: een exacte naam met een absurde catalogusprijs verliest van de middenprijs', () => {
        const peper = (id: number, name: string, eurKg: number): CostCandidate =>
            ({ source: 'supplier_product', ref_id: id, name, centsPerBaseUnit: eurKg / 10, baseUnit: 'g' });
        const r = pickBestMatch('zwarte peper', [
            peper(1, 'Zwarte peper, pot 47 gr', 386),          // exacte naam, doos-prijs als potje ingelezen
            peper(2, 'Zwarte peper gemalen, bus 500 gr', 25),
            peper(3, 'Zwarte peper gemalen, bus 460 gr', 37),
            peper(4, 'Zwarte peper steak, bus 400 gr', 39),
        ]);
        expect(r?.candidate.ref_id).toBe(3);   // middenprijs van 25 · [37] · 39 · 386
        expect(r?.confidence).toBe('middel');
    });
    it('uitschieter-rem raakt eigen bibliotheek en voorraad niet', () => {
        const r = pickBestMatch('zwarte peper', [
            { source: 'component', ref_id: 1, name: 'Zwarte peper', centsPerBaseUnit: 40, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 2, name: 'Zwarte peper gemalen, bus 500 gr', centsPerBaseUnit: 2.5, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 3, name: 'Zwarte peper gemalen, bus 460 gr', centsPerBaseUnit: 3.7, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 4, name: 'Zwarte peper steak, bus 400 gr', centsPerBaseUnit: 3.9, baseUnit: 'g' },
        ]);
        expect(r?.candidate.ref_id).toBe(1);
    });
    it('hoofdwoord vooraan wint van hetzelfde woord achteraan ("Roomboter ongezouten" vs "Croissant roomboter")', () => {
        const r = pickBestMatch('roomboter', [
            { source: 'supplier_product', ref_id: 1, name: 'Croissant roomboter 60 gr per stuk, doos 70 stuks', centsPerBaseUnit: 0.4, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 2, name: 'Roomboter ongezouten, pak 250 gr', centsPerBaseUnit: 0.9, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 3, name: 'Koekjes roomboter, doos 2 kg', centsPerBaseUnit: 0.6, baseUnit: 'g' },
        ]);
        expect(r?.candidate.ref_id).toBe(2);
    });
    it('uitschieter-rem werkt ook als een ingrediënt-woord in geen enkele naam voorkomt', () => {
        const peper = (id: number, name: string, eurKg: number): CostCandidate =>
            ({ source: 'supplier_product', ref_id: id, name, centsPerBaseUnit: eurKg / 10, baseUnit: 'g' });
        const r = pickBestMatch('zwarte peper (versgemalen)', [
            peper(1, 'Zwarte peper, pot 47 gr', 386),
            peper(2, 'Zwarte peper gemalen, bus 500 gr', 25),
            peper(3, 'Zwarte peper gemalen, bus 460 gr', 37),
            peper(4, 'Zwarte peper steak, bus 400 gr', 39),
        ]);
        expect(r?.candidate.ref_id).toBe(3);
    });
    it('een staart-match valt uit de groep zodra er een gewone kandidaat is', () => {
        const r = pickBestMatch('fijn zeezout', [
            { source: 'supplier_product', ref_id: 1, name: 'Melkchocolade karamel zeezout, doos 35 stuks', centsPerBaseUnit: 0.5, baseUnit: 'g' },
            { source: 'supplier_product', ref_id: 2, name: 'Fijn zeezout, bus 500 gr', centsPerBaseUnit: 0.1, baseUnit: 'g' },
        ]);
        expect(r?.candidate.ref_id).toBe(2);
        expect(r?.confidence).not.toBe('laag');
    });
    it('binnen de groep wint de eenheid die bij het recept past (ml-regel → ml-product)', () => {
        const r = pickBestMatch('karnemelk', [
            { source: 'supplier_product', ref_id: 1, name: 'Karnemelk pak 1 ltr', centsPerBaseUnit: 0.1, baseUnit: 'ml' },
            { source: 'supplier_product', ref_id: 2, name: 'Karnemelk', centsPerBaseUnit: 120, baseUnit: 'stuk' },
        ], undefined, 'ml');
        expect(r?.candidate.ref_id).toBe(1);   // 'Karnemelk' (stuk) scoort hoger op naam, maar is per stuk onbruikbaar voor ml
    });
});

describe('toBaseUnit', () => {
    it('kg → g met factor 1000', () => {
        expect(toBaseUnit('kg')).toEqual({ base: 'g', factor: 1000 });
    });
    it('liter → ml met factor 1000', () => {
        expect(toBaseUnit('liter')).toEqual({ base: 'ml', factor: 1000 });
    });
    it('onbekende eenheid → null', () => {
        expect(toBaseUnit('snufje')).toBeNull();
    });
});

describe('lineCostCents — gram ≈ milliliter', () => {
    it('40 g mayonaise tegen een ml-prijs rekent 1:1', () => {
        expect(lineCostCents(40, 'g', { centsPerBaseUnit: 0.5, baseUnit: 'ml' })).toBe(20);
    });
    it('gram tegen stuk blijft onvergelijkbaar', () => {
        expect(lineCostCents(40, 'g', { centsPerBaseUnit: 50, baseUnit: 'stuk' })).toBeNull();
    });
});

describe('lineCostCents', () => {
    const perGram: Pick<CostCandidate, 'centsPerBaseUnit' | 'baseUnit'> = { centsPerBaseUnit: 1.25, baseUnit: 'g' };
    it('200 g × 1,25 ct/g = 250 ct', () => {
        expect(lineCostCents(200, 'g', perGram)).toBe(250);
    });
    it('0,2 kg × 1,25 ct/g = 250 ct (kg→g conversie)', () => {
        expect(lineCostCents(0.2, 'kg', perGram)).toBe(250);
    });
    it('onvergelijkbare eenheden (g-ingrediënt, per-stuk-prijs) → null', () => {
        expect(lineCostCents(200, 'g', { centsPerBaseUnit: 50, baseUnit: 'stuk' })).toBeNull();
    });
    it('per stuk × aantal', () => {
        expect(lineCostCents(3, 'stuks', { centsPerBaseUnit: 40, baseUnit: 'stuk' })).toBe(120);
    });
    it('qty 0 → 0 cent', () => {
        expect(lineCostCents(0, 'g', perGram)).toBe(0);
    });
});

describe('pickBestMatch — een passende eenheid geeft de doorslag', () => {
    /* Uit de echte catalogus: Bidfood heeft karnemelk per ml, Makro dezelfde
       karnemelk per stuk. Op naam scoren ze vrijwel gelijk. Zonder eenheid-hint
       won de tweede, en dan ketste de regel af op "eenheid onvergelijkbaar"
       terwijl de goede prijs gewoon in huis was. */
    const perMl: CostCandidate = {
        source: 'supplier_product', ref_id: 1, name: 'Karnemelk, pak 1 ltr',
        centsPerBaseUnit: 0.121, baseUnit: 'ml',
    };
    const perStuk: CostCandidate = {
        source: 'supplier', ref_id: 2, name: 'Campina Karnemelk 1 l',
        centsPerBaseUnit: 125, baseUnit: 'stuk',
    };

    it('kiest het product waarvan de eenheid past', () => {
        const uit = pickBestMatch('karnemelk', [perStuk, perMl], undefined, 'ml');
        expect(uit?.candidate.ref_id).toBe(1);
    });

    it('laat een duidelijk betere naam nog steeds winnen', () => {
        /* De bonus mag klein zijn: "zure room" verliest nooit van "room" omdat
           die toevallig in grammen staat. */
        const room: CostCandidate = {
            source: 'supplier_product', ref_id: 3, name: 'Room 40%',
            centsPerBaseUnit: 0.5, baseUnit: 'g',
        };
        const zureRoom: CostCandidate = {
            source: 'supplier_product', ref_id: 4, name: 'Zure room 24%, pak 1 kg',
            centsPerBaseUnit: 0.43, baseUnit: 'ml',
        };
        const uit = pickBestMatch('zure room', [room, zureRoom], undefined, 'g');
        expect(uit?.candidate.ref_id).toBe(4);
    });

    it('gedraagt zich als vanouds zonder eenheid', () => {
        const uit = pickBestMatch('karnemelk', [perStuk, perMl]);
        expect(uit).not.toBeNull();
    });
});

describe('aliasSleutel — naam zonder hoeveelheid en eenheid (golf 4)', () => {
    it('haalt hoeveelheid en eenheid uit oude tekst-ingrediënten', () => {
        expect(aliasSleutel('0,05 stuks kaneelstokje')).toBe('kaneelstokje');
        expect(aliasSleutel('200 g bavette')).toBe('bavette');
    });
    it('laat beschrijvende woorden staan: fijn en grof zeezout zijn twee aliassen', () => {
        expect(aliasSleutel('Fijn zeezout')).toBe('fijn zeezout');
        expect(aliasSleutel('grof zeezout')).not.toBe(aliasSleutel('fijn zeezout'));
    });
    it('haakjes tellen niet: "procureur (varkensnek, am been)" is procureur', () => {
        expect(aliasSleutel('procureur (varkensnek, am been)')).toBe('procureur');
    });
    it('appelciderazijn en Appelciderazijn zijn dezelfde sleutel', () => {
        expect(aliasSleutel('Appelciderazijn')).toBe(aliasSleutel('appelciderazijn'));
    });
});

describe('nameScore — hoofdwoord en haakjes (golf 4)', () => {
    it('een gedeeld bijvoeglijk naamwoord is geen treffer: bruine basterdsuiker ↔ Bruine bonen', () => {
        expect(nameScore('bruine basterdsuiker', 'Bruine bonen, zak 1 kg')).toBe(0);
        expect(nameScore('Worcestershire sauce', 'Hemp sauce, fles 750 ml')).toBe(0);
    });
    it('haakjes zijn toelichting: zwarte peper (versgemalen) vindt gewoon zwarte peper', () => {
        expect(nameScore('zwarte peper (versgemalen)', 'Zwarte peper gemalen, bus 500 gr')).toBeGreaterThan(0.8);
    });
    it('water is gratis, in elke vorm', () => {
        expect(isGratis('water')).toBe(true);
        expect(isGratis('koud water')).toBe(true);
        expect(isGratis('water (voor broth)')).toBe(true);
        expect(isGratis('Coconut water')).toBe(false);
    });
});

describe('lineCostCents — recept in stuks, product per gram met stukgewicht', () => {
    it('1 stuks briochebun van 85 g tegen € 4,89/kg = 42 ct', () => {
        expect(lineCostCents(1, 'stuks', { centsPerBaseUnit: 0.489, baseUnit: 'g', perStuk: { hoeveelheid: 85, base: 'g' } })).toBe(42);
    });
    it('zonder stukgewicht blijft stuks vs gram onvergelijkbaar', () => {
        expect(lineCostCents(1, 'stuks', { centsPerBaseUnit: 0.489, baseUnit: 'g' })).toBeNull();
    });
});

describe('pickBestMatch — afgeleid product is hooguit "middel" (A–Z-test 15 sep)', () => {
    const sp = (id: number, name: string): CostCandidate =>
        ({ source: 'supplier_product', ref_id: id, name, centsPerBaseUnit: 1, baseUnit: 'g' });

    it('"boter" ↔ "Boter béarnaise saus, zak 1 kg" dekt het woord maar is een saus → middel', () => {
        const r = pickBestMatch('boter (voor roosteren broodjes)', [sp(1, 'Boter béarnaise saus, zak 1 kg')]);
        expect(r?.candidate.ref_id).toBe(1);
        expect(r?.confidence).toBe('middel');
    });
    it('"honing" ↔ "Honing-mosterdsaus, emmer 2,7 ltr" → middel', () => {
        const r = pickBestMatch('honing', [sp(1, 'Honing-mosterdsaus, emmer 2,7 ltr')]);
        expect(r?.confidence).toBe('middel');
    });
    it('een gewoon product met verpakkingswoorden blijft hoog ("Zout, pak 1 kg")', () => {
        const r = pickBestMatch('zout', [sp(1, 'Zout, pak 1 kg')]);
        expect(r?.confidence).toBe('hoog');
    });
    it('twee-woord-ingrediënt met één extra woord blijft hoog ("Zwarte peper gemalen, bus 460 gr")', () => {
        const r = pickBestMatch('zwarte peper', [sp(1, 'Zwarte peper gemalen, bus 460 gr')]);
        expect(r?.confidence).toBe('hoog');
    });
    it('"bruine suiker" ↔ "Siroop bruine suiker, fles 2,35 kg": eigen hoofdwoord vooraan → middel', () => {
        const r = pickBestMatch('bruine suiker', [sp(1, 'Siroop bruine suiker, fles 2,35 kg')]);
        expect(r?.confidence).toBe('middel');
    });
    it('extraWoorden telt alleen betekenisvolle woorden', () => {
        expect(extraWoorden('boter', 'Boter béarnaise saus, zak 1 kg')).toBe(2);
        expect(extraWoorden('zout', 'Zout, pak 1 kg')).toBe(0);
    });
});

describe('nameScore — hoofdwoord is nooit een bewerkingswoord', () => {
    it('"oregano gedroogd" ↔ "Oregano, stuk 80 gr" is een treffer (gedroogd is langer dan oregano)', () => {
        expect(nameScore('oregano gedroogd', 'Oregano, stuk 80 gr')).toBeGreaterThan(0.5);
    });
    it('"gerookt paprikapoeder" ↔ "Paprikapoeder" blijft een deel-treffer, geen nul', () => {
        expect(nameScore('gerookt paprikapoeder', 'Paprikapoeder, bus 500 gr')).toBeGreaterThan(0.5);
    });
    it('het echte hoofdwoord blijft verplicht: "bruine basterdsuiker" ↔ "Bruine bonen" = 0', () => {
        expect(nameScore('bruine basterdsuiker', 'Bruine bonen, blik 800 gr')).toBe(0);
    });
});
