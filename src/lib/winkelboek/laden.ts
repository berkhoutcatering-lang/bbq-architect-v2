/**
 * Laden voor Boekhouding winkel: de bonnen, bonregels en dagstaten van de
 * Toonbank, het voorraadlogboek en de eigen kasregels. Via RLS met de sessie
 * van de gebruiker; de organisatie gaat altijd expliciet mee.
 *
 * Rekenen doen dagboeking.ts, kasboek.ts, verkoop.ts, inkoop.ts en lopers.ts.
 * Elke lader bladert per 1000 rijen (het rijplafond van Supabase), en een
 * tabel of kolom die er nog niet is geeft een lege lijst, nooit een 500.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { nlDatum } from '@/lib/btwAangifteBronnen';
import { WINKEL_RUIMTE } from '@/lib/winkel/plekken';
import type { BonMin, DagstaatKort } from './dagboeking';
import type { KasMutatie } from './kasboek';
import { inkoopVanRegel, type Onderdeel, type ProductPrijs, type RegelMutatie, type VerkoopRegel } from './verkoop';

type Fout = { message: string; code?: string } | null;
type Antwoord<T> = PromiseLike<{ data: T[] | null; error: Fout }>;

const NOG_NIET = new Set(['42703', '42P01', 'PGRST200', 'PGRST204', 'PGRST205']);
const PAGINA = 1000;
const DAG = 86_400_000;

/** Postgres/PostgREST-codes voor "tabel of kolom bestaat nog niet". */
export function isNogNiet(fout: { code?: string } | null | undefined): boolean {
    return !!fout?.code && NOG_NIET.has(String(fout.code));
}

export function zonderProefdagen<T extends { bedrijfsdag: string }>(rijen: readonly T[], uitgesloten: ReadonlySet<string>): T[] {
    return rijen.filter((r) => !uitgesloten.has(r.bedrijfsdag));
}

/** Bladert door tot een pagina niet vol is. */
async function alles<T>(bouw: (van: number, tot: number) => Antwoord<T>): Promise<{ data: T[]; error: Fout }> {
    const uit: T[] = [];
    for (let van = 0; ; van += PAGINA) {
        const { data, error } = await bouw(van, van + PAGINA - 1);
        if (error) return { data: uit, error };
        uit.push(...(data ?? []));
        if (!data || data.length < PAGINA) return { data: uit, error: null };
    }
}

const dagErbij = (datum: string, dagen: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + dagen * DAG).toISOString().slice(0, 10);

/** Dagen die in de btw-aangifte op "telt niet mee" staan (proefdagen). */
export async function laadUitsluitingen(sb: SupabaseClient, orgId: string, start: string, eind: string): Promise<Set<string>> {
    const { data } = await (sb.from('btw_kassa_uitsluitingen').select('datum').eq('organization_id', orgId)
        .gte('datum', start).lte('datum', eind) as unknown as Antwoord<{ datum: string }>);
    return new Set((data ?? []).map((r) => String(r.datum)));
}

const BON_KOLOMMEN = 'status, dagstaat_id, bedrijfsdag, totaal_cents, afronding_cents, btw, statiegeld_cents, order_rest_cents, pin_cents, contant_cents';

export async function laadDagBonnen(
    sb: SupabaseClient, orgId: string, start: string, eind: string,
): Promise<{ bonnen: (BonMin & { bedrijfsdag: string })[]; fout: string | null }> {
    type Rij = BonMin & { bedrijfsdag: string };
    const haal = (kolommen: string) => alles<Rij>((van, tot) =>
        sb.from('toonbank_bonnen').select(kolommen).eq('organization_id', orgId)
            .gte('bedrijfsdag', start).lte('bedrijfsdag', eind)
            .order('id', { ascending: true }).range(van, tot) as unknown as Antwoord<Rij>);

    let res = await haal(`${BON_KOLOMMEN}, cadeaubon_cents`);
    /* De cadeaubon-migratie kan nog ontbreken: dan zonder die kolom. */
    if (res.error && isNogNiet(res.error)) res = await haal(BON_KOLOMMEN);
    if (res.error) {
        return { bonnen: [], fout: isNogNiet(res.error) ? null : `Kassabonnen niet te lezen: ${res.error.message}` };
    }
    return {
        bonnen: res.data.map((b) => ({
            ...b,
            btw: (b.btw ?? {}) as BonMin['btw'],
            cadeaubon_cents: Number(b.cadeaubon_cents ?? 0),
            dagstaat_id: b.dagstaat_id ?? null,
        })),
        fout: null,
    };
}

const DAGSTAAT_KOLOMMEN = 'id, apparaat_id, bedrijfsdag, status, gesloten_at, aantal_bonnen, pin_toonbank_cents, pin_mypos_app_cents, pin_verschil_cents, contant_begin_cents, contant_verwacht_cents, contant_geteld_cents, contant_verschil_cents, afgeroomd_cents, verschillen, goedgekeurd_at';

