/**
 * Pure rekenregels voor de schermen Bonnen, Te controleren en Dagstaten
 * (BA-9, BA-10). Geen database, geen klok.
 *
 * De btw-regel (contract §1.3, review M2): de btw van een dag is de som van
 * de bon-btw per tarief, zonder opnieuw af te ronden. toonbank_bonnen.btw is
 * al de bon-btw ({"21": {incl_cents, btw_cents}}); hier wordt alleen opgeteld.
 * Dezelfde regel staat in SQL in toonbank_dagstaat_herberekenen (BA-10).
 */

export interface BonBtw {
    [pct: string]: { incl_cents: number; btw_cents: number };
}

export interface BonRij {
    id: string;
    soort: 'verkoop' | 'tegenbon';
    status: 'afgerond' | 'geannuleerd';
    totaal_cents: number;
    omzet_incl_cents: number;
    btw: BonBtw | null;
    statiegeld_cents: number;
    order_rest_cents: number;
    korting_cents: number;
    afronding_cents: number;
    pin_cents: number;
    contant_cents: number;
}

export interface TariefTotaal {
    pct: number;
    incl_cents: number;
    grondslag_cents: number;
    btw_cents: number;
}

export interface DagTotalen {
    aantal_bonnen: number;
    aantal_tegenbonnen: number;
    aantal_geannuleerd: number;
    /** Netto per tarief (tegenbonnen eraf), hoogste tarief eerst. */
    omzet: TariefTotaal[];
    omzet_incl_cents: number;
    statiegeld_cents: number;
    order_rest_cents: number;
    tegenbonnen_cents: number;
    korting_cents: number;
    afronding_cents: number;
    pin_cents: number;
    contant_cents: number;
}

/** Som van de bon-btw per tarief van de afgeronde bonnen; nooit opnieuw afronden. */
export function dagTotalen(bonnen: readonly BonRij[]): DagTotalen {
    const perTarief = new Map<number, TariefTotaal>();
    const t: DagTotalen = {
        aantal_bonnen: 0, aantal_tegenbonnen: 0, aantal_geannuleerd: 0, omzet: [], omzet_incl_cents: 0, statiegeld_cents: 0,
        order_rest_cents: 0, tegenbonnen_cents: 0, korting_cents: 0, afronding_cents: 0, pin_cents: 0, contant_cents: 0,
    };
    for (const b of bonnen) {
        if (b.status === 'geannuleerd') { t.aantal_geannuleerd += 1; continue; }
        if (b.soort === 'tegenbon') { t.aantal_tegenbonnen += 1; t.tegenbonnen_cents += Number(b.omzet_incl_cents); } else { t.aantal_bonnen += 1; }
        for (const [pct, d] of Object.entries(b.btw ?? {})) {
            const p = Number(pct);
            const som = perTarief.get(p) ?? { pct: p, incl_cents: 0, grondslag_cents: 0, btw_cents: 0 };
            som.incl_cents += Number(d.incl_cents);
            som.btw_cents += Number(d.btw_cents);
            som.grondslag_cents = som.incl_cents - som.btw_cents;
            perTarief.set(p, som);
        }
        t.omzet_incl_cents += Number(b.omzet_incl_cents);
        t.statiegeld_cents += Number(b.statiegeld_cents);
        t.order_rest_cents += Number(b.order_rest_cents);
        t.korting_cents += Number(b.korting_cents);
        t.afronding_cents += Number(b.afronding_cents);
        t.pin_cents += Number(b.pin_cents);
        t.contant_cents += Number(b.contant_cents);
    }
    t.omzet = [...perTarief.values()].sort((a, b) => b.pct - a.pct);
    return t;
}

