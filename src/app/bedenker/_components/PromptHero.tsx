'use client';

import { useRef } from 'react';
import {
  Sparkles,
  Wand2,
  Users,
  Leaf,
  Thermometer,
  Flame,
  Globe,
  Snowflake,
  Cake,
  DollarSign,
  Baby,
  type LucideIcon,
} from 'lucide-react';

interface Suggestion {
  icon: string;
  text: string;
}

const SUGGESTIONS: Suggestion[] = [
  { icon: 'sparkles', text: 'Vegan hoofdgerecht in BBQ-stijl voor 80p' },
  { icon: 'flame', text: 'Borrelhapje met pulled pork — 1 hap' },
  { icon: 'leaf', text: '3 plantaardige sides voor zomer-event' },
  { icon: 'globe', text: 'Aziatische twist op brisket' },
  { icon: 'snowflake', text: 'Koud hoofdgerecht voor warme lunch' },
  { icon: 'cake', text: 'Smoke-dessert dat past bij ribs' },
  { icon: 'dollar-sign', text: 'Hoofdgerecht onder €4 kostprijs p.p.' },
  { icon: 'baby', text: 'Kids-friendly versie van brisket' },
];

const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  flame: Flame,
  leaf: Leaf,
  globe: Globe,
  snowflake: Snowflake,
  cake: Cake,
  'dollar-sign': DollarSign,
  baby: Baby,
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  busy: boolean;
  defaultPortions?: number;
}

export default function PromptHero({ value, onChange, onGenerate, busy, defaultPortions = 80 }: Props) {
  const ta = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div
      style={{
        position: 'relative',
        background:
          'linear-gradient(180deg, rgba(255,191,0,.04) 0%, rgba(196,163,90,.02) 50%, transparent 100%)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '28px 28px 22px',
        marginBottom: 22,
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 85% 0%, rgba(255,191,0,.08), transparent 40%), radial-gradient(circle at 0% 100%, rgba(167,139,250,.06), transparent 50%)',
          pointerEvents: 'none',
        }}
      />
      {/* Floating sparkles — pure CSS, slow drift */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {[
          { x: 8, y: 22, size: 3, delay: 0, dur: 8 },
          { x: 92, y: 30, size: 2, delay: 2, dur: 9 },
          { x: 78, y: 14, size: 4, delay: 1, dur: 7 },
          { x: 18, y: 78, size: 2, delay: 3, dur: 10 },
          { x: 65, y: 88, size: 3, delay: 4, dur: 8 },
          { x: 42, y: 10, size: 2, delay: 5, dur: 9 },
          { x: 88, y: 60, size: 3, delay: 1.5, dur: 7.5 },
        ].map((s, i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: i % 2 ? '#a78bfa' : '#FFBF00',
              boxShadow: `0 0 ${s.size * 3}px ${i % 2 ? '#a78bfa' : '#FFBF00'}`,
              animation: `bedenker-float ${s.dur}s ease-in-out ${s.delay}s infinite`,
              opacity: 0.65,
            }}
          />
        ))}
        <style>{`
          @keyframes bedenker-float {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
            25% { transform: translate(8px, -10px) scale(1.2); opacity: 0.85; }
            50% { transform: translate(-6px, -18px) scale(0.9); opacity: 0.6; }
            75% { transform: translate(4px, -8px) scale(1.1); opacity: 0.8; }
          }
        `}</style>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: 'linear-gradient(135deg, var(--brand), #9e781c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(255,191,0,.3)',
          }}
        >
          <Sparkles size={16} color="#0a0a0c" />
        </div>
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              color: 'var(--brand)',
              fontWeight: 700,
            }}
          >
            AI Brainstorm
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            Concepten landen niet in je productie-bibliotheek totdat jij ze bewust opslaat.
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          background: 'rgba(10,10,12,.6)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          padding: 14,
          transition: 'border-color .2s',
        }}
      >
        <textarea
          ref={ta}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              onGenerate();
            }
          }}
          placeholder='Bijv. "Vegan hoofdgerecht in BBQ-stijl voor 80 personen" of "Borrelhapje met pulled pork — 1 hap"'
          rows={2}
          style={{
            width: '100%',
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 15,
            lineHeight: 1.5,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
            <Pill icon={Users} text={`${defaultPortions} personen`} />
            <Pill icon={Leaf} text="Geen restrictie" />
            <Pill icon={Thermometer} text="Auto seizoen" />
            <span
              style={{
                marginLeft: 4,
                fontFamily: 'ui-monospace, monospace',
                fontSize: 10,
                opacity: 0.7,
              }}
            >
              ⌘ + Enter
            </span>
          </div>
          <button
            onClick={onGenerate}
            disabled={busy || !value.trim()}
            className="btn btn-brand"
            style={{
              opacity: busy || !value.trim() ? 0.5 : 1,
              cursor: busy || !value.trim() ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {busy ? (
              <>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: '2px solid rgba(0,0,0,.3)',
                    borderTopColor: '#000',
                    borderRadius: '50%',
                    animation: 'bedenker-spin .8s linear infinite',
                    display: 'inline-block',
                  }}
                />
                Bedenkt…
              </>
            ) : (
              <>
                <Wand2 size={14} />
                Bedenk 3 concepten
              </>
            )}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14, alignItems: 'center' }}>
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            color: 'var(--muted-light)',
            fontWeight: 700,
            marginRight: 4,
          }}
        >
          Inspiratie
        </span>
        {SUGGESTIONS.map((s, i) => {
          const Icon = ICONS[s.icon] || Sparkles;
          return (
            <button
              key={i}
              onClick={() => onChange(s.text)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.02)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all .15s',
              }}
              className="bedenker-chip"
            >
              <Icon size={11} color="var(--brand-gold)" />
              {s.text}
            </button>
          );
        })}
      </div>
      <style jsx>{`
        @keyframes bedenker-spin {
          to {
            transform: rotate(360deg);
          }
        }
        :global(.bedenker-chip:hover) {
          background: rgba(255, 191, 0, 0.06) !important;
          border-color: rgba(255, 191, 0, 0.3) !important;
        }
      `}</style>
    </div>
  );
}

function Pill({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      <Icon size={11} />
      {text}
    </span>
  );
}
