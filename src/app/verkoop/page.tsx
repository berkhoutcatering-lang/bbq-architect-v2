'use client';

import Link from 'next/link';
import { FileText, Receipt, Users, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import VerkoopTabs from '@/components/VerkoopTabs';

const HUB_CARDS = [
  {
    href: '/offertes',
    icon: FileText,
    title: 'Offertes',
    desc: 'AI-wizard om offertes te maken en de pipeline van wachtende klanten.',
    cta: 'Open offertes',
  },
  {
    href: '/facturen',
    icon: Receipt,
    title: 'Facturen',
    desc: 'Stuur en volg facturen — gekoppeld aan Mollie iDEAL en Moneybird.',
    cta: 'Open facturen',
  },
  {
    href: '/klanten',
    icon: Users,
    title: 'Klanten',
    desc: 'Klantbeheer, contactgegevens en historie van eerdere events.',
    cta: 'Open klanten',
  },
];

export default function VerkoopHub() {
  return (
    <div className="main-content">
      <VerkoopTabs />
      <PageHeader
        title="Verkoop"
        description="Offertes, facturen en klanten — de hele klant-flow van eerste mail tot betaalde factuur."
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
