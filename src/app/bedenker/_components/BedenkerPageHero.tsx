'use client';

import Link from 'next/link';
import { Utensils, Settings2, Dices } from 'lucide-react';

interface Props {
  onVerrasMe: () => void;
  busy: boolean;
}

export default function BedenkerPageHero({ onVerrasMe, busy }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 18,
        flexWrap: 'wrap',
      }}
    >
      <div>
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
            fontSize: 32,
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Gerechten{' '}
          <em
            style={{
              fontStyle: 'normal',
              fontWeight: 500,
              background: 'linear-gradient(90deg, var(--brand) 0%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Bedenker
          </em>
        </h1>
        <p
          style={{
            marginTop: 6,
            marginBottom: 0,
            fontSize: 13,
            color: 'var(--muted)',
            maxWidth: 640,
            lineHeight: 1.5,
          }}
        >
          Speel los met ideeën. AI verzint concept-gerechten geleund op jouw eigen receptuur — pas wanneer jij ze
          opslaat landen ze in /gerechten.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={onVerrasMe}
          disabled={busy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(255,191,0,.18), rgba(167,139,250,.20))',
            border: '1px solid rgba(167,139,250,.4)',
            color: 'var(--text)',
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
            fontFamily: 'inherit',
            boxShadow: '0 0 16px rgba(167,139,250,.18)',
          }}
          title="Random prompt + meteen genereren"
        >
          <Dices size={14} /> Verras me
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
      `}</style>
    </div>
  );
}
