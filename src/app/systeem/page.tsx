'use client';

import Link from 'next/link';
import { Settings, Users, Inbox, Globe, HelpCircle, Building2, ArrowRight } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import PageHeader from '@/components/PageHeader';
import SysteemTabs from '@/components/SysteemTabs';

const HUB_CARDS = [
  {
    href: '/instellingen',
    icon: Settings,
    title: 'Instellingen',
    desc: 'Systeemconfiguratie, voorkeuren en koppelingen met externe diensten.',
    cta: 'Open instellingen',
  },
  {
    href: '/gebruikers',
    icon: Users,
    title: 'Gebruikers',
    desc: 'Team-leden, rollen en uitnodigingen — wie mag wat.',
    cta: 'Open gebruikers',
  },
  {
    href: '/mailbox',
    icon: Inbox,
    title: 'Mailbox',
    desc: 'E-mail, templates en klant-correspondentie centraal.',
    cta: 'Open mailbox',
  },
  {
    href: '/website',
    icon: Globe,
    title: 'Website',
    desc: 'Beheer je publieke website, content en lead-formulieren.',
    cta: 'Open website',
  },
  {
    href: '/hulp',
    icon: HelpCircle,
    title: 'Help Center',
    desc: 'Artikelen, FAQ en support tickets — voor jou en je team.',
    cta: 'Open hulp',
  },
  {
    href: '/admin',
    icon: Building2,
    title: 'Platform Beheer',
    desc: 'Organisaties en klanten beheren (alleen voor admins).',
    cta: 'Open admin',
  },
];

export default function SysteemHub() {
  return (
    <div className="main-content">
      <SysteemTabs />
      <PageHeader
        title="Systeem"
        description="Instellingen, gebruikers, mailbox, website en hulp — het bouwbord van de app."
      />

      <PageGuideNote
        id="systeem"
        accent="#64748b"
        icon={Settings}
        intro="Het bouwbord van de app — alles wat je 1× instelt en daarna nooit meer aanraakt staat hier."
        actions={[
          { lead: 'Instellingen', text: 'voor je bedrijfsgegevens, logo en huisstijl die overal terugkomen op offertes en facturen.' },
          { lead: 'Integraties', text: 'om Moneybird, Mollie en Google Calendar te koppelen — eenmalige autorisatie.' },
          { lead: 'Help Center', text: 'als je vastloopt — daar staan korte uitleg-artikelen per hub.' },
        ]}
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
