/**
 * Instellingen → Toonbank (BA-7a): wat het beheerscherm toont, zonder
 * database of scherm. Puur, dus te testen.
 */

/** Wat de server action na "Tablet toevoegen" of "Nieuwe code" teruggeeft. */
export interface NieuweKoppelcode {
    apparaat_id: string;
    code: string;
    naam: string;
    /** 6 cijfers; alleen nu te zien, de database kent alleen de hash. */
    koppelcode: string;
    geldig_tot: string;
}

/** Een tablet zoals het beheerscherm hem leest (zonder hashes: kolomrechten). */
export interface TabletRij {
    id: string;
    naam: string;
    code: string;
    locatie: 'winkel' | 'event';
    sleutel_prefix: string | null;
    gekoppeld_at: string | null;
    koppelcode_geldig_tot: string | null;
    koppelpogingen: number;
    laatst_gezien_at: string | null;
    app_versie: string | null;
    contract_versie: string | null;
    hoogste_volgnummer_gemeld: number;
    bevestigd_tot_volgnummer: number;
    ingetrokken_at: string | null;
    ingetrokken_reden: string | null;
}

export type TabletStatus = 'ingetrokken' | 'wacht_op_koppelen' | 'code_verlopen' | 'gekoppeld' | 'nooit_gekoppeld';

/**
 * Review M2 (klein 7): een foute koppelcode telde mee bij álle open codes, en na 5 verviel een
 * code: vijf verzoeken blokkeerden het koppelen voor iedereen. Nu per bron (SHA-256 van het
 * IP-adres): hooguit 5 foute codes per 15 minuten (daarna 429), en een code vervalt pas na 25
 * foute pogingen, dus van minstens 5 bronnen. Zie toonbank_koppel_mislukt en _geblokkeerd.
 */
export const KOPPEL_POGINGEN_PER_BRON = 5;
export const KOPPEL_BRON_MINUTEN = 15;
export const KOPPEL_MAX_POGINGEN = 25;

export function tabletStatus(t: Pick<TabletRij, 'ingetrokken_at' | 'gekoppeld_at' | 'koppelcode_geldig_tot' | 'koppelpogingen'>, nu: Date = new Date()): TabletStatus {
    if (t.ingetrokken_at) return 'ingetrokken';
    const codeOpen = t.koppelcode_geldig_tot != null && new Date(t.koppelcode_geldig_tot).getTime() > nu.getTime() && t.koppelpogingen < KOPPEL_MAX_POGINGEN;
    if (codeOpen) return 'wacht_op_koppelen';
    if (t.gekoppeld_at) return 'gekoppeld';
    return t.koppelcode_geldig_tot != null ? 'code_verlopen' : 'nooit_gekoppeld';
}

export const STATUS_TEKST: Record<TabletStatus, string> = {
    ingetrokken: 'Ingetrokken',
    wacht_op_koppelen: 'Wacht op koppelen',
    code_verlopen: 'Code verlopen',
    gekoppeld: 'Gekoppeld',
    nooit_gekoppeld: 'Nog niet gekoppeld',
};

/** Meldingen die de tablet heeft maar die nog niet in het journaal staan. */
export function achterstand(t: Pick<TabletRij, 'hoogste_volgnummer_gemeld' | 'bevestigd_tot_volgnummer'>): number {
    return Math.max(0, t.hoogste_volgnummer_gemeld - t.bevestigd_tot_volgnummer);
}

/** "nog 4:59" tot de koppelcode verloopt, of null als hij al verlopen is. */
export function resterendeTijd(geldigTot: string, nu: Date = new Date()): string | null {
    const ms = new Date(geldigTot).getTime() - nu.getTime();
    if (!(ms > 0)) return null;
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "042917" → "042 917": makkelijker over te tikken. */
export function toonKoppelcode(code: string): string {
    return /^\d{6}$/.test(code) ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Een inlogcode die te makkelijk te raden is (1111, 1234, 9876). */
export function zwakkeInlogcode(code: string): boolean {
    return /^(\d)\1+$/.test(code) || '01234567890'.includes(code) || '09876543210'.includes(code);
}
