'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

interface SitemapRoute {
  href: string;
  label: string;
  desc: string;
  hub: string;
}

const ROUTES: SitemapRoute[] = [
  // Vandaag (Dashboard)
  { href: '/', label: 'Dashboard', desc: 'Vandaag — wat speelt er nu', hub: 'Vandaag' },

  // Plannen
  { href: '/plannen', label: 'Plannen-hub', desc: 'Welkomstcanvas voor alle planning-functies', hub: 'Plannen' },
  { href: '/agenda', label: 'Agenda', desc: 'Week- en maandweergave van events + prep', hub: 'Plannen' },
  { href: '/events', label: 'Events', desc: 'Lijst en detail van alle events', hub: 'Plannen' },
  { href: '/klantgesprek', label: 'Klantgesprek', desc: 'Intake-gesprek met AI-ondersteuning', hub: 'Plannen' },
  { href: '/prep-counter', label: 'Prep Counter', desc: 'Mise-en-place planner met sticker-gen', hub: 'Plannen' },

  // Verkoop
  { href: '/offertes', label: 'Offertes', desc: 'Offerte-overzicht + AI-wizard', hub: 'Verkoop' },
  { href: '/facturen', label: 'Facturen', desc: 'Facturen en betalingen', hub: 'Verkoop' },
  { href: '/klanten', label: 'Klanten', desc: 'Klantbeheer en contact', hub: 'Verkoop' },

  // Keuken
  { href: '/gerechten', label: 'Gerechten', desc: 'Catalog: gerechten met kostprijzen', hub: 'Keuken' },
  { href: '/marges', label: 'Marges & analyse', desc: 'BCG-matrix op marges en populariteit', hub: 'Keuken' },
  { href: '/gerechten?view=menus', label: 'Menu\u2019s', desc: 'Opgeslagen menu-templates voor offertes', hub: 'Keuken' },
  { href: '/ai-chat', label: 'AI Pitmaster', desc: 'AI-chat voor brainstorm en Q&A', hub: 'Keuken' },
  { href: '/foto-archief', label: 'Foto-archief', desc: 'Beheer fotos en media', hub: 'Keuken' },

  // Voorraad / Beheer
  { href: '/voorraad', label: 'Voorraad', desc: 'Huidige voorraad en tracking', hub: 'Voorraad' },
  { href: '/inkoop', label: 'Inkoop', desc: 'Inkooporders en leveranciers', hub: 'Voorraad' },
  { href: '/logistiek', label: 'Logistiek', desc: 'Transportplanning en bezorging', hub: 'Voorraad' },
  { href: '/materieel', label: 'Materieel', desc: 'Smoker, pannen, equipment', hub: 'Voorraad' },
  { href: '/price-intelligence', label: 'Inkoopprijzen', desc: 'Email-prijslijsten, facturen en bonnen', hub: 'Voorraad' },

  // Geld
  { href: '/financien', label: 'Financiën', desc: 'Dashboard, W&V, uitgaven, BTW, top klanten (5 tabs)', hub: 'Geld' },
  { href: '/uren', label: 'Uren', desc: 'Urenregistratie en planning', hub: 'Geld' },
  { href: '/haccp', label: 'HACCP', desc: 'Voedselveiligheid en kwaliteitscontrole', hub: 'Geld' },

  // Systeem
  { href: '/instellingen', label: 'Instellingen', desc: 'Systeemconfiguratie en voorkeuren', hub: 'Systeem' },
  { href: '/instellingen/integraties', label: 'Integraties', desc: 'Koppelingen met externe diensten', hub: 'Systeem' },
  { href: '/instellingen/data-export', label: 'Data export', desc: 'Exporteer je data', hub: 'Systeem' },
  { href: '/instellingen/referral', label: 'Referral', desc: 'Verwijs vrienden naar BBQ Architect', hub: 'Systeem' },
  { href: '/gebruikers', label: 'Gebruikers', desc: 'Gebruikersbeheer en rollen', hub: 'Systeem' },
  { href: '/mailbox', label: 'Mailbox', desc: 'E-mail, templates, klant-correspondentie', hub: 'Systeem' },
  { href: '/website', label: 'Website', desc: 'Beheer je website content', hub: 'Systeem' },
  { href: '/hulp', label: 'Help Center', desc: 'Artikelen, FAQ en support tickets', hub: 'Systeem' },
  { href: '/admin', label: 'Platform Beheer', desc: 'Organisaties en klanten beheren (admin-only)', hub: 'Systeem' },
  { href: '/admin/funnel', label: 'Admin Funnel', desc: 'Funnel-analytics (admin-only)', hub: 'Systeem' },

  // Power-features (verstopt)
  { href: '/offertes', label: 'Margin Doctor', desc: 'Marge-analyse per offerte (open offerte → tab)', hub: 'Power' },
];

const HUB_ORDER = ['Vandaag', 'Plannen', 'Verkoop', 'Keuken', 'Voorraad', 'Geld', 'Systeem', 'Power'];

export default function SitemapPage() {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROUTES;
    return ROUTES.filter(
      (r) => r.label.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.href.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map: Record<string, SitemapRoute[]> = {};
    filtered.forEach((r) => {
      if (!map[r.hub]) map[r.hub] = [];
      map[r.hub].push(r);
    });
    return map;
  }, [filtered]);

  return (
    <div className="mobile-safe-bottom" style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Sitemap"
        description="Alle pagina's, gegroepeerd per hub. Gebruik ⌘K voor sneltoetsen."
      />

      <div
        style={{
          position: 'relative',
          margin: '20px 0 28px',
        }}
      >
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--muted)',
            pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          placeholder="Zoek een pagina, functie of pad…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Zoek pagina"
          style={{
            width: '100%',
            padding: '12px 16px 12px 40px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--muted)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          Geen resultaten voor &ldquo;{query}&rdquo;.
        </div>
      ) : (
        HUB_ORDER.filter((h) => grouped[h]?.length).map((hub) => (
          <section key={hub} style={{ marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              {hub}
              <span
                style={{
                  marginLeft: 8,
                  fontWeight: 500,
                  fontSize: 11,
                  color: 'var(--muted)',
                  letterSpacing: 0,
                  textTransform: 'none',
                }}
              >
                · {grouped[hub].length}
              </span>
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 8,
              }}
            >
              {grouped[hub].map((r) => (
                <Link
                  key={`${r.hub}-${r.href}-${r.label}`}
                  href={r.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '14px 16px',
                    minHeight: 48,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.href} · {r.desc}
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
