import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';

export const dynamic = 'force-dynamic';

type MepStatus = 'todo' | 'bezig' | 'klaar';

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseIdsFromUrl(req: NextRequest): { eventId: number | null; itemId: number | null } {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const mepIndex = segments.lastIndexOf('mep');
  if (mepIndex === -1) return { eventId: null, itemId: null };
  return {
    eventId: toInteger(segments[mepIndex + 1]),
    itemId: toInteger(segments[mepIndex + 2]),
  };
}

export const PATCH = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx, routeCtx?: unknown) => {
  try {
    const params = (routeCtx as { params?: { eventId?: string; itemId?: string } } | undefined)?.params;
    const fromUrl = parseIdsFromUrl(req);
    const eventId = toInteger(params?.eventId) ?? fromUrl.eventId;
    const itemId = toInteger(params?.itemId) ?? fromUrl.itemId;

    if (!eventId || !itemId) {
      return NextResponse.json({ error: 'Ongeldige eventId of itemId.' }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Body bevat geen geldige JSON.' }, { status: 400 });
    }

    const status = body.status as string | undefined;
    if (!status || !['todo', 'bezig', 'klaar'].includes(status)) {
      return NextResponse.json({ error: 'Status is verplicht en moet todo, bezig of klaar zijn.' }, { status: 400 });
    }

    const { data: existing, error: fetchErr } = await supabase
      .from('mep_items')
      .select('id,event_id,status,started_at,completed_at,completed_by,notes')
      .eq('id', itemId)
      .eq('event_id', eventId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: 'MEP-item ophalen mislukt.' }, { status: 500 });
    if (!existing) return NextResponse.json({ error: 'MEP-item niet gevonden.' }, { status: 404 });

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if ('notes' in body) updates.notes = body.notes ?? null;

    const mepStatus = status as MepStatus;
    if (mepStatus === 'todo') {
      updates.started_at = null;
      updates.completed_at = null;
      updates.completed_by = null;
    } else if (mepStatus === 'bezig') {
      updates.started_at = (existing as Record<string, unknown>).started_at ?? now;
      updates.completed_at = null;
      updates.completed_by = null;
    } else {
      updates.started_at = (existing as Record<string, unknown>).started_at ?? now;
      updates.completed_at = now;
      updates.completed_by = 'completed_by' in body ? (body.completed_by ?? null) : ((existing as Record<string, unknown>).completed_by ?? null);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('mep_items')
      .update(updates)
      .eq('id', itemId)
      .eq('event_id', eventId)
      .eq('organization_id', orgId)
      .select('id,event_id,component_id,gerecht_id,status,started_at,completed_at,completed_by,notes')
      .single();

    if (updateErr) return NextResponse.json({ error: 'MEP-item updaten mislukt.' }, { status: 500 });

    return NextResponse.json({ item: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende serverfout.' }, { status: 500 });
  }
});
