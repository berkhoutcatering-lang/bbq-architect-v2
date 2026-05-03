'use client';

import Link from 'next/link';
import { Upload, Sparkles, Plus, type LucideIcon } from 'lucide-react';

interface ActionDef {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  variant?: 'ghost' | 'brand';
}

interface Props {
  onImport?: () => void;
  onAddGang?: () => void;
}

export default function GerechtenPageHero({ onImport, onAddGang }: Props) {
  const actions: ActionDef[] = [
    { label: 'Importeren', icon: Upload, onClick: onImport, variant: 'ghost' },
    { label: 'Vraag de Bedenker', icon: Sparkles, href: '/bedenker', variant: 'ghost' },
    { label: 'Gang toevoegen', icon: Plus, onClick: onAddGang, variant: 'brand' },
  ];

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
            color: 'var(--brand-gold)',
            fontWeight: 700,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand-gold)', boxShadow: '0 0 6px var(--brand-gold)' }} />
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
              background: 'linear-gradient(90deg, var(--brand) 0%, #c4a35a 70%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
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
          Overzicht van al je gerechten met ingrediënten en kostprijzen. Koppel ze aan gangen voor snelle menu-samenstelling.
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
  );
}
