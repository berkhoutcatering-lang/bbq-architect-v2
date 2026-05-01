'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export interface KansNudge {
  id: string;
  message: string;
  href: string;
  tone: 'warning' | 'info' | 'positive';
  impact?: number;
}

export interface KansOfferte {
  id: string | number;
  client: string;
  amount: number;
  daysOpen: number;
  status: string;
  href: string;
}

export interface KansData {
  nudges: KansNudge[];
  offertes: KansOfferte[];
}

interface Props {
  data: KansData;
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export default function ZoneKans({ data }: Props) {
  const sortedNudges = [...data.nudges].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
  const big = sortedNudges[0];
  const small = sortedNudges.slice(1, 3);

  return (
    <div
      style={{
        background: 'var(--color-bg-deep)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--space-8)',
        border: '1px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
        gap: 24,
      }}
    >
      {/* LINKS: AI nudges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
          }}
        >
          <Sparkles size={12} style={{ color: 'var(--brand)' }} />
          Wat je laat liggen
        </div>

        {!big ? (
          <div
            style={{
              padding: 'var(--space-6)',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border)',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            Niets aan de hand vandaag.
          </div>
        ) : (
          <>
            <NudgeCard nudge={big} size="big" />
            {small.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: small.length > 1 ? 'repeat(2, 1fr)' : '1fr',
                  gap: 10,
                }}
              >
                {small.map((n) => (
                  <NudgeCard key={n.id} nudge={n} size="small" />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* RECHTS: open offertes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
            }}
          >
            Open offertes
          </span>
          <Link
            href="/offertes"
            style={{
              fontSize: 11,
              color: 'var(--muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            open lijst <ArrowRight size={11} />
          </Link>
        </div>

        {data.offertes.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-5)',
              fontSize: 13,
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            Geen open offertes.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.offertes.slice(0, 4).map((o) => (
              <OfferteRow key={o.id} offerte={o} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NudgeCard({ nudge, size }: { nudge: KansNudge; size: 'big' | 'small' }) {
  const accent =
    nudge.tone === 'warning' ? 'var(--amber)' : nudge.tone === 'positive' ? 'var(--green)' : 'var(--blue)';

  return (
    <Link
      href={nudge.href}
      style={{
        display: 'block',
        padding: size === 'big' ? 'var(--space-5)' : 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--card-solid)',
        border: '1px solid var(--border)',
        borderLeft: `2px solid ${accent}`,
        textDecoration: 'none',
        color: 'var(--text)',
        transition: 'border-color .15s, transform .15s',
      }}
    >
      <div
        style={{
          fontSize: size === 'big' ? 14 : 12.5,
          color: 'var(--text)',
          lineHeight: 1.4,
        }}
      >
        {nudge.message}
      </div>
      {nudge.impact && nudge.impact > 0 ? (
        <div
          style={{
            fontSize: 10,
            color: accent,
            marginTop: 6,
            letterSpacing: '.04em',
          }}
        >
          ~{fmtEuro(nudge.impact)} potentie
        </div>
      ) : null}
    </Link>
  );
}

function OfferteRow({ offerte }: { offerte: KansOfferte }) {
  return (
    <Link
      href={offerte.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        background: 'transparent',
        border: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'var(--text)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {offerte.client}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
          {offerte.daysOpen}d open · {offerte.status}
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {fmtEuro(offerte.amount)}
      </div>
    </Link>
  );
}
