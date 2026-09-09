/**
 * Zo maken we het — de receptuur zoals hij in `recipe_steps` staat.
 *
 * De ontleder schreef negentien stappen weg met apparaat, temperatuur en
 * volgorde, en er was nergens in de app een plek waar je ze kon zien. Een
 * recept dat alleen in de database bestaat is geen recept.
 *
 * Wat hier bewust wél staat: welke stappen nog geen tijd hebben. Dat getal
 * hoort te dalen naarmate je het gerecht vaker draait, en zolang het er staat
 * weet je dat de planning van dit gerecht nog een schatting is.
 *
 * Server Component: leest één keer, geen interactie. Staat er niets, dan
 * verschijnt er ook niets — de meeste gerechten hebben nog geen stappen.
 */

import { createServerSupabase } from '@/lib/supabase-server';

interface Props {
    gerechtId: string;
    organizationId: string;
    /** Wat de kok besloot toen dit recept werd ingevoerd. */
    keuzes?: Array<{ vraag: string; antwoord: string }> | null;
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

export default async function Receptuur({ gerechtId, organizationId, keuzes }: Props) {
    const sb = await createServerSupabase();

    const KOLOMMEN = 'id, step_order, tekst, duur_actief_min, duur_passief_min, temp_doel_c, kern_temp_c, materieel_id, herhaal_interval_min, herhaal_duur_min, toezicht_nodig, hangt_af_van_stap_id, duur_bron, component_id';

    const { data: stappen } = await sb
        .from('recipe_steps')
        .select(KOLOMMEN)
        .eq('gerecht_id', gerechtId)
        .eq('organization_id', organizationId)
        .order('step_order');

    const rijen = (stappen ?? []) as StapRij[];

    /* De stappen die een bouwsteen maken hangen niet aan dit gerecht maar aan de
       bouwsteen zelf — daar is het hele punt van: die mogen dagen eerder. Ze
       horen hier wel gewoon te staan, anders lijkt het recept half. */
    const { data: bouwstenen } = await sb
        .from('gerecht_components')
        .select('component_id')
        .eq('gerecht_id', gerechtId)
        .eq('organization_id', organizationId);

    const componentIds = (bouwstenen ?? []).map((b) => b.component_id as number);
    let deelRijen: StapRij[] = [];
    let deelNamen = new Map<number, string>();

    if (componentIds.length > 0) {
        const [{ data: deelStappen }, { data: comps }] = await Promise.all([
            sb.from('recipe_steps').select(KOLOMMEN)
                .in('component_id', componentIds).eq('organization_id', organizationId).order('step_order'),
            sb.from('components').select('id, name').in('id', componentIds).eq('organization_id', organizationId),
        ]);
        deelRijen = (deelStappen ?? []) as StapRij[];
        deelNamen = new Map((comps ?? []).map((c) => [c.id as number, c.name as string]));
    }

    if (rijen.length === 0 && deelRijen.length === 0) return null;

    /* Apparaatnamen erbij. Alleen de toestellen die daadwerkelijk gebruikt
       worden — een lijst van al je materieel heeft hier niets te zoeken. */
    const ids = [...new Set(rijen.map((r) => r.materieel_id).filter((v): v is number => v != null))];
    const namen = new Map<number, string>();
    if (ids.length > 0) {
        const { data: materieel } = await sb
            .from('materieel')
            .select('id, naam')
            .eq('organization_id', organizationId)
            .in('id', ids);
        for (const m of materieel ?? []) namen.set(m.id as number, m.naam as string);
    }

    /* Eerst de delen, dan het gerecht zelf: zo lees je het ook in de keuken. */
    const alle = [...deelRijen, ...rijen];

    /* Stapnummer per id, zodat "hangt af van" een nummer wordt en geen UUID. */
    const nummerVan = new Map(alle.map((r) => [r.id, r.step_order]));
    const zonderTijd = alle.filter((r) => r.duur_actief_min == null && r.duur_passief_min == null).length;
    const werkMin = alle.reduce((a, r) => a + (r.duur_actief_min ?? 0), 0);
    const wachtMin = alle.reduce((a, r) => a + (r.duur_passief_min ?? 0), 0);
    const gemeten = alle.filter((r) => r.duur_bron === 'gemeten').length;

    return (
        <section
            style={{
                marginTop: 24,
                background: 'var(--color-bg-secondary, #1f2937)',
                border: '1px solid var(--color-border, #374151)',
                borderRadius: 12,
                overflow: 'hidden',
            }}
        >
            <header
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--color-border, #374151)',
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                }}
            >
                Zo maken we het ({alle.length} stappen)
            </header>

            {/* De kop mag nooit één totaal noemen alsof alles bekend is: bij
                veertien stappen zonder tijd leest "1 min werk" als een gerecht
                dat in een minuut klaar is. */}
            <p style={{ padding: '10px 16px 0', margin: 0, fontSize: 13, color: 'var(--color-text-muted, #9ca3af)' }}>
                {alle.length - zonderTijd === 0
                    ? 'Nog geen enkele stap heeft een tijd — die komen vanzelf zodra je hem draait.'
                    : `Bekende tijd over ${alle.length - zonderTijd} van de ${alle.length} stappen:`
                        + ` ${werkMin} min werk`
                        + (wachtMin > 0 ? `, ${formatDuur(wachtMin)} wachten` : '')
                        + (zonderTijd > 0 ? ` · de andere ${zonderTijd} worden gemeten` : '')}
                {gemeten > 0 && ` · ${gemeten} al echt gemeten`}
            </p>

