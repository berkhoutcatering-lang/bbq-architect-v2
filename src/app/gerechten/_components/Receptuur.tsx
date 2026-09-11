/**
 * Zo maken we het — de receptuur zoals hij in `recipe_steps` staat.
 *
 * Een receptuur valt uiteen in onderdelen (een saus, een kruidenmengsel, een
 * pekel) en het gerecht zelf. Die onderdelen mogen dagen eerder gemaakt worden,
 * en dat is het belangrijkste dat dit scherm moet overbrengen — vandaar dat elk
 * deel dicht begint met één regel eroverheen.
 *
 * Wat hier bewust wél staat: welke stappen nog geen tijd hebben. Dat getal hoort
 * te dalen naarmate je het gerecht vaker draait, en zolang het er staat weet je
 * dat de planning van dit gerecht nog een schatting is.
 *
 * Server Component: leest één keer en rekent alles uit. Het uitklappen zit in
 * ReceptuurLijst, dat verder niets hoeft te weten.
 */

import { createServerSupabase } from '@/lib/supabase-server';
import ReceptuurLijst, { type DeelRegel, type StapChip, type StapRegel } from './ReceptuurLijst';

interface Props {
    gerechtId: string;
    organizationId: string;
    /** Wat de kok besloot toen dit recept werd ingevoerd. */
    keuzes?: Array<{ vraag: string; antwoord: string; op?: string; door?: string }> | null;
}

interface StapRij {
    id: string;
    step_order: number;
    tekst: string;
    duur_actief_min: number | null;
    duur_passief_min: number | null;
    temp_doel_c: number | null;
    kern_temp_c: number | null;
    materieel_id: number | null;
    herhaal_interval_min: number | null;
    herhaal_duur_min: number | null;
    toezicht_nodig: boolean | null;
    hangt_af_van_stap_id: string | null;
    duur_bron: string | null;
    component_id: number | null;
}

const KOLOMMEN = 'id, step_order, tekst, duur_actief_min, duur_passief_min, temp_doel_c, kern_temp_c, materieel_id, herhaal_interval_min, herhaal_duur_min, toezicht_nodig, hangt_af_van_stap_id, duur_bron, component_id';

