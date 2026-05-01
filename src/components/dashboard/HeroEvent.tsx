'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, MapPin, Users, Plus } from 'lucide-react';
import ProgressRing from '@/components/charts/ProgressRing';

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
  ppp?: number;
}

export interface HeroCompletion {
  gangen: boolean;
  allergies: boolean;
  prep: boolean;
  confirmed: boolean;
}

const NL_DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
];

function formatHeroDate(iso: string): { line1: string; line2: string; isToday: boolean; daysAway: number } {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let line1: string;
  if (diffDays === 0) line1 = 'Vandaag';
  else if (diffDays === 1) line1 = 'Morgen';
  else if (diffDays < 7) line1 = NL_DAYS[d.getDay()];
  else line1 = `${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;

  const line2 = `${NL_DAYS[d.getDay()]} ${d.getDate()} ${NL_MONTHS[d.getMonth()]}`;

  return { line1, line2, isToday: diffDays === 0, daysAway: diffDays };
}

interface Props {
  event: EventData | null;
  completion?: HeroCompletion;
  revenue?: number;
  onNewEvent?: () => void;
}

export default function HeroEvent({ event, completion, revenue, onNewEvent }: Props) {
  if (!event) {
    return (
      <div
        style={{
          padding: 'var(--space-8)',
          borderRadius: 'var(--radius-2xl)',
          border: '1px dashed var(--border)',
          background: 'color-mix(in srgb, var(--brand) 4%, var(--card))',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 220,
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--brand-tint)',
            color: 'var(--brand)',
          }}
        >
          <Calendar size={22} />
        </div>
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 4,
              fontFamily: 'var(--font-artisan)',
              letterSpacing: '-.01em',
            }}
          >
            Nog geen event ingepland
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Plan je eerste event om hier overzicht te krijgen.
          </div>
        </div>
        {onNewEvent ? (
          <button onClick={onNewEvent} className="btn btn-brand">
            <Plus size={14} /> Plan event
          </button>
        ) : (
          <Link href="/events" className="btn btn-brand">
            <Plus size={14} /> Plan event
          </Link>
        )}
      </div>
    );
  }

  const dateInfo = formatHeroDate(event.date);
  const eventTitle = event.name || event.title || 'Event zonder titel';
  const isUrgent = dateInfo.isToday;

  /* Voltooiing als één getal voor de ring. Vier sub-checks tellen even zwaar.
     Geen completion-prop = ring toont 0% (neutrale state). */
  const checks: Array<[string, boolean]> = completion
    ? [
        ['Gangen', completion.gangen],
        ['Allergieën', completion.allergies],
        ['Prep', completion.prep],
        ['Bevestigd', completion.confirmed],
      ]
    : [];
  const doneCount = checks.filter(([, v]) => v).length;
  const completionPct = checks.length > 0 ? Math.round((doneCount / checks.length) * 100) : 0;

  return (
    <div
      style={{
        position: 'relative',
        padding: 'var(--space-8)',
        borderRadius: 'var(--radius-2xl)',
        border: `1px solid ${isUrgent ? 'var(--brand-tint-border)' : 'var(--border)'}`,
        background: isUrgent
          ? 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 14%, var(--card)) 0%, var(--card) 60%)'
          : 'linear-gradient(135deg, color-mix(in srgb, var(--brand) 4%, var(--card)) 0%, var(--card) 70%)',
        overflow: 'hidden',
        minHeight: 240,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 24,
        alignItems: 'center',
      }}
    >
      {/* LINKS: tekst */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            color: isUrgent ? 'var(--brand)' : 'var(--muted)',
            marginBottom: 8,
          }}
        >
          {dateInfo.line1}
          {!dateInfo.isToday && dateInfo.daysAway < 14 ? ` · over ${dateInfo.daysAway} dagen` : ''}
        </div>

        <h2
          style={{
            fontSize: 34,
            fontWeight: 700,
            marginBottom: 6,
            lineHeight: 1.1,
            letterSpacing: '-.015em',
            fontFamily: 'var(--font-artisan)',
            color: 'var(--text)',
          }}
        >
          {eventTitle}
        </h2>

        <div
          style={{
            fontSize: 12,
            color: 'var(--muted)',
            marginBottom: 18,
            letterSpacing: '.02em',
          }}
        >
          {dateInfo.line2}
          {event.client_naam ? ` · ${event.client_naam}` : ''}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginBottom: 22,
            fontSize: 13,
            color: 'var(--muted-light)',
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
          {revenue && revenue > 0 ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              €{revenue.toLocaleString('nl-NL')}
            </span>
          ) : null}
        </div>

        <Link
          href={`/events/${event.id}/hub`}
          className="btn btn-brand"
          style={{ padding: '11px 16px', fontSize: 13.5, textDecoration: 'none' }}
        >
          Open event <ArrowRight size={14} />
        </Link>
      </div>

      {/* RECHTS: voortgangs-ring + checks */}
      {checks.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            paddingRight: 8,
          }}
        >
          <ProgressRing
            value={completionPct}
            size={108}
            stroke={9}
            color={isUrgent ? 'var(--brand)' : 'var(--green)'}
            sublabel="gereed"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, auto)',
              gap: '4px 14px',
              fontSize: 11,
              color: 'var(--muted)',
            }}
          >
            {checks.map(([label, done]) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: done ? 'var(--green)' : 'var(--border-strong)',
                    display: 'inline-block',
                  }}
                  aria-hidden="true"
                />
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
