/* eslint-disable @typescript-eslint/no-explicit-any */
/* componentIngredients — houdt de genormaliseerde `component_ingredients`-tabel
 * in sync met het vrije `components.ingredients` JSONB.
 *
 * Waarom: de demand-motor (component-pad) leest `component_ingredients` met een
 * échte inventory_id, maar de component-editor schreef tot nu toe alléén het
 * JSONB-veld → 0 gekoppelde rijen → de motor kon niks berekenen voor
 * component-gebaseerde gerechten. Deze helper vult de keten zodra een component
 * wordt opgeslagen: elke ingredient-naam wordt via de GEDEELDE resolver aan een
 * inventory-item gekoppeld (of als fallback_name bewaard).
 *
 * Sam-model: een gerecht = componenten; een component = receptuur met
 * ingrediënten; elk ingrediënt = een inventory-item met z'n eigen vaste
 * leverancier. Dit is de schakel die dat model laat werken.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildMatchContext, resolveInventory } from './inventoryMatch';

interface ParsedIngredient {
  name: string;
  quantity: number;
  unit: string;
}

interface ParseResult {
  /** Alleen regels die écht bruikbaar zijn: naam + een hoeveelheid boven nul. */
  rows: ParsedIngredient[];
  /** Namen die de gebruiker wél invulde maar zonder hoeveelheid. */
  zonderHoeveelheid: string[];
}

/** Accepteer de bekende JSONB-vormen: {name|naam, qty|quantity|qty_pp, unit|eenheid}.
 *
 *  Regels zonder hoeveelheid gaan hier bewust NIET mee als `quantity: 0`.
 *  De opslag eist een hoeveelheid boven nul, dus één "peper" zonder gram liet
 *  vroeger de hele wegschrijf-actie stranden — en omdat de oude koppeling toen
 *  al gewist was, hield dat component daarna nul ingrediënten over en rekende
 *  de bestellijst dat component stilzwijgend als niets. We zetten zo'n regel
 *  apart zodat de gebruiker er een melding over krijgt en de rest gewoon
 *  doorgaat. */
function parseIngredients(raw: unknown): ParseResult {
  let arr: any = raw;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { return { rows: [], zonderHoeveelheid: [] }; }
  }
  if (!Array.isArray(arr)) return { rows: [], zonderHoeveelheid: [] };
  const rows: ParsedIngredient[] = [];
  const zonderHoeveelheid: string[] = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const name = String(it.name ?? it.naam ?? '').trim();
    if (!name) continue;
    const quantity = Number(it.qty ?? it.quantity ?? it.qty_pp ?? 0) || 0;
    if (!(quantity > 0)) { zonderHoeveelheid.push(name); continue; }
    const unit = String(it.unit ?? it.eenheid ?? 'stuk').trim() || 'stuk';
    rows.push({ name, quantity, unit });
  }
  return { rows, zonderHoeveelheid };
}

/** "peper", "peper en zout", "peper, zout en tijm", "peper, zout en 3 andere". */
function lijst(namen: string[]): string {
  if (namen.length <= 1) return namen[0] ?? '';
  const eerste = namen.slice(0, 3);
  const rest = namen.length - eerste.length;
  const kop = eerste.slice(0, -1).join(', ');
  const staart = rest > 0 ? `${eerste[eerste.length - 1]} en nog ${rest}` : `${eerste[eerste.length - 1]}`;
  return rest > 0 ? `${kop}, ${staart}` : `${kop} en ${staart}`;
}

export interface SyncResult {
  linked: number; // ingrediënten gekoppeld aan een inventory-item
  unlinked: number; // bewaard als fallback_name (nog geen voorraad-match)
  /** Namen die zijn overgeslagen omdat er geen hoeveelheid bij stond. */
  overgeslagen: string[];
  /** Mensentaal-melding voor de gebruiker (de aanroeper toont deze als
   *  waarschuwing). Nooit databasetaal. */
  error?: string;
}

/** Vervang de component_ingredients van één component door de rijen afgeleid uit
 *  het JSONB-veld. Best-effort: geeft een SyncResult terug i.p.v. te gooien, zodat
 *  de component-opslag zelf nooit faalt op dit koppelwerk.
 *
 *  Volgorde is hier de hele fix: eerst de nieuwe rijen bouwen, dan pas de oude
 *  weggooien, en als het wegschrijven tóch strandt de oude koppeling terugzetten.
 *  Wist je eerst en bouwde je daarna, dan kostte één onvolledige regel het hele
 *  ingrediënten-lijstje van dat component — zonder dat iemand dat merkte. */
