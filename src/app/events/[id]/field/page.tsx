'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import OfflineEventToggle from '@/components/dashboard/OfflineEventToggle';
import {
  ArrowLeft, MapPin, Clock, Play, Square, Check,
  Truck, Users, Phone, Thermometer,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useAuth } from '@/lib/AuthContext';

/**
 * SF-4 — Event-day field view (mobile-first)
 * Telefoon-context: 1 hand, vluchtige aandacht. Alle targets ≥ 56px.
 *
 * Toont per event:
 * - Naam, datum, locatie, gasten
 * - Maps-link (1-tap)
 * - Bel-klant-knop (1-tap)
 * - Mijn uren (start/stop in 2 taps)
 * - Materieel-checklist (uit pack_lists)
 * - Snel naar HACCP veldmodus
 */

type Event = {
  id: number;
  name: string;
  date: string;
  guests: number | null;
  location: string | null;
  client_naam: string | null;
  client_tel: string | null;
  status: string | null;
};

type ActiveLog = {
  id: number;
  start_time: string;
};

type PackItem = {
  id: number;
  naam: string;
  aantal: number | null;
  status: string | null;
};

export default function EventFieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { orgId } = useOrg();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ActiveLog | null>(null);
  const [now, setNow] = useState(Date.now());
  const [packItems, setPackItems] = useState<PackItem[]>([]);
  const [busy, setBusy] = useState(false);

  // Load event + active timer + packlist
  useEffect(function () {
    if (!supabase || !orgId) return;
    let cancelled = false;
    (async function () {
      const evRes = await supabase.from('events').select('id,name,date,guests,location,client_naam,client_tel,status').eq('id', id).maybeSingle();
      if (!cancelled && evRes.data) setEvent(evRes.data);

      if (user?.id) {
        const logRes = await supabase
          .from('time_logs')
          .select('id,start_time')
          .eq('organization_id', orgId)
          .eq('user_id', user.id)
          .eq('status', 'actief')
          .order('start_time', { ascending: false })
          .limit(1);
        if (!cancelled && logRes.data?.[0]) setActive(logRes.data[0]);
      }

      const packRes = await supabase
        .from('pack_lists')
        .select('id,naam,aantal,status')
        .eq('event_id', id)
        .eq('organization_id', orgId)
        .order('id');
      if (!cancelled && packRes.data) setPackItems(packRes.data);

      if (!cancelled) setLoading(false);
    })();
    return function () { cancelled = true; };
  }, [id, orgId, user?.id]);

  // Tick voor live duration
  useEffect(function () {
    if (!active) return;
    const t = setInterval(function () { setNow(Date.now()); }, 1000);
    return function () { clearInterval(t); };
  }, [active]);

  function formatDuration(start: string): string {
    const ms = now - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}u ${m.toString().padStart(2, '0')}m`;
  }

  async function startTimer() {
    if (!supabase || !orgId || !user?.id) return;
    setBusy(true);
    const startTime = new Date().toISOString();
    const { data, error } = await supabase
      .from('time_logs')
      .insert({
        organization_id: orgId,
        user_id: user.id,
        start_time: startTime,
        status: 'actief',
        locatie: event?.location || null,
        notitie: event ? `Event: ${event.name}` : null,
      })
      .select('id,start_time')
      .single();
    setBusy(false);
    if (!error && data) setActive(data);
    else if (error) alert('Start-timer mislukt: ' + error.message);
  }

  async function stopTimer() {
    if (!supabase || !active) return;
    setBusy(true);
    const { error } = await supabase
      .from('time_logs')
      .update({ end_time: new Date().toISOString(), status: 'afgerond' })
      .eq('id', active.id);
    setBusy(false);
    if (!error) setActive(null);
    else alert('Stop-timer mislukt: ' + error.message);
  }

  async function togglePackItem(item: PackItem) {
    if (!supabase) return;
    const next = item.status === 'klaar' ? 'open' : 'klaar';
    const { error } = await supabase.from('pack_lists').update({ status: next }).eq('id', item.id);
    if (!error) {
      setPackItems(prev => prev.map(p => p.id === item.id ? { ...p, status: next } : p));
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">Event laden...</div>;
  }
  if (!event) {
    return (
      <div className="min-h-screen p-6">
        <Link href="/events" className="text-[var(--color-accent-gold)] no-underline">← Naar events</Link>
        <p className="mt-4 text-[var(--text)]">Event niet gevonden.</p>
      </div>
    );
  }

  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--color-bg-primary)]/95 backdrop-blur-xl border-b border-[var(--card-solid)]">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link
            href={`/events/${id}`}
            className="flex items-center justify-center rounded-lg bg-[var(--color-bg-deep)]"
            style={{ minWidth: 44, minHeight: 44 }}
            aria-label="Terug naar event-detail"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold truncate">{event.name}</div>
            <div className="text-[11px] text-[var(--muted)]">Veldmodus • {event.date}</div>
          </div>
          <OfflineEventToggle eventId={parseInt(id, 10)} variant="compact" />
        </div>
      </header>

      <main className="max-w-[600px] mx-auto px-4 py-4 space-y-4">
        {/* Event-info-kaart */}
        <section className="rounded-2xl bg-[var(--card)] border border-[var(--card-solid)] p-4">
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mb-1">Gasten</div>
              <div className="text-[20px] font-light tabular-nums">{event.guests ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mb-1">Status</div>
              <div className="text-[14px] font-medium">{event.status ?? '—'}</div>
            </div>
          </div>
          {event.location && (
            <div className="text-[13px] text-white/85 mb-3 flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 text-[var(--color-accent-gold)] shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent-gold)] text-black font-bold no-underline"
                style={{ minHeight: 56 }}
              >
                <Truck className="w-4 h-4" />
                Route
              </a>
            )}
            {event.client_tel && (
              <a
                href={`tel:${event.client_tel}`}
                className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] no-underline"
                style={{ minHeight: 56 }}
              >
                <Phone className="w-4 h-4" />
                Bel klant
              </a>
            )}
          </div>
        </section>

        {/* Timer */}
        <section className="rounded-2xl bg-[var(--card)] border border-[var(--card-solid)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-[var(--color-accent-gold)]" />
            <h2 className="text-[14px] font-bold">Mijn uren</h2>
          </div>
          {active ? (
            <div>
              <div className="text-[36px] font-extralight tabular-nums text-center mb-3">
                {formatDuration(active.start_time)}
              </div>
              <button
                onClick={stopTimer}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500 text-[var(--text)] font-bold disabled:opacity-40"
                style={{ minHeight: 64 }}
              >
                <Square className="w-5 h-5" />
                {busy ? 'Stoppen...' : 'STOP'}
              </button>
              <div className="mt-2 text-[11px] text-center text-[var(--muted)]">Gestart om {new Date(active.start_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          ) : (
            <button
              onClick={startTimer}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-[var(--text)] font-bold disabled:opacity-40"
              style={{ minHeight: 72 }}
            >
              <Play className="w-5 h-5" />
              {busy ? 'Starten...' : 'START TIMER'}
            </button>
          )}
        </section>

        {/* Pack-list */}
        <section className="rounded-2xl bg-[var(--card)] border border-[var(--card-solid)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[var(--color-accent-gold)]" />
            <h2 className="text-[14px] font-bold">Materieel-checklist ({packItems.filter(p => p.status === 'klaar').length}/{packItems.length})</h2>
          </div>
          {packItems.length === 0 ? (
            <div className="text-[12px] text-[var(--muted)] italic">Geen pack-list voor dit event.</div>
          ) : (
            <ul className="space-y-2">
              {packItems.map(item => {
                const done = item.status === 'klaar';
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => togglePackItem(item)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${done ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-[var(--color-bg-deep)] border border-[var(--card-solid)]'}`}
                      style={{ minHeight: 56 }}
                    >
                      <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500 text-black' : 'bg-white/5 border border-white/15'}`}>
                        {done && <Check className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className={`text-[14px] font-medium ${done ? 'text-emerald-300 line-through' : 'text-[var(--text)]'}`}>{item.naam}</div>
                      </div>
                      {item.aantal !== null && (
                        <div className="text-[12px] text-[var(--muted)] tabular-nums">×{item.aantal}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Quick actions */}
        <section className="rounded-2xl bg-[var(--card)] border border-[var(--card-solid)] p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mb-3">Snel naar</div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/haccp/field"
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] no-underline"
              style={{ minHeight: 56 }}
            >
              <Thermometer className="w-4 h-4 text-[var(--color-accent-gold)]" />
              HACCP-veldmodus
            </Link>
            <Link
              href={`/events/${id}/hub`}
              className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)] text-[var(--text)] no-underline"
              style={{ minHeight: 56 }}
            >
              Volledige hub →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
