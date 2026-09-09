import { describe, it, expect } from 'vitest';
import {
    controleer, magOpslaan, openstaandeVragen, metKeuzesVerwerkt, temperatuurUitKeuze,
    inventarisVoorPrompt, isPlanbaar, type Voorstel,
} from './ontleder';
import type { ApparaatMetKundes } from './estafette';

/**
 * De maatstaf: sherry glazed buikspek uit BBQ'ish Bites.
 *
 * De AI vertaalt het boekrecept naar deze keuken; deze tests controleren of de
 * code doorheeft wanneer die vertaling niet klopt. Wat hier doorheen komt mag
 * worden vóórgelegd aan de kok — niet opgeslagen.
 */

const smoker: ApparaatMetKundes = {
    id: 21, naam: 'Yoder Smokers YS1500s pelletgrill', kundes: ['smoker', 'oven'],
    aanzetMin: 1, opwarmMin: 60, warmBlijftMin: null, schoonmaakMin: 20,
    exclusiefBezet: true, concurrentJobs: null, capaciteitWaarde: 60,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677,
    temp_min_c: 65, temp_max_c: 260, stationId: 2,
};

const houtskool: ApparaatMetKundes = {
    ...smoker, id: 1, naam: 'Yoder Smokers 24×48 houtskoolgrill', kundes: ['grill'],
    opwarmMin: 20, capaciteitWaarde: 40, kookoppervlakCm2: 7432,
    temp_min_c: null, temp_max_c: null,
};

const inductie: ApparaatMetKundes = {
    ...smoker, id: 38, naam: 'METRO inductiekookplaat', kundes: ['fornuis'],
    opwarmMin: 2, capaciteitWaarde: null, capaciteitEenheid: null,
    kookoppervlakCm2: null, temp_min_c: null, temp_max_c: null,
};

const APPARATEN = [smoker, houtskool, inductie];

/** Zoals de AI het buikspek zou moeten teruggeven: al omgezet naar deze keuken. */
const BUIKSPEK: Voorstel = {
    gerechtNaam: 'Sherry glazed buikspek met golden apples',
    porties: 8,
    componenten: [{ naam: 'Basis natte pekel', isVerwijzing: true }, { naam: 'Sherry glaze' }],
    stappen: [
        {
            volgnummer: 1, tekst: 'Pekel koken met jeneverbes, steranijs, peperkorrels, mosterdzaad, laurier en knoflook',
            bewerking: 'koken', actiefMin: 15, passiefMin: 30,
            materieelId: 38, apparaatReden: 'Pekel koken doe je in een pan op de inductie',
        },
        { volgnummer: 2, tekst: 'Varkensbuik in de pekel leggen en verzwaren', bewerking: 'inleggen', actiefMin: 5, hangtAfVanVolgnummer: 1 },
        { volgnummer: 3, tekst: '24 uur pekelen', bewerking: 'pekelen', passiefMin: 1440, hangtAfVanVolgnummer: 2 },
        {
            volgnummer: 4, tekst: 'Smoker aanzetten naar 110 °C', bewerking: 'aanzetten',
            actiefMin: 1, tempC: 110, materieelId: 21,
            apparaatReden: 'Indirect roken gaat op de YS1500s',
        },
        { volgnummer: 5, tekst: 'Buikspek uit de pekel, afspoelen en droogdeppen', bewerking: 'spoelen', actiefMin: 10, hangtAfVanVolgnummer: 3 },
        { volgnummer: 6, tekst: 'Insmeren met olie, zout en peper', bewerking: 'kruiden', actiefMin: 5, hangtAfVanVolgnummer: 5 },
        {
            volgnummer: 7, tekst: 'Roken tot kern 70 °C', bewerking: 'roken',
            passiefMin: 240, tempC: 70, materieelId: 21,
            apparaatReden: 'De YS1500s maakt zijn eigen rook',
            hangtAfVanVolgnummer: 6,
        },
        {
            volgnummer: 8, tekst: 'Sherryazijn met suiker en zout inkoken tot een stroperige glaze',
            bewerking: 'inkoken', actiefMin: 5, passiefMin: 15, materieelId: 38,
            apparaatReden: 'Saus gaat in een pan op de inductie',
        },
        { volgnummer: 9, tekst: 'Buikspek inkwasten en 10 minuten laten indikken', bewerking: 'glazuren', actiefMin: 3, passiefMin: 10, materieelId: 21, hangtAfVanVolgnummer: 7 },
        { volgnummer: 10, tekst: 'Venkelzaad en kardemom droog roosteren, boter en kurkuma erbij, dan honing en appelblokjes', bewerking: 'roosteren', actiefMin: 10, materieelId: 38 },
        { volgnummer: 11, tekst: 'Buikspek in blokjes snijden en serveren met de golden apples', bewerking: 'snijden', actiefMin: 8, hangtAfVanVolgnummer: 9 },
    ],
    vervallen: [
        { tekst: 'Schik een paar rookhoutchunks tussen de gloeiende kolen', reden: 'De YS1500s maakt zijn eigen rook' },
        { tekst: 'Voeg elk half uur rookhoutchunks toe', reden: 'Idem — geen halfuurritme nodig, je bent die vier uur vrij' },
    ],
};

