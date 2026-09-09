/**
 * Bestelstroom — rekenwerk zonder scherm.
 * Plan: docs/bestelstroom-bouwplan.md
 *
 * Alles wat hier staat is puur: dezelfde invoer geeft altijd dezelfde uitvoer,
 * er wordt niets opgehaald en niets opgeslagen. Dat is met opzet, want dit zijn
 * precies de plekken waar een fout stil doorwerkt naar een sticker of een mail.
 *
 * Twee regels lopen overal doorheen:
 *   • Weet je iets niet, geef dan `null` terug. Nooit een geraden getal en
 *     nooit een lege huls die eruitziet als een antwoord.
 *   • Getallen die uit de verpakking volgen (personen per doos, stuks per
 *     gerecht) horen bij het doostype in de Experience-app. Hier worden ze
 *     alleen gelezen, nooit vastgelegd.
 */

/* ── Wat aanroep A over een doostype teruggeeft ────────────────────────────
   `soort` en `per` staan nog niet in het contract (open punt 1 in het plan).
   Zolang ze ontbreken valt de samenstellingszin weg — dat is beter dan een
   zin waarin de sauzen meetellen als stukjes vlees. */
export interface DoosOnderdeel {
    naam: string;
    aantal_per_persoon?: number | null;
    bewaren?: string | null;
    allergenen?: string[] | null;
    houdbaarheid_dagen?: number | null;
    /** proteïne · saus · zuur · salade */
    soort?: string | null;
    /** waarmee het meeschaalt: 'persoon' of 'doos' */
    per?: string | null;
}

export interface DoosSamenstelling {
    titel?: string | null;
    seizoen?: string | null;
    pitch?: string[] | null;
    stops?: unknown[] | null;
    personen_per_doos?: number | null;
    onderdelen?: DoosOnderdeel[] | null;
}

/* ── Dozen ─────────────────────────────────────────────────────────────── */

/**
 * Hoeveel dozen is dit? Een doos schaalt mee tot `personenPerDoos`; daarboven
 * wordt het een tweede doos. Dat volgt uit de bakjes, niet uit een voorkeur.
 *
 * Geeft `null` als de doosmaat onbekend is. De aanroeper hoort dan geen
 * bestelling aan te nemen — liever dicht dan een doosmaat raden.
 */
export function berekenDozen(personen: number, personenPerDoos: number | null | undefined): number | null {
    if (!Number.isFinite(personen) || personen <= 0) return null;
    if (!personenPerDoos || !Number.isFinite(personenPerDoos) || personenPerDoos <= 0) return null;
    return Math.ceil(personen / personenPerDoos);
}

/* ── De samenstellingszin ───────────────────────────────────────────────── */

const MEERVOUD: Record<string, string> = {
    saus: 'sauzen',
    zuur: 'zuren',
    salade: 'salades',
};

const TELWOORD = ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien', 'elf', 'twaalf'];

/** "drie sauzen" — kleine getallen voluit, zoals ze in de mail staan. */
function telwoord(n: number, enkelvoud: string): string {
    const woord = n <= 12 ? TELWOORD[n] : String(n);
    const zelfstandig = n === 1 ? enkelvoud : (MEERVOUD[enkelvoud] ?? enkelvoud + 's');
    return `${woord} ${zelfstandig}`;
}

function aantalVoor(o: DoosOnderdeel, personen: number): number | null {
    const per = o.aantal_per_persoon;
    if (per == null || !Number.isFinite(per) || per <= 0) return null;
    /* 'doos' schaalt niet mee met de teller: drie sauzen blijft drie sauzen.
       Ontbreekt `per`, dan weten we het niet en telt dit onderdeel niet mee. */
    if (o.per === 'doos') return per;
    if (o.per === 'persoon') return per * personen;
    return null;
}

/**
 * "60 stukjes vlees en vis, drie sauzen, twee zuren en twee salades."
 *
 * Volledig gerekend, nooit ingetikt — dat is de hele reden dat die getallen bij
 * het doostype horen. Een zin die iemand overschrijft, kan iemand verkeerd
 * overschrijven, en dat is in dit project al een keer gebeurd.
 *
 * Geeft `null` zodra er niets te rekenen valt, zodat de aanroeper de regel
 * gewoon weglaat in plaats van een halve zin te tonen.
 */
export function samenstellingsZin(
    onderdelen: DoosOnderdeel[] | null | undefined,
    personen: number,
): string | null {
    if (!onderdelen?.length || !Number.isFinite(personen) || personen <= 0) return null;

    let stukjes = 0;
    for (const o of onderdelen) {
        if (o.soort !== 'proteïne' && o.soort !== 'proteine') continue;
        const aantal = aantalVoor(o, personen);
        if (aantal != null) stukjes += aantal;
    }

    const delen: string[] = [];
    if (stukjes > 0) delen.push(`${stukjes} stukjes vlees en vis`);

    /* Gelijksoortige bijgerechten worden opgeteld: twee saus-onderdelen van elk
       één worden "twee sauzen", niet "één saus, één saus". */
    delen.push(...samenvoegen(onderdelen, personen));

    if (!delen.length) return null;
    return zinsopsomming(delen) + '.';
}

