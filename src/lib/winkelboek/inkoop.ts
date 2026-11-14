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
 *    na de levering komen in aanmerking. Een bon hoort bij één levering: eerst
 *    de bon met precies hetzelfde bedrag, anders de dichtstbijzijnde in dagen.
 *    Zo vindt een leverancier die elke week levert bij elke levering zijn eigen
 *    bon. Alleen als er twee even ver weg liggen en geen van beide het bedrag
 *    heeft, staat er dat er meer zijn. Er wordt niets opgeslagen; het is een
 *    aanwijzing.
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
const dagErbij = (datum: string, dagen: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + dagen * DAG).toISOString().slice(0, 10);

/**
 * Hoe ruim er rond een periode geladen moet worden om de bonnen eerlijk te
 * verdelen: ook de leveringen van net ervoor en erna, want die hebben recht op
 * hun eigen bon. Geef dit venster aan de laders en de periode zelf aan
 * `maakLeveringen`.
 */
export function bonVenster(periode: { start: string; eind: string }): { start: string; eind: string } {
    return { start: dagErbij(periode.start, -(BON_VOOR + BON_NA)), eind: dagErbij(periode.eind, BON_VOOR + BON_NA) };
}

function samenvatting(namen: string[]): string {
    if (namen.length <= 1) return namen[0] ?? '';
    if (namen.length === 2) return `${namen[0]} en ${namen[1]}`;
    return `${namen[0]}, ${namen[1]} en ${namen.length - 2} andere`;
}

/**
 * De leveringen, nieuwste eerst. Met een `periode` doen ook de ontvangsten
 * erbuiten mee met het verdelen van de bonnen, maar komen alleen de leveringen
 * erbinnen in de lijst.
 */
export function maakLeveringen(ontvangsten: readonly Ontvangst[], bonnen: readonly InkoopBon[], periode?: { start: string; eind: string }): Levering[] {
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

    /* Elke combinatie van een levering en een bon die in aanmerking komt. */
    interface Paar { g: Groep; b: InkoopBon; verschil: number; afstand: number; zelfde: boolean }
    const paren: Paar[] = [];
    for (const g of groepen.values()) {
        if (g.leverancier_id === null) continue;
        for (const b of bonnen) {
            if (b.leverancier_id !== g.leverancier_id) continue;
            const verschil = dagenTussen(g.datum, b.datum);
            if (verschil < -BON_VOOR || verschil > BON_NA) continue;
            paren.push({ g, b, verschil, afstand: Math.abs(verschil), zelfde: g.bedrag !== null && b.netto_cents === g.bedrag });
        }
    }
    /* Eerst hetzelfde bedrag, dan de kortste afstand; bij gelijke afstand de bon ná de levering. */
    paren.sort((x, y) => Number(y.zelfde) - Number(x.zelfde) || x.afstand - y.afstand || y.verschil - x.verschil
        || x.g.datum.localeCompare(y.g.datum) || x.b.datum.localeCompare(y.b.datum) || x.b.id - y.b.id);

    const bonVan = new Map<Groep, Paar>();
    const vergeven = new Set<number>();
    for (const p of paren) {
        if (bonVan.has(p.g) || vergeven.has(p.b.id)) continue;
        bonVan.set(p.g, p);
        vergeven.add(p.b.id);
    }

    return [...groepen.values()]
        .filter((g) => !periode || (g.datum >= periode.start && g.datum <= periode.eind))
        .map((g): Levering => {
            const eigen = bonVan.get(g);
            /* Twijfel: een andere vrije bon ligt even ver weg, en het bedrag gaf de doorslag niet. */
            const evenVer = eigen && !eigen.zelfde ? paren.filter((p) => p.g === g && p.b.id !== eigen.b.id && !vergeven.has(p.b.id) && p.afstand === eigen.afstand).length : 0;
            const bon: BonStand = !eigen ? { soort: 'ontbreekt' }
                : evenVer > 0 ? { soort: 'meerdere', aantal: evenVer + 1 }
                : { soort: 'gevonden', id: eigen.b.id, netto_cents: eigen.b.netto_cents };
            return {
                datum: g.datum, leverancier_id: g.leverancier_id, leverancier: g.leverancier,
                producten: g.namen.size, wat: samenvatting([...g.namen.values()]),
                bedrag_cents: g.bedrag, btw_geschat_cents: g.btw, bon,
            };
        })
        .sort((a, b) => b.datum.localeCompare(a.datum) || a.leverancier.localeCompare(b.leverancier));
}