export async function laadDagstaten(
    sb: SupabaseClient, orgId: string, start: string, eind: string,
): Promise<{ dagstaten: DagstaatKort[]; fout: string | null }> {
    const res = await alles<DagstaatKort>((van, tot) =>
        sb.from('toonbank_dagstaten').select(DAGSTAAT_KOLOMMEN).eq('organization_id', orgId)
            .gte('bedrijfsdag', start).lte('bedrijfsdag', eind)
            .order('bedrijfsdag', { ascending: true }).order('gesloten_at', { ascending: true })
            .range(van, tot) as unknown as Antwoord<DagstaatKort>);
    if (res.error) {
        return { dagstaten: [], fout: isNogNiet(res.error) ? null : `Dagstaten niet te lezen: ${res.error.message}` };
    }
    return { dagstaten: res.data.map((s) => ({ ...s, verschillen: Array.isArray(s.verschillen) ? s.verschillen : [] })), fout: null };
}

/** De eigen kasregels. `beschikbaar` is false zolang de tabel winkel_kas_mutaties er nog niet is. */
export async function laadKasMutaties(
    sb: SupabaseClient, orgId: string, start: string, eind: string,
): Promise<{ mutaties: KasMutatie[]; beschikbaar: boolean }> {
    const res = await alles<KasMutatie & { created_at: string }>((van, tot) =>
        sb.from('winkel_kas_mutaties').select('id, datum, bedrag_cents, reden, omschrijving, moment, created_at').eq('organization_id', orgId)
            .gte('datum', start).lte('datum', eind)
            .order('datum', { ascending: true }).order('created_at', { ascending: true })
            .range(van, tot) as unknown as Antwoord<KasMutatie & { created_at: string }>);
    if (res.error) {
        if (!isNogNiet(res.error)) console.error('[winkelboek] kasregels laden mislukt:', res.error.message);
        return { mutaties: [], beschikbaar: !isNogNiet(res.error) };
    }
    return {
        mutaties: res.data.map((m) => ({
            id: String(m.id), datum: String(m.datum), bedrag_cents: Number(m.bedrag_cents), reden: m.reden,
            omschrijving: String(m.omschrijving), moment: m.moment === 'voor_openen' ? 'voor_openen' : 'tijdens',
        })),
        beschikbaar: true,
    };
}

interface RegelRij {
    id: number;
    artikel_id: string | null;
    naam: string | null;
    open_prijs_groep: string | null;
    aantal: number | string | null;
    bedrag_cents: number;
    btw: { pct: number; incl_cents: number }[] | null;
    onderdelen: Onderdeel[] | null;
    goederen_terug: boolean | null;
    toonbank_bonnen: { bedrijfsdag: string; gebeurd_at: string; status: string } | { bedrijfsdag: string; gebeurd_at: string; status: string }[];
}

/** Verkoopregels van afgeronde bonnen in de periode, met per regel de inkoopwaarde (ontwerp R3). */
export async function laadVerkoopRegels(
    sb: SupabaseClient, orgId: string, start: string, eind: string, uitgesloten: ReadonlySet<string>,
): Promise<{ regels: VerkoopRegel[]; fout: string | null }> {
    const res = await alles<RegelRij>((van, tot) =>
        sb.from('toonbank_bon_regels')
            .select('id, artikel_id, naam, open_prijs_groep, aantal, bedrag_cents, btw, onderdelen, goederen_terug, toonbank_bonnen!inner(bedrijfsdag, gebeurd_at, status)')
            .eq('organization_id', orgId)
            .eq('soort', 'verkoop')
            .eq('toonbank_bonnen.status', 'afgerond')
            .gte('toonbank_bonnen.bedrijfsdag', start).lte('toonbank_bonnen.bedrijfsdag', eind)
            .order('id', { ascending: true })
            .range(van, tot) as unknown as Antwoord<RegelRij>);
    if (res.error) {
        return { regels: [], fout: isNogNiet(res.error) ? null : `Bonregels niet te lezen: ${res.error.message}` };
    }

    const kaal = zonderProefdagen(res.data.map((r) => {
        const bon = Array.isArray(r.toonbank_bonnen) ? r.toonbank_bonnen[0] : r.toonbank_bonnen;
        return {
            regel_id: Number(r.id),
            bedrijfsdag: String(bon?.bedrijfsdag ?? ''),
            op: String(bon?.gebeurd_at ?? ''),
            artikel_id: r.artikel_id,
            naam: r.naam ?? 'Onbekend artikel',
            open_prijs_groep: r.open_prijs_groep,
            aantal: Number(r.aantal ?? 0),
            bedrag_cents: Number(r.bedrag_cents),
            btw: Array.isArray(r.btw) ? r.btw.map((b) => ({ pct: Number(b.pct), incl_cents: Number(b.incl_cents) })) : [],
            onderdelen: Array.isArray(r.onderdelen) ? r.onderdelen.map((o) => ({ product_id: String(o.product_id), hoeveelheid: Number(o.hoeveelheid), eenheid: String(o.eenheid) })) : [],
            goederen_terug: r.goederen_terug,
        };
    }), uitgesloten);
    if (kaal.length === 0) return { regels: [], fout: null };

    /* De voorraadmutaties per regel: een pakket geeft er meer dan één. */
    const perRegel = new Map<number, RegelMutatie[]>();
    const ids = kaal.map((r) => r.regel_id);
    for (let i = 0; i < ids.length; i += 200) {
        const stuk = ids.slice(i, i + 200);
        const m = await alles<RegelMutatie>((van, tot) =>
            sb.from('winkel_voorraad_mutaties').select('toonbank_bon_regel_id, winkel_product_id, type, waarde_cents')
                .eq('organization_id', orgId).in('toonbank_bon_regel_id', stuk)
                .order('id', { ascending: true }).range(van, tot) as unknown as Antwoord<RegelMutatie>);
        if (m.error) {
            if (isNogNiet(m.error)) break;
            return { regels: [], fout: `Voorraadlogboek niet te lezen: ${m.error.message}` };
        }
        for (const rij of m.data) {
            const sleutel = Number(rij.toonbank_bon_regel_id);
            const lijst = perRegel.get(sleutel);
            const schoon = { toonbank_bon_regel_id: sleutel, winkel_product_id: String(rij.winkel_product_id), type: String(rij.type), waarde_cents: rij.waarde_cents === null ? null : Number(rij.waarde_cents) };
            if (lijst) lijst.push(schoon); else perRegel.set(sleutel, [schoon]);
        }
    }

    const prijzen = await laadProductPrijzen(sb, orgId);

    return {
        regels: kaal.map((r) => ({ ...r, ...inkoopVanRegel(r, perRegel.get(r.regel_id) ?? [], prijzen) })),
        fout: null,
    };
}

