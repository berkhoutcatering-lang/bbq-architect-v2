/**
 * De schatter — hoe het systeem leert hoe lang dingen echt duren.
 *
 * Vier regels uit het bouwplan (§ "Leren van de werkelijkheid"), plus één
 * die uit het gesprek over duizend gerechten kwam en het model redde:
 *
 * **Leren gebeurt op de bewerking, niet op de receptstap.** Duizend gerechten
 * maal vijftien stappen is vijftienduizend stappen; die halen elk nooit vijf
 * metingen. "Ui snipperen" haalt ze binnen een week, of het nu in gerecht 12
 * of gerecht 840 zit. De receptstap erft de duur van zijn bewerking.
 */

/** Eén uitvoering. Onderbroken metingen komen hier niet in. */
export interface Meting {
    werkelijkeMin: number;
    hoeveelheid?: number | null;
    stukGewichtKg?: number | null;
    /** Vastgelegd, nog niet gebruikt. Later kan blijken dat 's middags trager is. */
    tijdstipVanDag?: number | null;
}

export type SchatStand = 'geen' | 'monitor' | 'gemeten';

export interface Schatting {
    /** Minuten. `null` als er niets te zeggen valt. */
    durMin: number | null;
    stand: SchatStand;
    aantal: number;
    /** De stap is niet onnauwkeurig maar verkeerd gedefinieerd. */
    splitsen: boolean;
    /** Waarom deze uitkomst — het scherm mag geen black box zijn. */
    reden: string;
}

/** Vanaf hier is een bewerking volwassen. */
export const MINIMUM_METINGEN = 5;
/** Verder terugkijken maakt hem traag zonder hem beter te maken. */
export const VENSTER = 10;
/** Onder deze afwijking laat de schatter de opgeslagen waarde staan. */
export const DREMPEL_PCT = 10;
/** Meer verschil dan dit binnen het venster = verkeerd gedefinieerd. */
export const SPREIDING_FACTOR = 2;

/**
 * De schatting voor één bewerking.
 *
 * Minder dan vijf metingen: de planner gebruikt hem wél, maar rekent met de
 * **hoogste** meting tot nu toe. Te ruim plannen is onschuldig; te krap
 * plannen stapelt zich op tot de dag 's middags niet meer klopt.
 *
 * Vanaf vijf: de mediaan van de laatste tien. Mediaan en geen gemiddelde,
 * zodat één uitschieter de schatting niet verzet.
 *
 * @param passief Bij een passieve gaarstap wordt er per kilo gerekend en
 *   wordt de spreidingsbewaker uitgezet — daar haalt hij die factor twee
 *   bijna altijd, en een lijst die altijd vol staat wordt niet gelezen.
 */
export function schat(metingen: Meting[], opties: { passief?: boolean } = {}): Schatting {
    const bruikbaar = metingen.filter((m) => Number.isFinite(m.werkelijkeMin) && m.werkelijkeMin > 0);
    if (bruikbaar.length === 0) {
        return { durMin: null, stand: 'geen', aantal: 0, splitsen: false, reden: 'nog nooit gemeten' };
    }

    const venster = bruikbaar.slice(-VENSTER);

    if (opties.passief) {
        /* Per kilo, anders vergelijk je een halve brisket met een hele. */
        const perKilo = venster
            .filter((m) => m.stukGewichtKg != null && m.stukGewichtKg > 0)
            .map((m) => m.werkelijkeMin / (m.stukGewichtKg as number));
        if (perKilo.length === 0) {
            return {
                durMin: Math.max(...venster.map((m) => m.werkelijkeMin)),
                stand: 'monitor',
                aantal: venster.length,
                splitsen: false,
                reden: 'passieve stap zonder stukgewicht — hoogste meting aangehouden',
            };
        }
        return {
            durMin: null,
            stand: 'monitor',
            aantal: perKilo.length,
            splitsen: false,
            reden: 'gaar op kern — de duur is een verwachting, geen geleerde tijd',
        };
    }

    if (venster.length < MINIMUM_METINGEN) {
        const hoogste = Math.max(...venster.map((m) => m.werkelijkeMin));
        return {
            durMin: round1(hoogste),
            stand: 'monitor',
            aantal: venster.length,
            splitsen: false,
            reden: `${venster.length} van ${MINIMUM_METINGEN} metingen — gerekend met de hoogste`,
        };
    }

    const waarden = venster.map((m) => m.werkelijkeMin);
    const laagste = Math.min(...waarden);
    const hoogste = Math.max(...waarden);
    const splitsen = laagste > 0 && hoogste / laagste > SPREIDING_FACTOR;

    return {
        durMin: round1(mediaan(waarden)),
        stand: 'gemeten',
        aantal: venster.length,
        splitsen,
        reden: splitsen
            ? `mediaan van ${venster.length}, maar de spreiding is meer dan ${SPREIDING_FACTOR}× — er zit iets in verstopt dat varieert`
            : `mediaan van de laatste ${venster.length}`,
    };
}

