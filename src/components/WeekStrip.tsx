'use client';
import React, { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import MetallicCard from './MetallicCard';
import { StatusDot } from './StatusBadge';

interface WeekStripEvent {
  id: string | number;
  title?: string;
  name?: string;
  date: string;
  status: string;
  guests?: number;
  client_naam?: string;
}

interface WeekStripProps {
  events: WeekStripEvent[];
  onDayClick?: (date: string) => void;
  onEventClick?: (event: WeekStripEvent) => void;
}

const DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const DAGEN_LANG = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];

function getWeekDays(): { date: string; dayName: string; dayNameLong: string; dayNum: number; isToday: boolean }[] {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    days.push({
      date: iso,
      dayName: DAGEN[d.getDay()],
      dayNameLong: DAGEN_LANG[d.getDay()],
      dayNum: d.getDate(),
      isToday: i === 0,
    });
  }
  return days;
}

export default function WeekStrip({ events, onDayClick, onEventClick }: WeekStripProps) {
  const days = useMemo(() => getWeekDays(), []);

  const eventsByDay = useMemo(() => days.map(day => ({
    ...day,
    events: events.filter(e => e.date === day.date),
  })), [days, events]);

  return (
    <MetallicCard hover={false} className="p-4 md:p-5 mb-6 md:mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          <Calendar size={12} className="mr-2 inline-block align-middle" style={{ color: '#c4a35a' }} />
          Deze week
        </h3>
        <span className="text-[10px] font-medium" style={{ color: 'var(--muted-light)' }}>
          {days[0].dayNum} - {days[6].dayNum} {new Date().toLocaleDateString('nl-NL', { month: 'long' })}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {eventsByDay.map(day => (
          <button
            key={day.date}
            onClick={() => onDayClick?.(day.date)}
            className="flex flex-col items-center rounded-xl py-2 md:py-3 px-1 transition-all duration-200"
            style={{
              background: day.isToday
                ? 'linear-gradient(135deg, rgba(196,163,90,.12), rgba(196,163,90,.04))'
                : day.events.length > 0
                  ? 'rgba(59,130,246,.04)'
                  : 'transparent',
              border: day.isToday
                ? '1px solid rgba(196,163,90,.25)'
                : day.events.length > 0
                  ? '1px solid rgba(59,130,246,.1)'
                  : '1px solid transparent',
              cursor: day.events.length > 0 || onDayClick ? 'pointer' : 'default',
            }}
            onMouseEnter={(e) => {
              if (!day.isToday) e.currentTarget.style.background = 'rgba(255,255,255,.03)';
            }}
            onMouseLeave={(e) => {
              if (!day.isToday) e.currentTarget.style.background = day.events.length > 0 ? 'rgba(59,130,246,.04)' : 'transparent';
            }}
          >
            {/* Day name */}
            <span
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: day.isToday ? '#c4a35a' : 'var(--muted)' }}
            >
              {day.dayName}
            </span>

            {/* Day number */}
            <span
              className="text-lg md:text-xl font-light mb-1.5"
              style={{
                color: day.isToday ? '#c4a35a' : day.events.length > 0 ? 'var(--text)' : 'var(--muted-light)',
              }}
            >
              {day.dayNum}
            </span>

            {/* Event indicators */}
            {day.events.length > 0 ? (
              <div className="flex flex-col items-center gap-1">
                {day.events.slice(0, 2).map(ev => (
                  <div
                    key={ev.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                    className="flex items-center gap-1 cursor-pointer"
                    title={`${ev.title || ev.name || ev.client_naam} — ${ev.guests || '?'} gasten`}
                  >
                    <StatusDot status={ev.status} />
                    <span className="text-[9px] font-medium truncate max-w-[50px] hidden md:inline" style={{ color: 'var(--muted)' }}>
                      {(ev.title || ev.name || ev.client_naam || '').slice(0, 8)}
                    </span>
                  </div>
                ))}
                {day.events.length > 2 && (
                  <span className="text-[9px] font-bold" style={{ color: 'var(--muted)' }}>
                    +{day.events.length - 2}
                  </span>
                )}
              </div>
            ) : (
              <div className="h-4" /> /* spacer to keep alignment */
            )}
          </button>
        ))}
      </div>
    </MetallicCard>
  );
}
