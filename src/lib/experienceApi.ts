import 'server-only';

/**
 * De koppeling met de Hop & Bites Experience-app.
 * Contract: docs/bestelstroom-bouwplan.md §3 en §3.1.
 *
 * Twee aanroepen, en het verschil ertussen is belangrijk:
 *
 *   A  GET /api/experience/v1/box-types/:slug
 *      Wat er in de doos zit. Geen persoonsgegevens, in beide richtingen niet.
 *      Blokkeert een pagina, dus 2 seconden en dan opgeven — het formulier laat
 *      de samenstellingszin gewoon weg als dit niet lukt.
 *
 *   B  POST /api/experience/v1/boxes
 *      Maakt de doos aan en geeft de token terug. 10 seconden, en dit MOET
 *      slagen: zonder token geen mail en geen sticker.
 *
 * Over de grens gaat heen alleen: voornaam, aantal personen, afhaaldatum.
 * Geen achternaam, geen mailadres, geen telefoonnummer, geen bedrag, en niet de
 * allergienotitie van de klant — dat is een gezondheidsgegeven en het blijft aan
 * deze kant. Die grens is hier op één plek te controleren: de body van `maakBox`.
 *
 * BBQ Architect maakt NOOIT zelf een token. Eén generator, in de andere app.
 * Bewaakt door src/lib/experienceKoppeling.test.ts.
 */

/* ── Wat er terugkomt ─────────────────────────────────────────────────────── */

export interface ExperienceOnderdeel {
    naam: string;
    aantal_per_persoon?: number | null;
    bewaren?: string | null;
    allergenen?: string[] | null;
    houdbaarheid_dagen?: number | null;
    /** proteïne · saus · zuur · salade */
    soort?: string | null;
    /** persoon · doos */
    per?: string | null;
}

export interface DoosTypeAntwoord {
    titel?: string | null;
    seizoen?: string | null;
    pitch?: string[] | null;
    stops?: unknown[] | null;
    personen_per_doos?: number | null;
    onderdelen?: ExperienceOnderdeel[] | null;
}

export interface BoxAntwoord {
    token: string;
    url: string;
    stops?: unknown[] | null;
    onderdelen?: ExperienceOnderdeel[] | null;
}

/* ── Fouten ───────────────────────────────────────────────────────────────── */

export interface ExperienceFout {
    /** Machineleesbaar. Nooit een bericht ontleden om te bepalen wat te doen. */
    code: string;
    /** Voor de operator in de hub, niet voor de klant. */
    bericht: string;
    status?: number;
    /**
     * Opnieuw proberen BINNEN dit verzoek. Alleen netwerkfouten, tijdslimieten
     * en 5xx. Elke 4xx wordt niet beter door het nog eens te doen.
     */
    directOpnieuw: boolean;
    /**
     * Later nog eens proberen (de dagelijkse cron, of de knop in de hub).
     * Ruimer dan hierboven: 429 mag morgen wél weer.
     */
    herstelbaar: boolean;
}

/**
 * Gelukt of niet.
 *
 * Uitpakken met `'fout' in uitkomst`, niet met `uitkomst.ok`: deze repo staat op
 * `strict: false`, en dan narrowt TypeScript niet op een letterlijke `true`/`false`.
 * De `in`-operator doet dat wel — hetzelfde patroon als `'error' in r` in de
 * bestaande server actions.
 */
export type Uitkomst<T> = { ok: true; data: T } | { ok: false; fout: ExperienceFout };

/* De codes uit het contract. Alles wat hier niet in staat behandelen we als
   interne_fout — een onbekende code is geen reden om te gokken. */
const NIET_HERSTELBAAR = new Set([
    'geen_toegang',
    'onbekend_doostype',
    'ongeldige_invoer',
    'andere_invoer_zelfde_sleutel',
    'doostype_gesloten',
]);

