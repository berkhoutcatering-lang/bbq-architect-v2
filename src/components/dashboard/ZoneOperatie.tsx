'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import HorizontalTimeline from '@/components/charts/HorizontalTimeline';
import type { TimelineEvent } from '@/components/charts/HorizontalTimeline';
import HeatmapRow from '@/components/charts/HeatmapRow';
import type { HeatmapCell } from '@/components/charts/HeatmapRow';
import ProgressRing from '@/components/charts/ProgressRing';
import DotStreak from '@/components/charts/DotStreak';
import type { DotStreakDay } from '@/components/charts/DotStreak';

export interface OperatieData {
  events: TimelineEvent[];
  inventory: HeatmapCell[];
  prep: { eventName: string; pct: number; href?: string }[];
  haccp: { days: DotStreakDay[]; status: 'ok' | 'warn' | 'danger' };
}

interface Props {
  data: OperatieData;
  onEventClick?: (e: TimelineEvent) => void;
}

export default function ZoneOperatie({ data, onEventClick }: Props) {
  const haccpColor =
    data.haccp.status === 'danger' ? 'var(--red)' : data.haccp.status === 'warn' ? 'var(--amber)' : 'var(--green)';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
        gridTemplateRows: 'auto auto',
        gap: 24,
      }}
    >
      {/* Timeline links — spans 2 rijen */}
      <Card title="Komende 14 dagen" href="/agenda" gridRow="span 2">
        {data.events.length === 0 ? (
          <Empty text="Nog geen events ingepland." />
        ) : (
          <div style={{ paddingTop: 4, marginTop: 'auto' }}>
            <HorizontalTimeline events={data.events} days={14} height={130} onEventClick={onEventClick} />
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                gap: 18,
                flexWrap: 'wrap',
                fontSize: 11,
                color: 'var(--muted)',
              }}
            >
              <LegendDot label="Bevestigd" color="var(--green)" />
              <LegendDot label="Optie" color="var(--amber)" />
              <LegendDot label="Concept" color="var(--brand)" />
            </div>
          </div>
        )}
      </Card>

      {/* Voorraad-heatmap */}
      <Card title="Voorraad-risico" href="/voorraad">
        {data.inventory.length === 0 ? (
          <Empty text="Geen voorraad geregistreerd." />
        ) : (
          <HeatmapRow cells={data.inventory} />
        )}
      </Card>

      {/* Prep + HACCP gecombineerd in één kaart */}
      <Card title="Prep & HACCP" href="/prep-counter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {data.prep.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <ProgressRing
                value={data.prep[0].pct}
                size={64}
                stroke={6}
                color="var(--brand)"
                sublabel="prep"
              />
              <div style={{ fontSize: 10, color: 'var(--muted)', maxWidth: 90, textAlign: 'center', lineHeight: 1.3 }}>
                {data.prep[0].eventName}
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                color: 'var(--muted)',
                fontSize: 11,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  border: '1px dashed var(--border-strong)',
                }}
              />
              geen prep
            </div>
          )}
          <div
            style={{
              flex: 1,
              borderLeft: '1px solid var(--border)',
              paddingLeft: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
              }}
            >
              HACCP · 7d
            </div>
            <DotStreak days={data.haccp.days} size={12} />
            <div style={{ fontSize: 11, color: haccpColor, marginTop: 4 }}>
              {data.haccp.status === 'ok' && 'alles ok'}
              {data.haccp.status === 'warn' && 'let op afwijkingen'}
              {data.haccp.status === 'danger' && 'kritieke meting'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({
  title,
  href,
  children,
  gridRow,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
  gridRow?: string;
}) {
  return (
    <div
      style={{
        gridRow,
        padding: 'var(--space-6)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
        backdropFilter: 'var(--glass-blur)',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        minHeight: 140,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3
          style={{
            fontSize: 14,
            fontWeight: 600,
            margin: 0,
            color: 'var(--text)',
            letterSpacing: '-.005em',
          }}
        >
          {title}
        </h3>
        {href ? (
          <Link
            href={href}
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              letterSpacing: '.02em',
            }}
          >
            open <ArrowRight size={11} />
          </Link>
        ) : null}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--muted)',
        fontSize: 13,
      }}
    >
      {text}
    </div>
  );
}

function LegendDot({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {label}
    </span>
  );
}
