'use client';

import Link from 'next/link';
import { Calendar, PartyPopper, MessageSquare, ClipboardList, Bell, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PlannenTabs from '@/components/PlannenTabs';

const HUB_CARDS = [
  {
    href: '/agenda',
    icon: Calendar,
    title: 'Agenda',
    desc: 'Week- en maandweergave van al je events, prep-deadlines en team-rooster.',
    cta: 'Open agenda',
  },
  {
    href: '/events',
    icon: PartyPopper,
    title: 'Events',
    desc: 'Detail per event: gasten, menu, status, prep en service.',
    cta: 'Open events',
  },
  {
    href: '/klantgesprek',
    icon: MessageSquare,
    title: 'Klantgesprek',
    desc: 'Intake-gesprek voorbereiden — AI helpt je met de juiste vragen.',
    cta: 'Start gesprek',
  },
  {
    href: '/prep-counter',
    icon: ClipboardList,
    title: 'Prep Counter',
    desc: 'Mise-en-place planner met AI-volgorde en sticker-generator.',
    cta: 'Open prep',
  },
  {
    href: '/service',
    icon: Bell,
    title: 'Service',
    desc: 'Live service-runtime: gangen, taken, team-coördinatie tijdens event.',
    cta: 'Open service',
  },
];

export default function PlannenHub() {
  return (
    <div className="main-content">
      <PlannenTabs />
      <PageHeader
        title="Plannen"
        description="Alles voor het plannen, voorbereiden en runnen van events. Kies waar je heen wilt of klik op een tab hierboven."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        {HUB_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                padding: 20,
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'border-color 120ms ease, transform 120ms ease',
                minHeight: 160,
              }}
              className="hub-card"
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--brand-tint)',
                  color: 'var(--brand)',
                }}
              >
                <Icon size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{card.title}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{card.desc}</div>
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--brand)',
                }}
              >
                {card.cta}
                <ArrowRight size={14} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
