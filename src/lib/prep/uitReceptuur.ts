/**
 * Van receptuur naar productiedag.
 *
 * Hier zat het gat. De receptlezer bouwt sinds twee dagen stappen met apparaat,
 * temperatuur, volgorde, onderdelen die vooruit mogen en een eindconditie op
 * kerntemperatuur — en niets daarvan kwam op het kookbord terecht. De taken voor
 * een event werden gemaakt uit `gerecht_components`: een naam en een hoeveelheid.
 * Alles wat we zorgvuldig hadden opgebouwd bleef in de la liggen.
 *
 * Deze module is die vertaling: één taak per receptstap, met alles wat de
 * planner nodig heeft om er een dag van te maken. Puur, zonder database, zodat
 * hij te testen is zonder een event aan te maken.
 *
 * **Hoe de tijden bepaald worden.** Achteruit vanaf de uitlevering. Voor elke
 * stap tellen we op hoeveel er ná hem nog moet gebeuren; dat is zijn afstand tot
 * het eind. Een stap met zeven dagen pekelen duwt daarmee alles wat ervóór komt
 * een week naar voren, en dat is precies het getal dat je wilt zien.
 *
 * Onbekende duren tellen als nul minuten. Dat is geen schatting maar een
 * erkenning: we weten het niet, dus we doen alsof het niets kost en de volgorde
 * blijft in elk geval kloppen. Zodra er gemeten is schuift het vanzelf recht.
 */

/** Een receptstap zoals hij uit `recipe_steps` komt. */
export interface ReceptStap {
    id: string;
    step_order: number;
    tekst: string;
    /** Null = hoort bij het gerecht zelf; anders bij een bouwsteen. */
    component_id: number | null;
    componentNaam?: string | null;
    bewerking_code: string | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    temp_doel_c: number | null;
    kern_temp_c: number | null;
    materieel_id: number | null;
    station_id: number | null;
    kunde: string | null;
    toezicht_nodig: boolean | null;
    herhaal_interval_min: number | null;
    herhaal_duur_min: number | null;
    hangt_af_van_stap_id: string | null;
    prep_group: string | null;
    plaats: string | null;
}

export interface TaakUitStap {
    recipe_step_id: string;
    text: string;
    /** Wanneer deze stap moet beginnen, achteruit gerekend vanaf de uitlevering. */
    scheduled_at: string;
    /** Hele dagen vóór het event. Nul = op de dag zelf. */
    dagen: number;
    component_id: number | null;
    gerecht_id: string;
    materieel_id: number | null;
    station_id: number | null;
    bewerking_code: string | null;
    kunde: string | null;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    duration_min: number | null;
    toezicht_nodig: boolean;
    plaats: string;
    /** Volgorde binnen het gerecht; laag getal is eerder aan de beurt. */
    priority: number;
    /** Hoort deze stap bij een onderdeel dat vooruit gemaakt mag worden? */
    magVooruit: boolean;
    /** De kookfase, afgeleid uit wat het toestel kan. */
    fase: 'smoke' | 'grill' | 'warm' | 'koud' | 'other';
}

/**
 * Welke kookfase hoort bij deze stap?
 *
 * Uit `kunde`, want dat is een gestructureerd veld dat bewust is ingevuld — niet
 * uit de tekst. "Rook" in een zin kan ook rookhout zijn, en daar zijn we eerder
 * over gestruikeld.
 */
export function faseVanStap(stap: ReceptStap): TaakUitStap['fase'] {
    switch (stap.kunde) {
        case 'smoker': return 'smoke';
        case 'grill': return 'grill';
        case 'oven':
        case 'fornuis': return 'warm';
        case 'koeling':
        case 'koelbox': return 'koud';
        default: return 'other';
    }
}

const MS = 60_000;

/**
 * Hoeveel minuten deze stap in beslag neemt.
 *
 * Werk plus wachten. Onbekend telt als nul — zie de kop van dit bestand.
 */
export function duurVanStap(stap: ReceptStap): number {
    return (stap.duur_actief_min ?? 0) + (stap.duur_passief_min ?? 0);
}

/**
 * De keten achteruit: hoeveel minuten er ná deze stap nog moet gebeuren.
 *
 * Volgt `hangt_af_van_stap_id` vooruit. Staat er geen keten, dan valt hij terug
 * op `step_order` binnen hetzelfde deel — een recept dat zijn afhankelijkheden
 * niet invult is nog steeds een lijst die je van boven naar beneden afwerkt.
 */