export default async function Receptuur({ gerechtId, organizationId, keuzes }: Props) {
    const sb = await createServerSupabase();

    const { data: stappen } = await sb
        .from('recipe_steps')
        .select(KOLOMMEN)
        .eq('gerecht_id', gerechtId)
        .eq('organization_id', organizationId)
        .order('step_order');

    const eigen = (stappen ?? []) as StapRij[];

    /* De stappen die een bouwsteen maken hangen aan die bouwsteen en niet aan
       dit gerecht — daar is het hele punt van. Ze horen hier wel te staan,
       anders lijkt het recept half.
    
       Twee wegen ernaartoe: bouwstenen die uit dít recept zijn ontstaan
       (uit_gerecht_id), en bouwstenen die je er later met een hoeveelheid aan
       gekoppeld hebt (gerecht_components). */
    const [{ data: eigenBouwstenen }, { data: gekoppeld }] = await Promise.all([
        sb.from('components').select('id, name')
            .eq('uit_gerecht_id', gerechtId).eq('organization_id', organizationId),
        sb.from('gerecht_components').select('component_id, quantity_used')
            .eq('gerecht_id', gerechtId).eq('organization_id', organizationId),
    ]);

    const componentNaam = new Map<number, string>();
    for (const c of eigenBouwstenen ?? []) componentNaam.set(c.id as number, c.name as string);

    const metHoeveelheid = new Set(
        (gekoppeld ?? []).filter((b) => Number(b.quantity_used) > 0).map((b) => b.component_id as number),
    );
    const componentIds = [...new Set([
        ...(eigenBouwstenen ?? []).map((c) => c.id as number),
        ...(gekoppeld ?? []).map((b) => b.component_id as number),
    ])];

    let deelStappen: StapRij[] = [];
    if (componentIds.length > 0) {
        const [{ data: rijen }, { data: comps }] = await Promise.all([
            sb.from('recipe_steps').select(KOLOMMEN)
                .in('component_id', componentIds).eq('organization_id', organizationId).order('step_order'),
            sb.from('components').select('id, name').in('id', componentIds).eq('organization_id', organizationId),
        ]);
        deelStappen = (rijen ?? []) as StapRij[];
        for (const c of comps ?? []) componentNaam.set(c.id as number, c.name as string);
    }

    const alle = [...deelStappen, ...eigen];
    if (alle.length === 0) return null;

    /* Korte namen: op een telefoon in de keuken past "METRO Professional
       GIC3135 inductiekookplaat" niet, en niemand zegt het zo. */
    const ids = [...new Set(alle.map((r) => r.materieel_id).filter((v): v is number => v != null))];
    const apparaatNaam = new Map<number, string>();
    if (ids.length > 0) {
        const { data: materieel } = await sb
            .from('materieel')
            .select('id, naam, korte_naam')
            .eq('organization_id', organizationId)
            .in('id', ids);
        for (const m of materieel ?? []) {
            apparaatNaam.set(m.id as number, (m.korte_naam as string) || (m.naam as string));
        }
    }

    const nummerVan = new Map(alle.map((r) => [r.id, r.step_order]));

    const zonderTijd = alle.filter((r) => r.duur_actief_min == null && r.duur_passief_min == null).length;
    const werkMin = alle.reduce((a, r) => a + (r.duur_actief_min ?? 0), 0);
    const wachtMin = alle.reduce((a, r) => a + (r.duur_passief_min ?? 0), 0);
    const gemeten = alle.filter((r) => r.duur_bron === 'gemeten').length;

    /* De delen, in de volgorde waarin je ze maakt. */
    const delen: DeelRegel[] = [];
    for (const id of componentIds) {
        const rijen = deelStappen.filter((r) => r.component_id === id);
        if (rijen.length === 0) continue;
        delen.push({
            ...maakDeel(componentNaam.get(id) ?? `Onderdeel ${id}`, true, rijen, apparaatNaam, nummerVan),
            zonderHoeveelheid: !metHoeveelheid.has(id),
        });
    }
    if (eigen.length > 0) {
        delen.push(maakDeel('Het gerecht zelf', false, eigen, apparaatNaam, nummerVan));
    }

    return (
        <section style={{ marginTop: 28 }}>
            <header style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '.14em',
                textTransform: 'uppercase', color: '#8a8f98', marginBottom: 8,
            }}>
                Zo maken we het
            </header>

            {/* Nooit één totaal noemen alsof alles bekend is: bij veertien
                stappen zonder tijd leest "1 min werk" als een gerecht dat in een
                minuut klaar is. */}
            <p style={{ margin: '0 0 6px', fontSize: 15, color: '#8a8f98', lineHeight: 1.5 }}>
                {alle.length - zonderTijd === 0
                    ? 'Nog geen enkele stap heeft een tijd — die komen vanzelf zodra je hem draait.'
                    : `Bekende tijd over ${alle.length - zonderTijd} van de ${alle.length} stappen: `
                        + `${werkMin} min werk`
                        + (wachtMin > 0 ? `, ${formatDuur(wachtMin)} wachten` : '')
                        + (zonderTijd > 0 ? ` · de andere ${zonderTijd} worden gemeten` : '')}
                {gemeten > 0 && ` · ${gemeten} al echt gemeten`}
            </p>

            {/* Een gerecht met dagen wachttijd begint dagen eerder. Wánneer
                precies hangt aan een event, en daar weet deze pagina niets van —
                dat hoort op het planningsscherm. Hier alleen de doorlooptijd. */}
            {wachtMin >= 1440 && (
                <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.5 }}>
                    <strong>{Math.ceil(wachtMin / 1440)} dagen doorlooptijd</strong>
                    <span style={{ color: '#8a8f98' }}>
                        {' '}— dit gerecht begint dagen vóór de uitlevering.
                    </span>
                </p>
            )}

            {/* Bewijsmateriaal, geen instelling: twee kolommen met een haarlijn
                ertussen, zodat het leest als een logboek en nooit als iets dat
                je per ongeluk omzet. */}
            {(keuzes?.length ?? 0) > 0 && (
                <div style={{
                    margin: '0 0 20px', padding: '14px 0 0',
                    borderTop: '1px solid rgba(245,245,245,.07)',
                }}>
                    <div style={{
                        fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
                        color: '#8a8f98', marginBottom: 10,
                    }}>
                        Toen dit recept werd goedgekeurd
                        {keuzes![0].op && ` · ${formatDatum(keuzes![0].op)}`}
                    </div>
                    {keuzes!.map((k) => (
                        <div key={k.vraag} style={{
                            display: 'flex', gap: 16, justifyContent: 'space-between',
                            alignItems: 'baseline', flexWrap: 'wrap',
                            padding: '8px 0', borderTop: '1px solid rgba(245,245,245,.07)',
                        }}>
                            <span style={{ fontSize: 14, color: '#8a8f98', flex: 1, minWidth: 220 }}>{k.vraag}</span>
                            <strong style={{ fontSize: 14 }}>{k.antwoord}</strong>
                        </div>
                    ))}
                </div>
            )}

            <ReceptuurLijst delen={delen} />
        </section>
    );
}

/* ── Van databaserijen naar wat er op het scherm staat ──────────── */

