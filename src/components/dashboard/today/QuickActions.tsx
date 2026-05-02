'use client';

import React from 'react';
import Link from 'next/link';
import {
  ClipboardList, ChefHat, FilePlus, ScanLine, FileScan, CalendarDays, UtensilsCrossed, Flame,
  type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'clipboard-list': ClipboardList,
  'chef-hat': ChefHat,
  'file-plus': FilePlus,
  'scan-line': ScanLine,
  'file-scan': FileScan,
  'calendar-days': CalendarDays,
  'utensils-crossed': UtensilsCrossed,
  flame: Flame,
};

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href: string;
  primary?: boolean;
}

export const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa-1', label: 'Voorraad tellen', icon: 'clipboard-list', href: '/voorraad', primary: true },
  { id: 'qa-2', label: 'Menu maken', icon: 'chef-hat', href: '/gerechten', primary: true },
  { id: 'qa-3', label: 'Nieuwe offerte', icon: 'file-plus', href: '/offertes', primary: true },
  { id: 'qa-4', label: 'Bon scannen', icon: 'scan-line', href: '/financien' },
  { id: 'qa-5', label: 'Agenda', icon: 'calendar-days', href: '/agenda' },
  { id: 'qa-6', label: 'Service mode', icon: 'utensils-crossed', href: '/service' },
  { id: 'qa-7', label: 'Prep starten', icon: 'flame', href: '/prep-counter' },
  { id: 'qa-8', label: 'HACCP', icon: 'file-scan', href: '/haccp' },
];

interface Props {
  actions?: QuickAction[];
}

export default function QuickActions({ actions = DEFAULT_QUICK_ACTIONS }: Props): React.ReactElement {
  return (
    <div
      className="smoke-card"
      style={{
        padding: '20px 22px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            SNEL AAN DE SLAG
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400 }}>
            Veelgebruikte acties
          </div>
        </div>
      </div>

      <div className="qa-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flex: 1 }}>
        {actions.map((qa) => {
          const Icon = ICON_MAP[qa.icon] || ClipboardList;
          return (
            <Link key={qa.id} href={qa.href} style={{ textDecoration: 'none' }}>
              <button
                style={{
                  width: '100%',
                  background: qa.primary
                    ? 'linear-gradient(135deg, rgba(255,191,0,.05), transparent)'
                    : 'rgba(255,255,255,.015)',
                  border: `1px solid ${qa.primary ? 'rgba(255,191,0,.25)' : 'var(--border)'}`,
                  borderRadius: 12,
                  padding: '16px 12px',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'transform .15s, border-color .15s',
                  fontFamily: 'inherit',
                  minHeight: 92,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = 'rgba(255,191,0,.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.borderColor = qa.primary
                    ? 'rgba(255,191,0,.25)'
                    : 'var(--border)';
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: qa.primary ? 'rgba(255,191,0,.1)' : 'rgba(0,0,0,.3)',
                    border: `1px solid ${qa.primary ? 'rgba(255,191,0,.3)' : 'var(--border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: qa.primary ? 'var(--brand)' : 'var(--muted)',
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>
                  {qa.label}
                </div>
              </button>
            </Link>
          );
        })}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .qa-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
