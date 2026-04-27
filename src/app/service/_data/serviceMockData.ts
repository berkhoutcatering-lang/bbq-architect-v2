/* ═══════════════════════════════════════════════════════════════════
   SERVICE MODE — mock data (3 events met courses, mise, allergieën)
   ═══════════════════════════════════════════════════════════════════ */

export type AllergenCode = 'G' | 'L' | 'N' | 'V' | 'VE' | 'E' | 'S' | 'F' | 'M';

export const ALLERGENS: Record<AllergenCode, { label: string; color: string }> = {
    G: { label: 'Gluten', color: '#d97706' },
    L: { label: 'Lactose', color: '#3b82f6' },
    N: { label: 'Noten', color: '#92400e' },
    V: { label: 'Veggie', color: '#10b981' },
    VE: { label: 'Vegan', color: '#059669' },
    E: { label: 'Ei', color: '#facc15' },
    S: { label: 'Soja', color: '#a3a3a3' },
    F: { label: 'Vis', color: '#0ea5e9' },
    M: { label: 'Mosterd', color: '#eab308' },
};

export type CourseStatus = 'queued' | 'active' | 'ready' | 'served' | 'recalled';

export interface CourseStep { n: number; action: string; detail: string }
export interface CourseMise { item: string; qty: string; source?: string }
export interface CourseItem {
    id: string;
    table: number;
    count: number;
    served?: boolean;
    ready?: boolean;
    inProgress?: boolean;
    started?: string;
    special?: string;   /* allergie/dieet-info per tafel */
}

export interface Course {
    id: string;
    num: number;
    title: string;
    emoji: string;
    imgGradient: string;
    prepTime: number;       /* minuten actieve prep */
    serveTime: number;      /* minuten vanaf event-start */
    status: CourseStatus;
    vegOption?: string;
    description: string;
    mise: CourseMise[];
    steps: CourseStep[];
    plating: string[];
    qualityChecks: string[];
    items: CourseItem[];
    aiNote?: string;
}

export interface AllergyEntry {
    table: number;
    seat: number;
    name: string;
    allergens: AllergenCode[];
    note: string;
}

export interface ServiceEvent {
    id: string;
    date: string;
    title: string;
    venue: string;
    guests: number;
    vegGuests: number;
    veganGuests: number;
    glutenFreeGuests: number;
    type: string;
    package: string;
    status: 'live' | 'scheduled' | 'completed';
    startTime: string;
    staff: string[];
    hero: string;
    banner: string;
    allergyTable: AllergyEntry[];
    courses: Course[];
}

const tables = (n: number, count: number, prefix: string, defaults?: Partial<CourseItem>): CourseItem[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `${prefix}_t${i + 1}`, table: i + 1, count,
        served: false, ready: false, inProgress: false,
        ...defaults,
    }));

/* ═══════════════════════════════════════════════════════════════════
   EVENT 1 — LIVE: Bruiloft Joost & Liane (8 gangen, 80p, Singraven)
   ═══════════════════════════════════════════════════════════════════ */
