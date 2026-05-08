'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Compass, type LucideIcon } from 'lucide-react';

export interface GuideAction {
  /** Bold lead — bv. "Klik op een kaart" — en daarna komt de rest van de regel */
  lead?: string;
  text: string;
}

interface Props {
  /** Stable storage-key voor collapsed-state per page (bv. 'gerechten') */
  id: string;
  /** Eyebrow boven titel — bv. "Wat kun je hier" */
  eyebrow?: string;
  /** Korte zin die de pagina-functie samenvat */
  intro: string;
  /** 2-3 actie-bullets met optionele bold lead */
  actions: GuideAction[];
  /** Hex-accent voor border, eyebrow, icon-tile glow */
  accent: string;
  /** Override-icon — default Compass */
  icon?: LucideIcon;
  /** Footer-element rechts (bv. een mini-stat, badge, link) */
  footer?: ReactNode;
}

/**
 * PageGuideNote — collapsible per-page help-strip die uitlegt wat je hier kunt
 * doen. Niet dismissable (anders dan PageHint) want het is permanente
 * orientatie-content, geen interruption. Default expanded; collapsed-state
 * persisteert in localStorage zodat power-users het uit hebben.
 *
 * Gebruikt de hub-accent-color als visuele lijn tussen pagina-thema en de
 * note (goud op /gerechten, paars op /bedenker, groen op /marges).
 */
export default function PageGuideNote({
  id,
  eyebrow = 'Wat kun je hier',
  intro,
  actions,
  accent,
  icon: Icon = Compass,
  footer,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(`bbq_guide_${id}_collapsed`);
      if (v === '1') setCollapsed(true);
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, [id]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(`bbq_guide_${id}_collapsed`, next ? '1' : '0');
      } catch {
        /* noop */
      }
      return next;
    });
  }

  // Voorkom hydration-flicker op de chevron richting
  if (!hydrated) return null;

  return (
    <div
      className="page-guide-note"
      style={{
        position: 'relative',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderLeft: `2px solid color-mix(in oklab, ${accent} 55%, var(--border))`,
        borderRadius: 14,
        padding: collapsed ? '12px 18px' : '16px 18px 18px',
        marginBottom: 18,
        overflow: 'hidden',
        transition: 'padding .2s',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}
      >
        <div
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: `color-mix(in oklab, ${accent} 14%, var(--card))`,
            border: `1px solid color-mix(in oklab, ${accent} 30%, var(--border))`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Icon size={14} color={accent} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              color: accent,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--text)',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {intro}
          </div>

          {!collapsed && (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '12px 0 0',
                display: 'grid',
                gap: 8,
              }}
            >
              {actions.map((a, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    fontSize: 12.5,
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: accent,
                      marginTop: 8,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${accent}`,
                    }}
                  />
                  <span>
                    {a.lead && (
                      <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{a.lead} </strong>
                    )}
                    {a.text}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!collapsed && footer && (
            <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>{footer}</div>
          )}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Uitklappen' : 'Inklappen'}
          aria-expanded={!collapsed}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 8px',
            cursor: 'pointer',
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontFamily: 'inherit',
            transition: 'all .15s',
          }}
          className="page-guide-note__toggle"
        >
          {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
        </button>
      </div>
      <style jsx>{`
        :global(.page-guide-note__toggle:hover) {
          background: rgba(255, 255, 255, 0.04) !important;
          color: var(--text) !important;
        }
      `}</style>
    </div>
  );
}
