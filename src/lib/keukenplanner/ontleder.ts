/**
 * De ontleder — van een receptfoto naar een Hop & Bites-receptuur.
 *
 * **Wie doet wat, en waarom die grens daar ligt.**
 *
 * De eerste versie liet code het apparaat kiezen op grond van patronen in de
 * recepttekst. Dat werkt bij "bereid een BBQ voor op indirect grillen" en
 * breekt bij "leg het vlees op de kamado en gooi er een rookhoutchunk in" —
 * dan moet je elke formulering gaan opsommen die een kok kan bedenken. Dat is
 * precies waar patroonherkenning slecht in is.
 *
 * Dus:
 *
 *   **De AI vertaalt.** Hij krijgt de inventaris te zien en zet het recept om
 *   naar hoe het hier gemaakt wordt. Een saus gaat in een pan op de inductie,
 *   niet "op het vuur". Een chunk in de kamado bestaat hier niet. Hetzelfde
 *   gerecht, dezelfde kwaliteit, andere machines.
 *
 *   **De code controleert.** Bestaat dat apparaat? Haalt het die temperatuur?
 *   Staat er een duur bij of wordt er iets verzonnen? Mag dit opgeslagen
 *   worden? Harde vragen met harde antwoorden — daar is code goed in.
 *
 * Deze module is die controle. Puur, testbaar, geen netwerk. Wat er niet
 * doorheen komt, wordt een vraag aan de kok en geen stille aanname.
 */

import { leesBereidingswijze } from './apparaatKeuze';
import type { ApparaatMetKundes } from './estafette';

/** Eén stap zoals de AI hem voorstelt, al vertaald naar deze keuken. */
export interface VoorstelStap {
    volgnummer: number;
    /** De handeling in chef-taal, één zin. */
    tekst: string;
    /** Genormaliseerd werkwoord, waarop gebatcht wordt. */
    bewerking?: string | null;
    hoeveelheid?: number | null;
    eenheid?: string | null;
    /** Minuten waarin de kok bezig is. Leeg = stond niet in het recept. */
    actiefMin?: number | null;
    /** Minuten wachten. Leeg = stond niet in het recept. */
    passiefMin?: number | null;
    /** Temperatuur van de omgeving: de smoker op 115, de oven op 180. */
    tempC?: number | null;
    /**
     * Kerntemperatuur van het product waarbij de stap klaar is.
     *
     * Dit is de eindconditie, niet een instelling. Staat hij gevuld, dan eindigt
     * de stap op de meter en niet op de klok — en dan is de duur ernaast een
     * schatting van hoe lang dat duurt, geen afspraak.
     */
    kernTempC?: number | null;
    /** Welk toestel de AI hiervoor koos, uit de meegegeven inventaris. */
    materieelId?: number | null;
    /** Waarom dat toestel. Komt op de goedkeur-lade. */
    apparaatReden?: string | null;
    /** Andere toestellen die ook kunnen — dan mag de kok kiezen. */
    alternatieven?: Array<{ materieelId: number; label: string }>;
    /** Elke zoveel minuten iets doen: natspuiten, draaien. */
    herhaalIntervalMin?: number | null;
    herhaalDuurMin?: number | null;
    /** Moet de kok erbij blijven? */
    toezichtNodig?: boolean | null;
    hangtAfVanVolgnummer?: number | null;
    /** Wat er in het boek stond en hier niet meer geldt. Alleen ter uitleg. */
    vervangenDoor?: string | null;
    /**
     * Deze stap wacht op een keuze die hierboven al gesteld is.
     *
     * Zonder dit veld vraagt de controle nóg een keer wat de AI zelf al netjes
     * had voorgelegd: bij de porchetta stond "welke pittemperatuur?" als keuze
     * én als bezwaar bij de stap. Twee regels voor één beslissing, en dan raakt
     * de lijst vol met dingen die al beantwoord worden.
     */
    wachtOpKeuze?: string | null;
}

export interface VoorstelComponent {
    naam: string;
    /** Verwijst het recept naar een ander recept ("zie blz. 22")? */
    isVerwijzing?: boolean;
}

/** Wat de AI teruggeeft na het lezen van de foto's. */
export interface Voorstel {
    gerechtNaam: string;
    porties?: number | null;
    componenten?: VoorstelComponent[];
    stappen: VoorstelStap[];
    /** Stappen uit het boek die hier vervallen, met de reden. */
    vervallen?: Array<{ tekst: string; reden: string }>;
    /** Waar de AI zelf niet uit kwam. Wordt letterlijk een vraag aan de kok. */
    keuzes?: Array<{ vraag: string; opties: string[] }>;
}

export type StapOordeel = 'akkoord' | 'vraag';

