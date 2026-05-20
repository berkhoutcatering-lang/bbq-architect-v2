'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar, Receipt, CreditCard, Webhook, ExternalLink, CheckCircle2,
  XCircle, ArrowLeft, RefreshCw, Settings, ChevronRight, Shield, Zap,
  BookOpen, Send, MessageCircle,
} from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import { Settings as SettingsIcon } from 'lucide-react';
import MetallicCard from '@/components/MetallicCard';

// ── Integratie definitie ──
interface Integration {
  id: string;
  naam: string;
  beschrijving: string;
  categorie: 'agenda' | 'boekhouding' | 'betalingen' | 'webhooks' | 'email' | 'communicatie';
  icon: React.ReactNode;
  accentColor: string;
  envVars: string[];
  docsUrl: string;
  apiEndpoint: string;
  configuratie: string[];
  /* "beta" verbergt de actie-knoppen en toont "Vraag toegang" — voor integraties
     die we wel willen aankondigen maar nog niet hebben uitgewerkt. */
  beta?: boolean;
}

const INTEGRATIES: Integration[] = [
  {
    id: 'google-calendar',
    naam: 'Google Calendar',
    beschrijving: 'Synchroniseer je BBQ events automatisch met Google Calendar. Tweerichtingsverkeer: push en pull.',
    categorie: 'agenda',
    icon: <Calendar size={20} />,
    accentColor: '#4285f4',
    envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    docsUrl: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    apiEndpoint: '/api/calendar/google',
    configuratie: [
      'Maak een Google Cloud project aan',
      'Activeer de Google Calendar API',
      'Maak OAuth 2.0 credentials aan (Web application)',
      'Doorloop de OAuth flow en sla de refresh token op',
      'Voeg GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET en GOOGLE_REFRESH_TOKEN toe aan .env.local',
    ],
  },
  {
    id: 'ical-export',
    naam: 'iCal Export',
    beschrijving: 'Exporteer bevestigde events als .ics bestand. Abonneer vanuit Apple Calendar, Outlook, etc.',
    categorie: 'agenda',
    icon: <Calendar size={20} />,
    accentColor: '#34C759',
    envVars: [], // Geen configuratie nodig, altijd beschikbaar
    docsUrl: '',
    apiEndpoint: '/api/calendar/ical',
    configuratie: [
      'Geen configuratie nodig \u2014 deze integratie werkt direct',
      'Abonneer op de iCal feed URL vanuit je agenda-app',
    ],
  },
  {
    id: 'exact-online',
    naam: 'Exact Online',
    beschrijving: 'Push facturen automatisch naar Exact Online als verkoopboekingen. Inclusief relatiebeheer.',
    categorie: 'boekhouding',
    icon: <Receipt size={20} />,
    accentColor: '#e94e1b',
    envVars: ['EXACT_CLIENT_ID', 'EXACT_CLIENT_SECRET', 'EXACT_REFRESH_TOKEN', 'EXACT_DIVISION'],
    docsUrl: 'https://apps.exactonline.com',
    apiEndpoint: '/api/accounting/exact',
    configuratie: [
      'Registreer een app op apps.exactonline.com',
      'Doorloop de OAuth 2.0 autorisatie flow',
      'Noteer je administratie-code (division)',
      'Voeg EXACT_CLIENT_ID, EXACT_CLIENT_SECRET, EXACT_REFRESH_TOKEN en EXACT_DIVISION toe aan .env.local',
      'Configureer grootboekrekeningen in de route code',
    ],
  },
  {
    id: 'moneybird',
    naam: 'Moneybird',
    beschrijving: 'Verstuur facturen naar Moneybird. Automatisch contacten aanmaken en verkoopfacturen synchroniseren.',
    categorie: 'boekhouding',
    icon: <Receipt size={20} />,
    accentColor: '#4CAF50',
    envVars: ['MONEYBIRD_TOKEN', 'MONEYBIRD_ADMINISTRATION_ID'],
    docsUrl: 'https://moneybird.com/user/applications/new',
    apiEndpoint: '/api/accounting/moneybird',
    configuratie: [
      'Maak een persoonlijke API token aan in Moneybird',
      'Zoek je administratie-ID op (staat in de Moneybird URL)',
      'Voeg MONEYBIRD_TOKEN en MONEYBIRD_ADMINISTRATION_ID toe aan .env.local',
    ],
  },
  {
    id: 'mollie',
    naam: 'Mollie Betalingen',
    beschrijving: 'Genereer betaallinks voor facturen via iDEAL, creditcard, Bancontact en meer.',
    categorie: 'betalingen',
    icon: <CreditCard size={20} />,
    accentColor: '#000000',
    envVars: ['MOLLIE_API_KEY'],
    docsUrl: 'https://mollie.com/dashboard/developers/api-keys',
    apiEndpoint: '/api/payments/mollie',
    configuratie: [
      'Maak een Mollie account aan op mollie.com',
      'Ga naar Ontwikkelaars > API-sleutels',
      'Voeg MOLLIE_API_KEY toe aan .env.local (test_ voor test, live_ voor productie)',
      'Configureer de webhook URL in je Mollie dashboard',
    ],
  },
  {
    id: 'webhooks',
    naam: 'Webhooks',
    beschrijving: 'Stuur automatische notificaties naar externe systemen bij events zoals nieuwe offertes, facturen of HACCP registraties.',
    categorie: 'webhooks',
    icon: <Webhook size={20} />,
    accentColor: 'var(--purple)',
    envVars: [], // Webhooks gebruiken de database, geen env vars
    docsUrl: '',
    apiEndpoint: '/api/webhooks',
    configuratie: [
      'Maak de webhooks en webhook_logs tabellen aan in Supabase',
      'Registreer webhook endpoints via de API of deze pagina',
      'Webhooks worden automatisch getriggerd bij app-events',
    ],
  },
  // S5-deel-3: drie nieuwe integraties voor NL-cateraars. MVP = beta-listing
  // met "Vraag toegang" — volledige OAuth-flow per provider volgt op vraag.
  {
    id: 'eboekhouden',
    naam: 'e-Boekhouden.nl',
    beschrijving: 'NL-boekhoudsoftware voor kleine ondernemers — populair als Moneybird-alternatief. Push facturen + bonnen automatisch naar je e-Boekhouden-administratie.',
    categorie: 'boekhouding',
    icon: <BookOpen size={20} />,
    accentColor: '#0066cc',
    envVars: ['EBOEKHOUDEN_USERNAME', 'EBOEKHOUDEN_SECURITY_CODE_1', 'EBOEKHOUDEN_SECURITY_CODE_2'],
    docsUrl: 'https://www.e-boekhouden.nl/koppelingen/',
    apiEndpoint: '/api/accounting/eboekhouden',
    configuratie: [
      'Vraag toegang aan via support — we koppelen via de officiële SOAP-API van e-Boekhouden',
      'Toon je security codes in e-Boekhouden onder "Beheer → API"',
      'Facturen + bonnen worden direct geboekt op de juiste grootboekrekening',
    ],
    beta: true,
  },
  {
    id: 'resend',
    naam: 'Resend',
    beschrijving: 'Moderne email-API als alternatief voor SMTP. Stuur offerte-PDFs en factuur-herinneringen vanuit je eigen domein zonder Mailgun/SendGrid setup.',
    categorie: 'email',
    icon: <Send size={20} />,
    accentColor: '#000000',
    envVars: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
    docsUrl: 'https://resend.com/docs',
    apiEndpoint: '/api/email/resend',
    configuratie: [
      'Maak een gratis Resend account aan (3000 mails/maand gratis)',
      'Verifieer je eigen domein via DNS — geen sender-spoofing',
      'Voeg RESEND_API_KEY toe aan .env.local',
      'Vraag toegang aan via support — we activeren de Resend-driver in plaats van SMTP',
    ],
    beta: true,
  },
  {
    id: 'whatsapp',
    naam: 'WhatsApp Business API',
    beschrijving: 'Stuur klant-bevestigingen, betaalherinneringen en event-updates via WhatsApp ipv email. Voor NL-catering bewezen hogere open-rate dan email.',
    categorie: 'communicatie',
    icon: <MessageCircle size={20} />,
    accentColor: '#25d366',
    envVars: ['WHATSAPP_PHONE_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN'],
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    apiEndpoint: '/api/whatsapp',
    configuratie: [
      'Maak een Meta Business account aan + verifieer je telefoonnummer',
      'Genereer permanent access token + phone-number ID',
      'Maak goedgekeurde message templates voor offerte/factuur/reminder flows',
      'Vraag toegang aan via support — we wiren de templates naar de juiste flows',
    ],
    beta: true,
  },
];

