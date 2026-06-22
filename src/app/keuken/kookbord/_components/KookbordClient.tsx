'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Flame, Calendar, Check, ChefHat } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import MepGerechtGroep from './MepGerechtGroep';
import MepItemSheet from './MepItemSheet';
import MepTopBar from './MepTopBar';
import { MEP_CSS } from './mep-ui';

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
  id: string;
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

const bannerFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
function fmtDate(d: string): string {
  const dt = d ? new Date(`${d}T00:00:00`) : null;
  return dt && !Number.isNaN(dt.getTime()) ? bannerFmt.format(dt) : '';
}

export default function KookbordClient() {
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [mepData, setMepData] = useState<MepResponse | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MepComponentItem | null>(null);
  const [selectedGerechtNaam, setSelectedGerechtNaam] = useState('');
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

  const guests = mepData?.event.guests ?? 0;
  const showSkeleton = loadingEvents || loading;
  const showEmptyEvents = !loadingEvents && !loading && events.length === 0;
  const showEmptyMenu = !loadingEvents && !loading && events.length > 0 && !!mepData && zichtbareGerechten.length === 0;
  const showBoard = !loadingEvents && !loading && zichtbareGerechten.length > 0;
  const allesKlaar = progress.total > 0 && progress.done === progress.total;

  const openItem = (item: MepComponentItem, gerechtNaam: string) => {
    setSelectedItem(item);
    setSelectedGerechtNaam(gerechtNaam);
    setSheetOpen(true);
  };

  return (
    <div style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column', background: 'radial-gradient(150% 120% at 50% -20%, #161518 0%, #0d0d0f 55%, #0a0a0c 100%)', fontFamily: "'DM Sans',sans-serif", color: '#f8f8f8', overflow: 'hidden', position: 'relative' }}>
      <style>{MEP_CSS}</style>

      {melding ? (
        <div style={{ position: 'fixed', left: 0, right: 0, top: 14, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none', padding: '0 16px' }}>
          <div style={{ background: 'rgba(16,16,18,.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(130,130,130,.2)', borderRadius: 12, padding: '10px 18px', fontSize: 13, color: '#e6e6e6', boxShadow: '0 10px 34px rgba(0,0,0,.5)' }}>{melding}</div>
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

      <main className="mep-sc" style={{ flex: 1, overflowY: 'auto', padding: '26px 24px 96px' }}>
        <div style={{ maxWidth: 1380, margin: '0 auto' }}>
          {fout ? (
            <div style={{ marginBottom: 18, borderRadius: 12, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.08)', padding: '14px 18px', fontSize: 13.5, color: '#f1b0b0' }}>{fout}</div>
          ) : null}

          {showSkeleton ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 180, height: 20, borderRadius: 6, background: 'linear-gradient(90deg,rgba(40,40,46,.5) 25%,rgba(64,64,72,.65) 37%,rgba(40,40,46,.5) 63%)', backgroundSize: '800px 100%', animation: 'mepShimmer 1.25s linear infinite' }} />
                <div style={{ flex: 1, height: 1, background: 'rgba(130,130,130,.1)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16, marginBottom: 34 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 214, borderRadius: 14, background: 'linear-gradient(90deg,rgba(34,34,40,.5) 25%,rgba(52,52,60,.6) 37%,rgba(34,34,40,.5) 63%)', backgroundSize: '900px 100%', animation: 'mepShimmer 1.3s linear infinite', border: '1px solid rgba(130,130,130,.1)' }} />)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 140, height: 20, borderRadius: 6, background: 'linear-gradient(90deg,rgba(40,40,46,.5) 25%,rgba(64,64,72,.65) 37%,rgba(40,40,46,.5) 63%)', backgroundSize: '800px 100%', animation: 'mepShimmer 1.25s linear infinite' }} />
                <div style={{ flex: 1, height: 1, background: 'rgba(130,130,130,.1)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 214, borderRadius: 14, background: 'linear-gradient(90deg,rgba(34,34,40,.5) 25%,rgba(52,52,60,.6) 37%,rgba(34,34,40,.5) 63%)', backgroundSize: '900px 100%', animation: 'mepShimmer 1.3s linear infinite', border: '1px solid rgba(130,130,130,.1)' }} />)}
              </div>
            </div>
          ) : null}

          {showEmptyEvents ? (
            <div style={{ minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, animation: 'mepRise .35s ease' }}>
              <div style={{ width: 96, height: 96, borderRadius: 24, background: 'radial-gradient(120% 120% at 50% 25%, rgba(196,163,90,.14), rgba(28,28,32,.6))', border: '1px solid rgba(196,163,90,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, boxShadow: '0 12px 40px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.04)' }}>
                <Flame size={38} color="rgba(216,184,99,.7)" strokeWidth={1.6} />
              </div>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 300, fontSize: 26, letterSpacing: '-.01em', margin: '0 0 10px', color: '#f3f3f3' }}>Geen aankomend event</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#949494', maxWidth: 400, margin: '0 0 22px' }}>Zodra een offerte bevestigd is, verschijnt hier automatisch je mise-en-place — opgesplitst per gerecht en per component.</p>
              <Link href="/agenda" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 11, background: 'rgba(130,130,130,.08)', border: '1px solid rgba(130,130,130,.2)', color: '#cfcfcf', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                <Calendar size={16} color="#cfcfcf" strokeWidth={2} /><span>Bekijk de agenda</span>
              </Link>
            </div>
          ) : null}

          {showEmptyMenu ? (
            <div style={{ minHeight: '62vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, animation: 'mepRise .35s ease' }}>
              <div style={{ width: 96, height: 96, borderRadius: 24, background: 'radial-gradient(120% 120% at 50% 25%, rgba(196,163,90,.14), rgba(28,28,32,.6))', border: '1px solid rgba(196,163,90,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22, boxShadow: '0 12px 40px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.04)' }}>
                <ChefHat size={38} color="rgba(216,184,99,.7)" strokeWidth={1.6} />
              </div>
              <h2 style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 300, fontSize: 26, letterSpacing: '-.01em', margin: '0 0 10px', color: '#f3f3f3' }}>Nog geen componenten</h2>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#949494', maxWidth: 420, margin: '0 0 22px' }}>De gerechten van dit event hebben nog geen onderdelen. Koppel componenten aan een gerecht, dan verschijnen ze hier als MEP-kaarten.</p>
              <Link href="/gerechten" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 11, background: 'rgba(130,130,130,.08)', border: '1px solid rgba(130,130,130,.2)', color: '#cfcfcf', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                <ChefHat size={16} color="#cfcfcf" strokeWidth={2} /><span>Naar gerechten</span>
              </Link>
            </div>
          ) : null}

          {showBoard ? (
            <div>
              {allesKlaar ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', marginBottom: 26, borderRadius: 15, background: 'linear-gradient(180deg,rgba(34,197,94,.12),rgba(26,26,30,.7))', border: '1px solid rgba(34,197,94,.3)', boxShadow: '0 10px 34px rgba(34,197,94,.1),inset 0 1px 0 rgba(255,255,255,.04)', animation: 'mepRise .4s ease' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(34,197,94,.16)', border: '1px solid rgba(34,197,94,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
                    <Check size={24} color="#74e29a" strokeWidth={2.6} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 500, fontSize: 19, letterSpacing: '-.01em', color: '#f3f3f3' }}>Alles MEP klaar</span>
                    <span style={{ fontSize: 13.5, color: '#9fb8a6' }}>{progress.done} van de {progress.total} componenten gereed — klaar voor uitgifte, van het vuur.</span>
                  </div>
                  <span style={{ flex: 1 }} />
                  {mepData ? <span style={{ fontSize: 13, color: '#8b8b8f', fontWeight: 500, letterSpacing: '.02em' }}>{mepData.event.name} · {fmtDate(mepData.event.date)} · {mepData.event.guests} pers</span> : null}
                </div>
              ) : null}

              {zichtbareGerechten.map(gerecht => (
                <MepGerechtGroep
                  key={gerecht.id}
                  gerecht={gerecht}
                  guests={guests}
                  onItemTap={openItem}
                  onStatusToggle={handleStatusToggle}
                />
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <MepItemSheet
        open={sheetOpen}
        item={selectedItem}
        guests={guests}
        gerecht={selectedGerechtNaam}
        onClose={() => setSheetOpen(false)}
        onStatusChange={handleStatusToggle}
        onSaveNotes={handleSaveNotes}
        savingNotes={savingNotes}
      />
    </div>
  );
}
