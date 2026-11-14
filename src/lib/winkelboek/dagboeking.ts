/**
 * De dag in hokjes (ontwerp R1): wat er binnenkwam (pin, contant, cadeaubon)
 * tegenover waar het geboekt is (omzet en btw per tarief, statiegeld,
 * afgehaalde webshoporders, afronding). Zuiver: krijgt de bonnen en dagstaten
 * van één bedrijfsdag, geeft centen.
 *
 * De btw wordt opgeteld uit de bon-btw (toonbank_bonnen.btw), nooit opnieuw
 * afgerond: zo geeft dit scherm hetzelfde getal als de dagstaat, de maandstaat
 * en de btw-aangifte.
 */
import { formatEur } from '@/lib/format';

export interface BonMin {
    status: 'afgerond' | 'geannuleerd';
    /** In welke dagafsluiting de bon valt; null = (nog) in geen enkele. */
    dagstaat_id: string | null;
    totaal_cents: number;
    afronding_cents: number;
    /** toonbank_bonnen.btw: {"9": {incl_cents, btw_cents}, "21": {…}} */
    btw: Record<string, { incl_cents: number; btw_cents: number }>;
    statiegeld_cents: number;
    order_rest_cents: number;
    pin_cents: number;
    contant_cents: number;
    cadeaubon_cents: number;
}

export interface DagstaatKort {
    id: string;
    apparaat_id: string;
    bedrijfsdag: string;
    status: 'voorlopig' | 'definitief' | 'aangevuld' | 'goedgekeurd';
    gesloten_at: string;
    aantal_bonnen: number;
    pin_toonbank_cents: number;
    pin_mypos_app_cents: number;
    pin_verschil_cents: number;
    contant_begin_cents: number;
    contant_verwacht_cents: number;
    contant_geteld_cents: number;
    contant_verschil_cents: number;
    afgeroomd_cents: number;
    verschillen: unknown[];
    goedgekeurd_at: string | null;
}

export interface Hokje {
    sleutel: string;
    label: string;
    uitleg: string;
    cents: number;
}

export type DagStand = 'geen_verkoop' | 'open' | 'te_controleren' | 'geboekt';

export interface Dagboeking {
    datum: string;
    binnen: { pin: number; contant: number; cadeaubon: number; totaal: number };
    hokjes: Hokje[];
    totaal_hokjes: number;
    sluit: boolean;
    stand: DagStand;
    /** Afgeronde bonnen, tegenbonnen meegeteld. */
    aantal_bonnen: number;
    /** De laatste dagstaat van de dag. */
    gesloten_at: string | null;
    /** Wat er nog aandacht vraagt, in gewone taal. */
    punten: string[];
}

const euro = (cents: number) => formatEur(Math.abs(cents) / 100);

/**
 * '€ 2,00 te weinig' of '€ 2,00 te veel'. De kassa rekent het kasverschil als
 * geteld − verwacht: onder nul lag er minder in de la dan verwacht.
 */
export function kasVerschilTekst(cents: number): string {
    return `${euro(cents)} ${cents < 0 ? 'te weinig' : 'te veel'}`;
}

/**
 * 'myPOS toont € 5,00 meer dan de kassa'. De kassa rekent het pinverschil als
 * myPOS − kassa: boven nul staat er in de myPOS-app meer dan de kassa telde.
 */
export function pinVerschilTekst(cents: number): string {
    return `myPOS toont ${euro(cents)} ${cents > 0 ? 'meer' : 'minder'} dan de kassa`;
}

/**
 * @param eigenTijdens_cents Som van wat je die dag zelf uit (−) of in (+) de la
 *   deed terwijl de kassa open was. Verklaart dat het kasverschil precies, dan
 *   zegt het punt dat; goedkeuren moet nog steeds (zelfde regel als de
 *   maandstaat en Verkoop → Toonbank → Dagstaten).
 */
