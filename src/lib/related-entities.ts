/* Cross-entity relatie-helper — het fundament van het "ecosysteem-gevoel".
   ──────────────────────────────────────────────────────────────────────
   De app verbindt offerte ↔ event ↔ factuur ↔ klant via FK's, maar de UI
   toonde die verbindingen niet (detail-pagina's waren dead-ends). Deze helper
   haalt de buren van een entiteit op zodat detail-pagina's klikbare
   relatie-pills kunnen renderen — vanaf elke entiteit kun je naar de
   verbonden entiteiten navigeren.

   FK-realiteit (geverifieerd 2026-06-01):
   - offertes.event_id  ↔  events.offerte_id   (bidirectioneel)
   - facturen.offerte_id → offerte
   - facturen.event_id   → event
   - klant: via client_naam (geen FK, naam-match binnen org)

   Werkt zowel client- als server-side (neemt SupabaseClient als param,
   net als resolveClientEmail). */

import type { SupabaseClient } from '@supabase/supabase-js';

export type EntityKind = 'offerte' | 'event' | 'factuur' | 'klant' | 'lead';

export interface RelatedEntity {
  kind: EntityKind;
  id: number | string;
  label: string;        // bv "Offerte F2026-015", event-naam, "Factuur F2026-2"
  status?: string;      // voor StatusBadge (raw DB-status; StatusBadge normaliseert)
  href: string;         // navigatie-doel
}

/* Route-conventies per entiteit. Centraal zodat alle pills consistent linken. */
export function entityHref(kind: EntityKind, id: number | string, clientNaam?: string): string {
  switch (kind) {
    case 'offerte': return `/offertes/${id}/view`;
    case 'event': return `/events/${id}/hub`;
    case 'factuur': return `/facturen?focus=${id}`;
    case 'klant': return `/klanten?focus=${encodeURIComponent(clientNaam || String(id))}`;
    case 'lead': return `/verkoop/leads?focus=${id}`;
  }
}

interface ResolveArgs {
  kind: EntityKind;
  id?: number | string;       // id van de bron-entiteit (niet nodig voor kind='klant')
  clientNaam?: string;        // klant-naam (voor klant-relaties + kind='klant')
  orgId?: string | null;
}

type Row = Record<string, unknown>;

function asRelated(kind: EntityKind, row: Row): RelatedEntity | null {
  if (!row || row.id == null) return null;
  const id = row.id as number | string;
  let label: string;
  if (kind === 'offerte') label = 'Offerte ' + (row.nummer || id);
  else if (kind === 'factuur') label = 'Factuur ' + (row.nummer || id);
  else if (kind === 'event') label = String(row.name || 'Event ' + id);
  else if (kind === 'lead') label = String(row.naam || 'Aanvraag ' + id);
  else label = String(row.naam || id);
  return {
    kind,
    id,
    label,
    status: typeof row.status === 'string' ? row.status : undefined,
    href: entityHref(kind, id, kind === 'klant' ? String(row.naam || '') : undefined),
  };
}

/* Haal de gerelateerde entiteiten van een bron-entiteit op. Best-effort:
   ontbrekende relaties leveren gewoon minder pills (geen crash). */