export interface GecontroleerdeStap extends VoorstelStap {
    oordeel: StapOordeel;
    /** Alleen gevuld bij een vraag: wat er niet klopt. */
    bezwaar?: string | null;
    materieelNaam?: string | null;
    /**
     * Geen tijd in het recept, en ook niet nodig om de dag te kunnen plannen.
     * Wordt getoond, telt niet mee in het gatenvullen, en gaat vanzelf goed
     * zodra hij een paar keer gemeten is.
     */
    duurOnbekend?: boolean;
    /** Duur komt uit een boek, niet uit een meting. Altijd. */
    duurBron: 'geschat';
}

export interface Controle {
    gerechtNaam: string;
    porties: number | null;
    stappen: GecontroleerdeStap[];
    vervallen: Array<{ tekst: string; reden: string }>;
    ontbrekendeComponenten: string[];
    /** Waar de AI zelf niet uitkwam. Elk hiervan wordt een keuze op de lade. */
    keuzes: Array<{ vraag: string; opties: string[] }>;
    /** Alles wat de kok moet beslissen voordat dit opgeslagen mag worden. */
    vragen: string[];
    samenvatting: { actiefMin: number; passiefMin: number; stappen: number; zonderTijd: number };
}

export interface ControleContext {
    apparaten: ApparaatMetKundes[];
    /** Componenten die al bestaan, op naam. */
    bekendeComponenten?: string[];
}

/**
 * Controleer het voorstel van de AI tegen de werkelijke keuken.
 *
 * Vijf harde toetsen. Elke toets die faalt wordt een vraag — nooit een stille
 * correctie, want dan leert niemand er iets van en klopt het de volgende keer
 * weer niet.
 */
/**
 * Componentnaam zonder de verwijzing naar het boek.
 *
 * "Smokey's Pig Spray (zie blz. 29)" en "Smokey's Pig Spray (blz. 28)" zijn
 * hetzelfde spul uit hetzelfde boek, alleen anders geciteerd. Zonder deze
 * normalisatie maakt elk recept zijn eigen kopie aan, en bij duizend recepten
 * heb je dan tien Piggy Mixen die geen van alle een kostprijs hebben.
 */
export function normaliseerComponentnaam(naam: string): string {
    /* Elke afsluitende haakjes-zin die naar het boek verwijst gaat eraf, hoe
       omslachtig ook geformuleerd: "(zie blz. 27)" net zo goed als
       "(zie blz. 27 — verwijzing naar apart recept)". */
    const zonder = naam.replace(/\s*\([^()]*\b(?:blz|bladzijde|pagina|p)\b[^()]*\)\s*$/i, '').trim();
    return (zonder || naam).trim();
}

/**
 * Hoe een kerntemperatuur in een zin geschreven kan staan.
 *
 * Twee volgordes, want een kok schrijft ze allebei: "tot kern 88 °C" en
 * "tot minimaal 64 °C kerntemperatuur". Alleen de eerste herkennen liet die 64
 * doorlekken naar het apparaatveld, en dan meldt de controle dat de Yoder geen
 * 64 °C haalt terwijl dat de temperatuur van het vlees is.
 */
const KERN_PATROON = /\bkern(?:temperatuur)?\s*(?:van\s*|heeft bereikt van\s*|bereikt van\s*)?(\d{2,3})\s*°?\s*C|(\d{2,3})\s*°?\s*C\s*kern(?:temperatuur)?\b/gi;

/**
 * Kerntemperatuur uit de eigen staptekst vissen.
 *
 * "Grillen tot een kerntemperatuur van 65 °C" met een leeg kernTempC-veld kwam
 * in twee van de elf proefrecepten voor: het getal staat er, het veld niet. Dat
 * is geen oordeel en geen schatting — het is overtypen uit een zin die het
 * model zelf geschreven heeft, en daar is code beter in dan een taalmodel.
 *
 * Alleen bij precies één ondubbelzinnige vermelding. Staan er twee
 * kerntemperaturen in één zin, dan is het een aftakking en beslist de kok.
 */
function kernUitTekst(tekst: string): number | null {
    const treffers = [...tekst.matchAll(KERN_PATROON)].map((m) => m[1] ?? m[2]);
    if (treffers.length !== 1) return null;
    const waarde = Number(treffers[0]);
    /* Buiten dit bereik is het geen kerntemperatuur maar iets anders. */
    return waarde >= 40 && waarde <= 100 ? waarde : null;
}

/**
 * Apparaattemperatuur uit de eigen staptekst vissen.
 *
 * Spiegelbeeld van `kernUitTekst`, en met dezelfde reden: "direct grillen op
 * circa 250 °C tot een kerntemperatuur van 65 °C" met een leeg tempC-veld
 * leverde de vraag op welke stand de grill moest krijgen — terwijl het antwoord
 * in diezelfde zin stond.
 *
 * De kernvermeldingen worden er eerst uitgeknipt, anders leest hij de 65 als
 * de stand van de grill.
 */
