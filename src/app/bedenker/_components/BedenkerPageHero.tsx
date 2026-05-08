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
        {/* Static orb — geen spinning rings of pulse-glow meer */}
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
            background: 'linear-gradient(135deg, rgba(167,139,250,.14), rgba(167,139,250,.03))',
            border: '1px solid rgba(167,139,250,.22)',
          }}
        >
          <Sparkles size={22} color="#a78bfa" />
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
                background: '#a78bfa',
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
              style={{
                fontStyle: 'normal',
                fontWeight: 500,
                color: '#a78bfa',
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
          className="btn btn-brand"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
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
    </div>
  );
}
