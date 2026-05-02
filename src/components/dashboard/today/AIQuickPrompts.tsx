'use client';

import React from 'react';
import {
  Sparkles, Beef, Snowflake, ClipboardList,
  Thermometer, Percent, ShoppingCart, MailWarning,
  type LucideIcon,
} from 'lucide-react';
import type { QuickPrompt } from './AIPromptDrawer';

const ICON_MAP: Record<string, LucideIcon> = {
  beef: Beef,
  snowflake: Snowflake,
  'clipboard-list': ClipboardList,
  thermometer: Thermometer,
  percent: Percent,
  'shopping-cart': ShoppingCart,
  'mail-warning': MailWarning,
  sparkles: Sparkles,
};

export const QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'qp-1', icon: 'beef', label: 'Meelijst volgende catering', prompt: 'Maak een meelijst voor de volgende catering — welke ingrediënten heb ik nodig en bij wie bestel ik die het goedkoopst?', category: 'keuken' },
  { id: 'qp-2', icon: 'snowflake', label: 'Wat kan ik prepen voor vriezer?', prompt: 'Wat kan ik nu vooruit prepen en invriezen voor komende events?', category: 'keuken' },
  { id: 'qp-3', icon: 'clipboard-list', label: 'Voorwerk deze week', prompt: 'Welk voorwerk staat deze week op de planning — wat moet ik wanneer doen?', category: 'keuken' },
  { id: 'qp-4', icon: 'thermometer', label: 'Wat is bijna op of THT?', prompt: 'Welke producten zijn bijna op of hebben een aflopende THT-datum?', category: 'keuken' },
  { id: 'qp-5', icon: 'percent', label: 'Hoe staat mijn marge?', prompt: 'Hoe staat mijn marge er deze maand voor — welke leveranciers of producten beïnvloeden hem het meest?', category: 'zaak' },
  { id: 'qp-6', icon: 'shopping-cart', label: 'Wat moet ik vandaag bestellen?', prompt: 'Wat moet ik vandaag bestellen — en bij welke leverancier het goedkoopst?', category: 'zaak' },
  { id: 'qp-7', icon: 'mail-warning', label: 'Welke facturen chasen?', prompt: 'Welke openstaande facturen moet ik vandaag bij klanten chasen?', category: 'zaak' },
  { id: 'qp-8', icon: 'sparkles', label: 'Briefing voor morgen', prompt: 'Geef me een korte briefing voor morgen — wat staat er op de planning en waar moet ik op letten?', category: 'zaak' },
];

interface Props {
  onPrompt: (qp: QuickPrompt) => void;
}

export default function AIQuickPrompts({ onPrompt }: Props): React.ReactElement {
  const keuken = QUICK_PROMPTS.filter((q) => q.category === 'keuken');
  const zaak = QUICK_PROMPTS.filter((q) => q.category === 'zaak');

  return (
    <div
      className="smoke-card"
      style={{
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Sparkles size={11} color="var(--brand)" />
        <span
          style={{
            fontSize: 10,
            letterSpacing: '.2em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: 'var(--brand)',
          }}
        >
          VRAAG AI
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 4px' }} />
      </div>

      <div className="ai-quick-cols" style={{ display: 'flex', gap: 24 }}>
        <Column items={keuken} title="Keuken" accent="#86efac" onPrompt={onPrompt} />
        <Column items={zaak} title="Zaak" accent="var(--brand)" onPrompt={onPrompt} />
      </div>

      <style>{`
        @media (max-width: 640px) {
          .ai-quick-cols { flex-direction: column !important; gap: 14px !important; }
        }
      `}</style>
    </div>
  );
}

function Column({
  items, title, accent, onPrompt,
}: {
  items: QuickPrompt[];
  title: string;
  accent: string;
  onPrompt: (qp: QuickPrompt) => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: '.22em',
          textTransform: 'uppercase',
          fontWeight: 600,
          color: 'var(--muted)',
          padding: '0 4px 6px',
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((qp) => {
          const Icon = ICON_MAP[qp.icon] || Sparkles;
          return (
            <button
              key={qp.id}
              onClick={() => onPrompt(qp)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 6px',
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                color: 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'background .15s',
                minHeight: 32,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={12} color={accent} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 400,
                  color: 'var(--text)',
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {qp.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