function omgevingUitTekst(tekst: string): number | null {
    const zonderKern = tekst.replace(new RegExp(KERN_PATROON.source, 'gi'), ' ');
    const treffers = [...zonderKern.matchAll(/(\d{2,3})\s*°\s*C/g)];
    if (treffers.length !== 1) return null;
    const waarde = Number(treffers[0][1]);
    return waarde >= 40 && waarde <= 300 ? waarde : null;
}

export function controleer(voorstel: Voorstel, context: ControleContext): Controle {
    const perId = new Map(context.apparaten.map((a) => [a.id, a]));
    const bekend = new Set(
        (context.bekendeComponenten ?? []).map((n) => normaliseerComponentnaam(n).toLowerCase()),
    );
    const vragen: string[] = [];

    /* Op welke stand elk toestel staat, terwijl we door het recept lopen.
    
       Een smoker die op 115 °C is gezet blijft op 115 °C tot iemand hem
       verdraait. Het recept schrijft dat één keer op en gaat verder — maar bij
       de porchetta stond de temperatuur alleen bij het erop leggen, en toen
       vroeg de controle bij het inpakken opnieuw op welke stand de Yoder moest.
       Dezelfde vraag, hetzelfde toestel, drie regels verderop. */
    const standVan = new Map<number, number>();

    const stappen: GecontroleerdeStap[] = voorstel.stappen.map((rauw) => {
        /* Wat het model in zijn eigen zin schreef maar niet in het veld zette. */
        const kern = rauw.kernTempC ?? kernUitTekst(rauw.tekst) ?? undefined;
        const omgeving = omgevingUitTekst(rauw.tekst);
        /* Eén getal in de zin is één temperatuur. Belandt dezelfde waarde in
           allebei de velden, dan is het twee keer hetzelfde gelezen. */
        const eigenTemp = rauw.tempC ?? (omgeving != null && omgeving !== kern ? omgeving : undefined);
        const erfelijk = rauw.materieelId != null ? standVan.get(rauw.materieelId) : undefined;

        if (eigenTemp != null && rauw.materieelId != null) standVan.set(rauw.materieelId, eigenTemp);

        const s: VoorstelStap = {
            ...rauw,
            kernTempC: kern,
            tempC: eigenTemp ?? erfelijk,
        };
        const basis = { ...s, duurBron: 'geschat' as const };
        const apparaat = s.materieelId != null ? perId.get(s.materieelId) : undefined;

        /* 1 — Bestaat het gekozen toestel? Een id dat nergens op slaat is
               erger dan geen keuze: het ziet er ingevuld uit. */
        if (s.materieelId != null && !apparaat) {
            return vraag(basis, `Apparaat ${s.materieelId} staat niet in het materieel — welk toestel wordt dit?`);
        }

        /* Wacht deze stap op een keuze die de kok toch al voorgelegd krijgt?
           Dan is een bezwaar dubbelop — de beslissing staat al op de lade. */
        const wachtOpKeuze = s.wachtOpKeuze != null
            && (voorstel.keuzes ?? []).some((k) => k.vraag === s.wachtOpKeuze);

        /* 2 — Haalt dat toestel de gevraagde temperatuur? Een onbekend bereik
               is geen bezwaar; een bereik dat het niet haalt wel.
        
               Let op wélke temperatuur: `tempC` is wat het apparaat aanhoudt en
               dat toetsen we. `kernTempC` is de temperatuur van het vlees en
               heeft niets met het bereik van de smoker te maken — die is bijna
               altijd lager, en zou vals alarm geven. */
        if (apparaat && s.tempC != null) {
            const onder = apparaat.temp_min_c != null && s.tempC < apparaat.temp_min_c;
            const boven = apparaat.temp_max_c != null && s.tempC > apparaat.temp_max_c;
            if (onder || boven) {
                return vraag(
                    basis,
                    `${apparaat.naam} houdt ${apparaat.temp_min_c ?? '?'}–${apparaat.temp_max_c ?? '?'} °C en deze stap vraagt ${s.tempC} °C`,
                );
            }
        }

        /* 2c — Tweede mening. De tekst wordt niet gebruikt om te beslissen —
               daar is de AI beter in — maar als de tekst overduidelijk iets
               anders zegt dan het gekozen toestel, is dat het melden waard.
               Alleen bij een echte botsing, niet bij twijfel.
        
               Dit gaat vóór de vragen over temperatuur en duur: staat de stap
               op het verkeerde toestel, dan is het zinloos om te vragen op
               welke stand dat toestel moet. */
        const uitTekst = leesBereidingswijze(s.tekst);
        if (apparaat && uitTekst != null) {
            const wilRoken = uitTekst === 'roken' || uitTekst === 'indirect';
            if (wilRoken && !apparaat.kundes.includes('smoker')) {
                return vraag(basis, `De stap leest als rookwerk maar staat op ${apparaat.naam} — klopt dat?`);
            }
        }

        /* 2b — Een kerntemperatuur zonder omgevingstemperatuur. Dat de stap op
                de meter eindigt is prima, maar dan moet er wél staan waarop het
                apparaat gezet wordt — anders kun je hem niet eens aanzetten.
                Deze vraag gaat vóór de duur-vraag: een onbekende duur meet je
                vanzelf, een onbekende instelling niet. */
        if (!wachtOpKeuze && s.kernTempC != null && s.tempC == null && apparaat != null && kanVerwarmen(apparaat)) {
            return vraag(basis, `Klaar bij kern ${s.kernTempC} °C — maar op welke temperatuur zet je de ${apparaat.naam}?`);
        }

        /* 3 — Ontbrekende duur: wel merken, niet altijd vragen.
        
               Een kookboek zet nooit een tijd bij "bestrooi met zout en peper",
               en daar hoort ook geen vraag bij — dat meet het systeem vanzelf
               zodra je het een paar keer doet. Vraag alleen naar een duur als
               het antwoord de dag verandert: bij een stap die een apparaat
               bezet houdt, of bij wachten.
        
               De eerste echte proef gaf 27 vragen waarvan er 20 hierover
               gingen. Een lijst die altijd vol staat wordt niet gelezen, en dan
               is de goedkeuring een klik geworden in plaats van een oordeel. */
        /* Een herhaling die geen duur per keer heeft gaat over die duur, niet
           over bezetting. "Elke 30 minuten besproeien" vroeg eerst hoe lang de
           smoker bezet raakt, en dat is de verkeerde vraag: de smoker staat er
           toch al, het gaat om die ene minuut spuiten. */
        if (s.herhaalIntervalMin != null && (s.herhaalDuurMin ?? null) == null) {
            return vraag(basis, `Er moet elke ${s.herhaalIntervalMin} min iets gebeuren, maar niet hoe lang dat per keer duurt`);
        }

        const duurOnbekend = (s.actiefMin ?? null) == null && (s.passiefMin ?? null) == null;

        /* Hier stond een vraag: "klaar bij kern 88 °C, maar hoe lang duurt dat?"
           Die is eruit, want het antwoord is een gok en gokken is precies wat
           dit systeem niet moet doen. Hoe lang 2,5 kg procureur erover doet
           weet je pas als je het een keer gemeten hebt, en daar is het
           leerspoor voor.
        
           De stap blijft wél zichtbaar als `duurOnbekend`: op het bord staat
           "tijd wordt gemeten", en de planner weet dat hij van deze stap geen
           eindtijd kan beloven. Dat is eerlijker dan een getal dat iemand onder
           druk heeft ingevuld. */

        /* 4 — Een herhaling moet binnen zijn eigen interval passen. Elk half
               uur twintig minuten spuiten is geen tussendoortje maar werk. */
        if (s.herhaalIntervalMin != null && s.herhaalDuurMin != null
            && s.herhaalDuurMin >= s.herhaalIntervalMin) {
            return vraag(basis, `Elke ${s.herhaalIntervalMin} min ${s.herhaalDuurMin} min werk — dat past niet in elkaar`);
        }

        return {
            ...basis,
            oordeel: 'akkoord',
            materieelNaam: apparaat?.naam ?? null,
            bezwaar: null,
            /* Wel zichtbaar op de lade, maar geen blokkade: de planner toont
               hem en laat hem buiten het gatenvullen tot hij gemeten is. */
            duurOnbekend,
        };
    });

    /* Componenten waar het recept naar verwijst en die je nog niet hebt. Die
       moeten eerst bestaan, anders hangt de helft van het recept in de lucht. */
    const ontbrekend = [...new Set(
        (voorstel.componenten ?? [])
            .map((c) => normaliseerComponentnaam(c.naam))
            .filter((naam) => !bekend.has(naam.toLowerCase())),
    )];

    for (const naam of ontbrekend) vragen.push(`"${naam}" bestaat nog niet als component — eerst aanmaken?`);
    for (const k of voorstel.keuzes ?? []) vragen.push(`${k.vraag} (${k.opties.join(' / ')})`);
    for (const s of stappen) if (s.oordeel === 'vraag') vragen.push(`Stap ${s.volgnummer}: ${s.bezwaar}`);

    return {
        gerechtNaam: voorstel.gerechtNaam,
        porties: voorstel.porties ?? null,
        stappen,
        vervallen: voorstel.vervallen ?? [],
        ontbrekendeComponenten: ontbrekend,
        keuzes: voorstel.keuzes ?? [],
        vragen,
        samenvatting: {
            actiefMin: stappen.reduce((a, s) => a + (s.actiefMin ?? 0), 0),
            passiefMin: stappen.reduce((a, s) => a + (s.passiefMin ?? 0), 0),
            stappen: stappen.length,
            /* Eerlijk erbij: hoeveel stappen nog geen tijd hebben. Dat getal
               hoort te dalen naarmate je vaker kookt. */
            zonderTijd: stappen.filter((s) => s.duurOnbekend).length,
        },
    };
}

