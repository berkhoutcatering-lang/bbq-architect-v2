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
        {/* Chart-orb — pulserend met animated bars */}
        <div
          aria-hidden
          className="marges-chart-orb"
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            marginBottom: 4,
            padding: '0 8px 8px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(34,197,94,.18), rgba(34,197,94,.04))',
            border: '1px solid rgba(34,197,94,.32)',
            boxShadow: '0 0 28px rgba(34,197,94,.25), inset 0 1px 0 rgba(255,255,255,.05)',
            overflow: 'hidden',
          }}
        >
          <div className="marges-bar marges-bar-1" />
          <div className="marges-bar marges-bar-2" />
          <div className="marges-bar marges-bar-3" />
          <div className="marges-bar marges-bar-4" />
          <BarChart3
            size={16}
            color="#22c55e"
            style={{ position: 'absolute', top: 8, right: 8, opacity: 0.55 }}
          />
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
              color: '#86efac',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px #22c55e',
                animation: 'marges-pulse-dot 2s ease-in-out infinite',
              }}
            />
            <span>Margin Lab</span>
          </div>
          <h1
            style={{
              fontWeight: 200,
              fontSize: 36,
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
            }}
          >
            Marges &{' '}
            <em
              className="marges-gradient-word"
              style={{
                fontStyle: 'normal',
                fontWeight: 500,
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
          className="marges-shimmer-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            color: '#0a0a0c',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            position: 'relative',
            overflow: 'hidden',
            textDecoration: 'none',
          }}
        >
          <Plus size={15} /> Nieuw gerecht
        </Link>
      </div>

      <style jsx>{`
        @keyframes marges-pulse-dot {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.5;
            transform: scale(1.4);
          }
        }

        :global(.marges-bar) {
          width: 9px;
          margin: 0 2px;
          border-radius: 2px 2px 0 0;
          background: linear-gradient(180deg, #22c55e 0%, #15803d 100%);
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
        }
        :global(.marges-bar-1) {
          height: 18px;
          animation: marges-bar-grow 2.4s ease-in-out infinite;
        }
        :global(.marges-bar-2) {
          height: 28px;
          animation: marges-bar-grow 2.4s ease-in-out 0.2s infinite;
        }
        :global(.marges-bar-3) {
          height: 22px;
          animation: marges-bar-grow 2.4s ease-in-out 0.4s infinite;
        }
        :global(.marges-bar-4) {
          height: 34px;
          animation: marges-bar-grow 2.4s ease-in-out 0.6s infinite;
          background: linear-gradient(180deg, #FFBF00 0%, #92400e 100%);
          box-shadow: 0 0 8px rgba(255, 191, 0, 0.4);
        }
        @keyframes marges-bar-grow {
          0%,
          100% {
            transform: scaleY(1);
            transform-origin: bottom;
          }
          50% {
            transform: scaleY(1.25);
            transform-origin: bottom;
          }
        }

        :global(.marges-gradient-word) {
          background: linear-gradient(
            90deg,
            #22c55e 0%,
            #FFBF00 25%,
            #86efac 50%,
            #FFBF00 75%,
            #22c55e 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: marges-gradient-flow 6s linear infinite;
        }
        @keyframes marges-gradient-flow {
          to {
            background-position: 200% center;
          }
        }

        :global(.marges-shimmer-btn) {
          background: linear-gradient(135deg, #22c55e 0%, #86efac 50%, #22c55e 100%);
          background-size: 200% auto;
          box-shadow: 0 0 20px rgba(34, 197, 94, 0.4),
            0 4px 14px rgba(34, 197, 94, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          animation: marges-shimmer-flow 3s linear infinite;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        :global(.marges-shimmer-btn::before) {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            120deg,
            transparent 30%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 70%
          );
          animation: marges-shimmer-sweep 2.5s ease-in-out infinite;
        }
        :global(.marges-shimmer-btn:hover) {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 0 30px rgba(34, 197, 94, 0.55),
            0 6px 20px rgba(34, 197, 94, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }
        @keyframes marges-shimmer-flow {
          to {
            background-position: 200% center;
          }
        }
        @keyframes marges-shimmer-sweep {
          0% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
