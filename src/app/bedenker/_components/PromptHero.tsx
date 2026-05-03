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
  Lightbulb,
  PackageOpen,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { BedenkMode, ModeContext } from './useConceptHistory';

interface Suggestion {
  icon: string;
  text: string;
}

const SUGGESTIONS_VRIJ: Suggestion[] = [
  { icon: 'sparkles', text: 'Vegan hoofdgerecht in BBQ-stijl voor 80p' },
  { icon: 'flame', text: 'Borrelhapje met pulled pork — 1 hap' },
  { icon: 'leaf', text: '3 plantaardige sides voor zomer-event' },
  { icon: 'globe', text: 'Aziatische twist op brisket' },
  { icon: 'snowflake', text: 'Koud hoofdgerecht voor warme lunch' },
  { icon: 'cake', text: 'Smoke-dessert dat past bij ribs' },
  { icon: 'dollar-sign', text: 'Hoofdgerecht onder €4 kostprijs p.p.' },
  { icon: 'baby', text: 'Kids-friendly versie van brisket' },
];

const SUGGESTIONS_VOORRAAD: Suggestion[] = [
  { icon: 'flame', text: 'Restjes pulled pork van gisteren — 2kg' },
  { icon: 'leaf', text: '5kg paprika rood + 1kg feta + 200g basilicum' },
  { icon: 'sparkles', text: '3kg kipdijen + 1kg ui + 500g cheddar' },
  { icon: 'cake', text: 'Bevroren bessen 2kg + slagroom 1L' },
];

const SUGGESTIONS_KLANT: Suggestion[] = [
  { icon: 'leaf', text: 'Bruiloft 60p — 3 vegan + 4 glutenvrij — buiten in juli' },
  { icon: 'baby', text: 'Verjaardag 25p incl. 8 kinderen — middag' },
  { icon: 'globe', text: 'Bedrijfsfeest 120p — internationale gasten — half halal' },
  { icon: 'dollar-sign', text: 'Tuinfeest 40p — budget €18pp — comfort BBQ' },
];

const DIET_OPTIONS = ['Vegan', 'Vegetarisch', 'Glutenvrij', 'Lactosevrij', 'Notenvrij', 'Halal'];

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
  mode: BedenkMode;
  onModeChange: (m: BedenkMode) => void;
  modeContext: ModeContext;
  onModeContextChange: (c: ModeContext) => void;
}

export default function PromptHero({
  value,
  onChange,
  onGenerate,
  busy,
  defaultPortions = 80,
  mode,
  onModeChange,
  modeContext,
  onModeContextChange,
}: Props) {
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

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              {mode === 'voorraad'
                ? 'Geef restjes/ingrediënten op — AI verzint een passend gerecht.'
                : mode === 'klant'
                ? 'Geef klant-context op — AI bedenkt een gerecht dat past.'
                : 'Vrije brainstorm — concepten landen niet in je bibliotheek tot jij ze opslaat.'}
            </div>
          </div>
        </div>

        <ModeSwitcher mode={mode} onChange={onModeChange} />
      </div>

      {mode === 'voorraad' && (
        <VoorraadPanel
          value={modeContext.voorraad || ''}
          onChange={(v) => onModeContextChange({ ...modeContext, voorraad: v })}
        />
      )}

      {mode === 'klant' && (
        <KlantPanel
          context={modeContext}
          onChange={(c) => onModeContextChange({ ...modeContext, ...c })}
        />
      )}

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
          placeholder={
            mode === 'voorraad'
              ? 'Vrije input: bv. "Maak iets pittigs voor de lunch" — voorraad-restjes hierboven invullen.'
              : mode === 'klant'
              ? 'Vrije input: bv. "Iets dat indruk maakt zonder vlees" — klant-info hierboven invullen.'
              : 'Bijv. "Vegan hoofdgerecht in BBQ-stijl voor 80 personen" of "Borrelhapje met pulled pork — 1 hap"'
          }
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
        {(mode === 'voorraad' ? SUGGESTIONS_VOORRAAD : mode === 'klant' ? SUGGESTIONS_KLANT : SUGGESTIONS_VRIJ).map((s, i) => {
          const Icon = ICONS[s.icon] || Sparkles;
          return (
            <button
              key={i}
              onClick={() => {
                if (mode === 'voorraad') {
                  onModeContextChange({ ...modeContext, voorraad: s.text });
                } else {
                  onChange(s.text);
                }
              }}
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

interface ModeDef {
  id: BedenkMode;
  label: string;
  icon: LucideIcon;
  /** OKLCH-tinted gradient voor de active-pill */
  gradient: string;
  /** Glow-color voor de active-button (rgba) */
  glow: string;
  /** Accent-line-color (subtle 1-px onder active button) */
  accent: string;
}

const MODES: ModeDef[] = [
  {
    id: 'vrij',
    label: 'Vrij denken',
    icon: Lightbulb,
    gradient: 'linear-gradient(135deg, rgba(255,191,0,.32) 0%, rgba(255,191,0,.08) 100%)',
    glow: 'rgba(255,191,0,.35)',
    accent: '#FFBF00',
  },
  {
    id: 'voorraad',
    label: 'Uit voorraad',
    icon: PackageOpen,
    gradient: 'linear-gradient(135deg, rgba(34,197,94,.32) 0%, rgba(34,197,94,.08) 100%)',
    glow: 'rgba(34,197,94,.35)',
    accent: '#22c55e',
  },
  {
    id: 'klant',
    label: 'Klant-input',
    icon: UserRound,
    gradient: 'linear-gradient(135deg, rgba(167,139,250,.32) 0%, rgba(167,139,250,.10) 100%)',
    glow: 'rgba(167,139,250,.40)',
    accent: '#a78bfa',
  },
];

function ModeSwitcher({ mode, onChange }: { mode: BedenkMode; onChange: (m: BedenkMode) => void }) {
  return (
    <div
      role="tablist"
      className="bedenker-mode-switcher"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.20) 100%)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04), 0 4px 14px rgba(0,0,0,.25)',
        position: 'relative',
      }}
    >
      {MODES.map((m) => {
        const active = mode === m.id;
        const Icon = m.icon;
        return (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(m.id)}
            className={active ? 'mode-pill mode-pill-active' : 'mode-pill'}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '8px 14px',
              borderRadius: 9,
              border: 'none',
              background: active ? m.gradient : 'transparent',
              color: active ? '#fff' : 'var(--muted)',
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background .25s, color .2s, transform .12s',
              boxShadow: active
                ? `inset 0 0 0 1px ${m.accent}66, 0 0 24px -4px ${m.glow}, 0 2px 8px ${m.glow}`
                : undefined,
              letterSpacing: active ? '.01em' : 0,
            }}
          >
            <Icon size={14} color={active ? m.accent : 'currentColor'} />
            <span>{m.label}</span>
            {active && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 12,
                  right: 12,
                  bottom: 2,
                  height: 1,
                  background: `linear-gradient(90deg, transparent, ${m.accent}, transparent)`,
                  opacity: 0.7,
                }}
              />
            )}
          </button>
        );
      })}
      <style jsx>{`
        :global(.mode-pill:hover:not(.mode-pill-active)) {
          color: var(--text) !important;
          background: rgba(255, 255, 255, 0.04) !important;
        }
        :global(.mode-pill-active) {
          animation: mode-pill-glow 4s ease-in-out infinite;
        }
        @keyframes mode-pill-glow {
          0%,
          100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.08);
          }
        }
      `}</style>
    </div>
  );
}