function samenvoegen(onderdelen: DoosOnderdeel[], personen: number): string[] {
    const totalen = new Map<string, number>();
    for (const o of onderdelen) {
        if (o.soort !== 'saus' && o.soort !== 'zuur' && o.soort !== 'salade') continue;
        const aantal = aantalVoor(o, personen);
        if (aantal == null) continue;
        totalen.set(o.soort, (totalen.get(o.soort) ?? 0) + aantal);
    }
    const volgorde = ['saus', 'zuur', 'salade'];
    return volgorde
        .filter((s) => totalen.has(s))
        .map((s) => telwoord(totalen.get(s)!, s));
}

/** "a, b en c" — Nederlandse opsomming, zonder komma voor "en". */
export function zinsopsomming(delen: string[]): string {
    if (delen.length <= 1) return delen[0] ?? '';
    return delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1];
}

/* ── Datums ────────────────────────────────────────────────────────────── */

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/**
 * "dinsdag 22 december" — de weekdag wordt altijd gerekend, nooit opgeslagen.
 * Zodra hij ergens als tekst vaststaat, liegt de mail bij de eerste keer dat
 * iemand de datum verzet.
 *
 * Parseert de losse delen in plaats van `new Date(string)`, zodat er geen
 * tijdzone tussen kan komen: een DATE uit Postgres heeft geen tijd en mag er
 * ook geen krijgen.
 */
export function formatteerDatum(isoDatum: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDatum ?? '');
    if (!m) return null;
    const jaar = Number(m[1]), maand = Number(m[2]), dag = Number(m[3]);
    if (maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;

    const d = new Date(Date.UTC(jaar, maand - 1, dag));
    /* Vangt 31 februari: de Date rolt dan door naar maart. */
    if (d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) return null;

    return `${DAGEN[d.getUTCDay()]} ${dag} ${MAANDEN[maand - 1]}`;
}

/** "dinsdag 22 december, 16:30" — de tijd erbij, zonder seconden. */
export function formatteerAfhaalmoment(isoDatum: string, startTijd: string | null | undefined): string | null {
    const datum = formatteerDatum(isoDatum);
    if (!datum) return null;
    const tijd = kortTijd(startTijd);
    return tijd ? `${datum}, ${tijd}` : datum;
}

/** Postgres geeft TIME terug als "16:30:00". Op het scherm hoort "16:30". */
export function kortTijd(tijd: string | null | undefined): string | null {
    const m = /^(\d{2}):(\d{2})/.exec(tijd ?? '');
    return m ? `${m[1]}:${m[2]}` : null;
}

/** THT per onderdeel: afhaaldatum + houdbaarheid, als ISO-datum. */
export function houdbaarTot(isoAfhaaldatum: string, dagen: number | null | undefined): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoAfhaaldatum ?? '');
    if (!m || dagen == null || !Number.isFinite(dagen) || dagen < 0) return null;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    d.setUTCDate(d.getUTCDate() + Math.floor(dagen));
    return d.toISOString().slice(0, 10);
}

/* ── Bewaartermijnen ───────────────────────────────────────────────────── */

/**
 * De datum van N maanden geleden, als YYYY-MM-DD.
 *
 * Gebruikt door de opruimtaak. Bewust met UTC-delen gerekend en niet met
 * `setMonth` op een lokale datum: dat laatste schuift op zomertijd een dag op,
 * en een bewaartermijn die per seizoen verspringt is geen bewaartermijn.
 *
 * 31 augustus min zes maanden bestaat niet (31 februari); dan wordt het de
 * laatste dag van die maand. Naar achteren afronden, zodat er nooit iets
 * eerder gewist wordt dan afgesproken.
 */
export function datumMinMaanden(vandaagISO: string, maanden: number): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vandaagISO ?? '');
    if (!m || !Number.isFinite(maanden) || maanden < 0) return null;

    const jaar = Number(m[1]);
    const maand = Number(m[2]) - 1;
    const dag = Number(m[3]);

    const doel = new Date(Date.UTC(jaar, maand - maanden, 1));
    /* Hoeveel dagen heeft de doelmaand? Dag 0 van de volgende maand. */
    const dagenInMaand = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
    doel.setUTCDate(Math.min(dag, dagenInMaand));

    return doel.toISOString().slice(0, 10);
}

/* ── Naam ──────────────────────────────────────────────────────────────── */

/**
 * Het eerste woord van de naam, als voorstel voor wat er straks groot op de
 * doospagina komt. Niet meer dan een voorstel: "Fam. Berkhout" wordt hier
 * "Fam.", en daarom is dit veld in de hub corrigeerbaar en staat het naast de
 * stickervoorbeeldweergave. Automatisch raden mag, stilzwijgend versturen niet.
 */
export function afleidVoornaam(naam: string): string {
    const schoon = (naam ?? '').trim().replace(/\s+/g, ' ');
    if (!schoon) return '';
    return schoon.split(' ')[0];
}
