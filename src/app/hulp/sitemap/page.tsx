'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { navSections } from '@/lib/navigation';

interface SitemapRoute {
  href: string;
  label: string;
  desc: string;
  hub: string;
}

/* Deze lijst stond met de hand geschreven en liep achter: hij noemde
   /plannen (een redirect-stub), /gerechten?view=menus (een deur die dicht is)
   en kende zo'n dertig van de ruim tachtig pagina's. De sidebar wéét al welke
   pagina's er zijn, dus die is nu de bron — net als bij het kruimelpad. Wat
   bewust niet in de sidebar staat, staat hieronder als aanvulling. */
const UIT_NAVIGATIE: SitemapRoute[] = navSections.flatMap(function (sectie) {
  return sectie.children.map(function (kind) {
    return {
      href: kind.href,
      label: kind.label,
      desc: kind.description || '',
      hub: sectie.title,
    };
  });
});

/* Pagina's die met opzet niet in de sidebar staan: sub-pagina's, tweede
   deuren en beheerdersschermen. Zonder deze lijst zou de plattegrond juist
   de plekken missen die je moeilijk vindt. */
const EXTRA: SitemapRoute[] = [
  { href: '/', label: 'Vandaag', desc: 'Wat er vandaag speelt, in één lijst', hub: 'Vandaag' },
  { href: '/gerechten/menukaarten', label: 'Menukaarten', desc: 'Menu\u2019s samenstellen en bewaren als sjabloon', hub: 'Keuken' },
  { href: '/gerechten/uit-catalogus', label: 'Receptuur uit de groothandel', desc: 'Een gerecht bouwen uit producten van je leveranciers', hub: 'Keuken' },
  { href: '/gerechten/analyse', label: 'Analyse', desc: 'Populariteit tegen marge, en de kwaliteit van je data', hub: 'Keuken' },
  { href: '/recepten', label: 'Recepten', desc: 'Bereidingswijzen per gerecht', hub: 'Keuken' },
  { href: '/ai-chat', label: 'AI Pitmaster', desc: 'Meedenken over menu, techniek en timing', hub: 'Keuken' },
  { href: '/foto-archief', label: 'Foto-archief', desc: 'Je beeldmateriaal op één plek', hub: 'Keuken' },
  { href: '/prep-counter', label: 'Prep-counter', desc: 'Mise-en-place per dag voor het event', hub: 'Plannen' },
  { href: '/klantgesprek', label: 'Klantgesprek', desc: 'Intake bij een potenti\u00eble klant', hub: 'Plannen' },
  { href: '/haccp', label: 'HACCP', desc: 'Temperaturen en controles vastleggen', hub: 'Plannen' },
  { href: '/logistiek', label: 'Logistiek', desc: 'Checklists en veldmodus voor de eventdag', hub: 'Plannen' },
  { href: '/verkoop/leads', label: 'Aanvragen', desc: 'Binnenkomende aanvragen tot gewonnen offerte', hub: 'Verkoop' },
  { href: '/verkoop/arrangementen', label: 'Arrangementen', desc: 'Wat klanten zelf kunnen samenstellen', hub: 'Verkoop' },
  { href: '/leveranciers', label: 'Leveranciers', desc: 'Waar je producten en prijzen vandaan komen', hub: 'Inkoop & Voorraad' },
  { href: '/leveranciers/bulk-upload', label: 'Bulk prijslijsten', desc: 'Meerdere PDF-prijslijsten tegelijk inlezen', hub: 'Inkoop & Voorraad' },
  { href: '/voorraad/nulmeting', label: 'Keuken tellen', desc: 'Je keuken kast voor kast langs met de telefoon', hub: 'Inkoop & Voorraad' },
  { href: '/archief', label: 'Bonnenkistje', desc: 'Elke bon terugvinden, tot op het woord', hub: 'Inkoop & Voorraad' },
  { href: '/bonnen', label: 'Bonnen scannen', desc: 'Foto of PDF van een bon uitlezen', hub: 'Inkoop & Voorraad' },
  { href: '/geld/boekhouder', label: 'Boekhouder', desc: 'RGS-categorisering en het maandpakket', hub: 'Geld' },
  { href: '/administratie/rittenregistratie', label: 'Rittenregistratie', desc: 'Kilometeradministratie voor de belasting', hub: 'Geld' },
  { href: '/template-editor', label: 'Template-editor', desc: 'Je eigen opmaak voor facturen, offertes en menukaarten', hub: 'Systeem' },
  { href: '/instellingen/integraties', label: 'Integraties', desc: 'Koppelingen met Moneybird, Mollie en agenda', hub: 'Systeem' },
  { href: '/instellingen/ai-usage', label: 'AI-gebruik en kosten', desc: 'Wat AI je deze maand kost', hub: 'Systeem' },
  { href: '/instellingen/data-export', label: 'Data & privacy', desc: 'Je data exporteren of verwijderen', hub: 'Systeem' },
  { href: '/instellingen/referral', label: 'Referral-programma', desc: 'Een collega-cateraar verwijzen', hub: 'Systeem' },
  { href: '/hulp', label: 'Hulp', desc: 'Antwoorden en contact', hub: 'Systeem' },
];

/* Op href ontdubbelen: staat een pagina in de sidebar, dan wint die tekst. */
const ROUTES: SitemapRoute[] = (function () {
  const perHref = new Map<string, SitemapRoute>();
  for (const r of [...UIT_NAVIGATIE, ...EXTRA]) {
    if (!perHref.has(r.href)) perHref.set(r.href, r);
  }
  return [...perHref.values()];
})();

/* Volgorde uit de sidebar zelf; "Voorraad" en "Power" stonden hier nog terwijl
   die hubs inmiddels "Inkoop & Voorraad" en "Team & Operatie" heten. */
const HUB_ORDER = ['Vandaag', ...navSections.map(function (s) { return s.title; })];

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
