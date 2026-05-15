'use client';

import React from 'react';
import { CalendarClock, Calendar, MapPin, Check, ArrowRight } from 'lucide-react';
import { deriveFaseProgress } from './prep-fases';

const MONTHS_NL_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DAY_NAMES_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

export interface EventHeroEvent {
  id: number | string;
  name: string;
  date: string;
  daysAway: number;
  guests: number;
  revenue: number;
  location?: string | null;
  status?: string | null;
  type?: string | null;
}

interface Props {
  event: EventHeroEvent | null;
  onOpen?: (event: EventHeroEvent) => void;
  onNewEvent?: () => void;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAY_NAMES_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_NL_SHORT[d.getMonth()]}`;
}

export default function EventHero({ event, onOpen, onNewEvent }: Props): React.ReactElement {
  if (!event) {
    return (
      <div
        style={{
          background: 'var(--card-solid)',
          border: '1px dashed var(--border)',
          borderRadius: 18,
          padding: '28px 30px',
          marginBottom: 18,
          textAlign: 'center',
          color: 'var(--muted)',
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 12 }}>Nog geen event gepland.</div>
        <button onClick={onNewEvent} className="btn btn-brand">
          Plan eerste event
        </button>
      </div>
    );
  }

  const fases = deriveFaseProgress(event.daysAway);
  const totalSteps = fases.length;
  const doneCount = fases.filter((f) => f.done).length;
  const progress = doneCount / totalSteps;

  // Days countdown ring — assume 90d horizon for ring fill, kromt de ring zichtbaar terug
  const totalHorizon = 90;
  const daysElapsed = Math.max(0, totalHorizon - event.daysAway);
  const ringProgress = Math.min(1, daysElapsed / totalHorizon);
  const ringSize = 168;
  const ringStroke = 8;
  const ringRadius = (ringSize - ringStroke) / 2;
  const ringCircum = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircum * (1 - ringProgress);

  const ppGuest = event.guests > 0 ? Math.round(event.revenue / event.guests) : 0;

  return (
    <div
      onClick={() => onOpen?.(event)}
      className="event-hero"
      style={{
        background:
          'linear-gradient(135deg, rgba(255,191,0,.04), rgba(196,163,90,.015) 50%), var(--card-solid)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '28px 30px',
        marginBottom: 18,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(196,163,90,.4), transparent)',
        }}
      />

      {/* Top label row */}
      <div
        className="event-hero-label"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 18,
          fontSize: 10,
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          fontWeight: 700,
          color: 'var(--muted)',
        }}
      >
        <CalendarClock size={12} color="var(--brand)" />
        <span style={{ color: 'var(--brand)' }}>VOLGEND EVENT</span>
        {event.status ? (
          <>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--muted-light)', flexShrink: 0 }} />
            <span>{event.status}</span>
          </>
        ) : null}
        {event.type ? (
          <>
            <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--muted-light)', flexShrink: 0 }} />
            <span>{event.type}</span>
          </>
        ) : null}
        <span
          className="event-hero-label__cta"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--muted)',
            textTransform: 'none',
            letterSpacing: '0',
            fontWeight: 500,
          }}
        >
          Open detail <ArrowRight size={11} />
        </span>
      </div>

      <div
        className="event-hero-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '188px 1fr 1fr',
          gap: 28,
          alignItems: 'start',
        }}
      >
        {/* — Col 1: Countdown ring — */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="event-hero-ring" style={{ position: 'relative', width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="rgba(255,255,255,.04)"
                strokeWidth={ringStroke}
              />
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={ringRadius}
                fill="none"
                stroke="url(#hero-ring-grad)"
                strokeWidth={ringStroke}
                strokeLinecap="round"
                strokeDasharray={ringCircum}
                strokeDashoffset={ringOffset}
                style={{ transition: 'stroke-dashoffset .8s' }}
              />
              <defs>
                <linearGradient id="hero-ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#c4a35a" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                className="event-hero-ring__big"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 56,
                  fontWeight: 200,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text)',
                  letterSpacing: '-.02em',
                }}
              >
                {event.daysAway}
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: '.2em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  marginTop: 4,
                }}
              >
                {event.daysAway === 1 ? 'dag' : 'dagen'}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            <Calendar size={11} />
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatDateLabel(event.date)}</span>
          </div>
        </div>

        {/* — Col 2: Event info — */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '.15em',
              textTransform: 'uppercase',
              fontWeight: 700,
              color: 'var(--muted)',
              marginBottom: 6,
            }}
          >
            {(event.type || 'Catering').toUpperCase()}
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 300,
              fontSize: 32,
              letterSpacing: '-.015em',
              margin: '0 0 14px',
              lineHeight: 1.05,
            }}
          >
            {event.name}
          </h2>

          <div style={{ display: 'flex', gap: 22, marginBottom: 16, flexWrap: 'wrap' }}>
            <Stat label="aantal" value={`${event.guests}`} unit="gasten" />
            <Divider />
            <Stat label="omzet" value={`€ ${Math.round(event.revenue).toLocaleString('nl-NL')}`} color="#86efac" />
            <Divider />
            <Stat label="per gast" value={`€ ${ppGuest}`} unit="p.p." />
          </div>

          {event.location ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 12,
                color: 'var(--muted)',
              }}
            >
              <MapPin size={13} color="var(--muted)" />
              <span>{event.location}</span>
            </div>
          ) : null}
        </div>

        {/* — Col 3: Prep checklist — */}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: '.15em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--muted)',
              }}
            >
              VOORBEREIDING
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 11,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--text)',
                fontWeight: 600,
              }}
            >
              {doneCount} <span style={{ color: 'var(--muted)' }}>/ {totalSteps}</span>
            </div>
          </div>

          <div
            style={{
              height: 4,
              background: 'rgba(255,255,255,.04)',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, var(--brand), #c4a35a)',
                borderRadius: 2,
                transition: 'width .4s',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fases.map((step, i) => {
              const isPast = step.done;
              const isCurrent = !step.done && fases.slice(0, i).every((s) => s.done);
              return (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    minHeight: 44,
                    background: isCurrent ? 'rgba(255,191,0,.06)' : 'transparent',
                    border: '1px solid ' + (isCurrent ? 'rgba(255,191,0,.25)' : 'transparent'),
                    borderRadius: 8,
                    transition: 'background .15s',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: isPast
                        ? '#86efac'
                        : isCurrent
                          ? 'rgba(255,191,0,.15)'
                          : 'rgba(255,255,255,.03)',
                      border:
                        '1px solid ' +
                        (isPast ? '#86efac' : isCurrent ? 'var(--brand)' : 'var(--border)'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isPast && <Check size={13} color="#0a0a0c" />}
                    {isCurrent && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: 'var(--brand)',
                          boxShadow: '0 0 8px var(--brand)',
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      color: isPast ? 'var(--muted)' : 'var(--text)',
                      fontWeight: isCurrent ? 600 : 500,
                      textDecoration: isPast ? 'line-through' : 'none',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted-light)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                      fontWeight: 600,
                    }}
                  >
                    {step.daysOffset === 0 ? 'D-day' : `D-${step.daysOffset}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .event-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 400,
            fontVariantNumeric: 'tabular-nums',
            color: color || 'var(--text)',
          }}
        >
          {value}
        </span>
        {unit ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{unit}</span> : null}
      </div>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '.2em',
          textTransform: 'uppercase',
          color: 'var(--muted-light)',
          fontWeight: 700,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, background: 'var(--border)' }} />;
}