/** "€ 3,95"; negatief "−€ 3,95". */
export function euro(centen: number): string {
    const n = Number(centen) || 0;
    const s = (Math.abs(n) / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '−' : ''}€ ${s}`;
}

/** De codes uit het journaal en de controles in gewone taal. */
export const CONTROLE_LABEL: Record<string, string> = {
    schema: 'Voldoet niet aan het contract',
    ongeldig: 'Onleesbare melding',
    dubbel: 'Bestaat al (bonnummer dubbel?)',
    volgnummer_dubbel: 'Volgnummer al gebruikt (gewiste tablet?)',
    soort_onbekend: 'Onbekende soort melding',
    moment_ongeldig: 'Geen geldige tijd',
    contract_verouderd: 'Te oude Toonbank-app',
    wacht_op_bon: 'Tegenbon wacht op zijn bon',
    totaal: 'Totaal klopt niet',
    btw_regel: 'Btw per regel klopt niet',
    contant_limiet: 'Contant boven € 3.000',
    bonnummer: 'Bonnummer past niet bij de tablet',
    leeftijd_ontbreekt: 'Alcohol zonder leeftijdscontrole',
    leeftijd_geweigerd: 'Alcohol na een geweigerde leeftijd',
    medewerker_onbekend: 'Onbekende medewerker',
    regel_onbekend: 'Tegenbon verwijst naar een onbekende regel',
    product_onbekend: 'Onbekend product',
    order_onbekend: 'Restbetaling op een onbekende order',
    rest_dubbel: 'Rest dubbel betaald?',
    rest_bedrag: 'Restbedrag wijkt af',
    goedkeuring_ontbreekt: 'Boven vrij zonder goedkeuring',
    goedkeuring_ongeldig: 'Goedkeuring klopt niet',
    goedkeuring_nodig: 'Offline boven vrij: goedkeuren',
    order_komt_tekort: 'Webshoporder komt tekort',
    dagstaat_verschil: 'Dagstaat wijkt af van de bonnen',
};

export function controleLabel(code: string | null | undefined): string {
    if (!code) return 'Te controleren';
    return CONTROLE_LABEL[code] ?? code;
}

export const SOORT_LABEL: Record<string, string> = {
    bon: 'Bon', tegenbon: 'Tegenbon', pinpoging: 'Pinpoging', inloggen: 'Inloggen', uitloggen: 'Uitloggen',
    vrij_overschreden: 'Boven vrij verkocht', dag_openen: 'Dag geopend', dagstaat: 'Dagstaat', wegzetten: 'Apart zetten',
    ophalen: 'Order opgehaald', doos_ophalen: 'Doos opgehaald', onbekend: 'Onbekend',
};

/** Eén regel tekst over een melding in het journaal, voor Te controleren. Nooit e-mail of telefoon. */
export function meldingSamenvatting(soort: string, payload: unknown): string {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const getal = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    switch (soort) {
        case 'bon':
        case 'tegenbon': {
            const regels = Array.isArray(p.regels) ? p.regels.length : 0;
            const totaal = getal(p.totaal_cents);
            return [String(p.bonnummer ?? 'zonder bonnummer'), totaal === null ? null : euro(totaal), `${regels} ${regels === 1 ? 'regel' : 'regels'}`,
                p.status === 'geannuleerd' ? 'geannuleerd' : null].filter(Boolean).join(' · ');
        }
        case 'vrij_overschreden':
            return `${getal(p.boven_vrij) ?? '?'} van ${getal(p.verkocht) ?? '?'} boven vrij verkocht (${p.modus === 'offline' ? 'offline' : 'online'})${typeof p.reden === 'string' ? ` · “${p.reden.slice(0, 120)}”` : ''}`;
        case 'pinpoging':
            return `Pinpoging ${getal(p.bedrag_cents) === null ? '' : euro(getal(p.bedrag_cents)!)} ${p.uitkomst === 'mislukt' ? 'mislukt' : 'gelukt'}`.trim();
        case 'dag_openen':
            return `Dag ${String(p.bedrijfsdag ?? '?')} geopend met ${getal(p.contant_begin_cents) === null ? '?' : euro(getal(p.contant_begin_cents)!)} wisselgeld`;
        case 'dagstaat':
            return `Dagstaat ${String(p.dagstaatnummer ?? '?')} van ${String(p.bedrijfsdag ?? '?')}`;
        default:
            return SOORT_LABEL[soort] ?? soort;
    }
}

const VERSCHIL_LABEL: Record<string, string> = {
    aantal_bonnen: 'Aantal bonnen',
    aantal_tegenbonnen: 'Aantal tegenbonnen',
    aantal_geannuleerd: 'Aantal geannuleerd',
    statiegeld_cents: 'Statiegeld',
    order_rest_cents: 'Rest webshoporders',
    tegenbonnen_cents: 'Tegenbonnen',
    korting_cents: 'Korting',
    afronding_cents: 'Afronding',
    pin_toonbank_cents: 'Pin volgens de Toonbank',
    contant_begin_cents: 'Wisselgeld bij openen',
    contant_verwacht_cents: 'Contant verwacht',
};

/** "omzet_21_btw" → "Btw 21%"; "aantal_bonnen" → "Aantal bonnen". */
export function verschilLabel(veld: string): string {
    const m = /^omzet_(\d+)_(incl|btw)$/.exec(veld);
    if (m) return m[2] === 'btw' ? `Btw ${m[1]}%` : `Omzet ${m[1]}% (incl. btw)`;
    return VERSCHIL_LABEL[veld] ?? veld;
}

/** Is een verschilveld een aantal (geen bedrag)? */
export function isAantal(veld: string): boolean {
    return veld.startsWith('aantal_');
}

/** ISO-tijd van n minuten vóór nu. */
export function minutenTerug(nu: Date, minuten: number): string {
    return new Date(nu.getTime() - minuten * 60_000).toISOString();
}

/** Vandaag in Europe/Amsterdam als jjjj-mm-dd. */
export function vandaagAmsterdam(nu: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

/** Een geldige jjjj-mm-dd, anders de terugval. */
export function geldigeDatum(v: string | null | undefined, terugval: string): string {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return terugval;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : terugval;
}