export function minutenNa(stappen: ReceptStap[]): Map<string, number> {
    const opId = new Map(stappen.map((s) => [s.id, s]));

    /* Wie hangt er aan wie? Expliciet via hangt_af_van_stap_id, en anders de
       volgende stap in hetzelfde deel. */
    const opvolgers = new Map<string, string[]>();
    for (const s of stappen) {
        if (s.hangt_af_van_stap_id != null && opId.has(s.hangt_af_van_stap_id)) {
            const lijst = opvolgers.get(s.hangt_af_van_stap_id) ?? [];
            lijst.push(s.id);
            opvolgers.set(s.hangt_af_van_stap_id, lijst);
        }
    }

    const heeftKeten = new Set([...opvolgers.values()].flat());
    const perDeel = new Map<string, ReceptStap[]>();
    for (const s of stappen) {
        const sleutel = String(s.component_id ?? 'gerecht');
        const lijst = perDeel.get(sleutel) ?? [];
        lijst.push(s);
        perDeel.set(sleutel, lijst);
    }
    for (const lijst of perDeel.values()) {
        lijst.sort((a, b) => a.step_order - b.step_order);
        for (let i = 0; i < lijst.length - 1; i++) {
            const volgende = lijst[i + 1];
            /* Alleen invullen waar het recept zelf niets zei. Een expliciete
               keten wint altijd van "de volgende regel". */
            if (heeftKeten.has(volgende.id)) continue;
            const lijstje = opvolgers.get(lijst[i].id) ?? [];
            lijstje.push(volgende.id);
            opvolgers.set(lijst[i].id, lijstje);
        }
    }

    /* Achteruit rekenen met memoïsatie. Een cyclus kan niet ontstaan zolang de
       keten uit step_order komt, maar een kapot recept mag de keuken niet
       laten hangen — vandaar het bezoek-spoor. */
    const na = new Map<string, number>();
    const bezig = new Set<string>();

    function reken(id: string): number {
        const bekend = na.get(id);
        if (bekend != null) return bekend;
        if (bezig.has(id)) return 0;
        bezig.add(id);

        const kinderen = opvolgers.get(id) ?? [];
        let langste = 0;
        for (const kind of kinderen) {
            const stap = opId.get(kind);
            if (!stap) continue;
            langste = Math.max(langste, duurVanStap(stap) + reken(kind));
        }

        bezig.delete(id);
        na.set(id, langste);
        return langste;
    }

    for (const s of stappen) reken(s.id);
    return na;
}

export interface PlanInvoer {
    gerechtId: string;
    gerechtNaam: string;
    stappen: ReceptStap[];
    /** Wanneer het op tafel moet, als ISO-tijd. */
    uitlevering: string;
    /** Onderdelen die los gemaakt mogen worden, op component_id. */
    magVooruit?: Set<number>;
}

/**
 * Maak van een receptuur een rij taken voor één event.
 *
 * De tekst krijgt het gerecht ervoor, want op het bord staan straks taken van
 * vier gerechten door elkaar en "afspoelen" zegt dan niets.
 */
export function takenUitReceptuur(invoer: PlanInvoer): TaakUitStap[] {
    const { gerechtId, gerechtNaam, stappen, uitlevering } = invoer;
    const magVooruit = invoer.magVooruit ?? new Set<number>();
    const eindMs = Date.parse(uitlevering);
    if (Number.isNaN(eindMs) || stappen.length === 0) return [];

    const na = minutenNa(stappen);

    return stappen.map((stap) => {
        const eigenDuur = duurVanStap(stap);
        const startMs = eindMs - (na.get(stap.id) ?? 0) * MS - eigenDuur * MS;
        const start = new Date(startMs);

        /* Hele dagen ervoor. Een stap die om 23:00 de avond ervóór begint is
           "1 dag" en niet "0,7 dag" — de kok denkt in dagen, niet in breuken. */
        const dagen = Math.max(0, Math.ceil((eindMs - startMs) / 86_400_000) - 1);

        const deel = stap.componentNaam ? `${stap.componentNaam} — ` : '';

        return {
            recipe_step_id: stap.id,
            text: `${gerechtNaam} — ${deel}${stap.tekst}`,
            scheduled_at: start.toISOString(),
            dagen,
            component_id: stap.component_id,
            gerecht_id: gerechtId,
            materieel_id: stap.materieel_id,
            station_id: stap.station_id,
            bewerking_code: stap.bewerking_code,
            kunde: stap.kunde,
            duur_actief_min: stap.duur_actief_min,
            duur_passief_min: stap.duur_passief_min,
            /* `duration_min` is het oude veld waar het kookbord op rekent.
               Vullen met de som, zodat bestaande schermen blijven werken. */
            duration_min: eigenDuur > 0 ? eigenDuur : null,
            /* Erbij blijven volgt ook uit een herhaling: moet er elk half uur
               iets gebeuren, dan is die wachttijd niet vrij. */
            toezicht_nodig: stap.toezicht_nodig === true || stap.herhaal_interval_min != null,
            plaats: stap.plaats ?? 'thuis',
            priority: stap.step_order,
            magVooruit: stap.component_id != null && magVooruit.has(stap.component_id),
            fase: faseVanStap(stap),
        };
    });
}