function VoorraadPanel({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(34,197,94,.04)',
        border: '1px solid rgba(34,197,94,.22)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.22em',
          textTransform: 'uppercase',
          color: '#86efac',
          fontWeight: 700,
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <PackageOpen size={11} /> Welke restjes / ingrediënten heb je?
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder='Bv. "2kg pulled pork over, 500g cheddar, 1kg ui, een halve emmer slaw"'
        style={{
          width: '100%',
          resize: 'none',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: 13.5,
          lineHeight: 1.45,
        }}
      />
    </div>
  );
}

function KlantPanel({
  context,
  onChange,
}: {
  context: ModeContext;
  onChange: (c: Partial<ModeContext>) => void;
}) {
  const dieet = context.dieet || [];
  return (
    <div
      style={{
        position: 'relative',
        background: 'rgba(167,139,250,.05)',
        border: '1px solid rgba(167,139,250,.25)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 12,
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.22em',
          textTransform: 'uppercase',
          color: '#c4b5fd',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <UserRound size={11} /> Klant-context
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <NumField
          label="Gasten"
          value={context.gasten}
          onChange={(n) => onChange({ gasten: n })}
          placeholder="60"
          width={92}
        />
        <NumField
          label="Budget €/p.p."
          value={context.budget_pp}
          onChange={(n) => onChange({ budget_pp: n })}
          placeholder="22"
          width={108}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <FieldLabel>Vrije context (gelegenheid, locatie, sfeer)</FieldLabel>
          <input
            type="text"
            value={context.context || ''}
            onChange={(e) => onChange({ context: e.target.value })}
            placeholder="Bv. 'tuinfeest 14u zomer, niet te zwaar'"
            style={inputStyle}
          />
        </div>
      </div>
      <div>
        <FieldLabel>Dieet-restricties</FieldLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {DIET_OPTIONS.map((d) => {
            const active = dieet.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  onChange({ dieet: active ? dieet.filter((x) => x !== d) : [...dieet, d] });
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'rgba(167,139,250,.6)' : 'var(--border)'}`,
                  background: active ? 'rgba(167,139,250,.18)' : 'transparent',
                  color: active ? '#ddd6fe' : 'var(--muted)',
                  fontSize: 11.5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all .12s',
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  width,
}: {
  label: string;
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <div style={{ width }}>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '' ? undefined : Number(v));
        }}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9.5,
        letterSpacing: '.18em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontWeight: 700,
        marginBottom: 3,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(10,10,12,.5)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  outline: 'none',
};