describe('controleer — het buikspek als maatstaf', () => {
    const uit = controleer(BUIKSPEK, { apparaten: APPARATEN, bekendeComponenten: ['sherry glaze'] });

    it('laat een kloppende vertaling er gewoon door', () => {
        const rook = uit.stappen.find((s) => s.volgnummer === 7)!;
        expect(rook.oordeel).toBe('akkoord');
        expect(rook.materieelNaam).toContain('YS1500s');
    });

    it('houdt de saus op de inductie en niet op de barbecue', () => {
        /* Een pannetje glaze op de smoker zetten is onzin; het gaat om het
           vlees. De AI kiest, de controle bevestigt dat het toestel bestaat. */
        const glaze = uit.stappen.find((s) => s.volgnummer === 8)!;
        expect(glaze.oordeel).toBe('akkoord');
        expect(glaze.materieelNaam).toContain('inductie');
    });

    it('bewaart wat er in het boek stond en hier vervalt', () => {
        /* Niet stilletjes weglaten: jij moet kunnen zien wat er is weggevallen
           en waarom, anders vertrouw je de vertaling niet. */
        expect(uit.vervallen).toHaveLength(2);
        expect(uit.vervallen[0].reden).toContain('eigen rook');
    });

    it('meldt de pekel als component die nog niet bestaat', () => {
        expect(uit.ontbrekendeComponenten).toEqual(['Basis natte pekel']);
        expect(uit.vragen.some((v) => v.includes('Basis natte pekel'))).toBe(true);
    });

    it('markeert elke duur als geschat, nooit als meting', () => {
        expect(uit.stappen.every((s) => s.duurBron === 'geschat')).toBe(true);
    });

    it('weigert op te slaan zolang er vragen open staan', () => {
        expect(magOpslaan(uit).mag).toBe(false);
    });

    it('laat door zodra alles bekend is', () => {
        const compleet = controleer(BUIKSPEK, {
            apparaten: APPARATEN,
            bekendeComponenten: ['basis natte pekel', 'sherry glaze'],
        });
        expect(magOpslaan(compleet).mag).toBe(true);
    });
});

