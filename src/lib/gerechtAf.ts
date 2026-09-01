/**
 * gerechtAf — wanneer is een gerecht af?
 *
 * Stap 2 uit docs/agent-architectuur-plan.md hoofdstuk 8.3. De aanleiding staat
 * in 8.2: op 1 september 2026 was nul van de vijftien gerechten compleet, en
 * niemand kon dat zien. Negen hadden geen enkel ingrediënt, vier een kostprijs,
 * drie allergenen, één receptstappen.
 *
 * De oorzaak is niet luiheid maar de vorm van het scherm. Toevoegen en afmaken
 * zijn dezelfde handeling: je maakt een gerecht aan met een naam, het staat
 * meteen op actief, en niets brengt je terug. Een half gerecht ziet er precies
 * zo uit als een heel gerecht.
 *
 * Deze module maakt "af" een begrip. Vijf eisen, elk met een reden waarom hij
 * er is en wat er stukgaat als hij ontbreekt — want een balkje dat alleen een
 * percentage toont vertelt je niet wat je moet doen.
 *
 * Wat hier NIET gebeurt: een oordeel over kwaliteit. Een gerecht met vijf vinkjes
 * kan nog steeds niet lekker zijn. Dit gaat over of de app ermee kan rekenen.
 */

export interface GerechtGegevens {
    id: string;
    naam: string;
    /** Gekoppelde ingrediënten — uit ingredient_costs of gerecht_components. */
    ingredienten: number;
    /** Afgeleide kostprijs in centen per portie. */
    kostprijsCent: number | null;
    allergenen: unknown;
    /** Aantal rijen in recipe_steps. */
    stappen: number;
    /** Stappen met een opgeschreven handtijd of wachttijd. */
    stappenMetDuur: number;
}

export type EisSleutel = 'ingredienten' | 'kostprijs' | 'allergenen' | 'stappen' | 'handtijd';

export interface Eis {
    sleutel: EisSleutel;
    /** Kort label voor in een lijstje. */
    label: string;
    gehaald: boolean;
    /** Wat er misgaat zolang dit ontbreekt. Staat in de UI als uitleg. */
    gevolg: string;
}

export interface AfOordeel {
    id: string;
    naam: string;
    eisen: Eis[];
    gehaald: number;
    totaal: number;
    af: boolean;
    /** De eerstvolgende stap, of null als het gerecht af is. */
    volgende: Eis | null;
}

/**
 * De vijf eisen, in de volgorde waarin je ze zinnig kunt invullen. Ingrediënten
 * eerst, want kostprijs en allergenen volgen daaruit; stappen daarna, want die
 * gaan over hoe je het maakt en niet over waarvan.
 */
export function beoordeelGerecht(g: GerechtGegevens): AfOordeel {
    const allergenen = Array.isArray(g.allergenen) ? g.allergenen.length : 0;

    const eisen: Eis[] = [
        {
            sleutel: 'ingredienten',
            label: 'Ingrediënten gekoppeld',
            gehaald: g.ingredienten > 0,
            gevolg: 'Zonder ingrediënten weet de bestellijst niet wat je moet inkopen.',
        },
        {
            sleutel: 'kostprijs',
            label: 'Kostprijs afgeleid',
            gehaald: (g.kostprijsCent ?? 0) > 0,
            gevolg: 'Zonder kostprijs telt dit gerecht als gratis mee in je marge.',
        },
        {
            sleutel: 'allergenen',
            label: 'Allergenen vastgelegd',
            gehaald: allergenen > 0,
            gevolg: 'Zonder allergenen staat er niets op je menukaart en kun je een gast niet gerust stellen.',
        },
        {
            sleutel: 'stappen',
            label: 'Stappen beschreven',
            gehaald: g.stappen > 0,
            gevolg: 'Zonder stappen valt dit gerecht op het kookbord terug op één regel "voorbereiden".',
        },
        {
            sleutel: 'handtijd',
            label: 'Handtijd bekend',
            gehaald: g.stappenMetDuur > 0,
            gevolg: 'Zonder handtijd weet de planning niet hoeveel werk er thuis en op locatie ligt.',
        },
    ];

    const gehaald = eisen.filter((e) => e.gehaald).length;
    return {
        id: g.id,
        naam: g.naam,
        eisen,
        gehaald,
        totaal: eisen.length,
        af: gehaald === eisen.length,
        volgende: eisen.find((e) => !e.gehaald) ?? null,
    };
}

export interface AfOverzicht {
    gerechten: number;
    af: number;
    /** Gerechten waar nog geen enkele eis van gehaald is. */
    leeg: number;
    /** Per eis: hoeveel gerechten hem halen. */
    perEis: Record<EisSleutel, number>;
    /**
     * De eerste eis in de keten die nog gerechten mist — daar begin je.
     *
     * Bewust niet de eis die het vaakst ontbreekt. Op het menu van 18 september
     * missen acht van de acht gerechten handtijd en vijf van de acht
     * ingrediënten; "handtijd" is dan het grootste getal en het slechtste
     * antwoord. Je kunt geen handtijd invullen zonder stappen, en geen zinnige
     * stappen zonder te weten waarvan het gemaakt is. Ingrediënten koppelen
     * lost kostprijs en allergenen bovendien vaak meteen mee op; andersom nooit.
     */
    eersteGat: { sleutel: EisSleutel; label: string; ontbreekt: number } | null;
}

export function afOverzicht(oordelen: AfOordeel[]): AfOverzicht {
    const perEis = {
        ingredienten: 0, kostprijs: 0, allergenen: 0, stappen: 0, handtijd: 0,
    } as Record<EisSleutel, number>;

    for (const o of oordelen) {
        for (const e of o.eisen) if (e.gehaald) perEis[e.sleutel]++;
    }

    /* Loop de keten af en stop bij de eerste eis die nog gerechten mist. */
    let eersteGat: AfOverzicht['eersteGat'] = null;
    if (oordelen.length > 0) {
        const volgorde: EisSleutel[] = ['ingredienten', 'kostprijs', 'allergenen', 'stappen', 'handtijd'];
        const labels = new Map(oordelen[0].eisen.map((e) => [e.sleutel, e.label]));
        for (const sleutel of volgorde) {
            const ontbreekt = oordelen.length - perEis[sleutel];
            if (ontbreekt > 0) {
                eersteGat = { sleutel, label: labels.get(sleutel) ?? sleutel, ontbreekt };
                break;
            }
        }
    }

    return {
        gerechten: oordelen.length,
        af: oordelen.filter((o) => o.af).length,
        leeg: oordelen.filter((o) => o.gehaald === 0).length,
        perEis,
        eersteGat,
    };
}
