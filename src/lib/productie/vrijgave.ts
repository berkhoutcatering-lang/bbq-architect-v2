/**
 * HACCP-vrijgave van een partij. Puur en getest.
 *
 * De regels komen van de bouwsteen zelf (component_haccp_points met
 * verplicht_voor_vrijgave = true). Geen verplicht punt → vrij. Wél verplichte
 * punten → elk punt moet een meting hebben, en als het punt een drempel
 * heeft moet die gehaald zijn. Een afwijking blokkeert: opnieuw meten of
 * corrigeren, nooit stilletjes vrijgeven.
 *
 * Twee woordenlijsten leven naast elkaar: de punten (kerntemp, koeltemp, …)
 * en de oudere check_types in haccp_records (kern, koeling, …).
 * `haccpPuntNaarCheckType` vertaalt; metingen mogen in beide talen komen.
 */

export interface HaccpPunt {
    id?: number | null;
    type: string;
    threshold_value: number | null;
    threshold_unit: string | null;
    note?: string | null;
    verplicht_voor_vrijgave: boolean;
}

export interface HaccpMeting {
    /** Punt-type ('kerntemp') of check_type ('kern'). */
    type: string;
    temp: number | null;
    /** Status zoals in haccp_records; leeg = nog niet beoordeeld. */
    status?: string | null;
}

export type Beoordeling = 'ok' | 'afwijking' | 'geregistreerd';

const NAAR_CHECK: Record<string, string> = { kerntemp: 'kern', koeltemp: 'koeling' };
const RICHTING: Record<string, 'min' | 'max'> = { kerntemp: 'min', koeltemp: 'max', tijd_uit_koeling: 'max' };

export const PUNT_LABEL: Record<string, string> = {
    kerntemp: 'Kerntemperatuur', koeltemp: 'Koeltemperatuur', tijd_uit_koeling: 'Tijd uit koeling',
    handhygiene: 'Handhygiëne', kruisbesmetting: 'Kruisbesmetting', oppervlakte_reiniging: 'Oppervlakte reiniging', overig: 'Overig',
};

export function haccpPuntNaarCheckType(puntType: string): string {
    return NAAR_CHECK[puntType] ?? puntType;
}

/** Heeft dit punt een meetwaarde nodig (temperatuur/minuten) of alleen een vinkje? */
export function puntVraagtWaarde(puntType: string): boolean {
    return puntType in RICHTING;
}

/** Beoordeel één meting tegen het punt. Zonder drempel: geregistreerd is genoeg. */
export function beoordeel(punt: HaccpPunt, temp: number | null): Beoordeling {
    const richting = RICHTING[punt.type];
    if (!richting || punt.threshold_value == null) return temp == null && richting ? 'afwijking' : 'geregistreerd';
    if (temp == null || !Number.isFinite(temp)) return 'afwijking';
    return (richting === 'min' ? temp >= punt.threshold_value : temp <= punt.threshold_value) ? 'ok' : 'afwijking';
}

export interface VrijgaveUitkomst {
    vrij: boolean;
    /** Verplichte punten zonder enige meting. */
    ontbrekend: HaccpPunt[];
    /** Verplichte punten waarvan de laatste meting de drempel niet haalt. */
    afwijkend: Array<{ punt: HaccpPunt; temp: number | null }>;
    /** Wat er is beoordeeld — gaat als snapshot op de partij. */
    beoordeeld: Array<{ type: string; verplicht: boolean; threshold_value: number | null; temp: number | null; beoordeling: Beoordeling | null }>;
}

function past(punt: HaccpPunt, m: HaccpMeting): boolean {
    const t = m.type.toLowerCase();
    return t === punt.type || t === haccpPuntNaarCheckType(punt.type);
}

/**
 * De laatste meting per punt telt: "14:16 61,8 °C onvoldoende" gevolgd door
 * "14:31 74,1 °C akkoord" is vrij. Metingen moeten in tijdsvolgorde staan.
 */
export function bepaalVrijgave(punten: HaccpPunt[], metingen: HaccpMeting[]): VrijgaveUitkomst {
    const ontbrekend: HaccpPunt[] = [];
    const afwijkend: VrijgaveUitkomst['afwijkend'] = [];
    const beoordeeld: VrijgaveUitkomst['beoordeeld'] = [];

    for (const punt of punten) {
        const bijPunt = metingen.filter((m) => past(punt, m));
        const laatste = bijPunt.length > 0 ? bijPunt[bijPunt.length - 1] : null;
        const beoordeling = laatste ? beoordeel(punt, laatste.temp) : null;
        beoordeeld.push({ type: punt.type, verplicht: punt.verplicht_voor_vrijgave, threshold_value: punt.threshold_value, temp: laatste?.temp ?? null, beoordeling });
        if (!punt.verplicht_voor_vrijgave) continue;
        if (!laatste) { ontbrekend.push(punt); continue; }
        if (beoordeling === 'afwijking') afwijkend.push({ punt, temp: laatste.temp });
    }

    return { vrij: ontbrekend.length === 0 && afwijkend.length === 0, ontbrekend, afwijkend, beoordeeld };
}

/** Mensentaal voor de 409. */
export function vrijgaveTekst(u: VrijgaveUitkomst): string {
    const delen: string[] = [];
    if (u.ontbrekend.length > 0) delen.push(`nog niet gemeten: ${u.ontbrekend.map((p) => PUNT_LABEL[p.type] ?? p.type).join(', ')}`);
    if (u.afwijkend.length > 0) {
        delen.push(`niet akkoord: ${u.afwijkend.map((a) => `${PUNT_LABEL[a.punt.type] ?? a.punt.type} ${a.temp ?? '—'} (eis ${RICHTING[a.punt.type] === 'min' ? '≥' : '≤'} ${a.punt.threshold_value})`).join(', ')}`);
    }
    return `HACCP-vrijgave niet mogelijk — ${delen.join('; ')}`;
}
