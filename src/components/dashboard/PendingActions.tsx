'use client';

import Link from 'next/link';
import { ArrowRight, FileText, Clipboard, ShieldCheck, Receipt, Package, AlertTriangle } from 'lucide-react';

export interface PendingItem {
  /** Unieke key voor React-render */
  key: string;
  /** Titel boven het cijfer (bijv. "Offertes wachten") */
  label: string;
  /** Hoofdcijfer dat je in één blik wilt zien */
  count: number;
  /** Korte beschrijving onder het cijfer */
  hint: string;
  /** Lucide icon naam */
  icon: 'offerte' | 'prep' | 'haccp' | 'factuur' | 'voorraad' | 'warning';
  /** Waar de gebruiker heen klikt */
  href: string;
  /** Toon dit blok in rood (urgent) */
  urgent?: boolean;
}

const ICON_MAP = {
  offerte: FileText,
  prep: Clipboard,
  haccp: ShieldCheck,
  factuur: Receipt,
  voorraad: Package,
  warning: AlertTriangle,
};

interface Props {
  items: PendingItem[];
  /** Sectie-titel boven de strook */
  title?: string;
}

export default function PendingActions({ items, title = 'Vraagt je aandacht' }: Props) {
  if (items.length === 0) {
    return (
      <div
        style={{
          padding: 18,
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--green, #10b981) 6%, var(--card))',
          fontSize: 13,
          color: 'var(--muted)',
          textAlign: 'center',
        }}
      >
        Niets dringend — alles loopt op rolletjes
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 10,
        }}
      >
        {items.map((item) => {
          const Icon = ICON_MAP[item.icon];
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 16px',
                borderRadius: 'var(--radius-lg)',
                border: `1px solid ${item.urgent ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
                background: item.urgent ? 'rgba(239,68,68,.06)' : 'var(--card)',
                textDecoration: 'none',
                color: 'var(--text)',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: item.urgent
                    ? 'rgba(239,68,68,.15)'
                    : 'var(--brand-tint)',
                  color: item.urgent ? '#f87171' : 'var(--brand)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '.06em',
                    marginBottom: 2,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{item.count}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.hint}
                  </span>
                </div>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