/**
 * Is dit iets waar je een taak aan kunt hangen?
 *
 * Een mes en een snijplank staan in het materieel — terecht, want ze hebben een
 * vervangingswaarde — maar het zijn geen apparaten die je bezet houdt. Zonder
 * deze zeef hing het model stappen aan de Miyabi Sujihiki, en dan staat er op
 * het wandscherm dat je "op het mes" aan het werk bent.
 *
 * De scheidslijn: iets dat alleen "werkbank" kan is gereedschap. Een gekoelde
 * werkbank kan ook "koeling" en blijft dus wél staan.
 */
export function isPlanbaar(a: ApparaatMetKundes): boolean {
    if (a.kundes.length === 0) return false;
    return !(a.kundes.length === 1 && a.kundes[0] === 'werkbank');
}

/**
 * Kan dit toestel actief verwarmen?
 *
 * Een kerntemperatuur zonder ingestelde apparaattemperatuur is alleen een vraag
 * bij iets dat je op een stand zet. Bij "afhalen bij kern 87 °C en een kwartier
 * laten rusten" op de Cambro vroeg het systeem op welke temperatuur je de
 * transportwagen zet — die 87 was de temperatuur waarbij het vlees eráf kwam,
 * niet iets wat de wagen moet halen.
 */
function kanVerwarmen(a: ApparaatMetKundes): boolean {
    return a.kundes.some((k) => k === 'smoker' || k === 'oven' || k === 'grill' || k === 'fornuis');
}