export const EVENT_BRUILOFT: ServiceEvent = {
    id: 'evt_singraven',
    date: 'Vandaag · 14:00',
    title: 'Bruiloft Joost & Liane',
    venue: 'Landgoed Singraven',
    guests: 80, vegGuests: 6, veganGuests: 2, glutenFreeGuests: 3,
    type: 'Bruiloft',
    package: 'Premium 8-gangs Wedding BBQ',
    status: 'live',
    startTime: '15:00',
    staff: ['MB', 'LV', 'JD', 'KE'],
    hero: '💍',
    banner: 'linear-gradient(135deg, #6b3410, #2a1a0a)',
    allergyTable: [
        { table: 1, seat: 3, name: 'Tante Greet', allergens: ['N'], note: 'Notenallergie — strikt' },
        { table: 2, seat: 7, name: 'Sjoerd', allergens: ['G'], note: 'Coeliakie' },
        { table: 4, seat: 2, name: 'Mevr. Berghuis', allergens: ['L'], note: 'Lactose-intolerant' },
        { table: 5, seat: 8, name: 'Lars (8jr)', allergens: ['VE'], note: 'Vegan kind' },
        { table: 7, seat: 1, name: 'Anouk', allergens: ['F'], note: 'Geen vis' },
    ],
    courses: [
        {
            id: 'c1', num: 1, title: 'Brood & Boters', emoji: '🥖',
            imgGradient: 'linear-gradient(135deg, #c4a35a, #6b4a18)',
            prepTime: 5, serveTime: 0, status: 'served',
            description: 'Vers gebakken zuurdesem met gerookte boter, boschampignon-tapenade en aioli.',
            mise: [
                { item: 'Zuurdesem brood', qty: '8 broden', source: 'Bakker Holtkamp' },
                { item: 'Gerookte boter', qty: '500g', source: 'Eigen smoker' },
                { item: 'Tapenade champignons', qty: '400g' },
                { item: 'Aioli', qty: '300g' },
            ],
            steps: [
                { n: 1, action: 'Brood in 8 stukken snijden', detail: '2cm dik, plankje per tafel' },
                { n: 2, action: 'Boter op kamertemp', detail: '15min vooraf uit koeling' },
                { n: 3, action: 'Tapenade in ramekins', detail: '40g per tafel' },
                { n: 4, action: 'Aioli erbij', detail: '30g per tafel' },
            ],
            plating: ['Plankje per tafel', 'Boter in ramekin links', 'Tapenade midden, aioli rechts'],
            qualityChecks: ['Brood vers en niet droog', 'Boter zacht', 'Garnering basilicum'],
            items: tables(10, 8, 'c1', { served: true }),
        },
        {
            id: 'c2', num: 2, title: 'Carpaccio · Black Angus', emoji: '🥩',
            imgGradient: 'linear-gradient(135deg, #8b1a1a, #2a0a0a)',
            prepTime: 12, serveTime: 30, status: 'served',
            description: 'Dun gesneden Black Angus, truffelmayonaise, oude grana, rucola, geroosterde pijnboompitten.',
            mise: [
                { item: 'Carpaccio Black Angus', qty: '2.4kg (30g/p)', source: 'Sligro' },
                { item: 'Truffelmayonaise', qty: '500g' },
                { item: 'Grana padano 24mnd', qty: '300g' },
                { item: 'Rucola', qty: '500g' },
                { item: 'Pijnboompitten', qty: '200g geroosterd' },
                { item: 'Truffel-olie', qty: '100ml' },
            ],
            steps: [
                { n: 1, action: 'Carpaccio uitleggen', detail: '4 plakjes per bord, niet overlappend' },
                { n: 2, action: 'Mayo dotjes', detail: '5 dotjes diagonaal' },
                { n: 3, action: 'Grana schaven', detail: '6 schilfers per bord, dun' },
                { n: 4, action: 'Rucola center', detail: 'Klein bosje, geen dressing' },
                { n: 5, action: 'Pijnboompitten', detail: 'Lichte regen' },
                { n: 6, action: 'Truffelolie afwerken', detail: '2 druppels — niet meer' },
            ],
            plating: [
                '4 plakjes carpaccio diagonaal',
                '5 dotjes truffelmayo tussen vlees',
                'Rucola-bosje midden',
                'Grana erover, pijnboompitten',
                'Truffelolie afsluiten',
            ],
            qualityChecks: ['Vlees rosé, niet bruin', 'Mayo niet uitgelopen', 'Garnering vers'],
            items: tables(10, 8, 'c2', { served: true }),
        },
        {
            id: 'c3', num: 3, title: 'Gerookte Zalm', emoji: '🐟',
            imgGradient: 'linear-gradient(135deg, #f97316, #7c2d12)',
            prepTime: 18, serveTime: 60, status: 'ready',
            description: 'Eigen gerookte zalm met dille-yoghurt, gepofte gerst, augurk en mierikswortelschuim.',
            mise: [
                { item: 'Gerookte zalm', qty: '2.0kg (25g/p)', source: 'Eigen smoker · gisteren' },
                { item: 'Dille-yoghurt', qty: '600g' },
                { item: 'Gepofte gerst', qty: '300g' },
                { item: 'Augurk gesneden', qty: '400g' },
                { item: 'Mierikswortelschuim', qty: '500ml siphon' },
                { item: 'Dille verse takjes', qty: '20 takjes' },
            ],
            steps: [
                { n: 1, action: 'Zalm op temperatuur', detail: '15min uit koeling — niet ijskoud' },
                { n: 2, action: 'Yoghurt cirkel', detail: 'Half-cirkel achtergrond' },
                { n: 3, action: 'Zalm plooien', detail: '2 plooien per bord, golvend' },
                { n: 4, action: 'Gerst sprenkelen', detail: 'Crunch over zalm' },
                { n: 5, action: 'Augurk dotjes', detail: '3 plakjes random' },
                { n: 6, action: 'Schuim siphon', detail: '3 dotjes' },
                { n: 7, action: 'Dille tip', detail: 'Klein takje als tip' },
            ],
            plating: [
                'Yoghurt half-cirkel achtergrond',
                'Zalm 2 plooien — golvend',
                'Gerst voor crunch',
                'Schuim 3 dotjes uit siphon',
                'Dille tip',
            ],
            qualityChecks: ['Zalm op kamertemperatuur', 'Schuim luchtig', 'Yoghurt geen huidje'],
            vegOption: 'Vegan: gepofte boekweit met avocado-mousse',
            items: [
                { id: 'c3_t1', table: 1, count: 8, ready: true },
                { id: 'c3_t2', table: 2, count: 7, ready: true, special: 'glutenvrij voor seat 7 (Sjoerd)' },
                { id: 'c3_t3', table: 3, count: 8, ready: true },
                { id: 'c3_t4', table: 4, count: 8, ready: true },
                { id: 'c3_t5', table: 5, count: 7, ready: true, special: 'vegan voor Lars (seat 8)' },
                { id: 'c3_t6', table: 6, count: 8, ready: true },
                { id: 'c3_t7', table: 7, count: 7, ready: true, special: 'GEEN VIS voor Anouk (seat 1)' },
                { id: 'c3_t8', table: 8, count: 8, ready: true },
                { id: 'c3_t9', table: 9, count: 8, ready: true },
                { id: 'c3_t10', table: 10, count: 8, ready: true },
            ],
            aiNote: 'Tafel 7 zonder vis — vergeet vegan alternatief niet',
        },
        {
            id: 'c4', num: 4, title: 'Rib Eye Tartaar', emoji: '🥩',
            imgGradient: 'linear-gradient(135deg, #dc2626, #450a0a)',
            prepTime: 20, serveTime: 90, status: 'active',
            description: 'Rib eye gehakt, gerookte eidooier, krokante kappertjes, brioche-toast.',
            mise: [
                { item: 'Rib eye gehakt', qty: '3.2kg (40g/p)', source: 'Vers gehakt — 30min' },
                { item: 'Eidooier gerookt', qty: '80 stuks', source: 'Eigen smoker · 90 sec' },
                { item: 'Kappertjes krokant', qty: '300g' },
                { item: 'Brioche toast', qty: '160 plakken (2 p/p)' },
                { item: 'Sjalot brunoise', qty: '600g' },
                { item: 'Mosterd crème', qty: '400g' },
                { item: 'Worcestershire', qty: '200ml' },
            ],
            steps: [
                { n: 1, action: 'Tartaar mengen', detail: '40g vlees + sjalot + mosterd + worcestershire. Hand-mengen, niet kneden.' },
                { n: 2, action: 'Tartaar in ring', detail: 'Cilinder ø6cm, 2.5cm hoog' },
                { n: 3, action: 'Eidooier op top', detail: 'Voorzichtig — niet doorprikken' },
                { n: 4, action: 'Kappertjes erover', detail: '5-6 stuks rondom dooier' },
                { n: 5, action: 'Brioche aanleg', detail: '2 plakken aangeleund' },
                { n: 6, action: 'Maldon zout', detail: 'Snufje op brioche' },
            ],
            plating: [
                'Tartaar cilinder 6cm',
                'Eidooier perfect bovenop — INTACT',
                'Kappertjes verspreid',
                '2 plakken brioche 45° aangeleund',
                'Maldon zout finish',
            ],
            qualityChecks: ['Tartaar koud — laatste minuut', 'Eidooier intact en glanzend', 'Brioche knapperig', 'Geen vleessap op bord'],
            vegOption: 'Veggie: bietentartaar met geitenkaas-mousse',
            items: [
                { id: 'c4_t1', table: 1, count: 8, inProgress: true, started: '15:42' },
                { id: 'c4_t2', table: 2, count: 7, inProgress: true, started: '15:42', special: 'glutenvrij brioche voor Sjoerd' },
                { id: 'c4_t3', table: 3, count: 8, inProgress: true, started: '15:43' },
                { id: 'c4_t4', table: 4, count: 8, special: 'lactosevrij — geen mosterd-crème (zure room)' },
                { id: 'c4_t5', table: 5, count: 7, special: 'VEGAN bietentartaar voor Lars' },
                { id: 'c4_t6', table: 6, count: 8 },
                { id: 'c4_t7', table: 7, count: 8 },
                { id: 'c4_t8', table: 8, count: 8 },
                { id: 'c4_t9', table: 9, count: 8 },
                { id: 'c4_t10', table: 10, count: 8 },
            ],
            aiNote: 'Tafel 1+2+3 al begonnen — tafel 4 lactosevrij niet vergeten',
        },
        {
            id: 'c5', num: 5, title: 'Pulled Pork Slider', emoji: '🍔',
            imgGradient: 'linear-gradient(135deg, #92400e, #1a0a0a)',
            prepTime: 15, serveTime: 120, status: 'queued',
            description: 'Eigen low&slow pulled pork (16u smoke), bourbon BBQ-saus, augurk-coleslaw, brioche bun.',
            mise: [
                { item: 'Pulled pork', qty: '4.8kg (60g/p)', source: 'Smoker 1 · 16u' },
                { item: 'Brioche buns', qty: '80 stuks' },
                { item: 'Bourbon BBQ saus', qty: '1.2L' },
                { item: 'Coleslaw', qty: '2kg' },
                { item: 'Augurken', qty: '400g gesneden' },
            ],
            steps: [
                { n: 1, action: 'PP opwarmen', detail: 'Bain-marie 75°C, vocht erbij' },
                { n: 2, action: 'Bun snijden + warmen', detail: '30 sec onder salamander' },
                { n: 3, action: 'PP doseren', detail: '60g per slider, met saus erin' },
                { n: 4, action: 'Coleslaw top', detail: '20g bovenop' },
                { n: 5, action: 'Augurk', detail: '2 plakjes' },
                { n: 6, action: 'Bovenkant bun', detail: 'Lichtjes plakken' },
            ],
            plating: ['Slider rechtop op plankje', 'Augurk-prikkertje door bun', 'Saus naast in dippot'],
            qualityChecks: ['PP saftig (niet droog)', 'Bun warm maar niet hard', 'Saus niet doorgelopen'],
            items: tables(10, 8, 'c5'),
            aiNote: 'PP ophalen uit warmhoudkast om 16:35 — 25min voor uitserveren',
        },
        {
            id: 'c6', num: 6, title: 'Brisket · Low & Slow', emoji: '🔥',
            imgGradient: 'linear-gradient(135deg, #ef4444, #1a0a0a)',
            prepTime: 25, serveTime: 180, status: 'queued',
            description: 'USDA Choice brisket, 18u low&slow, koffierub, smoked corn, gegrilde mais, jus.',
            mise: [
                { item: 'Brisket gesneden', qty: '6.4kg (80g/p)', source: 'Smoker 1 · 18u' },
                { item: 'Smoked corn puree', qty: '2kg' },
                { item: 'Gegrilde mais kolven', qty: '20 stuks (¼p)' },
                { item: 'Brisket jus', qty: '800ml' },
                { item: 'Microgreens', qty: '100g' },
            ],
            steps: [
                { n: 1, action: 'Brisket warm houden', detail: 'Cambro 60°C tot uitserveren' },
                { n: 2, action: 'Snij tegen de draad', detail: '8mm dik, 80g per portie' },
                { n: 3, action: 'Corn puree base', detail: 'Lepel achtergrond op bord' },
                { n: 4, action: 'Brisket aanleg', detail: '3 plakken waaier op puree' },
                { n: 5, action: 'Gegrilde mais', detail: '¼ kolf rechts' },
                { n: 6, action: 'Jus afwerken', detail: 'Lepel jus over brisket' },
                { n: 7, action: 'Microgreens', detail: 'Topping' },
            ],
            plating: ['Corn puree achtergrond', 'Brisket waaier 3 plakken', '¼ kolf gegrilde mais', 'Jus erover', 'Microgreens topping'],
            qualityChecks: ['Smoke-ring zichtbaar', 'Pull test 3sec', 'Jus warm en glanzend'],
            vegOption: 'Vegan: gerookte aubergine-roulade met miso',
            items: tables(10, 8, 'c6'),
            aiNote: 'Brisket pull-test elke 30min — moet "geven als boter"',
        },
        {
            id: 'c7', num: 7, title: 'Kaasplankje', emoji: '🧀',
            imgGradient: 'linear-gradient(135deg, #fbbf24, #78350f)',
            prepTime: 10, serveTime: 240, status: 'queued',
            description: '4 lokale kazen — Twentse oude, blauwader, brie, geitenkaas — chutney en walnoot-cracker.',
            mise: [
                { item: '4 kazen 80p', qty: '20g/p elk', source: 'Boerderij De Maat' },
                { item: 'Chutney appel-vijg', qty: '600g' },
                { item: 'Walnoot crackers', qty: '160 stuks' },
                { item: 'Druiven', qty: '1kg' },
            ],
            steps: [
                { n: 1, action: 'Kazen op temp', detail: '30min voor uitserveren uit koeling' },
                { n: 2, action: 'Aanleg per plankje', detail: '4 stukjes, 5cm uit elkaar' },
                { n: 3, action: 'Chutney', detail: 'Klein potje (15g) erbij' },
                { n: 4, action: 'Crackers', detail: '2 crackers ernaast' },
                { n: 5, action: 'Druiven', detail: '5 druifjes garneren' },
            ],
            plating: ['4 kazen op plankje', 'Chutney potje', '2 crackers', '5 druiven'],
            qualityChecks: ['Kazen op kamertemperatuur', 'Visueel kleurrijk', 'Crackers krokant'],
            items: tables(10, 8, 'c7'),
        },
        {
            id: 'c8', num: 8, title: 'Dessert · Smoked Crème Brûlée', emoji: '🍮',
            imgGradient: 'linear-gradient(135deg, #fef08a, #422006)',
            prepTime: 15, serveTime: 290, status: 'queued',
            description: 'Gerookte vanille crème brûlée, bourbon-karamel, vers fruit van het seizoen.',
            mise: [
                { item: 'Crème brûlée pots', qty: '80 stuks' },
                { item: 'Suiker fijn', qty: '500g' },
                { item: 'Bourbon karamel', qty: '600ml' },
                { item: 'Vers fruit', qty: '2kg seizoens' },
            ],
            steps: [
                { n: 1, action: 'Pots klaarzetten', detail: 'Op tray, geen condens' },
                { n: 2, action: 'Suiker', detail: 'Dunne laag, egaal' },
                { n: 3, action: 'Branden', detail: 'Brander 15cm, donkerbruin niet zwart' },
                { n: 4, action: 'Karamel rondom', detail: 'Cirkel om pot' },
                { n: 5, action: 'Fruit', detail: 'Klein bosje vers fruit ernaast' },
            ],
            plating: ['Pot midden bord', 'Suikerlaag goudbruin', 'Karamel cirkel', 'Vers fruit ernaast'],
            qualityChecks: ['Suikerlaag goudbruin — TIK test', 'Crème niet warm', 'Fruit vers'],
            vegOption: 'Vegan: kokosmelk crème brûlée',
            items: tables(10, 8, 'c8'),
        },
    ],
};

