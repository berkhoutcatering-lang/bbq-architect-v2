'use client';

import Link from 'next/link';
import { ArrowRight, Calendar, MapPin, Users, ChefHat, Bell, ShieldCheck, Plus } from 'lucide-react';

interface EventData {
  id: string | number;
  name?: string;
  title?: string;
  date: string;
  guests?: number;
  type?: string;
  location?: string;
  status?: string;
  client_naam?: string;
}

const NL_DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const NL_MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function formatDate(iso: string): { label: string; isToday: boolean; isTomorrow: boolean; isThisWeek: boolean } {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let label: string;
  if (diffDays === 0) label = 'Vandaag';
  else if (diffDays === 1) label = 'Morgen';
  else if (diffDays >= 2 && diffDays <= 6) label = `${NL_DAYS[d.getDay()]} (${diffDays} dagen)`;
  else label = `${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;

  return {
    label,
    isToday: diffDays === 0,
    isTomorrow: diffDays === 1,
    isThisWeek: diffDays >= 0 && diffDays <= 6,
  };
}

interface Props {
  event: EventData | null;
  onNewEvent?: () => void;
}

export default function ActiveEventCard({ event, onNewEvent }: Props) {
  /* Geen aankomend event: empty-state met grote CTA. */
  if (!event) {
    return (
      <div
        style={{
          padding: 28,
          borderRadius: 'var(--radius-xl)',
          border: '1px dashed var(--border)',
          background: 'color-mix(in srgb, var(--brand) 4%, var(--card))',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          minHeight: 180,
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--brand-tint)',
            color: 'var(--brand)',
          }}
        >
          <Calendar size={22} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Nog geen event gepland</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Plan je eerste event om hier overzicht te krijgen.
          </div>
        </div>
        {onNewEvent ? (
          <button onClick={onNewEvent} className="btn btn-brand">
            <Plus size={14} /> Nieuw event
          </button>
        ) : (
          <Link
            href="/events"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--brand)',
              color: '#000',
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            <Plus size={14} /> Bekijk events
          </Link>
        )}
      </div>
    );
  }

  const dateInfo = formatDate(event.date);
  const eventTitle = event.name || event.title || 'Event zonder titel';
  const isUrgent = dateInfo.isToday;

  return (
    <div
      style={{
        position: 'relative',
        padding: '28px 32px',
        borderRadius: 'var(--radius-2xl)',
        border: `1px solid ${isUrgent ? 'var(--brand-tint-border)' : 'var(--border)'}`,
        background: isUrgent
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 14%, var(--card)) 0%, var(--card) 60%)'
          : 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 4%, var(--card)) 0%, var(--card) 70%)',
        overflow: 'hidden',
        minHeight: 200,
      }}
    >
      {isUrgent && (
        <div
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--brand)',
            color: '#000',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.18em',
          }}
        >
          NU
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: isUrgent ? 'var(--brand)' : 'var(--muted)',
          }}
        >
          {dateInfo.label}
        </span>
        {event.status && event.status !== 'pending' && (
          <span
            style={{
              fontSize: 10,
              padding: '3px 9px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}
          >
            {event.status}
          </span>
        )}
      </div>

      <h2
        style={{
          fontSize: 30,
          fontWeight: 700,
          marginBottom: 12,
          lineHeight: 1.15,
          letterSpacing: '-.01em',
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        {eventTitle}
      </h2>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 18,
          marginBottom: 22,
          fontSize: 13.5,
          color: 'var(--muted)',
        }}
      >
        {event.guests ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Users size={14} /> {event.guests} gasten
          </span>
        ) : null}
        {event.location ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} /> {event.location}
          </span>
        ) : null}
        {event.type ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} /> {event.type}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <Link href={`/events/${event.id}/hub`} className="btn btn-brand" style={btnHeroPad}>
          Open event <ArrowRight size={14} />
        </Link>
        <Link href={`/events/${event.id}/hub`} className="btn btn-ghost" style={btnHeroPad}>
          <ChefHat size={14} /> Menu
        </Link>
        <Link href="/prep-counter" className="btn btn-ghost" style={btnHeroPad}>
          <Calendar size={14} /> Prep
        </Link>
        <Link href={`/events/${event.id}/field`} className="btn btn-ghost" style={btnHeroPad}>
          <Bell size={14} /> Service
        </Link>
        <Link href="/haccp" className="btn btn-ghost" style={btnHeroPad}>
          <ShieldCheck size={14} /> HACCP
        </Link>
      </div>
    </div>
  );
}

/* Hero-knoppen: bestaande btn-classes (brand/ghost) + iets ruimere padding voor de Vandaag-card. */
const btnHeroPad: React.CSSProperties = {
  padding: '11px 16px',
  fontSize: 13.5,
  textDecoration: 'none',
};