/**
 * Is dit een apparaat waar de dag op vastloopt als het onbekend lang bezet is?
 *
 * Een smoker die je zonder tijd inplant sloopt je hele middag; een pannetje op
 * de inductie niet. Het onderscheid zit in wat je erin laadt en hoe lang het
 * duurt voor hij bruikbaar is: een toestel met capaciteit, rooster of een
 * serieuze opwarmtijd is een toestel waar je op wacht.
 *
 * Zonder dit onderscheid werd elke stap een vraag — ook "appel schillen op de
 * werkbank" — en dan wordt de goedkeuring een klik in plaats van een oordeel.
 */
function isZwaarApparaat(a: ApparaatMetKundes): boolean {
    /* Capaciteit telt alleen als het een lading is. Een koelwerkbank heeft
       "421 liter" en dat is opslagvolume, geen belading — daar sta je aan te
       werken, je houdt hem niet bezet. Las ik dat als een lading, dan vroeg
       het systeem hoe lang je werkbank bezet is terwijl je vlees droogdept. */
    const ladingInKilos = a.capaciteitWaarde != null && (a.capaciteitEenheid ?? '').toLowerCase().startsWith('kg');
    return ladingInKilos
        || a.kookoppervlakCm2 != null
        || (a.opwarmMin ?? 0) >= 10;
}

function vraag(basis: VoorstelStap & { duurBron: 'geschat' }, bezwaar: string): GecontroleerdeStap {
    return { ...basis, oordeel: 'vraag', bezwaar };
}

/**
 * Wat de kok in de goedkeur-lade heeft ingevuld.
 *
 * Bewust drie losse velden en geen vrije tekst: het scherm en de opslagroute
 * moeten allebei kunnen uitrekenen of er nog iets openstaat, en dat lukt
 * alleen als een antwoord een waarde is en geen zin.
 */
export interface Antwoorden {
    /** Hoe lang de hérhaling per keer duurt: één minuut spuiten, niet het hele uur. */
    herhaalDuren?: Record<number, number>;
    /**
     * Stappen waarvan de kok zegt: het klopt toch.
     *
     * Niet elke twijfel is met een getal op te lossen. Bij "die temperatuur haalt
     * dat toestel niet" of "dit leest als rookwerk maar staat op de inductie" is
     * het antwoord een oordeel, en dat oordeel is van de kok. Zonder deze uitweg
     * blijft zo'n stap eeuwig open staan en kan het recept nooit opgeslagen
     * worden — dat is geen controle meer, dat is een dichte deur.
     */
    akkoordOndanks?: number[];
    /** Componenten die aangemaakt mogen worden, op naam. */
    componenten?: string[];
    /** Componenten die bewust overgeslagen worden. Ook dat is een antwoord. */
    componentenOvergeslagen?: string[];
    /** Gekozen optie per keuze van de AI, op de vraagtekst. */
    keuzes?: Record<string, string>;
    /**
     * Voor hoeveel porties dit recept is.
     *
     * Alleen nodig als het boek het niet zegt — "voor circa 1,5 kg" is geen
     * aantal. Zonder dit getal schreef de opslagroute er stilzwijgend tien in,
     * en dáár hangt straks je kostprijs per portie aan.
     */
    porties?: number | null;
}

