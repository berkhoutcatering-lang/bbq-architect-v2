'use client';

import React from 'react';
import { Sunrise, PartyPopper } from 'lucide-react';

interface Props {
  greeting: string;
  brandName: string;
  currentTime: Date;
  daysToNextEvent: number | null;
}

const DAY_NAMES_NL = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
const MONTHS_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function weekNumber(d: Date): number {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * 86400000));
}

export default function GreetingStrip({ greeting, brandName, currentTime, daysToNextEvent }: Props): React.ReactElement {
  const time = currentTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const day = DAY_NAMES_NL[currentTime.getDay()];
  const dateLabel = `${currentTime.getDate()} ${MONTHS_NL[currentTime.getMonth()]}`;
  const week = weekNumber(currentTime);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        marginBottom: 18,
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            fontSize: 10,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          <Sunrise size={12} color="var(--brand)" />
          <span>{time} · {day} {dateLabel} · Week {week}</span>
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 200,
            fontSize: 32,
            letterSpacing: '-.02em',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {greeting},{' '}
          <span
            style={{
              fontWeight: 500,
              background: 'linear-gradient(90deg, var(--brand) 0%, #c4a35a 60%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              whiteSpace: 'nowrap',
            }}
          >
            {brandName}
          </span>
        </h1>
      </div>
      {daysToNextEvent !== null ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--muted)',
            fontSize: 12,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <PartyPopper size={13} />
          <span>
            volgend event over <strong style={{ color: 'var(--text)' }}>{daysToNextEvent} {daysToNextEvent === 1 ? 'dag' : 'dagen'}</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}
