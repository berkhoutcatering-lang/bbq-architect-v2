/**
 * De goedkeur-lade — het primitief waar elke H-agent doorheen gaat.
 *
 * De harde regel uit het plan: extern of onomkeerbaar → nooit autonoom, altijd
 * bevestiging. Intern en terug te draaien → mag autonoom. Deze module is de
 * plek waar die regel wordt afgedwongen: een agent die iets voorstelt schrijft
 * hier een rij en muteert nooit zelf.
 *
 * Bewust GEEN uitvoering hierin. Een voorstel bevestigen levert de payload
 * terug; wat er daarna moet gebeuren verschilt per soort en hoort bij de
 * feature zelf. Zou de lade ook uitvoeren, dan zou hij elke agent moeten
 * kennen — en dan is het geen primitief meer maar een tweede applicatie.
 *
 * Zie docs/agent-architectuur-plan.md hoofdstuk 2 en 8.
 */

export const VOORSTEL_TYPES = [
    'offerte_draft',
    'event_draft',
    'klant_upsert',
    'email_draft',
    'recept_ontleding',
    'recept_ontwerp',
    'verbindende_component',
    'gerecht_profiel',
    'ingredient_profiel',
    'techniek_profiel',
    'kookles',
    'inkoop_order',
] as const;

export type VoorstelType = (typeof VOORSTEL_TYPES)[number];

export const VOORSTEL_STATUSSEN = ['pending', 'confirmed', 'edited', 'cancelled', 'expired'] as const;
export type VoorstelStatus = (typeof VOORSTEL_STATUSSEN)[number];

export interface Voorstel<T = unknown> {
    id: string;
    organization_id: string;
    user_id: string;
    proposal_type: VoorstelType;
    payload: T;
    status: VoorstelStatus;
    chat_message_id: string | null;
    result_id: string | null;
    created_at: string;
    expires_at: string;
    confirmed_at: string | null;
}

/** Hoe een soort voorstel zich gedraagt in de lade. Puur presentatie en
 *  zwaarte — de database bewaakt welke types bestaan. */
export interface VoorstelSoort {
    titel: string;
    /** Eén zin: wat gebeurt er als je bevestigt. Staat boven de knop, zodat je
     *  weet waar je voor tekent. */
    gevolg: string;
    /** Verlaat dit het bedrijf of is het onomkeerbaar? Bepaalt de toon van de
     *  bevestiging: intern werk mag luchtig, een bestelling niet. */
    zwaarte: 'intern' | 'extern';
}

export const VOORSTEL_SOORTEN: Record<VoorstelType, VoorstelSoort> = {
    offerte_draft: {
        titel: 'Concept-offerte',
        gevolg: 'De offerte wordt aangemaakt als concept. Versturen doe je daarna zelf.',
        zwaarte: 'extern',
    },
    event_draft: {
        titel: 'Concept-event',
        gevolg: 'Het event komt in je agenda te staan.',
        zwaarte: 'intern',
    },
    klant_upsert: {
        titel: 'Klantgegevens',
        gevolg: 'De klant wordt aangemaakt of bijgewerkt.',
        zwaarte: 'intern',
    },
    email_draft: {
        titel: 'Concept-mail',
        gevolg: 'De mail wordt klaargezet. Verzenden doe je daarna zelf.',
        zwaarte: 'extern',
    },
    recept_ontleding: {
        titel: 'Receptuur in stappen',
        gevolg: 'De stappen worden aan het recept gekoppeld, met handtijd en wachttijd.',
        zwaarte: 'intern',
    },
    recept_ontwerp: {
        titel: 'Nieuw gerecht',
        gevolg: 'Het gerecht komt erin als voorstel. Pas na een proeftest mag het aan een menu.',
        zwaarte: 'intern',
    },
    verbindende_component: {
        titel: 'Verbindende component',
        gevolg: 'De brug wordt als component toegevoegd, in status voorstel.',
        zwaarte: 'intern',
    },
    gerecht_profiel: {
        titel: 'Smaakprofiel',
        gevolg: 'Het profiel wordt aan het gerecht gekoppeld.',
        zwaarte: 'intern',
    },
    ingredient_profiel: {
        titel: 'Ingrediënt-profielen',
        gevolg: 'De profielen gaan de kennisbank in en gelden daarna als feit.',
        zwaarte: 'intern',
    },
    techniek_profiel: {
        titel: 'Techniek',
        gevolg: 'De techniek gaat de kennisbank in.',
        zwaarte: 'intern',
    },
    kookles: {
        titel: 'Vuistregel',
        gevolg: 'De regel gaat meesturen bij nieuwe voorstellen.',
        zwaarte: 'intern',
    },
    inkoop_order: {
        titel: 'Conceptbestelling',
        gevolg: 'De bestelling wordt klaargezet. Versturen naar de leverancier doe je daarna zelf.',
        zwaarte: 'extern',
    },
};

/** Redenen om een voorstel af te wijzen. Staat hier en niet bij de actions:
 *  een 'use server'-module mag alleen async functies exporteren, anders klapt
 *  de server-actions-loader eruit. Dezelfde val staat al gedocumenteerd in
 *  src/app/materieel/actions.ts.
 *
 *  Elke afwijzing zegt iets, maar alleen als je vraagt waarom. Vier knoppen,
 *  twee tellen werk, en het is de goedkoopste leerbron in het hele plan. */
export const AFWIJS_REDENEN = [
    'te_zwaar',
    'smaken_passen_niet',
    'te_veel_werk',
    'past_niet_bij_mijn_gasten',
    'klopt_niet',
    'anders',
] as const;

export type AfwijsReden = (typeof AFWIJS_REDENEN)[number];

/** Hoeveel tijd er nog op staat. Een voorstel vervalt na 24 uur — niet uit
 *  strengheid, maar omdat een voorstel van gisteren op verouderde prijzen en
 *  voorraad is gebaseerd. */
export function tijdOver(voorstel: Pick<Voorstel, 'expires_at'>, nu: Date = new Date()): {
    verlopen: boolean;
    minuten: number;
    tekst: string;
} {
    const eind = new Date(voorstel.expires_at).getTime();
    const minuten = Math.floor((eind - nu.getTime()) / 60000);

    if (minuten <= 0) return { verlopen: true, minuten: 0, tekst: 'verlopen' };
    if (minuten < 60) return { verlopen: false, minuten, tekst: `nog ${minuten} min` };

    const uren = Math.floor(minuten / 60);
    return { verlopen: false, minuten, tekst: `nog ${uren} uur` };
}

/** Een voorstel is alleen te bevestigen als het openstaat én niet verlopen is.
 *  Allebei checken: de status kan achterlopen tot er iemand kijkt. */
export function isTeBevestigen(voorstel: Pick<Voorstel, 'status' | 'expires_at'>, nu: Date = new Date()): boolean {
    return voorstel.status === 'pending' && !tijdOver(voorstel, nu).verlopen;
}