/**
 * Wat voor soort vraag is dit, en dus: met wát kun je hem beantwoorden?
 *
 * Het scherm moet weten of het een getalveld moet tonen of een oordeel moet
 * vragen. De eerste versie keek alleen naar duur-vragen, en toen bleek een
 * herhaling die niet paste een stap te zijn die je nooit meer los kreeg.
 */
export type VraagSoort = 'herhaling' | 'oordeel';

export function soortVraag(bezwaar: string | null | undefined): VraagSoort {
    const t = bezwaar ?? '';
    if (t.includes('per keer') || t.includes('past niet in elkaar')) return 'herhaling';
    return 'oordeel';
}

/**
 * Wat er nog beslist moet worden, gegeven wat er al ingevuld is.
 *
 * Deze functie is de enige plek waar die regel staat. Het scherm gebruikt hem
 * om de knop op slot te houden, de opslagroute om te controleren dat er niet
 * langs het scherm heen geschreven wordt — een dichte deur die je via de
 * achterdeur kunt omzeilen is geen deur.
 */
export function openstaandeVragen(controle: Controle, antwoorden: Antwoorden = {}): string[] {
    const aangemaakt = new Set(antwoorden.componenten ?? []);
    const overgeslagen = new Set(antwoorden.componentenOvergeslagen ?? []);
    const keuzes = antwoorden.keuzes ?? {};
    const open: string[] = [];

    if (controle.stappen.length === 0) return ['Geen stappen gevonden in dit recept'];

    if (controle.porties == null && !(typeof antwoorden.porties === 'number' && antwoorden.porties > 0)) {
        open.push('Voor hoeveel porties is dit recept?');
    }

    const herhaal = antwoorden.herhaalDuren ?? {};
    const ondanks = new Set(antwoorden.akkoordOndanks ?? []);

    for (const s of controle.stappen) {
        if (s.oordeel !== 'vraag') continue;
        /* De kok heeft er expliciet ja tegen gezegd. Dat telt. */
        if (ondanks.has(s.volgnummer)) continue;

        /* Bij een herhaling gaat het om de duur pér keer, en die moet binnen
           het interval passen — anders is het geen tussendoortje maar werk. */
        if (soortVraag(s.bezwaar) === 'herhaling') {
            const d = herhaal[s.volgnummer];
            const interval = s.herhaalIntervalMin ?? 0;
            if (typeof d === 'number' && d > 0 && d < interval) continue;
        }

        open.push(`Stap ${s.volgnummer}: ${s.bezwaar}`);
    }

    for (const naam of controle.ontbrekendeComponenten) {
        if (!aangemaakt.has(naam) && !overgeslagen.has(naam)) {
            open.push(`"${naam}" bestaat nog niet als component — eerst aanmaken?`);
        }
    }

    for (const k of controle.keuzes) {
        const gekozen = keuzes[k.vraag];
        if (!gekozen || !k.opties.includes(gekozen)) open.push(k.vraag);
    }

    return open;
}

/**
 * Mag dit opgeslagen worden?
 *
 * Nee zolang er vragen open staan. De ontleder stelt voor, de kok beslist —
 * en een systeem dat zijn eigen voorstel goedkeurt is geen goedkeuring.
 */
export function magOpslaan(controle: Controle, antwoorden: Antwoorden = {}): { mag: boolean; reden: string } {
    const open = openstaandeVragen(controle, antwoorden);
    if (open.length === 0) return { mag: true, reden: 'Klaar om op te slaan' };
    if (controle.stappen.length === 0) return { mag: false, reden: open[0] };
    return { mag: false, reden: `${open.length} ding(en) om eerst te beslissen` };
}

/**
 * De inventaris zoals de AI hem te zien krijgt.
 *
 * Bewust compact en zonder franje: dit gaat elke aanroep mee, dus elk woord
 * telt. En bewust volledig genoeg om écht te kunnen kiezen — een model dat
 * niet weet dat je een inductieplaat hebt, zet je sauzen op de barbecue.
 */
export function inventarisVoorPrompt(apparaten: ApparaatMetKundes[]): string {
    const planbaar = apparaten.filter(isPlanbaar);
    if (planbaar.length === 0) return 'Er staat nog geen apparatuur in het systeem.';

    return planbaar
        .map((a) => {
            const stukken = [`[${a.id}] ${a.naam}`, `kan: ${a.kundes.join(', ') || 'onbekend'}`];
            if (a.temp_min_c != null || a.temp_max_c != null) {
                stukken.push(`${a.temp_min_c ?? '?'}–${a.temp_max_c ?? '?'} °C`);
            }
            if (a.capaciteitWaarde != null) stukken.push(`max ${a.capaciteitWaarde} ${a.capaciteitEenheid ?? ''}`.trim());
            if (a.kookoppervlakCm2 != null) stukken.push(`${a.kookoppervlakCm2} cm² rooster`);
            if (a.opwarmMin != null) stukken.push(`${a.opwarmMin} min opwarmen`);
            return stukken.join(' · ');
        })
        .join('\n');
}

