/**
 * Inkoop van de winkel per levering (ontwerp R4). Zuiver: krijgt de
 * ontvangsten uit het voorraadlogboek en de bonnen uit het Bonnenkistje.
 *
 * Regels
 *  - Een levering = alle ontvangsten van één dag van één leverancier. Een
 *    ontvangst ontstaat als je in Assortiment een ontvangst boekt of een
 *    levering stickert; de datum is de dag van inboeken.
 *  - Bedrag = som van de waarde; is er één zonder waarde, dan is het bedrag
 *    van de hele levering onbekend (null), nooit een deelsom.
 *  - De btw is een schatting (waarde × het btw-tarief van het product). De
 *    echte voorbelasting staat op de bon en in de btw-aangifte.
 *  - De bon: bonnen van dezelfde leverancier van één dag vóór tot zeven dagen
 *    na de levering. Er wordt niets opgeslagen; het is een aanwijzing.
 */

export interface Ontvangst {
    /** JJJJ-MM-DD in Nederlandse tijd. */
    datum: string;
    product_id: string;
    product_naam: string;
    btw_pct: number;
    waarde_cents: number | null;
    leverancier_id: number | null;
    leverancier: string | null;
}

export interface InkoopBon {
    id: number;
    datum: string;
    leverancier_id: number | null;
    netto_cents: number | null;
}

export type BonStand =
    | { soort: 'gevonden'; id: number; netto_cents: number | null }
    | { soort: 'meerdere'; aantal: number }
    | { soort: 'ontbreekt' };

export interface Levering {
    datum: string;
    leverancier_id: number | null;
    leverancier: string;
    /** Aantal verschillende producten. */
    producten: number;
    /** 'Worst, Fuet en 2 andere' */
    wat: string;
    bedrag_cents: number | null;
    /** Geschat: waarde × het btw-tarief van het product. De echte voorbelasting staat op de bon. */
    btw_geschat_cents: number | null;
    bon: BonStand;
}

const DAG = 86_400_000;
const BON_VOOR = 1;
const BON_NA = 7;

const dagenTussen = (van: string, tot: string) => Math.round((Date.parse(`${tot}T12:00:00Z`) - Date.parse(`${van}T12:00:00Z`)) / DAG);

function samenvatting(namen: string[]): string {
    if (namen.length <= 1) return namen[0] ?? '';
    if (namen.length === 2) return `${namen[0]} en ${namen[1]}`;
    return `${namen[0]}, ${namen[1]} en ${namen.length - 2} andere`;
}

/** De leveringen van een periode, nieuwste eerst. */
export function maakLeveringen(ontvangsten: readonly Ontvangst[], bonnen: readonly InkoopBon[]): Levering[] {
    interface Groep { datum: string; leverancier_id: number | null; leverancier: string; namen: Map<string, string>; bedrag: number | null; btw: number | null }
    const groepen = new Map<string, Groep>();

    for (const o of ontvangsten) {
        const sleutel = `${o.datum}|${o.leverancier_id ?? 'geen'}`;
        let g = groepen.get(sleutel);
        if (!g) {
            g = { datum: o.datum, leverancier_id: o.leverancier_id, leverancier: o.leverancier_id === null ? 'Onbekend' : (o.leverancier ?? 'Onbekend'), namen: new Map(), bedrag: 0, btw: 0 };
            groepen.set(sleutel, g);
        }
        if (!g.namen.has(o.product_id)) g.namen.set(o.product_id, o.product_naam);
        if (o.waarde_cents === null || g.bedrag === null || g.btw === null) {
            g.bedrag = null;
            g.btw = null;
        } else {
            g.bedrag += o.waarde_cents;
            g.btw += Math.round((o.waarde_cents * o.btw_pct) / 100);
        }
    }

    return [...groepen.values()]
        .map((g): Levering => {
            const kandidaten = g.leverancier_id === null ? [] : bonnen.filter((b) => {
                if (b.leverancier_id !== g.leverancier_id) return false;
                const verschil = dagenTussen(g.datum, b.datum);
                return verschil >= -BON_VOOR && verschil <= BON_NA;
            });
            const bon: BonStand = kandidaten.length === 1 ? { soort: 'gevonden', id: kandidaten[0].id, netto_cents: kandidaten[0].netto_cents }
                : kandidaten.length > 1 ? { soort: 'meerdere', aantal: kandidaten.length }
                : { soort: 'ontbreekt' };
            return {
                datum: g.datum, leverancier_id: g.leverancier_id, leverancier: g.leverancier,
                producten: g.namen.size, wat: samenvatting([...g.namen.values()]),
                bedrag_cents: g.bedrag, btw_geschat_cents: g.btw, bon,
            };
        })
        .sort((a, b) => b.datum.localeCompare(a.datum) || a.leverancier.localeCompare(b.leverancier));
}
