/**
 * Koppelt de apparatuur die een techniek nodig heeft aan wat er echt in de
 * keuken staat.
 *
 * Zie docs/agent-architectuur-plan.md hoofdstuk 6.9: het gemis-rapport valt
 * gratis uit twee lijsten naast elkaar. Elke techniek noemt zijn apparaat, de
 * materieel-lijst noemt wat je hebt, en het verschil is je gemiste repertoire.
 *
 * Het matchen gebeurt in twee stappen, in deze volgorde:
 *   1. Expliciet — staat de apparaat-code in `maakt_mogelijk`, dan is dat de
 *      waarheid. Dat is het veld waarmee jij een misser corrigeert.
 *   2. Trefwoorden — anders raden we op naam en type.
 *
 * Die tweede stap is een gok en dat moet zichtbaar zijn: het rapport toont
 * wélk item matchte, zodat een misser opvalt. Een aanhanger met "Yoder" in de
 * naam is geen smoker, en dat zie je alleen als je het laat zien.
 */

export interface MaterieelItem {
    id: number | string;
    naam: string;
    type?: string | null;
    soort?: string | null;
    maakt_mogelijk?: string[] | null;
}

export interface ApparaatTreffer {
    apparaat: string;
    aanwezig: boolean;
    /** Welk item de match opleverde — leeg als er niets matchte. */
    item: MaterieelItem | null;
    /** Hoe zeker we zijn. Expliciet is jouw eigen invoer, geraden is trefwoord. */
    zekerheid: 'expliciet' | 'geraden' | 'geen';
}

/** Trefwoorden per apparaat-code. Merknamen erbij, want zo staan ze in de
 *  praktijk in een spullenlijst — niemand noemt zijn machine "groentesnijder". */
const TREFWOORDEN: Record<string, string[]> = {
    smoker: ['smoker', 'kamado', 'offset', 'pelletsmoker'],
    grill: ['grill', 'barbecue', 'rooster', 'plancha'],
    oven: ['oven', 'combisteamer', 'steamer', 'heteluchtoven'],
    fornuis: ['fornuis', 'inductie', 'kookplaat', 'gaspit', 'brander', 'kooktoestel'],
    pan: ['pan', 'sauteuse', 'braadslede', 'wok'],
    friteuse: ['friteuse', 'frituur'],
    blender: ['blender', 'vitamix', 'thermoblender'],
    staafmixer: ['staafmixer', 'bamix', 'handblender'],
    mixer: ['mixer', 'kitchenaid', 'planeetmenger', 'keukenmachine'],
    groentesnijder: ['groentesnijder', 'robot coupe', 'robot-coupe', 'cl50', 'cl 50', 'cutter'],
    snijmachine: ['snijmachine', 'berkel', 'bizerba', 'slicer', 'aufschnitt'],
    sifon: ['sifon', 'kidde', 'slagroomspuit'],
    vacuummachine: ['vacuum', 'vacuüm', 'sealer', 'alvac', 'henkelman'],
    'sous-vide': ['sous vide', 'sous-vide', 'sousvide', 'circulator', 'waterbad'],
    koeling: ['koeling', 'koelkast', 'koelwerkbank', 'koelcel', 'koelvitrine'],
    vriezer: ['vriezer', 'diepvries', 'freezer', 'vrieskist'],
    koelbox: ['koelbox', 'cambro', 'isolatiebox', 'thermobox'],
    'bain-marie': ['bain marie', 'bain-marie', 'bainmarie', 'chafing', 'warmhoud'],
    werkbank: ['werkbank', 'werktafel', 'snijplank', 'roestvrijstalen tafel'],
};

function normaliseer(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Zoekt voor één apparaat-code het beste item in de keuken. */
export function zoekApparaat(apparaat: string, spullen: MaterieelItem[]): ApparaatTreffer {
    const code = normaliseer(apparaat);

    /* 1. Expliciet — jouw eigen invoer wint altijd.
       Alleen `maakt_mogelijk`, bewust niet `soort`: dat laatste is de categorie
       (apparatuur, servies, opslag, gn_bak) en geen apparaat-code. Één veld voor
       twee betekenissen levert precies het soort stille verwarring op waar deze
       hele bibliotheek vanaf moet. */
    const expliciet = spullen.find((m) =>
        (m.maakt_mogelijk ?? []).some((v) => normaliseer(String(v)) === code)
    );
    if (expliciet) return { apparaat, aanwezig: true, item: expliciet, zekerheid: 'expliciet' };

    // 2. Trefwoorden — een gok, en dat laten we zien.
    const woorden = TREFWOORDEN[code] ?? [code];
    const geraden = spullen.find((m) => {
        const hooiberg = normaliseer(`${m.naam} ${m.type ?? ''} ${m.soort ?? ''}`);
        return woorden.some((w) => hooiberg.includes(w));
    });
    if (geraden) return { apparaat, aanwezig: true, item: geraden, zekerheid: 'geraden' };

    return { apparaat, aanwezig: false, item: null, zekerheid: 'geen' };
}

export interface TechniekRegel {
    slug: string;
    naam: string;
    apparaat: string | null;
    eindtextuur?: string | null;
}

export interface GemisRapport {
    /** Wat je kunt, met het apparaat dat het mogelijk maakt. */
    open: { techniek: TechniekRegel; treffer: ApparaatTreffer }[];
    /** Wat je niet kunt, gegroepeerd per ontbrekend apparaat — want één
     *  aanschaf opent vaak meerdere technieken tegelijk, en dat is precies
     *  het getal dat een investering rechtvaardigt. */
    gesloten: { apparaat: string; technieken: TechniekRegel[] }[];
    /** Technieken zonder apparaat: die kun je altijd. */
    zonderApparaat: TechniekRegel[];
}

export function maakGemisRapport(technieken: TechniekRegel[], spullen: MaterieelItem[]): GemisRapport {
    const open: GemisRapport['open'] = [];
    const zonderApparaat: TechniekRegel[] = [];
    const perApparaat = new Map<string, TechniekRegel[]>();

    /* Één zoekopdracht per apparaat, niet per techniek: veertig technieken op
       twintig apparaten zou anders veertig keer dezelfde lijst doorlopen. */
    const cache = new Map<string, ApparaatTreffer>();

    for (const t of technieken) {
        if (!t.apparaat) {
            zonderApparaat.push(t);
            continue;
        }
        let treffer = cache.get(t.apparaat);
        if (!treffer) {
            treffer = zoekApparaat(t.apparaat, spullen);
            cache.set(t.apparaat, treffer);
        }
        if (treffer.aanwezig) {
            open.push({ techniek: t, treffer });
        } else {
            const lijst = perApparaat.get(t.apparaat) ?? [];
            lijst.push(t);
            perApparaat.set(t.apparaat, lijst);
        }
    }

    return {
        open,
        // Meeste winst bovenaan: het apparaat dat de meeste deuren opent.
        gesloten: [...perApparaat.entries()]
            .map(([apparaat, technieken]) => ({ apparaat, technieken }))
            .sort((a, b) => b.technieken.length - a.technieken.length),
        zonderApparaat,
    };
}
