'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import MepGerechtGroep from './MepGerechtGroep';
import MepItemSheet from './MepItemSheet';
import MepTopBar from './MepTopBar';

export type MepStatus = 'todo' | 'bezig' | 'klaar';

export interface MepComponentItem {
  mep_item_id: number;
  component_id: number;
  name: string;
  description: string | null;
  type: 'prepared' | 'bought_in' | string;
  base_quantity: number;
  base_unit: string;
  preparation_steps: string[] | null;
  allergens: { allergen_code: string }[] | null;
  haccp_points: { type: string; threshold_value?: number; threshold_unit?: string; note?: string }[] | null;
  flavor_tags: string[] | null;
  status: MepStatus;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export interface MepGerecht {
  id: number;
  naam: string;
  foto_url: string | null;
  components: MepComponentItem[];
}

export interface MepResponse {
  event: { id: number; name: string; date: string; guests: number };
  gerechten: MepGerecht[];
}

type UpcomingEvent = {
  id: number;
  name: string;
  date: string;
  guests: number;
  status: string;
};

function toMepStatus(value: unknown): MepStatus {
  if (value === 'bezig' || value === 'klaar') return value;
  return 'todo';
}

function findItemById(data: MepResponse | null, itemId: number): MepComponentItem | null {
  if (!data) return null;
  for (const g of data.gerechten) {
    const found = g.components.find(c => c.mep_item_id === itemId);
    if (found) return found;
  }
  return null;
}

function patchMepData(
  data: MepResponse | null,
  itemId: number,
  patch: Partial<MepComponentItem>
): MepResponse | null {
  if (!data) return data;
  return {
    ...data,
    gerechten: data.gerechten.map(g => ({
      ...g,
      components: g.components.map(c => c.mep_item_id === itemId ? { ...c, ...patch } : c),
    })),
  };
}

function patchFromRow(row: Record<string, unknown>): Partial<MepComponentItem> {
  const patch: Partial<MepComponentItem> = {};
  if ('status' in row) patch.status = toMepStatus(row.status);
  if ('started_at' in row) patch.started_at = typeof row.started_at === 'string' ? row.started_at : null;
  if ('completed_at' in row) patch.completed_at = typeof row.completed_at === 'string' ? row.completed_at : null;
  if ('completed_by' in row) patch.completed_by = typeof row.completed_by === 'string' ? row.completed_by : null;
  if ('notes' in row) patch.notes = typeof row.notes === 'string' ? row.notes : null;
  return patch;
}

export default function KookbordClient() {
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [mepData, setMepData] = useState<MepResponse | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MepComponentItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fout, setFout] = useState('');
  const [melding, setMelding] = useState('');
  const [resetting, setResetting] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (!melding) return;
    const t = window.setTimeout(() => setMelding(''), 2600);
    return () => window.clearTimeout(t);
  }, [melding]);

  const laadEvents = useCallback(async () => {
    if (!supabase) {
      setFout('Supabase-configuratie ontbreekt.');
      setLoadingEvents(false);
      return;
    }
    setLoadingEvents(true);
    setFout('');
    try {
      const vandaag = new Date().toISOString().slice(0, 10);
      const over14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('events')
        .select('id,name,date,guests,status')
        .in('status', ['confirmed', 'optie'])
        .gte('date', vandaag)
        .lte('date', over14)
        .order('date', { ascending: true })
        .limit(10);
      if (error) throw new Error(error.message);
      const normalized = (data ?? []).map((row: Record<string, unknown>) => {
        const id = Number(row.id);
        if (!Number.isInteger(id)) return null;
        return { id, name: String(row.name ?? `Event ${id}`), date: String(row.date ?? ''), guests: Number(row.guests ?? 0), status: String(row.status ?? '') };
      }).filter((r): r is UpcomingEvent => r !== null);
      setEvents(normalized);
      setSelectedEventId(prev => {
        if (prev !== null && normalized.some(e => e.id === prev)) return prev;
        return normalized[0]?.id ?? null;
      });
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Events laden mislukt.');
      setEvents([]);
      setSelectedEventId(null);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { void laadEvents(); }, [laadEvents]);

  const laadMepData = useCallback(async (eventId: number) => {
    setLoading(true);
    setFout('');
    try {
      const res = await fetch(`/api/mep/${eventId}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null) as MepResponse | { error?: string } | null;
      if (!res.ok) throw new Error(String(payload && 'error' in payload ? payload.error : 'MEP laden mislukt.'));
      setMepData(payload as MepResponse);
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'MEP laden mislukt.');
      setMepData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEventId === null) { setMepData(null); return; }
    setSelectedItem(null);
    setSheetOpen(false);
    void laadMepData(selectedEventId);
  }, [selectedEventId, laadMepData]);

  // Realtime subscription
  useEffect(() => {
    if (!supabase || selectedEventId === null) return;
    const channel = supabase
      .channel(`mep:${selectedEventId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'mep_items',
        filter: `event_id=eq.${selectedEventId}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const row = payload?.new;
        if (!row) return;
        const itemId = Number(row.id);
        if (!Number.isInteger(itemId)) return;
        setMepData(prev => patchMepData(prev, itemId, patchFromRow(row)));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedEventId]);

  // Sync open sheet item with realtime updates
  useEffect(() => {
    if (!selectedItem || !mepData) return;
    const vernieuwd = findItemById(mepData, selectedItem.mep_item_id);
    if (vernieuwd) setSelectedItem(vernieuwd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mepData]);

  const patchServer = useCallback(async (
    eventId: number,
    itemId: number,
    body: { status: MepStatus; notes?: string | null; completed_by?: string | null }
  ) => {
    const res = await fetch(`/api/mep/${eventId}/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => null) as { item?: Record<string, unknown>; error?: string } | null;
    if (!res.ok) throw new Error(String(payload?.error ?? 'Bijwerken mislukt.'));
    return payload?.item ?? null;
  }, []);

  const handleStatusToggle = useCallback(async (itemId: number, newStatus: MepStatus) => {
    if (selectedEventId === null || !mepData) return;
    const snapshot = mepData;
    setMepData(prev => patchMepData(prev, itemId, { status: newStatus }));
    try {
      const updated = await patchServer(selectedEventId, itemId, { status: newStatus });
      if (updated) setMepData(prev => patchMepData(prev, itemId, patchFromRow(updated)));
    } catch (err) {
      setMepData(snapshot);
      setMelding(err instanceof Error ? err.message : 'Status opslaan mislukt.');
      await laadMepData(selectedEventId);
    }
  }, [selectedEventId, mepData, patchServer, laadMepData]);

  const handleSaveNotes = useCallback(async (itemId: number, notes: string) => {
    if (selectedEventId === null || !mepData) return;
    const current = findItemById(mepData, itemId);
    if (!current) return;
    const snapshot = mepData;
    const normalizedNotes = notes.trim() || null;
    setSavingNotes(true);
    setMepData(prev => patchMepData(prev, itemId, { notes: normalizedNotes }));
    try {
      const updated = await patchServer(selectedEventId, itemId, { status: current.status, notes: normalizedNotes });
      if (updated) setMepData(prev => patchMepData(prev, itemId, patchFromRow(updated)));
      setMelding('Notities opgeslagen.');
    } catch (err) {
      setMepData(snapshot);
      setMelding(err instanceof Error ? err.message : 'Notities opslaan mislukt.');
      await laadMepData(selectedEventId);
    } finally {
      setSavingNotes(false);
    }
  }, [selectedEventId, mepData, patchServer, laadMepData]);

  const handleReset = useCallback(async () => {
    if (selectedEventId === null) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/mep/${selectedEventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      const payload = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) throw new Error(String(payload?.error ?? 'Reset mislukt.'));
      await laadMepData(selectedEventId);
      setMelding('Alle MEP-items staan weer op te doen.');
    } catch (err) {
      setMelding(err instanceof Error ? err.message : 'Reset mislukt.');
    } finally {
      setResetting(false);
    }
  }, [selectedEventId, laadMepData]);

  const alleItems = useMemo(
    () => mepData?.gerechten.flatMap(g => g.components) ?? [],
    [mepData]
  );

  const progress = useMemo(() => ({
    done: alleItems.filter(i => i.status === 'klaar').length,
    total: alleItems.length,
  }), [alleItems]);

  const zichtbareGerechten = useMemo(
    () => (mepData?.gerechten ?? []).filter(g => g.components.length > 0),
    [mepData]
  );

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {melding ? (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 px-3">
          <div className="mx-auto max-w-xl rounded-lg bg-gray-800 px-4 py-3 text-center text-sm shadow-lg">
            {melding}
          </div>
        </div>
      ) : null}

      <MepTopBar
        events={events}
        selectedEventId={selectedEventId}
        onEventChange={setSelectedEventId}
        progress={progress}
        onReset={handleReset}
        resetting={resetting}
      />

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {fout ? (
          <div className="rounded-xl border border-red-700 bg-red-950 px-4 py-3 text-sm text-red-200">{fout}</div>
        ) : null}

        {loadingEvents ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-300">
            Aankomende events laden...
          </div>
        ) : null}

        {!loadingEvents && events.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-300">
            Geen aankomende events in de komende 14 dagen
          </div>
        ) : null}

        {!loadingEvents && events.length > 0 && loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-800" />)}
          </div>
        ) : null}

        {!loadingEvents && events.length > 0 && !loading && mepData && zichtbareGerechten.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-center text-gray-300">
            Geen menu gepland voor dit event — voeg gerechten toe via de offerteflow
          </div>
        ) : null}

        {!loadingEvents && events.length > 0 && !loading &&
          zichtbareGerechten.map(gerecht => (
            <MepGerechtGroep
              key={gerecht.id}
              gerecht={gerecht}
              guests={mepData?.event.guests ?? 0}
              onItemTap={item => { setSelectedItem(item); setSheetOpen(true); }}
              onStatusToggle={handleStatusToggle}
            />
          ))
        }
      </div>

      <MepItemSheet
        open={sheetOpen}
        item={selectedItem}
        guests={mepData?.event.guests ?? 0}
        onClose={() => setSheetOpen(false)}
        onStatusChange={handleStatusToggle}
        onSaveNotes={handleSaveNotes}
        savingNotes={savingNotes}
      />
    </div>
  );
}
