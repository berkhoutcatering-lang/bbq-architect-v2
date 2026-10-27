import type { Personeel } from '@/types';

/**
 * De kolommen die de app (usePersoneel) van personeel leest. Nooit
 * select('*'): kds_pin_hash (de inlogcode van KDS en Toonbank, scrypt van 4-6
 * cijfers) is voor ingelogde gebruikers niet leesbaar (review M2 K4,
 * kolomrechten), en dan faalt '*'. Werkt ook op een database zonder die
 * kolomrechten. Geen Toonbank-kolommen (toonbank_rol, kds_pin_hash,
 * kds_pin_lockout_until): die beheert alleen Instellingen → Toonbank, en wat
 * het personeelscherm niet leest, kan het ook niet terugschrijven
 * (hercontrole M2, N4a).
 */
export const PERSONEEL_KOLOMMEN =
    'id, organization_id, user_id, naam, email, telefoon, functie, uurtarief, contract_type, actief, notitie, created_at';

/**
 * De velden die het personeelscherm (Uren → Personeel, PersoneelDrawer)
 * bewerkt. Alleen deze gaan bij Bewaren naar de database.
 */
export const PERSONEEL_BEWERKBAAR = ['naam', 'email', 'telefoon', 'functie', 'uurtarief', 'contract_type', 'actief', 'notitie'] as const;
export type PersoneelBewerkbaar = (typeof PERSONEEL_BEWERKBAAR)[number];
export type PersoneelWijziging = Partial<Pick<Personeel, PersoneelBewerkbaar>>;

/**
 * Wat er bij Bewaren naar personeel gaat: alleen de velden van het scherm die
 * echt veranderd zijn. Hercontrole M2, N4a: het scherm stuurde de hele rij
 * mee zoals hij was toen het openging, ook kds_pin_lockout_until. Veranderde
 * de blokkade intussen (een tablet blokkeerde een inlogcode), dan kreeg een
 * Medewerker 42501 van trg_personeel_toonbank_bewaken, en hief een Admin de
 * lopende blokkade ongemerkt op. Ook user_id en de andere kolommen die het
 * scherm niet toont, gaan nooit meer mee: een gelijktijdige wijziging
 * elders wordt niet teruggezet.
 *
 * Leeg en null tellen als gelijk (een leeg veld dat leeg blijft, is geen
 * wijziging). Een veld dat niet in `nieuw` staat, blijft buiten beschouwing.
 */
export function personeelWijzigingen(oud: Partial<Personeel>, nieuw: Partial<Personeel>): PersoneelWijziging {
    const uit: Record<string, unknown> = {};
    for (const veld of PERSONEEL_BEWERKBAAR) {
        if (!Object.prototype.hasOwnProperty.call(nieuw, veld)) continue;
        const was = leeg(oud[veld]);
        const wordt = leeg(nieuw[veld]);
        if (was !== wordt) uit[veld] = nieuw[veld];
    }
    return uit as PersoneelWijziging;
}

function leeg(w: unknown): unknown {
    return w === undefined || w === '' ? null : w;
}