describe('controleer — waar de code de AI corrigeert', () => {
    const basis = (over: Partial<Voorstel['stappen'][0]>): Voorstel => ({
        gerechtNaam: 'Test',
        stappen: [{ volgnummer: 1, tekst: 'Iets doen', actiefMin: 10, ...over }],
    });

    it('vangt een apparaat dat niet bestaat', () => {
        /* Een verzonnen id ziet er ingevuld uit en is daarom erger dan geen
           keuze. */
        const uit = controleer(basis({ materieelId: 999 }), { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('staat niet in het materieel');
    });

    it('vangt een temperatuur die het toestel niet haalt', () => {
        const uit = controleer(basis({ materieelId: 21, tempC: 400 }), { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('65–260 °C');
    });

    it('laat een onbekend temperatuurbereik met rust', () => {
        /* De houtskoolgrill heeft geen opgegeven bereik. Onbekend is geen
           bezwaar — anders wordt elke grillstap een vraag. */
        const uit = controleer(basis({ materieelId: 1, tempC: 220 }), { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });

    it('laat een stap die op de meter eindigt gewoon staan', () => {
        /* Vroeger vroeg dit hoe lang het duurde. Dat antwoord is een gok, en
           gokken is precies wat dit systeem niet moet doen — het wordt gemeten
           zodra hij een keer gedraaid heeft. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 8,
                stappen: [{ volgnummer: 1, tekst: 'Doorgaren tot kern 88 °C', materieelId: 21, tempC: 115, kernTempC: 88 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(uit.stappen[0].duurOnbekend).toBe(true);
    });

    it('zeurt niet over een handeling aan een toestel dat toch al bezet is', () => {
        /* Het pulled pork-recept vroeg drie keer achter elkaar hoe lang de Yoder
           bezet raakte: bij het erop leggen, bij het insprayen en bij het
           inpakken. Drie handelingen van een paar minuten aan een smoker die
           toch al zes uur draaide. Een lijst die altijd vol staat wordt niet
           gelezen. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 8,
                stappen: [{ volgnummer: 1, tekst: 'Schouder op de pelletgrill leggen', materieelId: 21, tempC: 115 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(uit.stappen[0].duurOnbekend).toBe(true);
    });

    it('zeurt niet over een gekoelde werkbank', () => {
        /* Die heeft "421 liter" opslagvolume; dat is geen lading die je erop
           legt. Anders vraagt het systeem hoe lang je werkbank bezet is
           terwijl je vlees staat droog te deppen. */
        const koelbank: ApparaatMetKundes = {
            ...inductie, id: 40, naam: 'Inomak koelwerkbank',
            kundes: ['koeling', 'werkbank'], capaciteitWaarde: 421, capaciteitEenheid: 'liter',
        };
        const uit = controleer(
            { gerechtNaam: 'Test', stappen: [{ volgnummer: 1, tekst: 'Droogdeppen', materieelId: 40 }] },
            { apparaten: [...APPARATEN, koelbank] },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });

    it('zeurt niet over een pannetje op de inductie', () => {
        /* Een smoker die onbekend lang bezet is sloopt je dag; een pannetje
           niet. Zonder dat onderscheid werd élke stap een vraag. */
        const uit = controleer(
            { gerechtNaam: 'Test', stappen: [{ volgnummer: 1, tekst: 'Saus warm maken', materieelId: 38 }] },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(uit.stappen[0].duurOnbekend).toBe(true);
    });

    it('zeurt niet over de duur van los handwerk', () => {
        /* De eerste echte proef gaf 27 vragen waarvan er 20 hierover gingen.
           Een kookboek zet nooit een tijd bij "bestrooi met zout en peper", en
           daar hoort ook geen vraag bij — dat meet het systeem vanzelf. Een
           lijst die altijd vol staat wordt niet gelezen. */
        const uit = controleer(
            { gerechtNaam: 'Test', stappen: [{ volgnummer: 1, tekst: 'Bestrooien met zout en peper' }] },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(uit.stappen[0].duurOnbekend).toBe(true);
        expect(uit.stappen[0].actiefMin).toBeUndefined();
        expect(uit.vragen).toHaveLength(0);
    });

    it('telt hoeveel stappen er nog geen tijd hebben', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Test',
                stappen: [
                    { volgnummer: 1, tekst: 'Zout erover' },
                    { volgnummer: 2, tekst: 'Peper erover' },
                    { volgnummer: 3, tekst: 'Snijden', actiefMin: 8 },
                ],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.samenvatting.zonderTijd).toBe(2);
    });

    it('vangt een herhaling die niet in zichzelf past', () => {
        const uit = controleer(
            basis({ passiefMin: 240, herhaalIntervalMin: 30, herhaalDuurMin: 45 }),
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('past niet in elkaar');
    });

    it('meldt het als rookwerk op een toestel staat dat niet rookt', () => {
        /* Tweede mening op de tekst. Niet om te beslissen — dat doet de AI —
           maar wel om een echte botsing te zien. */
        const uit = controleer(
            basis({ tekst: 'Rook de buik indirect tot kern 70 °C', passiefMin: 240, materieelId: 38 }),
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('rookwerk');
    });

    it('zeurt niet als de tekst niets duidelijks zegt', () => {
        const uit = controleer(basis({ tekst: 'Meng alles door elkaar', materieelId: 38 }), { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });

    it('zet een open keuze van de AI door naar de kok', () => {
        const metKeuze: Voorstel = {
            gerechtNaam: 'Test',
            stappen: [{ volgnummer: 1, tekst: 'Saus warm houden', actiefMin: 5 }],
            keuzes: [{ vraag: 'Wil je de saus op de barbecue of op de inductie?', opties: ['barbecue', 'inductie'] }],
        };
        const uit = controleer(metKeuze, { apparaten: APPARATEN });
        expect(uit.vragen[0]).toContain('barbecue / inductie');
        expect(magOpslaan(uit).mag).toBe(false);
    });
});

describe('inventarisVoorPrompt', () => {
    it('geeft de AI genoeg om echt te kunnen kiezen', () => {
        /* Een model dat niet weet dat je een inductieplaat hebt, zet je sauzen
           op de barbecue. */
        const tekst = inventarisVoorPrompt(APPARATEN);
        expect(tekst).toContain('[21]');
        expect(tekst).toContain('smoker, oven');
        expect(tekst).toContain('65–260 °C');
        expect(tekst).toContain('max 60 kg');
        expect(tekst).toContain('inductiekookplaat');
        expect(tekst).toContain('fornuis');
    });

    it('zegt het eerlijk als er niets staat', () => {
        expect(inventarisVoorPrompt([])).toContain('nog geen apparatuur');
    });

    it('laat messen en snijplanken erbuiten', () => {
        /* Zonder deze zeef hing het model stappen aan de Miyabi Sujihiki, en
           dan staat er op het wandscherm dat je "op het mes" werkt. */
        const mes: ApparaatMetKundes = { ...inductie, id: 45, naam: 'Miyabi Sujihiki 24 cm', kundes: ['werkbank'] };
        expect(isPlanbaar(mes)).toBe(false);
        expect(inventarisVoorPrompt([...APPARATEN, mes])).not.toContain('Miyabi');
    });

    it('houdt een gekoelde werkbank er wél in', () => {
        /* Die kan ook koelen, en daar hang je wel degelijk een taak aan. */
        const koelbank: ApparaatMetKundes = {
            ...inductie, id: 41, naam: 'Inomak gekoelde productiewerkbank',
            kundes: ['koeling', 'werkbank'], temp_min_c: 1, temp_max_c: 10,
        };
        expect(isPlanbaar(koelbank)).toBe(true);
        expect(inventarisVoorPrompt([koelbank])).toContain('Inomak');
    });
});

describe('openstaandeVragen — wat de kok nog moet beslissen', () => {
    it('een stap die op de meter eindigt blokkeert niets meer', () => {
        /* Hoe lang 2,5 kg procureur over kern 70 doet weet je pas als je het
           gemeten hebt. Daar een getal voor vragen is om een gok vragen. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 8,
                stappen: [{ volgnummer: 1, tekst: 'Roken tot kern 70 °C', materieelId: 21, tempC: 110, kernTempC: 70 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].duurOnbekend).toBe(true);
        expect(openstaandeVragen(uit)).toHaveLength(0);
        expect(magOpslaan(uit).mag).toBe(true);
    });

    it('een onhaalbare temperatuur blokkeert nog steeds', () => {
        /* 300 °C haalt de YS1500s niet, en dat is geen kwestie van meten. */
        const teHeet: Voorstel = {
            gerechtNaam: 'Test', porties: 8,
            stappen: [{ volgnummer: 1, tekst: 'Afgrillen', materieelId: 21, tempC: 300, actiefMin: 5 }],
        };
        const uit = controleer(teHeet, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toHaveLength(1);
    });

    it('overslaan is net zo goed een antwoord als aanmaken', () => {
        const metComponent: Voorstel = {
            gerechtNaam: 'Test', porties: 8,
            componenten: [{ naam: 'Sherry glaze' }],
            stappen: [{ volgnummer: 1, tekst: 'Glazuur erover', actiefMin: 2 }],
        };
        const uit = controleer(metComponent, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toHaveLength(1);
        expect(openstaandeVragen(uit, { componenten: ['Sherry glaze'] })).toHaveLength(0);
        expect(openstaandeVragen(uit, { componentenOvergeslagen: ['Sherry glaze'] })).toHaveLength(0);
    });

    it('een keuze van de AI telt pas als er een van zijn eigen opties is gekozen', () => {
        const metKeuze: Voorstel = {
            gerechtNaam: 'Test', porties: 8,
            stappen: [{ volgnummer: 1, tekst: 'Roken', materieelId: 21, passiefMin: 240 }],
            keuzes: [{ vraag: 'Welke pellets?', opties: ['kersen', 'hickory'] }],
        };
        const uit = controleer(metKeuze, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toEqual(['Welke pellets?']);
        expect(openstaandeVragen(uit, { keuzes: { 'Welke pellets?': 'appel' } })).toHaveLength(1);
        expect(openstaandeVragen(uit, { keuzes: { 'Welke pellets?': 'kersen' } })).toHaveLength(0);
    });

    it('een herhaling die niet past is met een duur per keer op te lossen', () => {
        /* Het model las "elk half uur natspuiten" als 150 minuten werk per keer.
           Zonder een veld hiervoor liep dat recept muurvast: de controle zag
           terecht dat het niet kon, en er was geen plek om het recht te zetten. */
        const spuiten: Voorstel = {
            gerechtNaam: 'Oerham', porties: 4,
            stappen: [{
                volgnummer: 1, tekst: 'Garen en elk half uur natspuiten',
                materieelId: 21, passiefMin: 150, herhaalIntervalMin: 30, herhaalDuurMin: 150,
            }],
        };
        const uit = controleer(spuiten, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toHaveLength(1);
        /* Eén minuut spuiten past wél in een half uur. */
        expect(openstaandeVragen(uit, { herhaalDuren: { 1: 1 } })).toHaveLength(0);
        /* Veertig minuten nog steeds niet — dat is geen tussendoortje. */
        expect(openstaandeVragen(uit, { herhaalDuren: { 1: 40 } })).toHaveLength(1);
    });

    it('de kok mag een oordeel overrulen, maar moet het wel zeggen', () => {
        /* Een te hoge temperatuur is geen rekenfout maar een oordeel, en dat
           oordeel is van de kok. Zonder uitweg blijft de stap eeuwig open. */
        const teHeet: Voorstel = {
            gerechtNaam: 'Test', porties: 8,
            stappen: [{ volgnummer: 1, tekst: 'Afgrillen', materieelId: 21, tempC: 300, actiefMin: 5 }],
        };
        const uit = controleer(teHeet, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toHaveLength(1);
        expect(openstaandeVragen(uit, { akkoordOndanks: [1] })).toHaveLength(0);
    });

    it('een leeg recept mag nooit door', () => {
        const leeg = controleer({ gerechtNaam: 'Niets', porties: 4, stappen: [] }, { apparaten: APPARATEN });
        expect(magOpslaan(leeg, { componenten: [] }).mag).toBe(false);
    });
});

describe('porties — nooit stilzwijgend tien', () => {
    /* "Voor circa 1,5 kg" is geen aantal personen. Het boek zegt het niet, dus
       vraagt het systeem het — want hier hangt de kostprijs per portie aan. */
    const ZONDER_PORTIES: Voorstel = {
        gerechtNaam: 'Terrine',
        stappen: [{ volgnummer: 1, tekst: 'Pullen', actiefMin: 10 }],
    };

    it('vraagt het aantal als het recept het niet noemt', () => {
        const uit = controleer(ZONDER_PORTIES, { apparaten: APPARATEN });
        expect(uit.porties).toBeNull();
        expect(openstaandeVragen(uit)).toEqual(['Voor hoeveel porties is dit recept?']);
        expect(openstaandeVragen(uit, { porties: 12 })).toHaveLength(0);
        expect(openstaandeVragen(uit, { porties: 0 })).toHaveLength(1);
    });

    it('vraagt niet als het er wél staat', () => {
        const uit = controleer({ ...ZONDER_PORTIES, porties: 8 }, { apparaten: APPARATEN });
        expect(openstaandeVragen(uit)).toHaveLength(0);
    });
});

describe('twee soorten temperatuur', () => {
    /* Drie recepten op rij zetten de kerntemperatuur van het vlees en de
       temperatuur van de smoker in hetzelfde veld. Dat is geen detail: de een
       is een instelling, de ander een eindconditie. */

    it('toetst het apparaatbereik op de omgeving, niet op de kern', () => {
        /* Roken op 110 met kern 70: de YS1500s haalt 65–260, dus dit kan. Wie
           op de kern zou toetsen ziet 70 en denkt dat het ook kan — maar bij
           een kern van 52 (rosé) zou hij ten onrechte alarm slaan. */
        const rosé: Voorstel = {
            gerechtNaam: 'Hertenbiefstuk', porties: 8,
            stappen: [{
                volgnummer: 1, tekst: 'Roken tot kern 52 °C',
                materieelId: 21, tempC: 110, kernTempC: 52, passiefMin: 90,
            }],
        };
        const uit = controleer(rosé, { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(uit.stappen[0].kernTempC).toBe(52);
    });

    it('vraagt door als alleen de kern bekend is', () => {
        /* "Tot kern 88 °C" zegt niet waarop de smoker moet staan, en zonder dat
           getal kan niemand hem aanzetten. */
        const zonderPit: Voorstel = {
            gerechtNaam: 'Terrine', porties: 15,
            stappen: [{ volgnummer: 1, tekst: 'Doorgaren tot kern 88 °C', materieelId: 21, kernTempC: 88 }],
        };
        const uit = controleer(zonderPit, { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('welke temperatuur');
    });

    it('slaat nog steeds alarm als de omgevingstemperatuur niet haalbaar is', () => {
        const teHeet: Voorstel = {
            gerechtNaam: 'Test', porties: 4,
            stappen: [{ volgnummer: 1, tekst: 'Afgrillen', materieelId: 21, tempC: 300, kernTempC: 55, actiefMin: 5 }],
        };
        const uit = controleer(teHeet, { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('300');
    });
});

describe('componenten uit hetzelfde boek zijn één component', () => {
    it('ziet door de paginaverwijzing heen', () => {
        /* Het ene recept schrijft "(zie blz. 29)", het andere "(blz. 28)".
           Zonder normalisatie maakt elk recept zijn eigen Piggy Mix aan, en bij
           duizend recepten heb je er tien zonder kostprijs. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                componenten: [{ naam: "Smokey's Pig Spray (blz. 28)" }, { naam: 'Piggy Mix BBQ-kruiden (zie blz. 27)' }],
                stappen: [{ volgnummer: 1, tekst: 'Insprayen', actiefMin: 2 }],
            },
            { apparaten: APPARATEN, bekendeComponenten: ["Smokey's Pig Spray"] },
        );
        expect(uit.ontbrekendeComponenten).toEqual(['Piggy Mix BBQ-kruiden']);
    });

    it('vangt ook een omslachtige verwijzing', () => {
        /* "Chick Mix BBQ-kruiden (zie blz. 27 — verwijzing naar apart recept)"
           kwam uit de chicken sandwich en ontsnapte aan de eerste opschoning. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                componenten: [{ naam: 'Chick Mix BBQ-kruiden (zie blz. 27 — verwijzing naar apart recept)' }],
                stappen: [{ volgnummer: 1, tekst: 'Kruiden', actiefMin: 2 }],
            },
            { apparaten: APPARATEN, bekendeComponenten: ['Chick Mix BBQ-kruiden'] },
        );
        expect(uit.ontbrekendeComponenten).toEqual([]);
    });

    it('noemt hetzelfde onderdeel niet twee keer', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                componenten: [{ naam: 'Piggy Mix (blz. 27)' }, { naam: 'Piggy Mix' }],
                stappen: [{ volgnummer: 1, tekst: 'Kruiden', actiefMin: 2 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.ontbrekendeComponenten).toEqual(['Piggy Mix']);
    });
});

describe('een rustplek is geen oven', () => {
    it('vraagt niet op welke stand je de transportwagen zet', () => {
        /* "Afhalen bij kern 87 °C en een kwartier laten rusten" op de Cambro:
           die 87 is waar het vlees vandaan kwam, niet iets wat de wagen haalt. */
        const cambro: ApparaatMetKundes = {
            ...inductie, id: 49, naam: 'Cambro Ultra Camcart', kundes: ['koelbox'],
        };
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 8,
                stappen: [{ volgnummer: 1, tekst: 'Een kwartier laten rusten', materieelId: 49, kernTempC: 87, passiefMin: 15 }],
            },
            { apparaten: [...APPARATEN, cambro] },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });
});

describe('een beslissing hoort maar één keer op de lijst', () => {
    /* De porchetta: de AI vroeg zelf welke pittemperatuur, en daarna vroeg de
       controle het nog een keer omdat het veld leeg was. */
    const PORCHETTA: Voorstel = {
        gerechtNaam: 'Porchetta', porties: 12,
        stappen: [{
            volgnummer: 1, tekst: 'Indirect garen tot kern 64 °C',
            materieelId: 21, kernTempC: 64, passiefMin: 300,
            wachtOpKeuze: 'Welke pittemperatuur op de Yoder?',
        }],
        keuzes: [{ vraag: 'Welke pittemperatuur op de Yoder?', opties: ['130 °C', '150 °C', '175 °C'] }],
    };

    it('zwijgt over een stap die op een gestelde keuze wacht', () => {
        const uit = controleer(PORCHETTA, { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('akkoord');
        expect(openstaandeVragen(uit)).toEqual(['Welke pittemperatuur op de Yoder?']);
    });

    it('trapt er niet in als die keuze helemaal niet gesteld is', () => {
        /* Een verwijzing naar een vraag die nergens staat is geen antwoord. */
        const uit = controleer({ ...PORCHETTA, keuzes: [] }, { apparaten: APPARATEN });
        expect(uit.stappen[0].oordeel).toBe('vraag');
    });
});

describe('lange wachttijden horen gewoon in minuten', () => {
    /* De spiced maple bacon: zeven dagen pekelen en twee dagen drogen kwamen
       allebei terug zonder duur. Juist die stappen bepalen wanneer je moet
       beginnen — een gerecht met negen dagen voorwerk plan je niet op vrijdag
       voor zaterdag. */
    it('rekent een week pekelen mee in de doorlooptijd', () => {
        const bacon: Voorstel = {
            gerechtNaam: 'Spiced maple bacon', porties: 20,
            stappen: [
                { volgnummer: 1, tekst: 'Zeven dagen pekelen, elke dag omdraaien', passiefMin: 10080, herhaalIntervalMin: 1440, herhaalDuurMin: 2 },
                { volgnummer: 2, tekst: 'Twee dagen drogen in de koeling', passiefMin: 2880 },
            ],
        };
        const uit = controleer(bacon, { apparaten: APPARATEN });
        expect(uit.samenvatting.passiefMin).toBe(12960);
        expect(uit.stappen.every((s) => s.oordeel === 'akkoord')).toBe(true);
        expect(openstaandeVragen(uit)).toHaveLength(0);
    });
});

describe('een kerntemperatuur in de zin telt ook', () => {
    it('haalt het getal uit de eigen staptekst', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Burger', porties: 4,
                stappen: [{ volgnummer: 1, tekst: 'Burgers grillen tot een kerntemperatuur van 65 °C', materieelId: 1, tempC: 250, actiefMin: 8 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].kernTempC).toBe(65);
    });

    it('blijft eraf bij twee temperaturen in één zin', () => {
        /* "54 °C medium rare of 60 °C medium" is een aftakking; daar beslist
           de kok, niet een reguliere expressie. */
        const uit = controleer(
            {
                gerechtNaam: 'Burger', porties: 4,
                stappen: [{ volgnummer: 1, tekst: 'Grillen tot kern 54 °C (medium rare) of kern 60 °C (medium)', materieelId: 1, tempC: 250, actiefMin: 8 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].kernTempC).toBeUndefined();
    });

    it('haalt ook de apparaatstand uit de zin, zonder de kern te verwarren', () => {
        /* "Direct grillen op circa 250 °C tot een kerntemperatuur van 65 °C":
           twee getallen, twee velden, allebei uit dezelfde zin. */
        const uit = controleer(
            {
                gerechtNaam: 'Burger', porties: 4,
                stappen: [{ volgnummer: 1, tekst: 'Varkensburgers direct grillen op circa 250 °C tot een kerntemperatuur van 65 °C', materieelId: 1, actiefMin: 10 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].tempC).toBe(250);
        expect(uit.stappen[0].kernTempC).toBe(65);
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });

    it('laat een ovenstand met rust', () => {
        /* 180 °C is geen kern; dat getal moet niet in het kernveld belanden. */
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                stappen: [{ volgnummer: 1, tekst: 'Afbakken op 180 °C', materieelId: 21, tempC: 180, actiefMin: 5 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].kernTempC).toBeUndefined();
    });
});

describe('een toestel houdt zijn stand vast', () => {
    it('erft de temperatuur van een eerdere stap op hetzelfde toestel', () => {
        /* De porchetta: de 150 °C stond bij het erop leggen, en drie stappen
           later vroeg de controle opnieuw op welke stand de Yoder moest. */
        const uit = controleer(
            {
                gerechtNaam: 'Porchetta', porties: 12,
                stappen: [
                    { volgnummer: 1, tekst: 'Porchetta op de grill leggen', materieelId: 21, tempC: 150, passiefMin: 300 },
                    { volgnummer: 2, tekst: 'Inpakken in folie en doorgaren tot kern 64 °C', materieelId: 21 },
                ],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[1].tempC).toBe(150);
        expect(uit.stappen[1].oordeel).toBe('akkoord');
    });

    it('erft niet over een ánder toestel heen', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                stappen: [
                    { volgnummer: 1, tekst: 'Roken', materieelId: 21, tempC: 110, passiefMin: 120 },
                    { volgnummer: 2, tekst: 'Afgrillen tot kern 60 °C', materieelId: 1 },
                ],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[1].tempC).toBeUndefined();
    });

    it('een latere wijziging wint van de eerdere stand', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Test', porties: 4,
                stappen: [
                    { volgnummer: 1, tekst: 'Roken op 110 °C', materieelId: 21, tempC: 110, passiefMin: 120 },
                    { volgnummer: 2, tekst: 'Opstoken naar 220 °C en afgrillen', materieelId: 21, tempC: 220, actiefMin: 10 },
                    { volgnummer: 3, tekst: 'Nog even doorgrillen', materieelId: 21, actiefMin: 3 },
                ],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[2].tempC).toBe(220);
    });
});

describe('een beantwoorde keuze belandt in de stap', () => {
    /* Zonder dit bewaarde het gerecht netjes "150 °C" als beslissing en had het
       tegelijk een stap zonder temperatuur — het antwoord stond dan wel in de
       database maar niet waar de planner kijkt. */
    const PORCHETTA: Voorstel = {
        gerechtNaam: 'Porchetta', porties: 12,
        stappen: [{
            volgnummer: 1, tekst: 'Indirect garen tot kern 64 °C',
            materieelId: 21, kernTempC: 64, passiefMin: 300,
            wachtOpKeuze: 'Op welke grilltemperatuur?',
        }],
        keuzes: [{
            vraag: 'Op welke grilltemperatuur?',
            opties: ['150 °C indirect — circa 5 à 6 uur tot 64 °C', '130 °C indirect — langzamer'],
        }],
    };

    it('pakt de waarde vooraan uit de gekozen optie', () => {
        expect(temperatuurUitKeuze('150 °C indirect — circa 5 à 6 uur tot 64 °C')).toBe(150);
        expect(temperatuurUitKeuze('Niet draaien, stil laten liggen')).toBeNull();
    });

    it('zet die temperatuur in de stap die erop wachtte', () => {
        const uit = controleer(PORCHETTA, { apparaten: APPARATEN });
        expect(uit.stappen[0].tempC).toBeUndefined();

        const verwerkt = metKeuzesVerwerkt(uit, {
            keuzes: { 'Op welke grilltemperatuur?': '150 °C indirect — circa 5 à 6 uur tot 64 °C' },
        });
        expect(verwerkt[0].tempC).toBe(150);
        expect(verwerkt[0].kernTempC).toBe(64);
    });

    it('laat een stap met een eigen temperatuur met rust', () => {
        const metEigen = controleer(
            { ...PORCHETTA, stappen: [{ ...PORCHETTA.stappen[0], tempC: 175 }] },
            { apparaten: APPARATEN },
        );
        const verwerkt = metKeuzesVerwerkt(metEigen, {
            keuzes: { 'Op welke grilltemperatuur?': '150 °C indirect — circa 5 à 6 uur tot 64 °C' },
        });
        expect(verwerkt[0].tempC).toBe(175);
    });

    it('doet niets zolang er niet gekozen is', () => {
        const uit = controleer(PORCHETTA, { apparaten: APPARATEN });
        expect(metKeuzesVerwerkt(uit)[0].tempC).toBeUndefined();
    });
});

describe('een receptuur kan uit delen bestaan', () => {
    /* Mathijs, 9 sep: "recepturen moeten uit delen KUNNEN bestaan — stel ik ga
       pulled pork maken en het kruiden mengen kost 10 min, dan kan dat ook
       eerder." Zolang die stap aan het gerecht hangt kan de planner hem niet
       vooruittrekken; aan de bouwsteen wel. */
    const MET_DEEL: Voorstel = {
        gerechtNaam: 'Pulled pork', porties: 20,
        componenten: [{ naam: 'Piggy Mix BBQ-kruiden (zie blz. 27)' }],
        stappen: [
            { volgnummer: 1, tekst: 'Specerijen afwegen en mengen', actiefMin: 10, voorComponent: 'Piggy Mix BBQ-kruiden (zie blz. 27)' },
            { volgnummer: 2, tekst: 'Schouder inwrijven met de kruiden', actiefMin: 5 },
        ],
    };

    it('houdt de deelstappen los van het gerecht', () => {
        const uit = controleer(MET_DEEL, { apparaten: APPARATEN });
        expect(uit.stappen[0].voorComponent).toBe('Piggy Mix BBQ-kruiden');
        expect(uit.stappen[1].voorComponent).toBeNull();
        expect(uit.stappen.every((s) => s.oordeel === 'akkoord')).toBe(true);
    });

    it('vraagt door als de stap naar een onderdeel wijst dat nergens staat', () => {
        /* Anders belandt die stap nergens: niet bij het gerecht en niet bij de
           bouwsteen. */
        const uit = controleer(
            { ...MET_DEEL, componenten: [] },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('vraag');
        expect(uit.stappen[0].bezwaar).toContain('staat niet bij de onderdelen');
    });

    it('herkent het onderdeel ook als het anders geciteerd is', () => {
        const uit = controleer(
            { ...MET_DEEL, componenten: [{ naam: 'Piggy Mix BBQ-kruiden' }] },
            { apparaten: APPARATEN },
        );
        expect(uit.stappen[0].oordeel).toBe('akkoord');
    });
});

describe('twee recepten op één pagina', () => {
    /* De Italiaanse kookboeken zetten er standaard twee op een bladzij. De lezer
       werkt er één uit en noemt de ander, zodat de kok hem met één klik alsnog
       kan laten lezen zonder opnieuw te fotograferen. */
    it('geeft de naam van het andere recept door', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Gehaktballen in bier', porties: 4,
                anderRecept: 'Gesmoord rundvlees met uien',
                stappen: [{ volgnummer: 1, tekst: 'Balletjes draaien', actiefMin: 10 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.anderRecept).toBe('Gesmoord rundvlees met uien');
        /* Het is geen openstaande beslissing: opslaan mag gewoon. */
        expect(openstaandeVragen(uit)).toHaveLength(0);
    });

    it('is leeg als er maar één recept staat', () => {
        const uit = controleer(
            {
                gerechtNaam: 'Alleen dit', porties: 4,
                anderRecept: '  ',
                stappen: [{ volgnummer: 1, tekst: 'Iets doen', actiefMin: 5 }],
            },
            { apparaten: APPARATEN },
        );
        expect(uit.anderRecept).toBeNull();
    });
});
