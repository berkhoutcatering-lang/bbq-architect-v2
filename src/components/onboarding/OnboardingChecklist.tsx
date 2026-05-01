'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, X, ArrowRight, Sparkles } from 'lucide-react';
import { trackOnce } from '@/lib/track';

interface ChecklistItem {
  key: string;
  title: string;
  desc: string;
  href: string;
  /** Functie die kijkt of item klaar is op basis van app-data */
  isDone: (data: ChecklistData) => boolean;
}

export interface ChecklistData {
  hasLogo: boolean;
  hasOwnGerecht: boolean;
  hasRealOfferte: boolean;
  hasSentOfferte: boolean;
}

const ITEMS: ChecklistItem[] = [
  {
    key: 'logo',
    title: 'Upload je logo',
    desc: 'Persoonlijke branding op offertes en facturen — 1 min',
    href: '/instellingen',
    isDone: (d) => d.hasLogo,
  },
  {
    key: 'gerecht',
    title: 'Pas een gerecht aan',
    desc: 'Verander een demo-gerecht naar je eigen menu — 2 min',
    href: '/gerechten',
    isDone: (d) => d.hasOwnGerecht,
  },
  {
    key: 'offerte',
    title: 'Maak je eerste offerte',
    desc: 'Test de wizard met een echte klant — 5 min',
    href: '/offertes',
    isDone: (d) => d.hasRealOfferte,
  },
  {
    key: 'send',
    title: 'Verstuur naar je eerste klant',
    desc: 'Magic-link naar email — klaar',
    href: '/offertes',
    isDone: (d) => d.hasSentOfferte,
  },
];

const DISMISS_KEY = 'bbq_onboarding_checklist_dismissed';

interface Props {
  data: ChecklistData;
}

/**
 * Dismissable onboarding-checklist op Vandaag-laag.
 * Toont 4 stappen die nieuwe tenant moet doen om de app te activeren.
 * Persisteert dismiss-state in localStorage; toont automatisch niet meer
 * zodra alle 4 items klaar zijn.
 */
export default function OnboardingChecklist({ data }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch { /* SSR fallback */ }
  }, []);

  const doneCount = ITEMS.filter((i) => i.isDone(data)).length;
  const allDone = doneCount === ITEMS.length;

  /* Track per item één keer als het van niet-done naar done gaat. trackOnce zorgt
     voor dedup via localStorage zodat we niet bij elke render dubbele events firen. */
  useEffect(() => {
    if (!mounted) return;
    ITEMS.forEach((item) => {
      if (item.isDone(data)) {
        trackOnce('checklist_item_done', `checklist_${item.key}`, { item: item.key });
      }
    });
  }, [mounted, data]);

  /* Niet renderen tijdens SSR (localStorage niet bekend), na dismiss, of als alles klaar is. */
  if (!mounted || dismissed || allDone) return null;

  function handleDismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* */ }
    setDismissed(true);
  }

  return (
    <div
      style={{
        position: 'relative',
        padding: 'var(--space-5) var(--space-6)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--brand-tint-border)',
        background: 'linear-gradient(135deg, var(--brand-tint) 0%, var(--card) 70%)',
        marginBottom: 'var(--space-4)',
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Sluit onboarding-checklist"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: 6,
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <X size={16} />
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-3)' }}>
        <Sparkles size={18} style={{ color: 'var(--brand)' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Welkom — pak het echt aan</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {doneCount} van {ITEMS.length} klaar · ~13 min totaal
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: 'var(--border)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
          marginBottom: 'var(--space-4)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(doneCount / ITEMS.length) * 100}%`,
            background: 'var(--brand)',
            transition: 'width 200ms ease',
          }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {ITEMS.map((item, idx) => {
          const done = item.isDone(data);
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: done ? 'var(--brand-tint-subtle)' : 'var(--card)',
                textDecoration: 'none',
                color: 'var(--text)',
                opacity: done ? 0.7 : 1,
                minHeight: 48,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 'var(--radius-full)',
                  border: done ? 'none' : '2px solid var(--border)',
                  background: done ? 'var(--brand)' : 'transparent',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  color: done ? '#000' : 'var(--muted)',
                }}
              >
                {done ? <Check size={14} /> : idx + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: done ? 'line-through' : 'none',
                  }}
                >
                  {item.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.desc}</div>
              </div>
              {!done && <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