/* ═══════════════════════════════════════════════════════════════════
   EVENT 2 — TechCorp Bedrijfsfeest (4 gangen, 80p, morgen 16:00)
   ═══════════════════════════════════════════════════════════════════ */
const simpleCourse = (id: string, num: number, title: string, opts: Partial<Course> & { description: string }): Course => ({
    id, num, title, emoji: opts.emoji || '🍽️',
    imgGradient: opts.imgGradient || 'linear-gradient(135deg, #2a1a0a, #1a1a1a)',
    prepTime: opts.prepTime || 15, serveTime: opts.serveTime || 0,
    status: opts.status || 'queued',
    description: opts.description,
    mise: opts.mise || [], steps: opts.steps || [],
    plating: opts.plating || [], qualityChecks: opts.qualityChecks || [],
    items: opts.items || tables(10, 8, id),
    vegOption: opts.vegOption, aiNote: opts.aiNote,
});

export const EVENT_TECHCORP: ServiceEvent = {
    id: 'evt_techcorp',
    date: 'Morgen · 16:00',
    title: 'TechCorp Bedrijfsfeest',
    venue: 'HQ Hengelo',
    guests: 80, vegGuests: 12, veganGuests: 4, glutenFreeGuests: 5,
    type: 'Bedrijfsfeest', package: 'Low & Slow All-In',
    status: 'scheduled', startTime: '16:00',
    staff: ['MB', 'LV', 'JD'],
    hero: '🏢',
    banner: 'linear-gradient(135deg, #1e3a8a, #0a0a1a)',
    allergyTable: [
        { table: 1, seat: 4, name: 'CFO Kramer', allergens: ['G'], note: 'Coeliakie' },
        { table: 3, seat: 2, name: 'Lisa', allergens: ['L', 'E'], note: 'Lactose + ei' },
        { table: 5, seat: 6, name: 'Stagiair Bram', allergens: ['VE'], note: 'Vegan' },
    ],
    courses: [
        simpleCourse('tc1', 1, 'Welkomsthapje', { emoji: '🥃', prepTime: 5, description: 'Whisky-cured zalm canapé.', imgGradient: 'linear-gradient(135deg, #b45309, #1a0a0a)' }),
        simpleCourse('tc2', 2, 'Pulled Pork Buffet', { emoji: '🍔', prepTime: 30, serveTime: 60, description: 'Buffet-stijl met PP, brisket, sides.', imgGradient: 'linear-gradient(135deg, #92400e, #1a0a0a)' }),
        simpleCourse('tc3', 3, 'Brisket Hoofdgang', { emoji: '🥩', prepTime: 25, serveTime: 120, description: 'Brisket met smoked corn.', imgGradient: 'linear-gradient(135deg, #ef4444, #1a0a0a)' }),
        simpleCourse('tc4', 4, 'Dessert', { emoji: '🍰', prepTime: 10, serveTime: 200, description: 'Smoked apple crumble.', imgGradient: 'linear-gradient(135deg, #f97316, #1a0a0a)' }),
    ],
};

