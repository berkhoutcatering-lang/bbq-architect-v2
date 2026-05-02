'use client';

import Link from 'next/link';
import { ChefHat, Sparkles, BarChart3, Camera, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import KeukenTabs from '@/components/KeukenTabs';

const HUB_CARDS = [
  {
    href: '/gerechten',
    icon: ChefHat,
    title: 'Gerechten & Menu\'s',
    desc: 'Vaste gerechten met receptuur en opgeslagen menu-templates voor offertes.',
    cta: 'Open gerechten',
  },
  {
    href: '/bedenker',
    icon: Sparkles,
    title: 'Bedenker',
    desc: 'AI-speeltuin om gerechten te brainstormen voordat ze op het menu komen.',
    cta: 'Start brainstorm',
  },
  {
    href: '/marges',
    icon: BarChart3,
    title: 'Marges',
    desc: 'BCG-analyse: marges en populariteit per gerecht — wat verdient écht?',
    cta: 'Open analyse',
  },
  {
    href: '/foto-archief',
    icon: Camera,
    title: 'Foto-archief',
    desc: 'Foto\'s van gerechten en events — bron voor offertes en social.',
    cta: 'Open archief',
  },
];

export default function KeukenHub() {
  return (
    <div className="main-content">
      <KeukenTabs />
      <PageHeader
        title="Keuken"
        description="Gerechten, recepten, AI-bedenker en marge-analyse. Kies een tab hierboven of een kaart hieronder."
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
