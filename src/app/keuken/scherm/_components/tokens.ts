/**
 * De kleuren en maten van het wandscherm.
 *
 * Overgenomen uit het design-systeem (Keukenscherm v2). Bewust hier als
 * constanten en niet als Tailwind-klassen: dit scherm heeft een eigen palet
 * dat niets met de rest van de app te maken heeft, en één plek om het te
 * veranderen is hier meer waard dan hergebruik.
 *
 * De ondergrond is mat zwart omdat dit ding vierentwintig uur per dag aan
 * staat. Een wit vlak van 1920 × 1080 is in een werkruimte een lamp.
 */

export const K = {
    /** De wand. */
    zwart: '#17181A',
    /** De statusbalk, een tint dieper. */
    balk: '#131415',
    /** Een vlak dat iets draagt. */
    vlak: '#1F2022',
    /** Wat hij nu moet weten. */
    wit: '#EDE9E1',
    /** Wat kan schuiven. */
    stof: '#8C8B84',
    /** Nog verder naar achter. */
    stofDiep: '#5F5E58',
    /** Nu, en de vrije ruimte. */
    olijf: '#6B7A3F',
    olijfLicht: '#A6BA6A',
    olijfDonker: '#4A5330',
    olijfDiep: '#3A4227',
    /** Herplant, maar haalbaar. */
    waarschuwing: '#C9A14A',
    /** Niet haalbaar, of het scherm klopt niet. */
    alarm: '#B4442F',
    grijs: '#2A2B2C',
    lijn: 'rgba(237,233,225,.12)',
    lijnSterk: 'rgba(237,233,225,.3)',
} as const;

/* De app laadt Outfit, DM Sans en IBM Plex Mono al via next/font (zie
   src/app/layout.tsx) en zet ze als CSS-variabelen. Die hergebruiken we —
   de families opnieuw bij naam noemen zou ze een tweede keer laten laden,
   of erger: stil terugvallen op een systeemletter. */
export const LETTER = {
    display: 'var(--font-display)',
    tekst: 'var(--font-sans)',
    cijfer: 'var(--font-mono)',
} as const;

/** Het etiket bij elke duur. Nooit weglaten — dat is de kern van het ontwerp. */
export const BRON_LABEL: Record<string, string> = {
    geschat: 'GESCHAT',
    monitor: 'MONITOR',
    gemeten: 'GEMETEN',
    handmatig: 'HANDMATIG',
    verwacht: 'VERWACHT',
};

/** Alleen `gemeten` krijgt kleur; de rest blijft bewust ingetogen. */
export function bronKleur(bron: string): string {
    return bron === 'gemeten' ? K.olijfLicht : K.stof;
}

export function bronRand(bron: string): string {
    return bron === 'gemeten' ? 'rgba(166,186,106,.45)' : K.lijnSterk;
}

/** De kop boven NU: het antwoord op "ben ik bezig of ben ik vrij". */
export function aandachtKop(aandacht: string, wachtNog: string | null): string {
    switch (aandacht) {
        case 'actief':
            return 'JE BENT BEZIG';
        case 'passief_gebonden':
            return 'JE BENT VRIJ · BLIJF IN DE BUURT';
        case 'passief_bewaakt':
            return 'BLIJF ERBIJ';
        default:
            return wachtNog ? `JE BENT VRIJ · ${wachtNog.toUpperCase()}` : 'JE BENT VRIJ';
    }
}