/* ═══════════════════════════════════════════════════════════════════
   EVENT 3 — Diner Familie Berghuis (3 gangen, 24p)
   ═══════════════════════════════════════════════════════════════════ */
export const EVENT_BERGHUIS: ServiceEvent = {
    id: 'evt_berghuis',
    date: 'Za 30 mei · 17:00',
    title: 'Verjaardag Familie Berghuis',
    venue: 'Privé locatie Goor',
    guests: 24, vegGuests: 2, veganGuests: 0, glutenFreeGuests: 1,
    type: 'Verjaardag', package: 'Pulled Pork & Brisket',
    status: 'scheduled', startTime: '17:00',
    staff: ['MB', 'LV'],
    hero: '🎂',
    banner: 'linear-gradient(135deg, #7c2d12, #1a0a0a)',
    allergyTable: [
        { table: 1, seat: 5, name: 'Opa', allergens: ['L'], note: 'Lactose' },
    ],
    courses: [
        simpleCourse('br1', 1, 'Voorgerecht Carpaccio', { emoji: '🥩', prepTime: 12, description: 'Black Angus carpaccio.', imgGradient: 'linear-gradient(135deg, #8b1a1a, #2a0a0a)', items: tables(3, 8, 'br1') }),
        simpleCourse('br2', 2, 'Hoofdgang BBQ Plateau', { emoji: '🔥', prepTime: 20, serveTime: 60, description: 'PP, brisket, sides.', imgGradient: 'linear-gradient(135deg, #92400e, #1a0a0a)', items: tables(3, 8, 'br2') }),
        simpleCourse('br3', 3, 'Dessert Crème Brûlée', { emoji: '🍮', prepTime: 12, serveTime: 150, description: 'Smoked crème brûlée.', imgGradient: 'linear-gradient(135deg, #fef08a, #422006)', items: tables(3, 8, 'br3') }),
    ],
};

export const SERVICE_EVENTS: ServiceEvent[] = [EVENT_BRUILOFT, EVENT_TECHCORP, EVENT_BERGHUIS];

export interface ServiceAIDirective {
    severity: 'critical' | 'opportunity' | 'info';
    title: string;
    body: string;
}

export const SERVICE_AI_DIRECTIVES: ServiceAIDirective[] = [
    { severity: 'critical', title: 'Tafel 4 lactosevrij!', body: 'Vervang mosterd-crème door zure room voor C4 (Rib Eye Tartaar)' },
    { severity: 'opportunity', title: 'Plaats-optimalisatie', body: 'Begin direct met C5 (PP) — heeft 25min voor uitgifte, kan parallel met C4' },
    { severity: 'info', title: 'Op schema', body: 'Service loopt 2min voor planning. Volgende uitgifte 16:05' },
];
