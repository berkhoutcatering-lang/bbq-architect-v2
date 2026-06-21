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
  gerecht_id: number;
  status: MepStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
};

type ComponentOutput = NormalizedComponent & NormalizedMepItem & { mep_item_id: number };

type GerechtOutput = {
  id: number;
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

/** Naam-matching: exact eerst, dan contains (kortste = meest specifiek) */
function matchGerechtId(zoekNaam: string, gerechten: { id: number; naam: string }[]): number | null {
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

function normalizeAllergens(value: unknown): AllergeneItem[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const list = value.map(entry => {
      if (typeof entry === 'string') return entry.trim().toUpperCase() ? { allergen_code: entry.trim().toUpperCase() } : null;
      if (entry && typeof entry === 'object') {
        const r = entry as Record<string, unknown>;
        const code = r.allergen_code ?? r.code;
        return typeof code === 'string' && code.trim() ? { allergen_code: code.trim().toUpperCase() } : null;
      }
      return null;
    }).filter((e): e is AllergeneItem => e !== null);
    return list.length > 0 ? list : null;
  }
  if (typeof value === 'string') {
    try { return normalizeAllergens(JSON.parse(value)); } catch { /* ignore */ }
  }
  return null;
}

function normalizeHaccpPoints(value: unknown): HaccpPoint[] | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return normalizeHaccpPoints(JSON.parse(value)); } catch { return null; }
  }
  if (Array.isArray(value)) {
    const points = value.map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const r = entry as Record<string, unknown>;
      const type = r.type ?? r.label ?? r.name;
      if (typeof type !== 'string' || !type.trim()) return null;
      const p: HaccpPoint = { type: type.trim() };
      const tv = Number(r.threshold_value ?? r.threshold ?? r.value);
      if (Number.isFinite(tv)) p.threshold_value = tv;
      if (typeof r.threshold_unit === 'string' && r.threshold_unit.trim()) p.threshold_unit = r.threshold_unit.trim();
      if (typeof r.note === 'string' && r.note.trim()) p.note = r.note.trim();
      return p;
    }).filter((p): p is HaccpPoint => p !== null);
    return points.length > 0 ? points : null;
  }
  return null;
}

function mepKey(gerechtId: number, componentId: number): string {
  return `${gerechtId}:${componentId}`;
}

function parseEventIdFromUrl(req: NextRequest): number | null {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const mepIndex = segments.lastIndexOf('mep');
  if (mepIndex === -1) return null;
  return toInteger(segments[mepIndex + 1]);
}

/**
 * Resolve gerecht-IDs voor een event — identiek aan bulkSchedule.ts:
 * 1. offerte.menu_selectie (namen) via offertes.event_id
 * 2. Fallback: offerte via events.offerte_id
 * 3. Namen matchen op gerechten.naam (fuzzy)
 * 4. Fallback: events.menu (legacy integer-array)
 */
async function resolveGerechtIds(
  supabase: TenantAuthCtx['supabase'],
  orgId: string,
  eventId: number,
  offerte_id: number | null | undefined,
  rawMenu: unknown,
): Promise<number[]> {
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

      const lookup = (alleGerechten ?? []) as { id: number; naam: string }[];
      const ids: number[] = [];
      for (const naam of namen) {
        const id = matchGerechtId(naam, lookup);
        if (id != null) ids.push(id);
      }
      if (ids.length > 0) return dedupeNumbers(ids);
    }
  }

  // 2. Fallback: events.menu (legacy integer-array)
  let menu = rawMenu;
  if (typeof menu === 'string') {
    try { menu = JSON.parse(menu); } catch { return []; }
  }
  if (!Array.isArray(menu) || menu.length === 0) return [];
  return dedupeNumbers(menu.map(toInteger).filter((v): v is number => v !== null));
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
    const gerechtId = toInteger(row.gerecht_id);
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

    // Resolve gerechten via offerte.menu_selectie (namen) of events.menu (legacy IDs)
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
      const id = toInteger(row.id);
      if (!id) return null;
      return { id, naam: String(row.naam ?? `Gerecht ${id}`), foto_url: row.foto_url ? String(row.foto_url) : null };
    }).filter((g): g is { id: number; naam: string; foto_url: string | null } => g !== null);

    if (gerechten.length === 0) return NextResponse.json({ event: eventPayload, gerechten: [] });

    const geldigeIds = gerechten.map(g => g.id);

    const { data: gcData, error: gcError } = await supabase
      .from('gerecht_components')
      .select('gerecht_id,component_id')
      .in('gerecht_id', geldigeIds);

    if (gcError) return NextResponse.json({ error: 'Component-koppelingen ophalen mislukt.' }, { status: 500 });

    const gerechtComponents = (gcData ?? []).map((row: Record<string, unknown>) => {
      const gerechtId = toInteger(row.gerecht_id);
      const componentId = toInteger(row.component_id);
      if (!gerechtId || !componentId) return null;
      return { gerecht_id: gerechtId, component_id: componentId };
    }).filter((r): r is { gerecht_id: number; component_id: number } => r !== null);

    if (gerechtComponents.length === 0) return NextResponse.json({ event: eventPayload, gerechten: [] });

    const componentIds = dedupeNumbers(gerechtComponents.map(r => r.component_id));

    const { data: componentData, error: componentError } = await supabase
      .from('components')
      .select('id,name,description,type,base_quantity,base_unit,preparation_steps,allergens,haccp_points,flavor_tags')
      .eq('organization_id', orgId)
      .in('id', componentIds);

    if (componentError) return NextResponse.json({ error: 'Componenten ophalen mislukt.' }, { status: 500 });

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
        allergens: normalizeAllergens(row.allergens),
        haccp_points: normalizeHaccpPoints(row.haccp_points),
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
    const gcPerGerecht = new Map<number, { gerecht_id: number; component_id: number }[]>();
    for (const r of gerechtComponents) {
      const list = gcPerGerecht.get(r.gerecht_id) ?? [];
      list.push(r);
      gcPerGerecht.set(r.gerecht_id, list);
    }

    const resultaatGerechten: GerechtOutput[] = gerechtIds
      .map(gid => gerechtMap.get(gid))
      .filter((g): g is { id: number; naam: string; foto_url: string | null } => Boolean(g))
      .map(gerecht => {
        const pairs = gcPerGerecht.get(gerecht.id) ?? [];
        const components: ComponentOutput[] = pairs.map(pair => {
          const comp = componentMap.get(pair.component_id);
          const mep = mepMap.get(mepKey(pair.gerecht_id, pair.component_id));
          if (!comp || !mep) return null;
          return { ...comp, ...mep, mep_item_id: mep.id };
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