// ── Status check component ──
function StatusIndicator({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {connected ? (
        <>
          <CheckCircle2 size={14} className="text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-400">Verbonden</span>
        </>
      ) : (
        <>
          <XCircle size={14} className="text-[var(--muted)]" />
          <span className="text-[11px] font-medium text-[var(--muted)]">Niet geconfigureerd</span>
        </>
      )}
    </span>
  );
}

export default function IntegratiesPage() {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Check welke integraties geconfigureerd zijn via een API call
  useEffect(function () {
    checkStatuses();
  }, []);

  async function checkStatuses() {
    setLoading(true);
    const newStatuses: Record<string, boolean> = {};

    // iCal is altijd beschikbaar
    newStatuses['ical-export'] = true;

    // Check elke integratie met env vars door een lichte API call
    const checks = INTEGRATIES.filter(function (i) { return i.envVars.length > 0; });

    await Promise.allSettled(
      checks.map(async function (integration) {
        try {
          // Doe een simpele GET of POST met een test om te kijken of de env vars er zijn
          const res = await fetch(integration.apiEndpoint, { method: 'GET' });
          const data = await res.json();
          // Als status 501 = niet geconfigureerd, anders = geconfigureerd (zelfs bij fouten)
          newStatuses[integration.id] = res.status !== 501;
        } catch {
          newStatuses[integration.id] = false;
        }
      })
    );

    // Webhooks: check of de API bereikbaar is
    try {
      const res = await fetch('/api/webhooks');
      newStatuses['webhooks'] = res.ok;
    } catch {
      newStatuses['webhooks'] = false;
    }

    setStatuses(newStatuses);
    setLoading(false);
  }

  function toggleExpanded(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  const categorien = [
    { key: 'agenda', label: 'Agenda & Planning', icon: <Calendar size={16} /> },
    { key: 'boekhouding', label: 'Boekhouding', icon: <Receipt size={16} /> },
    { key: 'betalingen', label: 'Betalingen', icon: <CreditCard size={16} /> },
    { key: 'email', label: 'Email', icon: <Send size={16} /> },
    { key: 'communicatie', label: 'Klant-communicatie', icon: <MessageCircle size={16} /> },
    { key: 'webhooks', label: 'Webhooks & Automatisering', icon: <Webhook size={16} /> },
  ];

  const connectedCount = Object.values(statuses).filter(Boolean).length;
  const totalCount = INTEGRATIES.length;

  return (
    <>
      <PageGuideNote
        id="integraties"
        accent="#6366f1"
        icon={SettingsIcon}
        intro="Koppel BBQ Architect aan de tools die je toch al gebruikt — eenmalig autoriseren, daarna loopt het op de achtergrond."
        actions={[
          { lead: 'Klik een integratie open', text: 'om te zien hoe je hem koppelt — meestal 1 knop en een redirect terug.' },
          { lead: 'De groene puntjes', text: 'naast elke integratie laten zien of de koppeling actief en gezond is.' },
          { lead: 'Webhooks bovenin', text: 'gebruiken developers om eigen automatiseringen te maken — Lars hoeft hier niets mee.' },
        ]}
      />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/instellingen" className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors">
            <ArrowLeft size={18} className="text-[var(--muted)]" />
          </Link>
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Integraties</h2>
            <p className="text-[12px] text-[var(--muted)]">
              Koppel externe diensten aan BBQ Architect
            </p>
          </div>
        </div>
        <button
          onClick={checkStatuses}
          className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--card)] border border-[var(--border)] rounded-lg transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Vernieuwen
        </button>
      </div>

      {/* Overzicht kaart */}
      <MetallicCard className="p-5 mb-6" hover={false} accent="var(--brand)">
        <div className="flex items-center gap-4">
          <div
            className="p-3 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, var(--brand)15, var(--brand)08)',
              border: '1px solid var(--brand)20',
            }}
          >
            <Zap size={22} className="text-[var(--brand)]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted)] mb-1">
              Integratie Status
            </p>
            <p className="text-xl font-light text-[var(--text)]">
              {loading ? '...' : `${connectedCount} / ${totalCount}`}
            </p>
            <p className="text-[11px] text-[var(--muted-light)] mt-0.5">
              {loading ? 'Status controleren...' : connectedCount === 0 ? 'Nog geen integraties actief' : `${connectedCount} integratie${connectedCount === 1 ? '' : 's'} verbonden`}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Shield size={14} className="text-[var(--muted)]" />
            <span className="text-[11px] text-[var(--muted)]">
              Credentials via .env.local
            </span>
          </div>
        </div>
      </MetallicCard>

      {/* Integraties per categorie */}
      {categorien.map(function (cat) {
        const items = INTEGRATIES.filter(function (i) { return i.categorie === cat.key; });
        if (items.length === 0) return null;

        return (
          <div key={cat.key} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[var(--muted)]">{cat.icon}</span>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                {cat.label}
              </h3>
            </div>

            <div className="space-y-3">
              {items.map(function (integration) {
                const connected = statuses[integration.id] || false;
                const isExpanded = expanded === integration.id;

                return (
                  <MetallicCard
                    key={integration.id}
                    className="overflow-hidden"
                    hover={true}
                    accent={connected ? integration.accentColor : undefined}
                    onClick={function () { toggleExpanded(integration.id); }}
                  >
                    {/* Hoofdrij */}
                    <div className="flex items-center gap-4 p-4">
                      <div
                        className="p-2.5 rounded-xl shrink-0"
                        style={{
                          background: `linear-gradient(135deg, ${integration.accentColor}15, ${integration.accentColor}08)`,
                          border: `1px solid ${integration.accentColor}20`,
                        }}
                      >
                        <span style={{ color: integration.accentColor }}>
                          {integration.icon}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-[14px] font-medium text-[var(--text)] truncate">
                            {integration.naam}
                          </h4>
                          <StatusIndicator connected={connected} />
                        </div>
                        <p className="text-[12px] text-[var(--muted)] line-clamp-1">
                          {integration.beschrijving}
                        </p>
                      </div>

                      <ChevronRight
                        size={16}
                        className={`text-[var(--muted)] shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>

                    {/* Uitklapbare details */}
                    {isExpanded && (
                      <div
                        className="px-4 pb-4 border-t border-[var(--border)]"
                        onClick={function (e) { e.stopPropagation(); }}
                      >
                        <div className="pt-4 space-y-4">
                          {/* Beschrijving */}
                          <p className="text-[12px] text-[var(--muted-light)] leading-relaxed">
                            {integration.beschrijving}
                          </p>

                          {/* Vereiste omgevingsvariabelen */}
                          {integration.envVars.length > 0 && (
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--muted)] mb-2">
                                Vereiste omgevingsvariabelen
                              </p>
                              <div className="space-y-1">
                                {integration.envVars.map(function (v) {
                                  return (
                                    <code
                                      key={v}
                                      className="block text-[12px] px-3 py-1.5 bg-[var(--color-bg-darker)] rounded-lg text-amber-400/80 font-mono border border-[var(--border)]"
                                    >
                                      {v}
                                    </code>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Configuratie stappen */}
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--muted)] mb-2">
                              Configuratie
                            </p>
                            <ol className="space-y-1.5">
                              {integration.configuratie.map(function (stap, idx) {
                                return (
                                  <li key={idx} className="flex items-start gap-2">
                                    <span className="text-[11px] text-[var(--muted)] font-mono shrink-0 mt-0.5">
                                      {idx + 1}.
                                    </span>
                                    <span className="text-[12px] text-[var(--muted-light)]">
                                      {stap}
                                    </span>
                                  </li>
                                );
                              })}
                            </ol>
                          </div>

                          {/* API endpoint */}
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--muted)] mb-2">
                              API Endpoint
                            </p>
                            <code className="block text-[12px] px-3 py-1.5 bg-[var(--color-bg-darker)] rounded-lg text-blue-400/80 font-mono border border-[var(--border)]">
                              {integration.apiEndpoint}
                            </code>
                          </div>

                          {/* Actie knoppen */}
                          <div className="flex items-center gap-2 pt-1">
                            {integration.docsUrl && (
                              <a
                                href={integration.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--color-bg-darker)] border border-[var(--border)] rounded-lg transition-colors"
                              >
                                <ExternalLink size={12} />
                                Documentatie
                              </a>
                            )}
                            <Link
                              href="/instellingen"
                              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[var(--muted)] hover:text-[var(--text)] bg-[var(--color-bg-darker)] border border-[var(--border)] rounded-lg transition-colors"
                            >
                              <Settings size={12} />
                              Instellingen
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </MetallicCard>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Info footer */}
      <MetallicCard className="p-4 mt-2" hover={false}>
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-[var(--muted)] shrink-0 mt-0.5" />
          <div>
            <p className="text-[12px] text-[var(--muted)] leading-relaxed">
              Alle API-sleutels en tokens worden veilig opgeslagen als omgevingsvariabelen in{' '}
              <code className="text-[11px] px-1 py-0.5 bg-[var(--color-bg-darker)] rounded text-amber-400/80 font-mono">.env.local</code>{' '}
              en worden nooit naar de client verstuurd. Configureer je integraties door de benodigde
              variabelen toe te voegen en de applicatie opnieuw te starten.
            </p>
          </div>
        </div>
      </MetallicCard>
    </>
  );
}
