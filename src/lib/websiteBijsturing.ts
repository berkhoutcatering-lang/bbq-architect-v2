/**
 * Website bijsturen — de vertaling van databaserijen naar het contract dat
 * hopbites.nl leest op /api/public-bijsturing/{slug}.
 *
 * Contract (website-repo, BOUWBRIEF-BEHEERSCHERM.md):
 *
 *   {
 *     "sluiting":       { "reden": "We staan op locatie.", "tot": "2026-09-09T18:00:00+02:00" },
 *     "openingstijden": [ { "datum": "2026-09-12", "van": "10:00", "tot": "17:00", "gesloten": false } ],
 *     "weekaanbod":     { "van": "…", "tot": "…", "titel": "…", "tekst": "…", "producten": ["borrelplanken"] },
 *     "uitverkocht":    ["borrelplanken"]
 *   }
 *
 * Elk veld mag null zijn; {} is een geldig antwoord en betekent "niets
 * bijgestuurd". De site maakt alles nog eens schoon bij binnenkomst, dus dit
 * bestand hoeft niet wantrouwig te zijn — wel eerlijk: wat voorbij is, geven we
 * niet meer door. Anders blijft "vandaag dicht" staan tot iemand eraan denkt.
 *
 * Geen imports uit Next of Supabase: dit moet zonder database te testen zijn.
 */

/** Rij uit website_bijsturing, zoals Supabase hem teruggeeft. */
export interface BijsturingRij {
    sluiting_reden: string | null;
    sluiting_tot: string | null;
    sluiting_actief: boolean;
    weekaanbod_van: string | null;
    weekaanbod_tot: string | null;
    weekaanbod_titel: string | null;
    weekaanbod_tekst: string | null;
    weekaanbod_producten: string[] | null;
    uitverkocht: string[] | null;
}

/** Rij uit website_openingstijden. `van`/`tot` komen als 'HH:MM:SS' binnen. */
export interface OpeningstijdRij {
    datum: string;
    van: string | null;
    tot: string | null;
    gesloten: boolean;
}

export interface BijsturingContract {
    sluiting: { reden: string | null; tot: string | null } | null;
    openingstijden: Array<{ datum: string; van: string | null; tot: string | null; gesloten: boolean }>;
    weekaanbod: { van: string; tot: string; titel: string | null; tekst: string | null; producten: string[] } | null;
    uitverkocht: string[];
}

/** 'HH:MM:SS' → 'HH:MM'. De site verwacht kloktijden zonder seconden. */
export function kortTijd(tijd: string | null | undefined): string | null {
    if (!tijd) return null;
    const m = /^(\d{2}):(\d{2})/.exec(tijd);
    return m ? `${m[1]}:${m[2]}` : null;
}

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function vandaagISO(nu: Date = new Date()): string {
    return nu.toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

/**
 * Het contract voor dit moment.
 *
 * - Een sluiting telt alleen als hij aan staat én niet verlopen is.
 * - Openingstijden van vóór vandaag doen er niet meer toe.
 * - Een weekaanbod waarvan de laatste dag voorbij is, bestaat niet meer.
 *   Eén dat nog moet beginnen gaat wél mee: de site weet zelf wanneer ze het
 *   toont, en zo kan Mathijs het zondagavond klaarzetten.
 */
export function naarContract(
    rij: BijsturingRij | null,
    openingstijden: OpeningstijdRij[],
    nu: Date = new Date(),
): BijsturingContract {
    const vandaag = vandaagISO(nu);

    let sluiting: BijsturingContract['sluiting'] = null;
    if (rij?.sluiting_actief) {
        const tot = rij.sluiting_tot;
        const verlopen = tot != null && !Number.isNaN(Date.parse(tot)) && Date.parse(tot) <= nu.getTime();
        if (!verlopen) sluiting = { reden: rij.sluiting_reden ?? null, tot: tot ?? null };
    }

    const tijden = openingstijden
        .filter((o) => o.datum >= vandaag)
        .sort((a, b) => a.datum.localeCompare(b.datum))
        .map((o) => ({
            datum: o.datum,
            van: o.gesloten ? null : kortTijd(o.van),
            tot: o.gesloten ? null : kortTijd(o.tot),
            gesloten: o.gesloten,
        }));

    let weekaanbod: BijsturingContract['weekaanbod'] = null;
    if (rij?.weekaanbod_van && rij.weekaanbod_tot && rij.weekaanbod_tot >= vandaag) {
        weekaanbod = {
            van: rij.weekaanbod_van,
            tot: rij.weekaanbod_tot,
            titel: rij.weekaanbod_titel ?? null,
            tekst: rij.weekaanbod_tekst ?? null,
            producten: rij.weekaanbod_producten ?? [],
        };
    }

    return {
        sluiting,
        openingstijden: tijden,
        weekaanbod,
        uitverkocht: rij?.uitverkocht ?? [],
    };
}

/**
 * De productlijnen zoals hopbites.nl ze kent, voor de keuzelijstjes in het
 * scherm. Dit is een spiegel van `lib/content/content.ts` in de website-repo —
 * de site blijft de eigenaar. Een slug die hier ontbreekt kun je gewoon
 * intypen; een slug die de site niet kent, negeert ze.
 */
export const WEBSITE_PRODUCTEN: ReadonlyArray<{ slug: string; naam: string }> = [
    { slug: 'texas-bbq', naam: 'Texas BBQ' },
    { slug: 'stamppotbuffet', naam: 'Stamppotbuffet' },
    { slug: 'streetfood-buffet', naam: 'Streetfood buffet' },
    { slug: 'streetfood-2-0', naam: 'Streetfood 2.0' },
    { slug: 'signature-menu', naam: 'Signature Menu' },
    { slug: 'bbq-pakket', naam: 'BBQ-pakket' },
    { slug: 'borrelbar', naam: 'BorrelBar' },
    { slug: 'borrel-journey', naam: 'Borrel Journey' },
    { slug: 'hop-en-bites-plank', naam: 'Hop & Bites-plank' },
    { slug: 'broodjes', naam: 'Broodjes' },
    { slug: 'vleeswaren', naam: 'Vleeswaren' },
    { slug: 'geschenkbox', naam: 'Geschenkbox' },
    { slug: 'borrelbox', naam: 'Borrelbox' },
    { slug: 'pit-en-rook', naam: 'Pit & Rook' },
    { slug: 'drenthe-bieravond', naam: 'Drenthe bieravond' },
    { slug: 'voor-papa', naam: 'Voor papa' },
    { slug: 'kerst-box', naam: 'Kerstbox' },
];

export const SLUG_PATROON = /^[a-z0-9-]{1,60}$/;