function fout(code: string, bericht: string, opts: Partial<ExperienceFout> = {}): ExperienceFout {
    return {
        code,
        bericht,
        directOpnieuw: false,
        herstelbaar: !NIET_HERSTELBAAR.has(code),
        ...opts,
    };
}

/* ── Configuratie ─────────────────────────────────────────────────────────── */

/**
 * De sleutel heet `EXPERIENCE_API_KEY` en NOOIT iets met een `VITE_`- of
 * `NEXT_PUBLIC_`-voorvoegsel. Beide bouwers bakken variabelen met dat
 * voorvoegsel in de bundel die elke bezoeker binnenhaalt — dat is precies
 * waarom de Supabase anon-sleutel daar publiek is. Bewaakt door een test.
 *
 * `EXPERIENCE_API_KEY_VORIGE` bestaat voor de ontvangende kant: die accepteert
 * tijdens een wissel beide sleutels, zodat rouleren geen downtime kost. Als
 * aanroeper sturen we altijd de nieuwe.
 */
function config(): { url: string; key: string } | null {
    const url = process.env.EXPERIENCE_API_URL;
    const key = process.env.EXPERIENCE_API_KEY;
    if (!url || !key) return null;
    return { url: url.replace(/\/+$/, ''), key };
}

/** `[koppel #123]` — hetzelfde nummer aan beide kanten, zodat één bestelling
    door twee apps heen te volgen is. Nooit de sleutel meelo. */
function log(koppelnummer: string, ...rest: unknown[]) {
    console.info(`[experience ${koppelnummer}]`, ...rest);
}

/* ── Het verzoek ──────────────────────────────────────────────────────────── */

interface RoepOpties {
    pad: string;
    methode: 'GET' | 'POST';
    body?: unknown;
    timeoutMs: number;
    pogingen: number;
    koppelnummer: string;
    idempotencyKey?: string;
}

async function roep<T>(o: RoepOpties): Promise<Uitkomst<T>> {
    const cfg = config();
    if (!cfg) {
        return {
            ok: false,
            fout: fout('niet_geconfigureerd', 'EXPERIENCE_API_URL of EXPERIENCE_API_KEY ontbreekt.'),
        };
    }

    let laatste: ExperienceFout | null = null;

    for (let poging = 1; poging <= o.pogingen; poging++) {
        const uitkomst = await eenPoging<T>(cfg, o);
        if (!('fout' in uitkomst)) return uitkomst;

        laatste = uitkomst.fout;
        if (!uitkomst.fout.directOpnieuw || poging === o.pogingen) break;

        /* Oplopende wachttijd. Bewust kort: dit draait binnen een verzoek dat
           zelf een tijdslimiet heeft, en de echte vangnetten zijn de cron en de
           knop in de hub. */
        const wacht = poging * 500;
        log(o.koppelnummer, `poging ${poging} faalde (${uitkomst.fout.code}), opnieuw over ${wacht}ms`);
        await new Promise((r) => setTimeout(r, wacht));
    }

    log(o.koppelnummer, 'opgegeven:', laatste?.code, laatste?.bericht);
    return { ok: false, fout: laatste ?? fout('interne_fout', 'Onbekende fout.') };
}

