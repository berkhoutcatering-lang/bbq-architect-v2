'use client';

import Link from 'next/link';
import { Utensils, Settings2, Dices, Sparkles } from 'lucide-react';

interface Props {
  onVerrasMe: () => void;
  busy: boolean;
}

export default function BedenkerPageHero({ onVerrasMe, busy }: Props) {
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
        {/* AI-orb — pulserend, vervangt het static "Wand" icon */}
        <div
          aria-hidden
          className="bedenker-ai-orb"
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 4,
          }}
        >
          <div className="orb-ring orb-ring-outer" />
          <div className="orb-ring orb-ring-mid" />
          <div className="orb-ring orb-ring-inner" />
          <div className="orb-core">
            <Sparkles size={20} color="#0a0a0c" />
          </div>
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
              color: '#c4b5fd',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#a78bfa',
                boxShadow: '0 0 8px #a78bfa',
                animation: 'bedenker-pulse-dot 2s ease-in-out infinite',
              }}
            />
            <span>Brainstorm Studio</span>
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
            Gerechten{' '}
            <em
              className="bedenker-gradient-word"
              style={{
                fontStyle: 'normal',
                fontWeight: 500,
              }}
            >
              Bedenker
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
            Speel los met ideeën. AI verzint concept-gerechten geleund op jouw eigen receptuur — pas wanneer jij ze
            opslaat landen ze in /gerechten.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onVerrasMe}
          disabled={busy}
          className="bedenker-shimmer-btn"
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
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
            fontFamily: 'inherit',
            position: 'relative',
            overflow: 'hidden',
          }}
          title="Random prompt + meteen genereren"
        >
          <Dices size={15} /> Verras me
        </button>
        <Link
          href="/gerechten"
          className="btn btn-ghost"
          style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Utensils size={14} /> Naar /gerechten
        </Link>
        <button
          className="btn btn-ghost"
          disabled
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Settings2 size={14} /> AI-instellingen
        </button>
      </div>

      <style jsx>{`
        /* Pulse-dot eyebrow */
        @keyframes bedenker-pulse-dot {
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

        /* AI-orb met 3 concentrische rings + core */
        :global(.orb-ring) {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(167, 139, 250, 0.4);
        }
        :global(.orb-ring-outer) {
          inset: 0;
          animation: orb-ring-spin 8s linear infinite;
          border-color: rgba(167, 139, 250, 0.25);
          border-top-color: #a78bfa;
        }
        :global(.orb-ring-mid) {
          inset: 8px;
          animation: orb-ring-spin 5s linear infinite reverse;
          border-color: rgba(255, 191, 0, 0.2);
          border-right-color: var(--brand);
        }
        :global(.orb-ring-inner) {
          inset: 16px;
          animation: orb-ring-spin 3s linear infinite;
          border-color: rgba(196, 163, 90, 0.4);
          border-bottom-color: #c4a35a;
        }
        :global(.orb-core) {
          position: absolute;
          inset: 22px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--brand) 0%, #a78bfa 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 24px rgba(167, 139, 250, 0.6), 0 0 12px rgba(255, 191, 0, 0.4);
          animation: orb-core-pulse 2.4s ease-in-out infinite;
        }
        @keyframes orb-ring-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes orb-core-pulse {
          0%,
          100% {
            transform: scale(1);
            box-shadow: 0 0 24px rgba(167, 139, 250, 0.6), 0 0 12px rgba(255, 191, 0, 0.4);
          }
          50% {
            transform: scale(1.08);
            box-shadow: 0 0 36px rgba(167, 139, 250, 0.85), 0 0 18px rgba(255, 191, 0, 0.6);
          }
        }

        /* Animated gradient text op "Bedenker" */
        :global(.bedenker-gradient-word) {
          background: linear-gradient(
            90deg,
            var(--brand) 0%,
            #c4a35a 25%,
            #a78bfa 50%,
            #c4a35a 75%,
            var(--brand) 100%
          );
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: bedenker-gradient-flow 6s linear infinite;
        }
        @keyframes bedenker-gradient-flow {
          to {
            background-position: 200% center;
          }
        }

        /* Shimmer-glow knop */
        :global(.bedenker-shimmer-btn) {
          background: linear-gradient(135deg, var(--brand) 0%, #ffd35b 50%, var(--brand) 100%);
          background-size: 200% auto;
          box-shadow: 0 0 20px rgba(255, 191, 0, 0.4), 0 4px 14px rgba(167, 139, 250, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          animation: shimmer-flow 3s linear infinite;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        :global(.bedenker-shimmer-btn::before) {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            120deg,
            transparent 30%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 70%
          );
          animation: shimmer-sweep 2.5s ease-in-out infinite;
        }
        :global(.bedenker-shimmer-btn:hover:not(:disabled)) {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 0 30px rgba(255, 191, 0, 0.55), 0 6px 20px rgba(167, 139, 250, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
        }
        @keyframes shimmer-flow {
          to {
            background-position: 200% center;
          }
        }
        @keyframes shimmer-sweep {
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
