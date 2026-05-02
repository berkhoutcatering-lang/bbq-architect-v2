'use client';

import Link from 'next/link';
import { BarChart3, Clock, Users, Package, ShoppingCart, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const HUB_CARDS = [
  {
    href: '/financien',
    icon: BarChart3,
    title: 'Financiën',
    desc: 'Dashboard, winst & verlies, uitgaven, BTW en top-klanten in één canvas.',
    cta: 'Open financiën',
  },
  {
    href: '/uren',
    icon: Clock,
    title: 'Uren',
    desc: 'Urenregistratie van team-leden per event — start/stop en weekoverzicht.',
    cta: 'Open uren',
  },
  {
    href: '/klanten',
    icon: Users,
    title: 'Klanten',
    desc: 'Klantenbestand en historie van eerdere events, offertes en facturen.',
    cta: 'Open klanten',
  },
  {
    href: '/voorraad',
    icon: Package,
    title: 'Voorraad',
    desc: 'Huidige voorraadstand, par-levels en reorder-warnings.',
    cta: 'Open voorraad',
  },
  {
    href: '/inkoop',
    icon: ShoppingCart,
    title: 'Inkooplijsten',
    desc: 'Bestellijsten, leveranciers en open bestelling-statussen.',
    cta: 'Open inkoop',
  },
];

export default function AdministratieHub() {
  return (
    <div className="main-content">
      <PageHeader
        title="Administratie"
        description="Alles wat papierwerk is — financiën, uren, klanten, voorraad en inkoop op één plek."
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
