/**
 * Keukenplanner — het vocabulaire.
 *
 * Zie docs/keukenplanner-bouwplan.md. Deze module bevat alleen types; alle
 * rekenwerk staat in de zusters ernaast en is puur (geen database, geen tijd
 * uit de omgeving — `nu` wordt altijd meegegeven). Dat is bewust: dit is de
 * enige plek in de app waar een fout zich de hele dag opstapelt, dus elke
 * stap moet los te testen zijn.
 *
 * Er zit geen taalmodel in deze map en dat blijft zo.
 */

/** Waar een duur vandaan komt. Het scherm laat dit altijd zien. */
export type DuurBron =
    /** Nog nooit gemeten — dit is een gok. */
    | 'geschat'
    /** Minder dan vijf metingen; de planner rekent met de hoogste. */
    | 'monitor'
    /** Mediaan van de laatste tien. */
    | 'gemeten'
    /** Met de hand ingevuld en dus niet door de schatter te overschrijven. */
    | 'handmatig'
    /** Gaar op kern: de klok is een verwachting, de waarneming beslist. */
    | 'verwacht';

/**
 * Wat een blok tijd van de kok vraagt. Dit is de kern van het hele ontwerp:
 * het scherm beantwoordt elke seconde de vraag "ben ik bezig of ben ik vrij".
 */
export type Aandacht =
    /** Handen aan het werk. */
    | 'actief'
    /** Weg kunnen lopen. Rusten, marineren, opwarmen. */
    | 'passief_vrij'
    /** In de buurt blijven: elk half uur natspuiten. */
    | 'passief_gebonden'
    /** Erbij blijven staan. `toezicht_nodig`. */
    | 'passief_bewaakt';

export type TaakStatus = 'planned' | 'queued' | 'in_progress' | 'done' | 'skipped' | 'blocked';

/** Een apparaat zoals de planner het nodig heeft. Uit `materieel`. */
export interface Apparaat {
    id: number;
    naam: string;
    /** Lopen en op de knop drukken. Echt actief werk. */
    aanzetMin: number;
    /** Van koud naar bedrijfstemperatuur. Passief, en vulbaar. */
    opwarmMin: number | null;
    /** Hoe lang hij warm blijft als hij aan blijft staan. `null` = koelt af. */
    warmBlijftMin: number | null;
    schoonmaakMin: number | null;
    exclusiefBezet: boolean;
    /** Hoeveel dingen er tegelijk in kunnen. `null` = onbekend → niet bundelen. */
    concurrentJobs: number | null;
    /** Maximale belading. `null` = onbekend → niet bundelen. */
    capaciteitWaarde: number | null;
    capaciteitEenheid: string | null;
    /**
     * Bruikbaar rooster-oppervlak. Bij een grill of smoker is dit meestal de
     * bindende grens: twee briskets van 6 kg passen qua gewicht makkelijk en
     * toch niet naast elkaar.
     */
    kookoppervlakCm2: number | null;
    /** Bedrijfsbereik. Leeg = niet vastgelegd, en dan wordt er niets aangenomen. */
    temp_min_c?: number | null;
    temp_max_c?: number | null;
    /** Wat dit toestel kan, uit `materieel.maakt_mogelijk`. */
    kundes?: string[];
    stationId: number | null;
}

/** Een werkplek. Uit `kitchen_stations`. */
export interface Station {
    id: number;
    naam: string;
    isFysiek: boolean;
    exclusief: boolean;
}

/**
 * Eén taak op de dag. Komt uit `prep_tasks`, aangevuld met wat er in de
 * bijbehorende `recipe_steps`-rij en `materieel`-rij staat.
 *
 * Alle duren zijn minuten. `null` betekent onbekend en dat is niet nul:
 * een taak met onbekende duur wordt getoond maar valt buiten het gatenvullen.
 */
export interface Taak {
    id: number;
    titel: string;
    /** Korte regel eronder: de handeling van nu, nooit het hele recept. */
    toelichting?: string | null;

    recipeStepId?: string | null;
    schoonmaaktaakId?: number | null;
    gerechtNaam?: string | null;
    eventId?: number | null;

