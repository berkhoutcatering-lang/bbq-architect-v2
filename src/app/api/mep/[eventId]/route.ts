import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const dynamic = 'force-dynamic';

type MepStatus = 'todo' | 'bezig' | 'klaar';
type AllergeneItem = { allergen_code: string };
type HaccpPoint = { type: string; threshold_value?: number; threshold_unit?: string; note?: string };

type NormalizedComponent = {
  id: number;
  name: string;
  description: string | null;
  type: 'prepared' | 'bought_in';
  base_quantity: number;
  base_unit: string;
  preparation_steps: string[] | null;
  allergens: AllergeneItem[] | null;
  haccp_points: HaccpPoint[] | null;
  flavor_tags: string[] | null;
};

type NormalizedMepItem = {
  id: number;
  component_id: number;
  gerecht_id: string; // UUID
  status: MepStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

type ComponentOutput = NormalizedComponent & NormalizedMepItem & { mep_item_id: number };

type GerechtOutput = {
  id: string; // UUID
  naam: string;
  foto_url: string | null;
  components: ComponentOutput[];
};

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function normalizeNaam(s: string): string {
  return s.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract gerecht-namen uit menu_selectie (zelfde shapes als bulkSchedule.ts) */
function extractNamesFromMenuSelectie(raw: unknown): string[] {
  let ms = raw;
  if (typeof ms === 'string') {
    try { ms = JSON.parse(ms); } catch { return []; }
  }
  if (!ms || typeof ms !== 'object') return [];

  const flat: unknown[] = Array.isArray(ms)
    ? ms
    : Object.values(ms as Record<string, unknown>).flatMap(v => Array.isArray(v) ? v : [v]);

  const names: string[] = [];
  for (const item of flat) {
    if (typeof item === 'string' && item.trim()) {
      names.push(item.trim());
    } else if (item && typeof item === 'object') {
      const it = item as Record<string, unknown>;
      const naam = it.gerecht_naam ?? it.naam;
      if (typeof naam === 'string' && naam.trim()) names.push(naam.trim());
    }
  }
  return names;
}

/** Naam-matching: exact eerst, dan contains (kortste = meest specifiek). Returns UUID string. */
function matchGerechtId(zoekNaam: string, gerechten: { id: string; naam: string }[]): string | null {
  const target = normalizeNaam(zoekNaam);
  if (!target) return null;

  const kandidaten = gerechten.map(g => ({ id: g.id, naam: normalizeNaam(g.naam) })).filter(g => g.naam);

  // exact
  const exact = kandidaten.find(g => g.naam === target);
  if (exact) return exact.id;

  // enkelvoud (strip trailing s)
  const singular = target.endsWith('s') && target.length > 4 ? target.slice(0, -1) : null;

  // contains match — kortste gerecht-naam wint (meest specifiek)
  const matches = kandidaten.filter(g => g.naam.includes(target) || (singular && g.naam.includes(singular)));
  if (matches.length > 0) return matches.sort((a, b) => a.naam.length - b.naam.length)[0].id;

  return null;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const items = value.map(String).map(s => s.trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return normalizeStringArray(JSON.parse(trimmed)); } catch { /* ignore */ }
    return [trimmed];
  }
  return null;
}

function mepKey(gerechtId: string, componentId: number): string {
  return `${gerechtId}:${componentId}`;
}

function parseEventIdFromUrl(req: NextRequest): number | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const mepIndex = segments.lastIndexOf('mep');
  if (mepIndex === -1) return null;
  return toInteger(segments[mepIndex + 1]);
}

/**
 * Resolve gerecht-UUIDs voor een event — identiek aan bulkSchedule.ts:
 * 1. offerte.menu_selectie (namen) via offertes.event_id
 * 2. Fallback: offerte via events.offerte_id
 * 3. Namen matchen op gerechten.naam (fuzzy)
 * 4. Fallback: events.menu (legacy integer-array → lookup via id)
 */
