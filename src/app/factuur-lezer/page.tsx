'use client';

import Link from 'next/link';
import { ScanLine, Image as ImageIcon, ShoppingCart, Receipt, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const HUB_CARDS = [
  {
    href: '/inkoop',
    icon: ScanLine,
    title: 'Bon of factuur scannen',
    desc: 'Upload een PDF of foto van een Makro-bon, leveranciersfactuur of inkoopbon. AI extracteert de regels en koppelt aan voorraad.',
    cta: 'Open scanner',
  },
  {
    href: '/foto-archief',
    icon: ImageIcon,
    title: 'Archief',
    desc: 'Alle gescande bonnen, facturen en foto\'s terugvinden — gefilterd op categorie, leverancier of event.',
    cta: 'Open archief',
  },
  {
    href: '/price-intelligence',
    icon: Receipt,
    title: 'Prijsanalyse',
    desc: 'Trends in inkoopprijzen per ingrediënt en leverancier — pak je dure pieken vroeg.',
    cta: 'Open analyse',
  },
];

export default function FactuurLezerHub() {
  return (
    <div className="main-content">
      <PageHeader
        title="Factuur-lezer"
        description="Bon of factuur binnen? Hier komt alles op één plek — scannen, archiveren, prijsanalyse."
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