    /** Batchsleutel-onderdelen. */
    bewerkingCode?: string | null;
    componentId?: number | null;

    stationId?: number | null;
    stationNaam?: string | null;
    /**
     * Het gekozen apparaat. Kwam vroeger vast uit de stap; wordt nu door de
     * planner gekozen op grond van `kunde`, tenzij de stap een specifiek
     * toestel eist.
     */
    apparaat?: Apparaat | null;
    /** Wat deze taak van een apparaat vraagt: "smoker", "oven", "grill"… */
    kunde?: string | null;
    /** Waarom dit toestel gekozen is. Voor op het scherm en in de uitleg. */
    apparaatReden?: string | null;

    hoeveelheid?: number | null;
    eenheid?: string | null;
    /** Gewicht van één stuk; bepaalt hoe lang een passieve gaarstap duurt. */
    stukGewichtKg?: number | null;
    /** Hoeveel rooster deze taak inneemt. `null` = onbekend, dus niet meerekenen. */
    oppervlakCm2?: number | null;

    /** Actieve tijd, al uitgerekend (vast + per eenheid × hoeveelheid). */
    actiefMin: number | null;
    /** Passieve tijd, al geschaald naar het stukgewicht. */
    passiefMin: number | null;
    duurBron: DuurBron;

    /** Gebonden passief: elk `interval` minuten `duur` minuten werk. */
    herhaalIntervalMin?: number | null;
    herhaalDuurMin?: number | null;
    toezichtNodig: boolean;

    /** Kerntemperatuur; als die er is eindigt de stap daarop en niet op tijd. */
    tempDoelC?: number | null;

    /** Hoe lang dit nog houdbaar is; begrenst hoe ver vooruit gebatcht mag. */
    houdbaarheidNaDagen?: number | null;

    /** Taken die af moeten zijn voordat deze kan beginnen. */
    hangtAfVan: number[];

    status: TaakStatus;
    /** Wanneer de planner hem wil starten. */
    geplandOp?: string | null;
    gestartOp?: string | null;
    /** Uiterste moment waarop dit klaar moet zijn. */
    deadline?: string | null;

    /** Gerekend eind. Altijd gevuld zodra er gepland is. */
    verwachtEind?: string | null;
    /** Waargenomen eind — thermometer of kok met een prikker. Wint altijd. */
    bevestigdEind?: string | null;

    batchId?: string | null;
    ladingNr?: number | null;
}

/** Eén regel op het scherm. Kant-en-klaar: het scherm rekent niets. */
export interface TijdlijnRegel {
    taakId: number;
    /** "11:30" of "~ 20m" als er geen vast tijdstip is. */
    tijd: string;
    tijdIsVast: boolean;
    titel: string;
    /** "Smoker" of "Yoder 1500 · 110 °C". */
    waar: string | null;
    aandacht: Aandacht;
    duurBron: DuurBron;
}

/** Een melding op het scherm. Drie regels: wat, wat het betekent, wat er moet. */
export interface Melding {
    id: string;
    ernst: 'info' | 'waarschuwing' | 'alarm';
    kop: string;
    uitleg?: string | null;
    /** Wat er van de kok verwacht wordt. Mag leeg zijn. */
    verwacht?: string | null;
}

/** Wat het wandscherm krijgt. Eén object, geen rekenwerk aan de andere kant. */
export interface Keukenscherm {
    /** Waar het scherm op staat. Bepaalt welke van de zes beelden je ziet. */
    stand: 'actief' | 'vrij' | 'leeg';
    nu: {
        taakId: number | null;
        kop: string;
        regel: string | null;
        toelichting: string | null;
        station: string | null;
        aandacht: Aandacht;
        duurBron: DuurBron;
        /** Resterende tijd als "11:48", of null bij onbekende duur. */
        resterend: string | null;
        bezigSinds: string | null;
        vanMin: number | null;
        tempDoelC: number | null;
        /** Bij vrij: waar je op wacht, klein ernaast. */
        wachtOp: string | null;
        wachtNog: string | null;
    };
    straks: TijdlijnRegel[];
    meldingen: Melding[];
    status: {
        tijd: string;
        takenOpen: number;
        haccpOpen: number;
        gegenereerdOp: string;
    };
}