async function resolveGerechtIds(
  supabase: TenantAuthCtx['supabase'],
  orgId: string,
  eventId: number,
  offerte_id: number | null | undefined,
  rawMenu: unknown,
): Promise<string[]> {
  // 1. Probeer offerte via event_id
  let menuSelectie: unknown = null;
  const { data: viaEventId } = await supabase
    .from('offertes')
    .select('id,menu_selectie')
    .eq('event_id', eventId)
    .maybeSingle();

  if (viaEventId?.menu_selectie) {
    menuSelectie = viaEventId.menu_selectie;
  } else if (offerte_id != null) {
    const { data: viaOfferteId } = await supabase
      .from('offertes')
      .select('id,menu_selectie')
      .eq('id', offerte_id)
      .maybeSingle();
    menuSelectie = viaOfferteId?.menu_selectie ?? null;
  }

  if (menuSelectie) {
    const namen = extractNamesFromMenuSelectie(menuSelectie);
    if (namen.length > 0) {
      const { data: alleGerechten } = await supabase
        .from('gerechten')
        .select('id,naam')
        .eq('organization_id', orgId);

      const lookup = (alleGerechten ?? []) as { id: string; naam: string }[];
      const ids: string[] = [];
      for (const naam of namen) {
        const id = matchGerechtId(naam, lookup);
        if (id != null) ids.push(id);
      }
      if (ids.length > 0) return dedupeStrings(ids);
    }
  }

  // 2. Fallback: events.menu (legacy integer-array) — zoek UUIDs via integer-ish waarden
  let menu = rawMenu;
  if (typeof menu === 'string') {
    try { menu = JSON.parse(menu); } catch { return []; }
  }
  if (!Array.isArray(menu) || menu.length === 0) return [];

  // Legacy menu bevat soms integer IDs — probeer gerechten op te halen via die waarden
  // (gerechten.id is UUID, dus dit werkt alleen als menu echte UUID-strings bevat)
  const uuidLike = (menu as unknown[]).filter(v => typeof v === 'string' && v.includes('-'));
  if (uuidLike.length > 0) return dedupeStrings(uuidLike as string[]);

  return [];
}

async function fetchMepItems(
  supabase: TenantAuthCtx['supabase'],
  orgId: string,
  eventId: number,
): Promise<NormalizedMepItem[]> {
  const { data, error } = await supabase
    .from('mep_items')
    .select('id,component_id,gerecht_id,status,started_at,completed_at,completed_by,notes')
    .eq('organization_id', orgId)
    .eq('event_id', eventId);

  if (error) throw new Error('MEP-items ophalen mislukt.');

  return (data ?? []).map((row: Record<string, unknown>) => {
    const id = toInteger(row.id);
    const componentId = toInteger(row.component_id);
    const gerechtId = typeof row.gerecht_id === 'string' && row.gerecht_id ? row.gerecht_id : null;
    if (!id || !componentId || !gerechtId) return null;
    return {
      id,
      component_id: componentId,
      gerecht_id: gerechtId,
      status: (['todo', 'bezig', 'klaar'].includes(row.status as string) ? row.status : 'todo') as MepStatus,
      started_at: typeof row.started_at === 'string' ? row.started_at : null,
      completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
      completed_by: typeof row.completed_by === 'string' ? row.completed_by : null,
      notes: typeof row.notes === 'string' ? row.notes : null,
    } as NormalizedMepItem;
  }).filter((r): r is NormalizedMepItem => r !== null);
}

