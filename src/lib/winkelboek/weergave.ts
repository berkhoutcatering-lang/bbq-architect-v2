/**
 * Wat de schermen van Boekhouding winkel tonen als de cijfers er zijn: welke
 * stand, welke kleur, welke regel eronder. Zuiver, zodat de regels "nooit een
 * groen vinkje bij een laadfout" en "een verschil dat is goedgekeurd heet niet
 * gelijk" getest zijn in plaats van alleen bekeken.
 */
import type { KassaDag } from '@/lib/btwAangifteBronnen';
import type { KassaRegel } from '@/lib/financeAnalytics';
import { formatEur } from '@/lib/format';
import type { Dagboeking } from './dagboeking';
import type { PeriodeMarge } from './verkoop';

const euro = (cents: number) => (cents < 0 ? `− ${formatEur(-cents / 100)}` : formatEur(cents / 100));
const aantal = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

/**
 * De kassacijfers van een periode uit laadToonbank. Die geeft euro's als
 * kommagetal, en zijn `dagen` staan in de volgorde van de bonnen en bevatten
 * ook proefdagen: hier worden het centen, zonder proefdagen, op datum.
 */
export function kassaCijfers(regels: readonly KassaRegel[], dagen: readonly KassaDag[]): {
    omzet_cents: number; btw_cents: number; bonnen: number; dagen: { datum: string; cents: number }[];
} {
    const echt = dagen.filter((d) => !d.uitgesloten).sort((a, b) => a.datum.localeCompare(b.datum));
    return {
        omzet_cents: Math.round(regels.reduce((s, r) => s + r.omzet, 0) * 100),
        btw_cents: Math.round(regels.reduce((s, r) => s + r.btw, 0) * 100),
        bonnen: echt.reduce((s, d) => s + d.orders, 0),
        dagen: echt.map((d) => ({ datum: d.datum, cents: Math.round(d.omzet * 100) })),
    };
}

/** De regel onder de tegel Inkoopwaarde: over welk deel van de omzet hij gaat, en wat geschat is. */
export function inkoopOnderschrift(marge: Pick<PeriodeMarge, 'dekking_pct' | 'geschat'>): string {
    const delen: string[] = [];
    if (marge.dekking_pct !== null && marge.dekking_pct < 100) delen.push(`Over ${marge.dekking_pct}% van de omzet`);
    if (marge.geschat > 0) delen.push(`${aantal(marge.geschat, 'artikel', 'artikelen')} met de inkoopprijs van nu`);
    return delen.length > 0 ? delen.join(' · ') : 'Van wat je verkocht';
}

export type DagKopSoort = 'fout' | 'proefdag' | 'geboekt' | 'te_controleren' | 'open' | 'geen_verkoop';

/** De kop van de dagpagina. Een laadfout wint van alles: dan is de dag niet nagekeken. */
export function dagKop(dag: Dagboeking, opties: { proefdag: boolean; fout: string | null }): { soort: DagKopSoort; titel: string; regel: string } {
    if (opties.fout) return { soort: 'fout', titel: 'Niet te laden', regel: 'De kassagegevens van deze dag konden niet geladen worden. Probeer het zo nog eens.' };
    if (opties.proefdag) return { soort: 'proefdag', titel: 'Proefdag', regel: 'Deze dag telt niet mee in de boekhouding.' };
    switch (dag.stand) {
        case 'geboekt': return { soort: 'geboekt', titel: 'Dag geboekt', regel: 'Alles klopt, je hoeft niets te doen.' };
        case 'te_controleren': return { soort: 'te_controleren', titel: 'Dag afgesloten', regel: `${aantal(dag.punten.length, 'punt', 'punten')} om naar te kijken.` };
        case 'open': return { soort: 'open', titel: 'Nog niet afgesloten', regel: 'De kassa is nog niet afgesloten. Dit zijn de cijfers tot nu toe.' };
        default: return { soort: 'geen_verkoop', titel: 'Geen verkoop', regel: 'Er is op deze dag niets verkocht.' };
    }
}

export type Toon = 'goed' | 'let_op' | 'neutraal';
export interface Vakje { toon: Toon; kop: string; waarde: string; onder: string }

/**
 * Het vakje Kas op het Overzicht, over de laatste kassadag.
 * - `onverklaard`: de kasverschillen die geen eigen kasregel verklaart en die niet zijn goedgekeurd.
 * - `verklaard_open`: er is een verschil dat wél verklaard is, maar nog niet goedgekeurd.
 * - `goedgekeurd`: er was een verschil en dat is goedgekeurd.
 */
export function kasVakje(v: { afgesloten: boolean; in_de_la_cents: number | null; onverklaard: readonly number[]; verklaard_open: boolean; goedgekeurd: boolean }): Vakje {
    if (!v.afgesloten) return { toon: 'neutraal', kop: 'Kas', waarde: 'Nog niet afgesloten', onder: 'Tel de la en sluit de dag af op de kassa' };
    const inDeLa = v.in_de_la_cents === null ? 'Onbekend' : `${euro(v.in_de_la_cents)} in de la`;
    if (v.onverklaard.some((c) => c !== 0)) {
        return { toon: 'let_op', kop: 'Kasverschil', waarde: v.onverklaard.filter((c) => c !== 0).map(euro).join(' en '), onder: 'Nog niet goedgekeurd' };
    }
    if (v.verklaard_open) return { toon: 'neutraal', kop: 'Kas verklaard', waarde: inDeLa, onder: 'Verschil verklaard door je kasregel, nog goedkeuren' };
    return { toon: 'goed', kop: 'Kas klopt', waarde: inDeLa, onder: v.goedgekeurd ? 'Verschil goedgekeurd' : 'Geteld gelijk aan verwacht' };
}

/** Het vakje Pin: wat de kassa telde tegenover wat in de myPOS-app stond. */
export function pinVakje(v: { afgesloten: boolean; pin_cents: number; verschillen: readonly number[]; goedgekeurd: boolean }): Vakje {
    if (!v.afgesloten) return { toon: 'neutraal', kop: 'Pin', waarde: 'Nog niet afgesloten', onder: 'Het pinbedrag volgt bij het afsluiten' };
    if (v.verschillen.some((c) => c !== 0)) {
        return { toon: 'let_op', kop: 'Pinverschil', waarde: v.verschillen.filter((c) => c !== 0).map(euro).join(' en '), onder: 'Kassa en myPOS wijken af' };
    }
    return { toon: 'goed', kop: 'Pin klopt', waarde: `${euro(v.pin_cents)} gepind`, onder: v.goedgekeurd ? 'Verschil goedgekeurd' : 'Kassa en myPOS geven hetzelfde bedrag' };
}

/** Een lijst is leeg, gevuld, of onbekend omdat het laden mislukte. De fout wint: dan weten we niet of er niets is. */
export function lijstStaat(aantalRijen: number, fout: string | null): 'fout' | 'leeg' | 'lijst' {
    if (fout) return 'fout';
    return aantalRijen === 0 ? 'leeg' : 'lijst';
}
