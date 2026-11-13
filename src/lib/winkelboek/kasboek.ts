/**
 * Het kasboek van de winkel (ontwerp R2): wat erbij kwam, wat eraf ging en wat
 * er in de la ligt. Zuiver: krijgt de dagstaten van de Toonbank en de regels
 * die je zelf invoerde (winkel_kas_mutaties), geeft regels met een lopend saldo.
 *
 * Eén la. Het boek loopt per dagafsluiting, op volgorde van bedrijfsdag en
 * sluittijd: dezelfde kassa kan op één dag twee keer afsluiten. Per afsluiting:
 *   1. eigen regels die er nog vóór horen (eerdere datum, of dezelfde datum
 *      met moment 'voor_openen' bij de eerste afsluiting van die dag);
 *   2. "Tussen de dagen" als de beginstand afwijkt van het saldo;
 *   3. "Contante verkoop" = verwacht − begin;
 *   4. bij de laatste afsluiting van die dag: de eigen regels 'tijdens';
 *   5. "Kasverschil" = verschil van de tablet − de som uit stap 4;
 *   6. "Afgeroomd".
 * Na stap 6 is het saldo altijd geteld − afgeroomd.
 */
import { formatEur } from '@/lib/format';
import type { DagstaatKort } from './dagboeking';

export type KasReden = 'uitgave' | 'prive' | 'wisselgeld' | 'overig';
/** 'tijdens' = tussen openen en tellen (verklaart een kasverschil); 'voor_openen' = vóór de eerste telling van die dag (verklaart een verschil tussen de dagen). */
export type KasMoment = 'voor_openen' | 'tijdens';

export interface KasMutatie {
    id: string;
    datum: string;
    /** Negatief = uit de la, positief = in de la. */
    bedrag_cents: number;
    reden: KasReden;
    omschrijving: string;
    moment: KasMoment;
}

export type KasRegelSoort = 'beginstand' | 'tussen_dagen' | 'verkoop' | 'eigen' | 'kasverschil' | 'afgeroomd';

export interface KasRegel {
    datum: string;
    soort: KasRegelSoort;
    wat: string;
    /** + erbij, − eraf; 0 bij de beginstand. */
    bedrag_cents: number;
    /** In de la na deze regel. */
    saldo_cents: number;
    bron: 'automatisch' | 'zelf';
    mutatie_id: string | null;
    /** Alleen van belang bij een kasverschil. */
    goedgekeurd: boolean;
}

export interface Kasboek {
    /** Oplopend in tijd. */
    regels: KasRegel[];
    /** null zonder dagstaat in de periode. */
    in_de_la_cents: number | null;
    /** Som van de onverklaarde verschillen. */
    kasverschil_cents: number;
    afgeroomd_cents: number;
    punten: string[];
}

const euro = (cents: number) => formatEur(Math.abs(cents) / 100);
const korteDag = (datum: string) =>
    new Date(`${datum}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function maakKasboek(dagstaten: DagstaatKort[], mutaties: KasMutatie[], uitgesloten: ReadonlySet<string> = new Set()): Kasboek {
    const staten = dagstaten
        .filter((s) => !uitgesloten.has(s.bedrijfsdag))
        .sort((a, b) => a.bedrijfsdag.localeCompare(b.bedrijfsdag) || a.gesloten_at.localeCompare(b.gesloten_at));
    if (staten.length === 0) return { regels: [], in_de_la_cents: null, kasverschil_cents: 0, afgeroomd_cents: 0, punten: [] };

    const regels: KasRegel[] = [];
    const punten: string[] = [];
    let saldo = staten[0].contant_begin_cents;
    let kasverschil = 0;
    let afgeroomd = 0;

    const regel = (datum: string, soort: KasRegelSoort, wat: string, bedrag: number, extra: Partial<KasRegel> = {}) => {
        saldo += bedrag;
        regels.push({ datum, soort, wat, bedrag_cents: bedrag, saldo_cents: saldo, bron: 'automatisch', mutatie_id: null, goedgekeurd: false, ...extra });
    };
    const eigenRegel = (m: KasMutatie) => regel(m.datum, 'eigen', m.omschrijving, m.bedrag_cents, { bron: 'zelf', mutatie_id: m.id });

    /* Wat vóór de eerste afsluiting gebeurde, zit al in de beginstand. */
    const eersteDag = staten[0].bedrijfsdag;
    const open = [...mutaties]
        .filter((m) => !(m.datum < eersteDag || (m.datum === eersteDag && m.moment === 'voor_openen')))
        .sort((a, b) => a.datum.localeCompare(b.datum));
    const geplaatst = new Set<string>();
    const plaats = (kies: (m: KasMutatie) => boolean): number => {
        let som = 0;
        for (const m of open) {
            if (geplaatst.has(m.id) || !kies(m)) continue;
            geplaatst.add(m.id);
            eigenRegel(m);
            som += m.bedrag_cents;
        }
        return som;
    };

    regel(eersteDag, 'beginstand', 'Beginstand', 0);

    staten.forEach((s, i) => {
        const dag = s.bedrijfsdag;
        const eersteVanDag = i === 0 || staten[i - 1].bedrijfsdag !== dag;
        const laatsteVanDag = i === staten.length - 1 || staten[i + 1].bedrijfsdag !== dag;

        plaats((m) => m.datum < dag || (eersteVanDag && m.datum === dag && m.moment === 'voor_openen'));

        if (i > 0 && s.contant_begin_cents !== saldo) {
            const verschil = s.contant_begin_cents - saldo;
            regel(dag, 'tussen_dagen', 'Tussen de dagen', verschil);
            punten.push(`Tussen ${korteDag(staten[i - 1].bedrijfsdag)} en ${korteDag(dag)} veranderde de la ${euro(verschil)} zonder regel.`);
        }

        regel(dag, 'verkoop', 'Contante verkoop', s.contant_verwacht_cents - s.contant_begin_cents);

        const tijdens = laatsteVanDag ? plaats((m) => m.datum === dag && m.moment === 'tijdens') : 0;

        const onverklaard = s.contant_verschil_cents - tijdens;
        if (onverklaard !== 0) {
            const goedgekeurd = !!s.goedgekeurd_at;
            regel(dag, 'kasverschil', 'Kasverschil', onverklaard, { goedgekeurd });
            kasverschil += onverklaard;
            if (!goedgekeurd) punten.push(`Kasverschil van ${euro(onverklaard)} op ${korteDag(dag)} is nog niet goedgekeurd.`);
        }

        if (s.afgeroomd_cents > 0) {
            regel(dag, 'afgeroomd', 'Afgeroomd', -s.afgeroomd_cents);
            afgeroomd += s.afgeroomd_cents;
        }
    });

    /* Eigen regels na de laatste afsluiting schuiven het saldo nog op. */
    plaats(() => true);

    if (new Set(staten.map((s) => s.apparaat_id)).size > 1) {
        punten.push('Er zijn dagafsluitingen van meer dan één kassa. Het kasboek rekent met één la.');
    }

    return { regels, in_de_la_cents: saldo, kasverschil_cents: kasverschil, afgeroomd_cents: afgeroomd, punten };
}