/* ── De prompt en het schema ─────────────────────────────────────
   Hier en niet in de route, zodat de test precies meet wat de route
   straks doet. Twee versies van een prompt is geen prompt. */

export const SYSTEEM = `Je zet kookboekrecepten om naar de werkwijze van Hop & Bites, een Nederlandse BBQ-catering.

Je bent geen transcribent. Je vertaalt: hetzelfde gerecht, dezelfde kwaliteit, gemaakt met de apparatuur die er staat. Een recept dat "leg het op de kamado en gooi er een rookhoutchunk in" zegt, wordt hier een stap op de pelletgrill zonder chunk — die maakt zijn eigen rook. Een saus gaat in een pan op de inductie, niet op de barbecue; het gaat om het vlees.

HARDE REGELS

0. Alle tijden zijn in MINUTEN, ook de lange. Een nacht is 720, een etmaal 1440, zeven dagen pekelen is 10080, negen dagen 12960. Zet nooit "7" omdat het recept dagen zegt en laat het veld ook niet leeg omdat het getal groot wordt — een pekelstap van een week is juist de stap waar de hele planning omheen gebouwd wordt. Datzelfde geldt voor een herhaling: "iedere dag omdraaien" is herhaalIntervalMin 1440.
1. Verzin geen tijden. Staat er geen duur in het recept en kun je hem niet uit de tekst afleiden, laat het veld leeg. Een leeg veld wordt een vraag aan de kok; een verzonnen getal wordt een verkeerde planning die niemand opmerkt.
2. Kies alleen uit de meegegeven apparatuur, met het opgegeven id. Verzin geen apparaat en geen id.
3. Respecteer het temperatuurbereik van een toestel. Past het niet, kies iets anders of stel een vraag.
3a. Noemt een stap een kerntemperatuur, vul dan ALTIJD kernTempC. Niet alleen in de zin schrijven — het veld stuurt wanneer de kok teruggeroepen wordt.
3b. Twee soorten temperatuur, twee velden. \`tempC\` is wat het APPARAAT aanhoudt (smoker op 115, oven op 180, koeling op 4). \`kernTempC\` is de temperatuur van het PRODUCT waarbij de stap klaar is ("tot een kerntemperatuur van 88 °C"). Zet ze nooit in hetzelfde veld: een stap die op kerntemperatuur eindigt eindigt op de meter en niet op de klok, en dat verschil bepaalt of de kok om tien over twee teruggeroepen wordt of pas als het vlees er is. Noemt het recept allebei, vul dan allebei in.
4. Splits actief en passief. Actief = de kok is bezig. Passief = het staat te doen en de kok kan weglopen. Een stap van "1 minuut aanzetten en dan een uur opwarmen" zijn twee stappen, geen één.
5. Wat in het boek staat en hier vervalt, zet je in "vervallen" met de reden. Nooit stilzwijgend weglaten — de kok moet kunnen zien wat er anders ging.
6. Onderdelen die het recept als apart recept behandelt (een pekel, een glaze, een salsa) horen in "componenten". Verwijst het recept naar een ander recept ("zie blz. 22"), zet dan isVerwijzing op true.
6a. De stappenlijst is ÉÉN weg door het recept, niet alle mogelijke wegen. Biedt het boek een aftakking — "gaar tot 80 °C voor plakken, of door tot 87 °C als je hem wilt plukken" — schrijf dan de stappen voor één route (de eerste die het boek noemt) en zet de aftakking in "keuzes", met in de vraag wat er verandert als de kok de andere route kiest. Allebei de routes achter elkaar in de lijst zetten levert een plan op waarin het vlees twee keer gegaard wordt.
6d. De naam van een component is alleen de naam: "Piggy Mix BBQ-kruiden", niet "Piggy Mix BBQ-kruiden (zie blz. 27)" en niet "(verwijzing naar apart recept)". Die naam blijft voor altijd in de bouwstenenlijst staan en moet in elk recept precies hetzelfde geschreven worden, anders krijg je tien keer hetzelfde spul zonder kostprijs.
6c. Een component is iets dat je vóór of tijdens dít gerecht maakt en erin verwerkt. Een bijgerecht dat "lekker is erbij", of een ánder gerecht waar dit gerecht een vulling voor kan zijn, is geen component — die horen bij "vervallen" als serveertip of blijven helemaal weg. Zet nooit iets in "vervallen" als serveersuggestie én in "componenten": dat is twee keer een ander antwoord op dezelfde vraag.
6b. Staat er een instructie die zich herháált — "elk half uur natspuiten", "vanaf het eerste uur elk uur insprayen", "iedere dag omdraaien" — vul dan herhaalIntervalMin én herhaalDuurMin. Het interval is hoe vaak, de duur is hoe lang je er per keer mee bezig bent (bijna altijd één of twee minuten). Laat je die leeg, dan weet de planner niet dat de kok elk uur even terug moet.
7. Weet je iets niet zeker en verandert het antwoord het gerecht — bijvoorbeeld of iets gerookt moet worden — zet het dan in "keuzes" met de opties. Vraag liever dan te gokken.
7b. Leg je een keuze voor die een stap onvolledig laat — een temperatuur die nog gekozen moet worden, een gaarheid die het eindpunt bepaalt — zet dan in die stap "wachtOpKeuze" op de exacte vraagtekst van die keuze. Anders vraagt het systeem er nog een tweede keer naar en staat dezelfde beslissing twee keer op de lijst.
8. Geen allergenen, geen kostprijzen, geen productiehoeveelheden. Die komen ergens anders vandaan.
9. Houd de werkplek consistent. Snijden, mengen en portioneren gebeuren op dezelfde werkbank tenzij het recept een reden geeft om te verkassen. Eén productie die halverwege van de keukenwerkbank naar de aanhanger springt en weer terug is geen vertaling maar een slordigheid, en de planner rekent er looptijd voor.

HOE GROOT IS EEN STAP

Een stap is zo klein als de eenheid die je wilt meten en hergebruiken. Niet kleiner. Een stap verdient een eigen regel als hij minstens één van deze vijf heeft:
- een eigen duur die het waard is om te meten ("8 kg buikspek portioneren")
- een eigen apparaat dat hij bezet houdt
- eigen wachttijd, zodat de kok kan weglopen
- een eigen beslismoment of temperatuurcontrole
- batchbaarheid: het is een bewerking die in andere gerechten terugkomt, zoals ui snipperen of mayonaise aanmaken

Heeft iets geen van die vijf, dan hoort het bij de stap ernaast. "Insmeren met olie en bestrooien met zout en peper" is één stap, geen twee.

WAT NOOIT EEN STAP IS
- Het apparaat opstoken of voorverwarmen. Van elk toestel weet het systeem hoe lang het nodig heeft om op temperatuur te komen, en het zet de wekker daar zelf op. Zet je het óók als stap in het recept, dan telt die tijd twee keer en gaat de smoker een uur te vroeg aan. LET OP: de temperatuur die in die opstookzin stond ("verhit tot 250 °C") mag niet verdwijnen — zet hem als tempC bij de eerste stap waarin er iets op dat toestel gaat. Laat je hem weg, dan weet niemand op welke stand het ding moet.
- Lopen. Naar de koelcel, naar de smoker, terug naar de werkbank. De planner rekent looptijden zelf uit en bundelt gangen; staat het in het recept, dan kan hij dat niet meer.
- Klaarleggen en opruimen rond één handeling. Snijplank pakken, mes pakken, bak neerzetten. Dat is opzettijd en hoort in de duur van de stap zelf.
- "Verzamel de ingrediënten." Dat is geen handeling maar een zin uit een kookboek.

SCHRIJFSTIJL
Stappen in chef-taal: één handeling per regel, gebiedend, kort. "Vliezen van de buik afhalen", niet "Vervolgens dient men de vliezen te verwijderen".`;