/** De inkoopprijs van nu per product, voor regels zonder voorraadmutatie. */
export async function laadProductPrijzen(sb: SupabaseClient, orgId: string): Promise<Map<string, ProductPrijs>> {
    const res = await alles<{ id: string; inkoop_excl_cents: number | null; prijs_per: number | string | null }>((van, tot) =>
        sb.from('winkel_producten').select('id, inkoop_excl_cents, prijs_per').eq('organization_id', orgId)
            .order('id', { ascending: true }).range(van, tot) as unknown as Antwoord<{ id: string; inkoop_excl_cents: number | null; prijs_per: number | string | null }>);
    return new Map(res.data.map((p) => [String(p.id), {
        inkoop_excl_cents: p.inkoop_excl_cents === null || p.inkoop_excl_cents === undefined ? null : Number(p.inkoop_excl_cents),
        prijs_per: Number(p.prijs_per ?? 1) || 1,
    }]));
}

/** Per product de naam van zijn afdeling in de winkel (via winkel_plaatsingen). */
export async function laadAfdelingVanProduct(sb: SupabaseClient): Promise<Map<string, string>> {
    const [plekken, plaatsingen] = await Promise.all([
        sb.from('opslag_locaties').select('id, code, naam, parent_id') as unknown as Antwoord<{ id: string; code: string; naam: string; parent_id: string | null }>,
        sb.from('winkel_plaatsingen').select('product_id, locatie_id').eq('rol', 'verkoop') as unknown as Antwoord<{ product_id: string; locatie_id: string }>,
    ]);
    if (plekken.error || plaatsingen.error) return new Map();
    const ruimte = (plekken.data ?? []).find((p) => p.code === WINKEL_RUIMTE.code);
    if (!ruimte) return new Map();
    const afdeling = new Map((plekken.data ?? []).filter((p) => p.parent_id === ruimte.id).map((p) => [p.id, p.naam]));
    const uit = new Map<string, string>();
    for (const p of plaatsingen.data ?? []) {
        const naam = afdeling.get(p.locatie_id);
        if (naam && !uit.has(p.product_id)) uit.set(p.product_id, naam);
    }
    return uit;
}

/** Derving (breuk en over datum) in de periode, tegen inkoopwaarde. */
export async function laadDerving(
    sb: SupabaseClient, orgId: string, start: string, eind: string,
): Promise<{ cents: number; aantal: number; zonder_waarde: number }> {
    type Rij = { waarde_cents: number | null; gebeurd_at: string | null; created_at: string };
    const res = await alles<Rij>((van, tot) =>
        sb.from('winkel_voorraad_mutaties').select('waarde_cents, gebeurd_at, created_at')
            .eq('organization_id', orgId).eq('type', 'afwijking').in('reden', ['derving_breuk', 'derving_tht'])
            .gte('created_at', `${dagErbij(start, -1)}T00:00:00Z`).lte('created_at', `${dagErbij(eind, 2)}T00:00:00Z`)
            .order('id', { ascending: true }).range(van, tot) as unknown as Antwoord<Rij>);
    const uit = { cents: 0, aantal: 0, zonder_waarde: 0 };
    for (const r of res.data) {
        const dag = nlDatum(r.gebeurd_at ?? r.created_at);
        if (dag < start || dag > eind) continue;
        uit.aantal += 1;
        if (r.waarde_cents === null) uit.zonder_waarde += 1;
        else uit.cents += Math.abs(Number(r.waarde_cents));
    }
    return uit;
}
