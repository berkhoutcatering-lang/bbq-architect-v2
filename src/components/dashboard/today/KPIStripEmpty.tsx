'use client';

import Link from 'next/link';
import { ChefHat, Users, CalendarPlus, ArrowRight } from 'lucide-react';

/**
 * Pillar #5 — Empty-state never blank.
 *
 * Toont 3 actie-tegels in plaats van een rij €0-KPI's wanneer de tenant
 * nog geen events/offertes/klanten heeft. Geeft richting i.p.v. lege state.
 */

const EMPTY_ACTIONS = [
  {
    icon: ChefHat,
    label: 'Voeg eerste gerecht toe',
    desc: 'Bouw je menu op',
    href: '/gerechten?new=1',
  },
  {
    icon: Users,
    label: 'Maak eerste klant aan',
    desc: 'Wie krijgt jouw catering?',
    href: '/klanten?new=1',
  },
  {
    icon: CalendarPlus,
    label: 'Plan eerste event',
    desc: 'Of laat AI er één maken',
    href: '/agenda?new=1',
  },
];

export default function KPIStripEmpty() {
  return (
    <div
      className="rounded-xl border p-5 md:p-6 mb-6"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-accent-gold) 22%, transparent)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--color-accent-gold) 5%, transparent), transparent)',
      }}
    >
      <div className="text-[14px] font-bold text-[var(--text)] mb-1">Klaar om te starten</div>
      <p className="text-[12px] text-[var(--muted)] mb-4 max-w-xl leading-relaxed">
        Hier komen straks je omzet, marge en pipeline-cijfers. Begin met één van deze stappen — je kunt
        altijd terug.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {EMPTY_ACTIONS.map(({ icon: Icon, label, desc, href }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-3 rounded-lg p-3 transition-colors no-underline"
            style={{
              border: '1px solid var(--card-solid)',
              background: 'var(--card)',
            }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'color-mix(in srgb, var(--color-accent-gold) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-accent-gold) 22%, transparent)',
              }}
            >
              <Icon className="w-4 h-4" style={{ color: 'var(--color-accent-gold)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-[var(--text)] truncate">{label}</div>
              <div className="text-[11px] text-[var(--muted)] truncate">{desc}</div>
            </div>
            <ArrowRight
              className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
              style={{ color: 'var(--muted)' }}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