export /**
 * Het schema waar het antwoord van het model aan moet voldoen.
 *
 * Bewust zonder ['X', 'null']-varianten: geen van deze velden is verplicht, dus
 * een leeg veld laat het model gewoon weg. Met de null-varianten erbij liep het
 * schema tegen de complexiteitsgrens van de API aan ("Schema is too complex")
 * zodra er één veld bijkwam. Weglaten en null betekenen hier hetzelfde.
 */
const SCHEMA: Record<string, unknown> = {
    type: 'object',
    additionalProperties: false,
    required: ['gerechtNaam', 'stappen'],
    properties: {
        gerechtNaam: { type: 'string' },
        porties: { type: 'integer' },
        componenten: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['naam'],
                properties: {
                    naam: { type: 'string' },
                },
            },
        },
        stappen: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['volgnummer', 'tekst'],
                properties: {
                    volgnummer: { type: 'integer' },
                    tekst: { type: 'string' },
                    bewerking: { type: 'string' },
                    actiefMin: { type: 'integer' },
                    passiefMin: { type: 'integer' },
                    tempC: { type: 'number' },
                    kernTempC: { type: 'number' },
                    materieelId: { type: 'integer' },
                    herhaalIntervalMin: { type: 'integer' },
                    herhaalDuurMin: { type: 'integer' },
                    toezichtNodig: { type: 'boolean' },
                    hangtAfVanVolgnummer: { type: 'integer' },
                    wachtOpKeuze: { type: 'string' },
                },
            },
        },
        vervallen: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['tekst', 'reden'],
                properties: { tekst: { type: 'string' }, reden: { type: 'string' } },
            },
        },
        keuzes: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['vraag', 'opties'],
                properties: {
                    vraag: { type: 'string' },
                    opties: { type: 'array', items: { type: 'string' } },
                },
            },
        },
    },
};
