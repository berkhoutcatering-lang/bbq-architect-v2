'use client';

import Link from 'next/link';
import { UtensilsCrossed, Plus, BarChart3 } from 'lucide-react';

interface Props {
  totaalGerechten: number;
  metKostprijs: number;
}

export default function MargesPageHero({ totaalGerechten, metKostprijs }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flex: 1, minWidth: 0 }}>
        {/* Static chart-orb — geen dansende bars, alleen icon */}
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 6,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(34,197,94,.14), rgba(34,197,94,.03))',
            border: '1px solid rgba(34,197,94,.22)',
          }}
        >
          <BarChart3 size={22} color="#22c55e" />
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
              fontSize: 10,
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: '#22c55e',
              }}
            />
            <span>Margin Lab</span>
          </div>
          <h1
            style={{
              fontWeight: 200,
              fontSize: 'clamp(24px, 7vw, 36px)',
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
            }}
          >
            Marges &{' '}
            <em
              style={{
                fontStyle: 'normal',
                fontWeight: 500,
                color: '#22c55e',
              }}
            >
              analyse
            </em>
          </h1>
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              fontSize: 13,
              color: 'var(--muted)',
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            {totaalGerechten} gerechten geanalyseerd op marge en populariteit.{' '}
            {metKostprijs > 0 && `${metKostprijs} met kostprijs berekend.`}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href="/gerechten?view=menus"
          className="btn btn-ghost"
          style={{
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <UtensilsCrossed size={14} /> Stel menu samen
        </Link>
        <Link
          href="/gerechten"
          className="btn btn-brand"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'none',
          }}
        >
          <Plus size={14} /> Nieuw gerecht
        </Link>
      </div>
    </div>
  );
}