export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx, routeCtx?: unknown) => {
  try {
    const rawEventId = (routeCtx as { params?: { eventId?: string } } | undefined)?.params?.eventId;
    const eventId = toInteger(rawEventId) ?? parseEventIdFromUrl(req);
    if (!eventId) return NextResponse.json({ error: 'Ongeldig eventId.' }, { status: 400 });

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id,name,date,guests,menu,offerte_id')
      .eq('id', eventId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (eventError) return NextResponse.json({ error: 'Event ophalen mislukt.' }, { status: 500 });
    if (!eventRow) return NextResponse.json({ error: 'Event niet gevonden.' }, { status: 404 });

    const r = eventRow as Record<string, unknown>;
    const eventPayload = {
      id: eventId,
      name: String(r.name ?? `Event ${eventId}`),
      date: String(r.date ?? ''),
      guests: toNumber(r.guests, 0),
    };

    // Resolve gerechten via offerte.menu_selectie (namen) of events.menu (legacy)
    const gerechtIds = await resolveGerechtIds(
      supabase,
      orgId,
      eventId,
      r.offerte_id != null ? toInteger(r.offerte_id) : null,
      r.menu,
    );

    if (gerechtIds.length === 0) return NextResponse.json({ event: eventPayload, gerechten: [] });

    const { data: gerechtenData, error: gerechtenError } = await supabase
      .from('gerechten')
      .select('id,naam,foto_url')
      .in('id', gerechtIds);

    if (gerechtenError) return NextResponse.json({ error: 'Gerechten ophalen mislukt.' }, { status: 500 });

    const gerechten = (gerechtenData ?? []).map((row: Record<string, unknown>) => {
      const id = typeof row.id === 'string' && row.id ? row.id : null;
      if (!id) return null;
      return { id, naam: String(row.naam ?? 'Gerecht'), foto_url: row.foto_url ? String(row.foto_url) : null };
    }).filter((g): g is { id: string; naam: string; foto_url: string | null } => g !== null);

    if (gerechten.length === 0) return NextResponse.json({ event: eventPayload, gerechten: [] });

    const geldigeIds = gerechten.map(g => g.id);

    const { data: gcData, error: gcError } = await supabase
      .from('gerecht_components')
      .select('gerecht_id,component_id,quantity_used,unit')
      .in('gerecht_id', geldigeIds);

    if (gcError) return NextResponse.json({ error: 'Component-koppelingen ophalen mislukt.' }, { status: 500 });

    type GcPair = { gerecht_id: string; component_id: number; quantity_used: number; unit: string };
    const gerechtComponents = (gcData ?? []).map((row: Record<string, unknown>): GcPair | null => {
      const gerechtId = typeof row.gerecht_id === 'string' && row.gerecht_id ? row.gerecht_id : null;
      const componentId = toInteger(row.component_id);
      if (!gerechtId || !componentId) return null;
      // quantity_used = hoeveel het gerecht van deze component gebruikt per portie (×gasten = te maken)
      const qu = Number(row.quantity_used);
      return {
        gerecht_id: gerechtId,
        component_id: componentId,
        quantity_used: Number.isFinite(qu) && qu > 0 ? qu : NaN,
        unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : '',
      };
    }).filter((r): r is GcPair => r !== null);

    if (gerechtComponents.length === 0) return NextResponse.json({ event: eventPayload, gerechten: [] });

    const componentIds = dedupeNumbers(gerechtComponents.map(r => r.component_id));

    const { data: componentData, error: componentError } = await supabase
      .from('components')
      .select('id,name,description,type,base_quantity,base_unit,preparation_steps,flavor_tags')
      .eq('organization_id', orgId)
      .in('id', componentIds);

    if (componentError) return NextResponse.json({ error: 'Componenten ophalen mislukt.' }, { status: 500 });

    // Allergenen + HACCP komen uit aparte tabellen (niet uit components zelf)
    const [{ data: allergRows }, { data: haccpRows }] = await Promise.all([
      supabase.from('component_allergens').select('component_id,allergen_code').eq('organization_id', orgId).in('component_id', componentIds),
      supabase.from('component_haccp_points').select('component_id,type,threshold_value,threshold_unit,note').eq('organization_id', orgId).in('component_id', componentIds),
    ]);

    const allergPerComponent = new Map<number, AllergeneItem[]>();
    for (const row of (allergRows ?? []) as Record<string, unknown>[]) {
      const cid = toInteger(row.component_id);
      const code = typeof row.allergen_code === 'string' ? row.allergen_code.trim().toUpperCase() : '';
      if (!cid || !code) continue;
      const list = allergPerComponent.get(cid) ?? [];
      list.push({ allergen_code: code });
      allergPerComponent.set(cid, list);
    }

    const haccpPerComponent = new Map<number, HaccpPoint[]>();
    for (const row of (haccpRows ?? []) as Record<string, unknown>[]) {
      const cid = toInteger(row.component_id);
      const type = typeof row.type === 'string' ? row.type.trim() : '';
      if (!cid || !type) continue;
      const p: HaccpPoint = { type };
      const tv = Number(row.threshold_value);
      if (Number.isFinite(tv)) p.threshold_value = tv;
      if (typeof row.threshold_unit === 'string' && row.threshold_unit.trim()) p.threshold_unit = row.threshold_unit.trim();
      if (typeof row.note === 'string' && row.note.trim()) p.note = row.note.trim();
      const list = haccpPerComponent.get(cid) ?? [];
      list.push(p);
      haccpPerComponent.set(cid, list);
    }

    const componentMap = new Map<number, NormalizedComponent>();
    for (const row of (componentData ?? []) as Record<string, unknown>[]) {
      const id = toInteger(row.id);
      if (!id) continue;
      componentMap.set(id, {
        id,
        name: String(row.name ?? `Component ${id}`),
        description: row.description ? String(row.description) : null,
        type: row.type === 'bought_in' ? 'bought_in' : 'prepared',
        base_quantity: toNumber(row.base_quantity, 0),
        base_unit: String(row.base_unit ?? 'stuks'),
        preparation_steps: normalizeStringArray(row.preparation_steps),
        allergens: allergPerComponent.get(id) ?? null,
        haccp_points: haccpPerComponent.get(id) ?? null,
        flavor_tags: normalizeStringArray(row.flavor_tags),
      });
    }

    let mepItems = await fetchMepItems(supabase, orgId, eventId);
    const bestaand = new Set(mepItems.map(m => mepKey(m.gerecht_id, m.component_id)));

    const teInitieren = gerechtComponents
      .filter(r => componentMap.has(r.component_id) && !bestaand.has(mepKey(r.gerecht_id, r.component_id)))
      .map(r => ({ organization_id: orgId, event_id: eventId, component_id: r.component_id, gerecht_id: r.gerecht_id, status: 'todo' }));

    if (teInitieren.length > 0) {
      const { error: initError } = await supabase
        .from('mep_items')
        .upsert(teInitieren, { onConflict: 'organization_id,event_id,component_id,gerecht_id', ignoreDuplicates: true });
      if (initError) return NextResponse.json({ error: 'MEP-items initialiseren mislukt.' }, { status: 500 });
      mepItems = await fetchMepItems(supabase, orgId, eventId);
    }

    const mepMap = new Map(mepItems.map(m => [mepKey(m.gerecht_id, m.component_id), m]));
    const gerechtMap = new Map(gerechten.map(g => [g.id, g]));
    const gcPerGerecht = new Map<string, GcPair[]>();
    for (const r of gerechtComponents) {
      const list = gcPerGerecht.get(r.gerecht_id) ?? [];
      list.push(r);
      gcPerGerecht.set(r.gerecht_id, list);
    }

    const resultaatGerechten: GerechtOutput[] = gerechtIds
      .map(gid => gerechtMap.get(gid))
      .filter((g): g is { id: string; naam: string; foto_url: string | null } => Boolean(g))
      .map(gerecht => {
        const pairs = gcPerGerecht.get(gerecht.id) ?? [];
        const components: ComponentOutput[] = pairs.map(pair => {
          const comp = componentMap.get(pair.component_id);
          const mep = mepMap.get(mepKey(pair.gerecht_id, pair.component_id));
          if (!comp || !mep) return null;
          // Te maken = quantity_used (per portie) × gasten — niet de component-basisbatch.
          const base_quantity = Number.isFinite(pair.quantity_used) ? pair.quantity_used : comp.base_quantity;
          const base_unit = pair.unit || comp.base_unit;
          return { ...comp, base_quantity, base_unit, ...mep, mep_item_id: mep.id };
        }).filter((c): c is ComponentOutput => c !== null);
        return { ...gerecht, components };
      })
      .filter(g => g.components.length > 0);

    return NextResponse.json({ event: eventPayload, gerechten: resultaatGerechten });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende serverfout.' }, { status: 500 });
  }
});

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx, routeCtx?: unknown) => {
  try {
    const rawEventId = (routeCtx as { params?: { eventId?: string } } | undefined)?.params?.eventId;
    const eventId = toInteger(rawEventId) ?? parseEventIdFromUrl(req);
    if (!eventId) return NextResponse.json({ error: 'Ongeldig eventId.' }, { status: 400 });

    let body: { action?: unknown } = {};
    try { body = await req.json() as { action?: unknown }; } catch { /* ignore */ }

    if (body.action !== undefined && body.action !== 'reset') {
      return NextResponse.json({ error: "Ongeldige actie. Gebruik action='reset'." }, { status: 400 });
    }

    const { data: eventRow, error: eventError } = await supabase
      .from('events').select('id').eq('id', eventId).eq('organization_id', orgId).maybeSingle();
    if (eventError) return NextResponse.json({ error: 'Eventcontrole mislukt.' }, { status: 500 });
    if (!eventRow) return NextResponse.json({ error: 'Event niet gevonden.' }, { status: 404 });

    const { data: updatedRows, error: resetError } = await supabase
      .from('mep_items')
      .update({ status: 'todo', started_at: null, completed_at: null, completed_by: null })
      .eq('organization_id', orgId)
      .eq('event_id', eventId)
      .select('id');

    if (resetError) return NextResponse.json({ error: 'Resetten mislukt.' }, { status: 500 });

    return NextResponse.json({ ok: true, updated: updatedRows?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende serverfout.' }, { status: 500 });
  }
});