            {/* Waarom staat de porchetta op 150 °C en niet op 130? Omdat je dat
                gekozen hebt. Zonder dit blokje is dat over een half jaar niet
                meer te achterhalen. */}
            {(keuzes?.length ?? 0) > 0 && (
                <div style={{ padding: '10px 16px 0' }}>
                    {keuzes!.map((k) => (
                        <div key={k.vraag} style={{ fontSize: 13, marginBottom: 6 }}>
                            <span style={{ color: 'var(--color-text-muted, #9ca3af)' }}>{k.vraag} </span>
                            <strong>{k.antwoord}</strong>
                        </div>
                    ))}
                </div>
            )}

            <ol style={{ listStyle: 'none', padding: '8px 0 12px', margin: 0 }}>
                {alle.map((r, i) => {
                    const deelNaam = r.component_id != null ? deelNamen.get(r.component_id) : null;
                    const vorigeDeel = i === 0 ? undefined
                        : alle[i - 1].component_id != null ? deelNamen.get(alle[i - 1].component_id!) : null;
                    const details = [
                        r.duur_actief_min != null ? `${r.duur_actief_min} min werk` : null,
                        r.duur_passief_min != null ? `${formatDuur(r.duur_passief_min)} wachten` : null,
                        r.materieel_id != null ? (namen.get(r.materieel_id) ?? `apparaat ${r.materieel_id}`) : null,
                        r.temp_doel_c != null ? `${r.temp_doel_c} °C` : null,
                        /* De eindconditie apart, want een stap die op kern 88
                           eindigt eindigt op de meter en niet op de klok. */
                        r.kern_temp_c != null ? `klaar bij kern ${r.kern_temp_c} °C` : null,
                        r.herhaal_interval_min != null ? `elke ${r.herhaal_interval_min} min iets doen` : null,
                        /* Alleen melden bij wachttijd. Bij een stap waar je zelf
                           staat te snijden is "erbij blijven" geen nieuws, en op
                           vijftien van de negentien regels leest niemand het meer. */
                        r.toezicht_nodig && (r.duur_passief_min ?? 0) > 0 ? 'niet weglopen' : null,
                        r.hangt_af_van_stap_id != null && nummerVan.has(r.hangt_af_van_stap_id)
                            ? `na stap ${nummerVan.get(r.hangt_af_van_stap_id)}`
                            : null,
                        r.duur_actief_min == null && r.duur_passief_min == null ? 'tijd wordt gemeten' : null,
                    ].filter(Boolean).join(' · ');

                    return (
                        <div key={r.id}>
                        {/* Kop boven een blok stappen dat een bouwsteen maakt. Die
                            mogen dagen eerder gemaakt worden en horen zichtbaar
                            los te staan van het gerecht zelf. */}
                        {deelNaam != null && deelNaam !== vorigeDeel && (
                            <div style={{
                                padding: '10px 16px 2px', fontSize: 12, fontWeight: 600,
                                letterSpacing: '.06em', textTransform: 'uppercase',
                                color: 'var(--brand, #6B7A3F)',
                            }}>Hiermee maak je: {deelNaam} · mag vooruit</div>
                        )}
                        {deelNaam == null && vorigeDeel != null && (
                            <div style={{
                                padding: '10px 16px 2px', fontSize: 12, fontWeight: 600,
                                letterSpacing: '.06em', textTransform: 'uppercase',
                                color: 'var(--color-text-muted, #9ca3af)',
                            }}>Het gerecht zelf</div>
                        )}
                        <li
                            style={{
                                display: 'flex',
                                gap: 12,
                                padding: '8px 16px',
                                alignItems: 'flex-start',
                            }}
                        >
                            <span
                                style={{
                                    minWidth: 22,
                                    color: 'var(--color-text-muted, #9ca3af)',
                                    fontVariantNumeric: 'tabular-nums',
                                    fontSize: 14,
                                }}
                            >
                                {r.step_order}.
                            </span>
                            <span>
                                <span style={{ display: 'block', fontSize: 14, lineHeight: 1.45 }}>{r.tekst}</span>
                                {details && (
                                    <span
                                        style={{
                                            display: 'block',
                                            fontSize: 12.5,
                                            marginTop: 2,
                                            color: 'var(--color-text-muted, #9ca3af)',
                                        }}
                                    >
                                        {details}
                                    </span>
                                )}
                            </span>
                        </li>
                        </div>
                    );
                })}
            </ol>
        </section>
    );
}

/** Vierentwintig uur pekelen lees je niet als 1440. */
function formatDuur(min: number): string {
    if (min < 90) return `${min} min`;
    const uren = Math.floor(min / 60);
    const rest = min % 60;
    return rest === 0 ? `${uren} uur` : `${uren} u ${rest} min`;
}
