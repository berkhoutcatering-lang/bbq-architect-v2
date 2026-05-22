'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, Sparkles, BarChart3, type LucideIcon } from 'lucide-react';

interface RichTab {
  href: string;
  label: string;
  icon: LucideIcon;
  eyebrow: string;
  color: string;
}

const TABS: RichTab[] = [
  { href: '/gerechten', label: 'Gerechten', icon: ChefHat, eyebrow: 'Receptuur · Ingrediënten', color: '#FFBF00' },
  { href: '/bedenker', label: 'Bedenker', icon: Sparkles, eyebrow: 'AI · Brainstorm', color: '#a78bfa' },
  { href: '/gerechten/menu-analyse', label: 'Menu-analyse', icon: BarChart3, eyebrow: 'Marges · Health · BCG', color: '#22c55e' },
];

export default function RichKeukenTabs() {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 22,
      }}
      className="rich-keuken-tabs"
    >
      {TABS.map((t) => {
        const isActive = pathname === t.href || (t.href !== '/' && pathname?.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={isActive ? 'page' : undefined}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '16px 20px',
              borderRadius: 14,
              background: isActive
                ? `linear-gradient(135deg, color-mix(in oklab, ${t.color} 7%, var(--card)), var(--card) 70%)`
                : 'var(--card)',
              border: '1px solid ' + (isActive ? `color-mix(in oklab, ${t.color} 22%, var(--border))` : 'var(--border)'),
              textDecoration: 'none',
              color: 'var(--text)',
              transition: 'transform .15s, box-shadow .15s, border-color .15s',
              cursor: 'pointer',
              overflow: 'hidden',
            }}
            className="rich-tab"
          >
            {isActive && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at 0% 0%, ${t.color}10, transparent 55%)`,
                  pointerEvents: 'none',
                }}
              />
            )}
            <div
              style={{
                position: 'relative',
                width: 38,
                height: 38,
                borderRadius: 10,
                background: isActive
                  ? `linear-gradient(135deg, ${t.color}, color-mix(in oklab, ${t.color} 60%, #000))`
                  : 'rgba(255,255,255,.04)',
                border: isActive ? 'none' : '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: isActive ? `0 2px 8px ${t.color}30` : 'none',
              }}
            >
              <Icon size={18} color={isActive ? '#0a0a0c' : t.color} />
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  fontWeight: 700,
                  marginBottom: 2,
                }}
              >
                {t.eyebrow}
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-.01em' }}>{t.label}</div>
            </div>
          </Link>
        );
      })}
      <style jsx>{`
        :global(.rich-tab:hover) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        @media (max-width: 800px) {
          :global(.rich-keuken-tabs) {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