function maakDeel(
    naam: string,
    magVooruit: boolean,
    rijen: StapRij[],
    apparaatNaam: Map<number, string>,
    nummerVan: Map<string, number>,
): DeelRegel {
    const werk = rijen.reduce((a, r) => a + (r.duur_actief_min ?? 0), 0);
    const wacht = rijen.reduce((a, r) => a + (r.duur_passief_min ?? 0), 0);
    const zonder = rijen.filter((r) => r.duur_actief_min == null && r.duur_passief_min == null).length;

    const apparaten = [...new Set(
        rijen.map((r) => (r.materieel_id != null ? apparaatNaam.get(r.materieel_id) : null))
            .filter((n): n is string => n != null),
    )];

    const tijdStukken = [
        werk > 0 ? `${werk} min werk` : null,
        wacht > 0 ? `${formatDuur(wacht)} wachten` : null,
    ].filter(Boolean);

    return {
        sleutel: naam,
        naam,
        magVooruit,
        onderschrift: [`${rijen.length} ${rijen.length === 1 ? 'stap' : 'stappen'}`, ...apparaten].join(' · '),
        bekendeTijd: tijdStukken.length > 0
            ? tijdStukken.join(' · ') + (zonder > 0 ? ` · ${zonder} nog te meten` : '')
            : `${zonder === rijen.length ? 'alle' : zonder} ${rijen.length === 1 ? 'stap wordt' : 'stappen worden'} gemeten`,
        stappen: rijen.map((r) => maakStap(r, apparaatNaam, nummerVan)),
    };
}

function maakStap(
    r: StapRij,
    apparaatNaam: Map<number, string>,
    nummerVan: Map<string, number>,
): StapRegel {
    const chips: StapChip[] = [];

    if (r.materieel_id != null) {
        chips.push({ tekst: apparaatNaam.get(r.materieel_id) ?? `apparaat ${r.materieel_id}` });
    }
    if (r.temp_doel_c != null) chips.push({ tekst: `${r.temp_doel_c} °C`, mono: true });
    if (r.kern_temp_c != null) chips.push({ tekst: `klaar bij kern ${r.kern_temp_c} °C` });
    if (r.herhaal_interval_min != null) {
        chips.push({ tekst: `elke ${r.herhaal_interval_min} min iets doen` });
    }
    if (r.hangt_af_van_stap_id != null && nummerVan.has(r.hangt_af_van_stap_id)) {
        chips.push({ tekst: `na stap ${nummerVan.get(r.hangt_af_van_stap_id)}`, voorwaarde: true });
    }

    /* De rechterkolom: wat deze stap aan tijd kost. Wachten krijgt amber, want
       dat is de tijd die je ergens anders kunt gebruiken. */
    if (r.duur_passief_min != null) {
        const gebonden = r.toezicht_nodig === true || r.herhaal_interval_min != null;
        return {
            id: r.id, nummer: r.step_order, tekst: r.tekst, chips,
            getal: { ...splitsDuur(r.duur_passief_min), amber: true },
            rechts: gebonden ? 'wachten · blijf in de buurt' : 'wachten · je kunt weg',
        };
    }
    if (r.duur_actief_min != null) {
        return {
            id: r.id, nummer: r.step_order, tekst: r.tekst, chips,
            getal: { ...splitsDuur(r.duur_actief_min), amber: false },
            rechts: 'werk',
        };
    }
    return {
        id: r.id, nummer: r.step_order, tekst: r.tekst, chips,
        getal: null,
        /* Een stap die op de meter eindigt hoeft geen tijd te hebben om eerlijk
           te zijn — de kerntemperatuur beslist wanneer hij klaar is. */
        rechts: r.kern_temp_c != null ? 'de kern beslist, niet de klok' : 'tijd wordt gemeten',
    };
}

/** 10080 wordt "7 dagen", 240 wordt "4 uur", 45 blijft "45 min". */
function splitsDuur(min: number): { waarde: string; eenheid: string } {
    if (min >= 1440 && min % 1440 === 0) {
        const dagen = min / 1440;
        return { waarde: String(dagen), eenheid: dagen === 1 ? 'dag' : 'dagen' };
    }
    if (min >= 90 && min % 60 === 0) {
        return { waarde: String(min / 60), eenheid: 'uur' };
    }
    return { waarde: String(min), eenheid: 'min' };
}

/** "9 sep" — een logboekregel heeft geen tijdstip nodig. */
function formatDatum(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

/** Vierentwintig uur pekelen lees je niet als 1440. */
function formatDuur(min: number): string {
    if (min < 90) return `${min} min`;
    if (min >= 1440) {
        const dagen = Math.floor(min / 1440);
        const rest = Math.round((min % 1440) / 60);
        return rest === 0 ? `${dagen} dagen` : `${dagen} d ${rest} u`;
    }
    const uren = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `${uren} uur` : `${uren} u ${rest} min`;
}