export function maakDagboeking(datum: string, bonnen: BonMin[], dagstaten: DagstaatKort[], eigenTijdens_cents = 0): Dagboeking {
    const afgerond = bonnen.filter((b) => b.status === 'afgerond');

    const binnen = { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 };
    const perTarief = new Map<number, { incl: number; btw: number }>();
    let statiegeld = 0;
    let webshop = 0;
    let afronding = 0;

    for (const b of afgerond) {
        binnen.pin += b.pin_cents;
        binnen.contant += b.contant_cents;
        binnen.cadeaubon += b.cadeaubon_cents;
        statiegeld += b.statiegeld_cents;
        webshop += b.order_rest_cents;
        afronding += b.afronding_cents;
        for (const [pct, t] of Object.entries(b.btw ?? {})) {
            const som = perTarief.get(Number(pct)) ?? { incl: 0, btw: 0 };
            som.incl += t.incl_cents;
            som.btw += t.btw_cents;
            perTarief.set(Number(pct), som);
        }
    }
    binnen.totaal = binnen.pin + binnen.contant + binnen.cadeaubon;

    const hokjes: Hokje[] = [];
    for (const pct of [...perTarief.keys()].sort((a, b) => a - b)) {
        const t = perTarief.get(pct)!;
        hokjes.push({ sleutel: `omzet_${pct}`, label: `Omzet ${pct}%`, uitleg: 'Excl. btw', cents: t.incl - t.btw });
        hokjes.push({ sleutel: `btw_${pct}`, label: `Btw ${pct}%`, uitleg: 'Af te dragen', cents: t.btw });
    }
    hokjes.push({ sleutel: 'statiegeld', label: 'Statiegeld', uitleg: 'Geen omzet, geen btw', cents: statiegeld });
    hokjes.push({ sleutel: 'webshop_afgehaald', label: 'Webshop afgehaald', uitleg: 'Omzet stond al bij de webshop', cents: webshop });
    hokjes.push({ sleutel: 'afronding', label: 'Afronding contant', uitleg: 'Op 5 cent', cents: afronding });
    const gevuld = hokjes.filter((h) => h.cents !== 0);

    const totaal_hokjes = gevuld.reduce((s, h) => s + h.cents, 0);
    const sluit = totaal_hokjes === binnen.totaal;

    const punten: string[] = [];
    let stand: DagStand;
    if (dagstaten.length === 0) {
        stand = afgerond.length === 0 ? 'geen_verkoop' : 'open';
        if (stand === 'open') punten.push('De kassa is nog niet afgesloten.');
    } else {
        if (dagstaten.some((s) => s.status === 'voorlopig')) punten.push('De dagstaat is voorlopig: de tablet had nog bonnen te versturen.');
        const kas = dagstaten.filter((s) => s.contant_verschil_cents !== 0 && !s.goedgekeurd_at).reduce((n, s) => n + s.contant_verschil_cents, 0);
        const heeftKas = dagstaten.some((s) => s.contant_verschil_cents !== 0 && !s.goedgekeurd_at);
        if (heeftKas) {
            punten.push(kas !== 0 && kas === eigenTijdens_cents
                ? `Kasverschil: ${kasVerschilTekst(kas)} in de la, verklaard door je eigen kasregel, nog niet goedgekeurd.`
                : `Kasverschil: ${kasVerschilTekst(kas)} in de la, nog niet goedgekeurd.`);
        }
        const pin = dagstaten.filter((s) => s.pin_verschil_cents !== 0 && !s.goedgekeurd_at).reduce((n, s) => n + s.pin_verschil_cents, 0);
        const heeftPin = dagstaten.some((s) => s.pin_verschil_cents !== 0 && !s.goedgekeurd_at);
        if (heeftPin) punten.push(`Pinverschil: ${pinVerschilTekst(pin)}, nog niet goedgekeurd.`);
        if (dagstaten.some((s) => (s.verschillen ?? []).length > 0 && s.status !== 'goedgekeurd')) punten.push('Narekenen uit de bonnen gaf een verschil met de tablet.');
        if (afgerond.some((b) => b.dagstaat_id === null)) punten.push('Er zijn bonnen die in geen dagafsluiting vallen.');
        if (!sluit) punten.push(`De hokjes sluiten niet: ${euro(totaal_hokjes - binnen.totaal)} verschil.`);
        stand = punten.length > 0 ? 'te_controleren' : 'geboekt';
    }

    const gesloten_at = dagstaten.reduce<string | null>((laatst, s) => (laatst === null || s.gesloten_at > laatst ? s.gesloten_at : laatst), null);

    return { datum, binnen, hokjes: gevuld, totaal_hokjes, sluit, stand, aantal_bonnen: afgerond.length, gesloten_at, punten };
}