/**
 * Moet de opgeslagen schatting vervangen worden?
 *
 * Wijkt de nieuwe mediaan minder dan tien procent af, dan blijft de oude
 * staan. Zo verspringt de planning niet bij elke meting, maar volgt hij wel
 * een echte verandering: word je over dertig uitvoeringen vijf procent
 * sneller, dan zakt de mediaan geleidelijk mee en slaat de drempel op enig
 * moment om. Reageren op een patroon, niet op een dag.
 */
export function moetBijstellen(opgeslagenMin: number | null, nieuweMin: number | null): boolean {
    if (nieuweMin == null) return false;
    if (opgeslagenMin == null || opgeslagenMin <= 0) return true;
    const afwijkingPct = (Math.abs(nieuweMin - opgeslagenMin) / opgeslagenMin) * 100;
    return afwijkingPct >= DREMPEL_PCT;
}

/**
 * Vaste tijd en tijd per eenheid scheiden.
 *
 * Kan pas als er metingen zijn bij minstens twee duidelijk verschillende
 * hoeveelheden. Snipper je vijf keer precies twee kilo, dan weet het systeem
 * niet wat het klaarzetten van de machine kost. Tot die tijd één duur voor de
 * hele stap.
 */
export const SPLITS_MIN_VERHOUDING = 1.5;

export function splitsVastEnPerEenheid(metingen: Meting[]): { vastMin: number; perEenheidMin: number } | null {
    const punten = metingen
        .filter((m) => m.hoeveelheid != null && m.hoeveelheid > 0 && m.werkelijkeMin > 0)
        .map((m) => ({ x: m.hoeveelheid as number, y: m.werkelijkeMin }));

    if (punten.length < MINIMUM_METINGEN) return null;

    const laagste = Math.min(...punten.map((p) => p.x));
    const hoogste = Math.max(...punten.map((p) => p.x));
    if (laagste <= 0 || hoogste / laagste < SPLITS_MIN_VERHOUDING) return null;

    /* Kleinste-kwadraten door de punten. Bewust simpel: met vijf tot tien
       metingen is iets ingewikkelders schijnprecisie. */
    const n = punten.length;
    const somX = punten.reduce((a, p) => a + p.x, 0);
    const somY = punten.reduce((a, p) => a + p.y, 0);
    const somXY = punten.reduce((a, p) => a + p.x * p.y, 0);
    const somXX = punten.reduce((a, p) => a + p.x * p.x, 0);
    const noemer = n * somXX - somX * somX;
    if (noemer === 0) return null;

    const helling = (n * somXY - somX * somY) / noemer;
    const snijpunt = (somY - helling * somX) / n;

    /* Een negatieve opzettijd of een negatief tarief is onzin; dan zegt de
       data dat deze stap zo niet werkt en houden we één duur aan. */
    if (helling <= 0 || snijpunt < 0) return null;

    return { vastMin: round1(snijpunt), perEenheidMin: round1(helling) };
}

/** Welk etiket het scherm toont. */
export function duurBronVan(schatting: Schatting, isGaarOpKern: boolean): 'geschat' | 'monitor' | 'gemeten' | 'verwacht' {
    if (isGaarOpKern) return 'verwacht';
    if (schatting.stand === 'gemeten') return 'gemeten';
    if (schatting.stand === 'monitor') return 'monitor';
    return 'geschat';
}

export function mediaan(waarden: number[]): number {
    const s = [...waarden].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function round1(n: number): number {
    return Math.round(n * 10) / 10;
}