async function eenPoging<T>(cfg: { url: string; key: string }, o: RoepOpties): Promise<Uitkomst<T>> {
    let res: Response;
    try {
        res = await fetch(cfg.url + o.pad, {
            method: o.methode,
            headers: {
                Authorization: `Bearer ${cfg.key}`,
                Accept: 'application/json',
                ...(o.body ? { 'Content-Type': 'application/json' } : {}),
                ...(o.idempotencyKey ? { 'Idempotency-Key': o.idempotencyKey } : {}),
            },
            body: o.body ? JSON.stringify(o.body) : undefined,
            signal: AbortSignal.timeout(o.timeoutMs),
            cache: 'no-store',
        });
    } catch (e) {
        const afgebroken = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
        return {
            ok: false,
            fout: fout(
                afgebroken ? 'tijd_verstreken' : 'netwerkfout',
                afgebroken
                    ? `Geen antwoord binnen ${o.timeoutMs / 1000} seconden.`
                    : `De Experience-app was niet bereikbaar: ${e instanceof Error ? e.message : 'onbekend'}`,
                { directOpnieuw: true, herstelbaar: true },
            ),
        };
    }

    if (!res.ok) {
        /* Het contract belooft { fout, bericht }. Belooft is niet is: een
           proxy of een crash geeft HTML. Dan valt de code terug op de status. */
        let code = 'interne_fout';
        let bericht = `De Experience-app gaf status ${res.status}.`;
        try {
            const body = await res.json() as { fout?: string; bericht?: string };
            if (typeof body?.fout === 'string') code = body.fout;
            if (typeof body?.bericht === 'string') bericht = body.bericht;
        } catch { /* geen JSON — status is dan alles wat we hebben */ }

        if (res.status >= 500) {
            return { ok: false, fout: fout(code, bericht, { status: res.status, directOpnieuw: true, herstelbaar: true }) };
        }
        /* Elke 4xx: niet opnieuw binnen dit verzoek, dat wordt niet beter.
           429 mag morgen wel weer — vandaar herstelbaar, maar directOpnieuw niet. */
        return { ok: false, fout: fout(code, bericht, { status: res.status, directOpnieuw: false }) };
    }

    try {
        return { ok: true, data: await res.json() as T };
    } catch {
        return { ok: false, fout: fout('onleesbaar_antwoord', 'Het antwoord was geen geldige JSON.') };
    }
}

/* ── A · het doostype ─────────────────────────────────────────────────────── */

/**
 * Haalt op wat er in de doos zit. Wordt gebruikt om het bestelformulier te
 * vullen (en dus vóórdat er een bestelling bestaat), daarom geen bestelnummer
 * en geen idempotency-sleutel.
 *
 * Mag mislukken: dan valt de samenstellingszin weg en werkt het formulier door
 * op wat er in de cache staat.
 */
export async function haalDoosType(slug: string): Promise<Uitkomst<DoosTypeAntwoord>> {
    return roep<DoosTypeAntwoord>({
        pad: `/api/experience/v1/box-types/${encodeURIComponent(slug)}`,
        methode: 'GET',
        timeoutMs: 2000,
        pogingen: 1,           // blokkeert een pagina; één poging en dan door
        koppelnummer: `doostype ${slug}`,
    });
}

/* ── B · de doos ──────────────────────────────────────────────────────────── */

export interface MaakBoxInvoer {
    /** Alleen voor de idempotency-sleutel en het logboek — gaat niet als veld mee. */
    bestellingId: number;
    experienceSlug: string;
    voornaam: string;
    personen: number;
    /** YYYY-MM-DD */
    afhaaldatum: string;
}

/**
 * Maakt de doos aan in de Experience-app en krijgt token, url, haltes en
 * onderdelen terug.
 *
 * **Dit is de enige plek waar gegevens de grens over gaan.** De body hieronder
 * is de volledige lijst; er staat met opzet geen spread-operator in, zodat een
 * extra veld op de bestelling nooit per ongeluk meelift.
 *
 * De idempotency-sleutel is afgeleid van het bestelnummer en dus stabiel over
 * alle pogingen heen: opnieuw koppelen levert dezelfde doos op, niet een tweede.
 */
export async function maakBox(invoer: MaakBoxInvoer): Promise<Uitkomst<BoxAntwoord>> {
    const koppelnummer = `#${invoer.bestellingId}`;
    return roep<BoxAntwoord>({
        pad: '/api/experience/v1/boxes',
        methode: 'POST',
        body: {
            box_type: invoer.experienceSlug,
            voornaam: invoer.voornaam,
            personen: invoer.personen,
            afhaaldatum: invoer.afhaaldatum,
        },
        idempotencyKey: `bestelling-${invoer.bestellingId}`,
        timeoutMs: 10000,
        pogingen: 3,
        koppelnummer,
    });
}
