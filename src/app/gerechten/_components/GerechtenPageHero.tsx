'use client';

import Link from 'next/link';
import { Upload, Sparkles, Plus, ChefHat, UtensilsCrossed, type LucideIcon } from 'lucide-react';

interface ActionDef {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: 'ghost' | 'brand';
}

type View = 'gerechten' | 'menus';

interface Props {
  onImport?: () => void;
  onAddGerecht?: () => void;
  onAddGang?: () => void;
  onAddMenu?: () => void;
  view?: View;
  onViewChange?: (v: View) => void;
  gerechtenCount?: number;
  menusCount?: number;
}

export default function GerechtenPageHero({
  onImport,
  onAddGerecht,
  onAddGang,
  onAddMenu,
  view = 'gerechten',
  onViewChange,
  gerechtenCount,
  menusCount,
}: Props) {
  const actions: ActionDef[] = [
    { label: 'Importeren', icon: Upload, onClick: onImport, variant: 'ghost' },
    { label: 'Bedenker', icon: Sparkles, href: '/bedenker', variant: 'ghost' },
  ];
  if (onAddGerecht && view === 'gerechten') {
    actions.push({ label: 'Gerecht toevoegen', icon: Plus, onClick: onAddGerecht, variant: 'brand' });
  }
  if (onAddGang && view === 'gerechten') {
    actions.push({ label: 'Gang toevoegen', icon: Plus, onClick: onAddGang, variant: 'ghost' });
  }
  if (onAddMenu) {
    actions.push({ label: 'Nieuw menu', icon: Plus, onClick: onAddMenu, variant: 'brand' });
  }

  return (
    <>
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
              color: 'var(--muted)',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--brand)',
              }}
            />
            <span>Receptuur · Bibliotheek</span>
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
                color: 'var(--brand)',
              }}
            >
              &amp; Menu&apos;s
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
            {view === 'menus'
              ? 'Stel hier je menu’s samen met de wizard. Gebruik ze later als startpunt voor offertes.'
              : 'Overzicht van al je gerechten met ingrediënten en kostprijzen. Koppel ze aan gangen voor snelle menu-samenstelling.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {actions.map((a) => {
            const Icon = a.icon;
            const cls = a.variant === 'brand' ? 'btn btn-brand' : 'btn btn-ghost';
            const inner = (
              <>
                <Icon size={14} /> {a.label}
              </>
            );
            if (a.href) {
              return (
                <Link
                  key={a.label}
                  href={a.href}
                  className={cls}
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={a.label}
                onClick={a.onClick}
                className={cls}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      </div>

      {onViewChange && (
        <div
          role="tablist"
          aria-label="Weergave"
          style={{
            display: 'inline-flex',
            gap: 4,
            padding: 3,
            background: 'rgba(255,255,255,.03)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            marginBottom: 18,
          }}
        >
          <ToggleBtn
            active={view === 'gerechten'}
            onClick={() => onViewChange('gerechten')}
            icon={ChefHat}
            label="Gerechten"
            count={gerechtenCount}
          />
          <ToggleBtn
            active={view === 'menus'}
            onClick={() => onViewChange('menus')}
            icon={UtensilsCrossed}
            label="Menu's"
            count={menusCount}
          />
        </div>
      )}
    </>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 8,
        border: 'none',
        background: active ? 'var(--brand)' : 'transparent',
        color: active ? '#0a0a0c' : 'var(--muted)',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all .15s',
      }}
    >
      <Icon size={13} />
      {label}
      {typeof count === 'number' && (
        <span
          style={{
            fontSize: 11,
            opacity: 0.7,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            marginLeft: 2,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