export async function syncComponentIngredients(
  supabase: SupabaseClient,
  orgId: string,
  componentId: number,
  ingredientsJson: unknown,
): Promise<SyncResult> {
  try {
    const { rows: parsed, zonderHoeveelheid } = parseIngredients(ingredientsJson);

    const meldingGeenHoeveelheid = zonderHoeveelheid.length === 0 ? undefined
      : `Vul een hoeveelheid in bij ${lijst(zonderHoeveelheid)} — ${zonderHoeveelheid.length === 1 ? 'dat ingrediënt telt' : 'die ingrediënten tellen'} nu niet mee in de bestellijst.`;

    /* Alles wat er staat mist een hoeveelheid. Dan de bestaande koppeling
       LATEN STAAN: 'ik weet het even niet' mag nooit hetzelfde uitpakken als
       'er zitten geen ingrediënten in'. */
    if (parsed.length === 0 && zonderHoeveelheid.length > 0) {
      return { linked: 0, unlinked: 0, overgeslagen: zonderHoeveelheid, error: meldingGeenHoeveelheid };
    }

    /* Resolver-context (zelfde 3-traps match als de demand-motor) en het bouwen
       van de rijen gebeurt vóór elke wijziging — mislukt dit, dan is er nog
       niets kapot. */
    let linked = 0;
    let unlinked = 0;
    const namen: string[] = [];
    let rows: Array<Record<string, unknown>> = [];

    if (parsed.length > 0) {
      const [invRes, aliasRes, taxRes] = await Promise.all([
        supabase.from('inventory').select('id, naam').eq('organization_id', orgId),
        supabase.from('org_product_aliases').select('alias_normalized, master_product_id').eq('organization_id', orgId),
        supabase.from('meat_taxonomy').select('id, aliassen'),
      ]);
      const ctx = buildMatchContext(invRes.data || [], aliasRes.data, taxRes.data);

      rows = parsed.map(function (ing) {
        const inv = resolveInventory(ing.name, ctx);
        if (inv) linked++; else unlinked++;
        namen.push(ing.name);
        return {
          organization_id: orgId,
          component_id: componentId,
          inventory_id: inv ? inv.id : null,
          fallback_name: inv ? null : ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
        };
      });
    }

    /* Vangnet: onthoud de huidige koppeling zodat we 'm kunnen terugzetten als
       het wegschrijven onverwacht helemaal faalt. */
    const { data: huidig } = await supabase
      .from('component_ingredients')
      .select('id, organization_id, component_id, inventory_id, fallback_name, quantity, unit, yield_override, notes')
      .eq('component_id', componentId)
      .eq('organization_id', orgId);

    // Replace-strategie: eerst weg (org-scoped), dan opnieuw.
    await supabase
      .from('component_ingredients')
      .delete()
      .eq('component_id', componentId)
      .eq('organization_id', orgId);

    if (rows.length === 0) {
      return { linked: 0, unlinked: 0, overgeslagen: zonderHoeveelheid, error: meldingGeenHoeveelheid };
    }

    const { error } = await supabase.from('component_ingredients').insert(rows);
    if (!error) {
      return { linked, unlinked, overgeslagen: zonderHoeveelheid, error: meldingGeenHoeveelheid };
    }

    /* Eén regel die de opslag weigert mag de rest niet meeslepen: opnieuw,
       nu rij voor rij. */
    let okLinked = 0;
    let okUnlinked = 0;
    const mislukt: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const { error: rijErr } = await supabase.from('component_ingredients').insert(rows[i]);
      if (rijErr) { mislukt.push(namen[i]); continue; }
      if (rows[i].inventory_id) okLinked++; else okUnlinked++;
    }

    if (okLinked + okUnlinked === 0 && (huidig?.length ?? 0) > 0) {
      /* Niets gelukt: liever de oude, kloppende koppeling terug dan een
         component dat vanaf nu als 'nul ingrediënten' de bestellijst in gaat. */
      await supabase.from('component_ingredients').insert(huidig as Record<string, unknown>[]);
      return {
        linked: 0, unlinked: 0, overgeslagen: zonderHoeveelheid,
        error: `De ingrediënten konden niet opgeslagen worden; de vorige lijst is teruggezet.${meldingGeenHoeveelheid ? ` ${meldingGeenHoeveelheid}` : ''}`,
      };
    }

    const deelMelding = mislukt.length > 0
      ? `${lijst(mislukt)} kon niet opgeslagen worden en telt niet mee in de bestellijst.`
      : undefined;
    const samen = [deelMelding, meldingGeenHoeveelheid].filter(Boolean).join(' ');
    return { linked: okLinked, unlinked: okUnlinked, overgeslagen: zonderHoeveelheid, error: samen || undefined };
  } catch (e) {
    return {
      linked: 0, unlinked: 0, overgeslagen: [],
      error: e instanceof Error ? `Ingrediënten koppelen lukte niet: ${e.message}` : 'Ingrediënten koppelen lukte niet.',
    };
  }
}