export async function getRelatedEntities(
  supabase: SupabaseClient,
  args: ResolveArgs,
): Promise<RelatedEntity[]> {
  const out: RelatedEntity[] = [];

  try {
    if (args.kind === 'offerte' && args.id != null) {
      const { data: off } = await supabase.from('offertes')
        .select('id,nummer,event_id,client_naam').eq('id', args.id).single();
      if (off) {
        // event (via offerte.event_id of events.offerte_id)
        const evId = (off as Row).event_id;
        if (evId) {
          const { data: ev } = await supabase.from('events').select('id,name,status').eq('id', evId).single();
          const r = ev && asRelated('event', ev); if (r) out.push(r);
        } else {
          const { data: ev } = await supabase.from('events').select('id,name,status').eq('offerte_id', args.id).limit(1).maybeSingle();
          const r = ev && asRelated('event', ev as Row); if (r) out.push(r);
        }
        // factuur
        const { data: fac } = await supabase.from('facturen').select('id,nummer,status').eq('offerte_id', args.id).limit(1).maybeSingle();
        const rf = fac && asRelated('factuur', fac as Row); if (rf) out.push(rf);
        // klant
        const naam = (off as Row).client_naam as string | undefined;
        if (naam) out.push({ kind: 'klant', id: naam, label: naam, href: entityHref('klant', naam, naam) });
        // lead (reciprocaal: de aanvraag die tot deze offerte leidde)
        const { data: ld } = await supabase.from('leads').select('id,naam,status').eq('offerte_id', args.id).limit(1).maybeSingle();
        const rl = ld && asRelated('lead', ld as Row); if (rl) out.push(rl);
      }
    }

    else if (args.kind === 'event' && args.id != null) {
      const { data: ev } = await supabase.from('events')
        .select('id,offerte_id,client_naam').eq('id', args.id).single();
      if (ev) {
        const offId = (ev as Row).offerte_id;
        if (offId) {
          const { data: off } = await supabase.from('offertes').select('id,nummer,status').eq('id', offId).single();
          const r = off && asRelated('offerte', off); if (r) out.push(r);
        } else {
          const { data: off } = await supabase.from('offertes').select('id,nummer,status').eq('event_id', args.id).limit(1).maybeSingle();
          const r = off && asRelated('offerte', off as Row); if (r) out.push(r);
        }
        const { data: fac } = await supabase.from('facturen').select('id,nummer,status').eq('event_id', args.id).limit(1).maybeSingle();
        const rf = fac && asRelated('factuur', fac as Row); if (rf) out.push(rf);
        const naam = (ev as Row).client_naam as string | undefined;
        if (naam) out.push({ kind: 'klant', id: naam, label: naam, href: entityHref('klant', naam, naam) });
      }
    }

    else if (args.kind === 'factuur' && args.id != null) {
      const { data: fac } = await supabase.from('facturen')
        .select('id,offerte_id,event_id,client_naam').eq('id', args.id).single();
      if (fac) {
        const offId = (fac as Row).offerte_id;
        if (offId) {
          const { data: off } = await supabase.from('offertes').select('id,nummer,status').eq('id', offId).single();
          const r = off && asRelated('offerte', off); if (r) out.push(r);
        }
        const evId = (fac as Row).event_id;
        if (evId) {
          const { data: ev } = await supabase.from('events').select('id,name,status').eq('id', evId).single();
          const r = ev && asRelated('event', ev); if (r) out.push(r);
        }
        const naam = (fac as Row).client_naam as string | undefined;
        if (naam) out.push({ kind: 'klant', id: naam, label: naam, href: entityHref('klant', naam, naam) });
      }
    }

    else if (args.kind === 'lead' && args.id != null) {
      const { data: ld } = await supabase.from('leads')
        .select('id,offerte_id,client_naam').eq('id', args.id).single();
      if (ld) {
        const offId = (ld as Row).offerte_id;
        if (offId) {
          const { data: off } = await supabase.from('offertes').select('id,nummer,status').eq('id', offId).single();
          const r = off && asRelated('offerte', off); if (r) out.push(r);
        }
        const naam = (ld as Row).client_naam as string | undefined;
        if (naam) out.push({ kind: 'klant', id: naam, label: naam, href: entityHref('klant', naam, naam) });
      }
    }

    else if (args.kind === 'klant') {
      const naam = args.clientNaam;
      if (naam && args.orgId) {
        const [offs, evs, facs, lds] = await Promise.all([
          supabase.from('offertes').select('id,nummer,status').eq('organization_id', args.orgId).ilike('client_naam', naam).order('datum', { ascending: false }).limit(10),
          supabase.from('events').select('id,name,status').eq('organization_id', args.orgId).ilike('client_naam', naam).order('date', { ascending: false }).limit(10),
          supabase.from('facturen').select('id,nummer,status').eq('organization_id', args.orgId).ilike('client_naam', naam).order('datum', { ascending: false }).limit(10),
          supabase.from('leads').select('id,naam,status').eq('organization_id', args.orgId).ilike('client_naam', naam).order('created_at', { ascending: false }).limit(10),
        ]);
        (offs.data || []).forEach((r) => { const x = asRelated('offerte', r as Row); if (x) out.push(x); });
        (evs.data || []).forEach((r) => { const x = asRelated('event', r as Row); if (x) out.push(x); });
        (facs.data || []).forEach((r) => { const x = asRelated('factuur', r as Row); if (x) out.push(x); });
        (lds.data || []).forEach((r) => { const x = asRelated('lead', r as Row); if (x) out.push(x); });
      }
    }
  } catch {
    /* best-effort — minder pills bij fout, geen crash */
  }

  return out;
}
