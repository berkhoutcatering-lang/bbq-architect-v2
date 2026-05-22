// Sprint 2 C7 — Integration manifest.
// Single source of truth voor de integraties-marketplace pagina.
// Per integratie: meta (id/naam/categorie/tier/icon) + setup-config (type, env-keys,
// OAuth-URL, test-endpoint, docs) + wizard-step-content.

import type { ReactNode } from 'react';

export type IntegrationCategory =
  | 'boekhouding'
  | 'communicatie'
  | 'betalingen'
  | 'data'
  | 'compliance';

export type IntegrationTier = 'all' | 'pro' | 'enterprise' | 'binnenkort';

export type SetupType = 'oauth' | 'env' | 'webhook' | 'none';

export interface WizardStep {
  title: string;
  body: string;       // Markdown-vrije prose (≤ 200 chars)
  list?: string[];    // Optionele bulletpoints
}

export interface IntegrationManifest {
  id: string;
  name: string;
  category: IntegrationCategory;
  tier: IntegrationTier;
  /** Render gebeurt in IntegrationCard — pak een Lucide-icoon (geen JSX hier, want server-component compatible). */
  iconKey: string;
  accentColor: string;
  shortDescription: string;
  setup: {
    type: SetupType;
    envKeys?: string[];           // Env-vars die gecheckt worden voor "Aangesloten"-status
    oauthStartUrl?: string;       // OAuth-flow startpunt
    statusEndpoint?: string;      // GET endpoint die {configured: bool} returnt
    testEndpoint?: string;        // POST endpoint die een test-call doet
    docsUrl?: string;
  };
  wizardSteps: WizardStep[];
}

export const INTEGRATIONS_MANIFEST: IntegrationManifest[] = [
  {
    id: 'moneybird',
    name: 'Moneybird',
    category: 'boekhouding',
    tier: 'all',
    iconKey: 'receipt',
    accentColor: '#4CAF50',
    shortDescription: 'Push facturen naar Moneybird; contacten en verkoopfacturen synchroniseren.',
    setup: {
      type: 'env',
      envKeys: ['MONEYBIRD_TOKEN', 'MONEYBIRD_ADMINISTRATION_ID'],
      statusEndpoint: '/api/integrations/moneybird/status',
      docsUrl: 'https://moneybird.com/user/applications/new',
    },
    wizardSteps: [
      {
        title: 'Wat doet Moneybird?',
        body: 'Stuurt automatisch elke geaccepteerde offerte als verkoopfactuur naar Moneybird. Klantgegevens worden gematcht of nieuw aangemaakt.',
        list: ['Verkoopfactuur per offerte-accept', 'Contact-sync per klant', 'BTW-categorisatie volgt jouw Moneybird-config'],
      },
      {
        title: 'Verbind je administratie',
        body: 'Maak een persoonlijke API token in Moneybird en kopieer je administratie-ID (staat in de Moneybird URL).',
        list: ['MONEYBIRD_TOKEN', 'MONEYBIRD_ADMINISTRATION_ID'],
      },
      {
        title: 'Test de koppeling',
        body: 'Klik "Test" om een ping naar Moneybird te sturen — de eerste factuur wordt vanzelf bij de eerstvolgende offerte-accept verstuurd.',
      },
    ],
  },
  {
    id: 'exact-online',
    name: 'Exact Online',
    category: 'boekhouding',
    tier: 'pro',
    iconKey: 'receipt',
    accentColor: '#e94e1b',
    shortDescription: 'Push facturen naar Exact Online als verkoopboekingen, inclusief relatiebeheer.',
    setup: {
      type: 'oauth',
      envKeys: ['EXACT_CLIENT_ID', 'EXACT_CLIENT_SECRET', 'EXACT_REFRESH_TOKEN', 'EXACT_DIVISION'],
      statusEndpoint: '/api/integrations/exact-online/status',
      docsUrl: 'https://apps.exactonline.com',
    },
    wizardSteps: [
      {
        title: 'Wat doet Exact Online?',
        body: 'Boekt elke factuur als verkoopboeking in jouw administratie. Aanbevolen voor caterers met een externe boekhouder die Exact gebruikt.',
      },
      {
        title: 'Verbind je administratie',
        body: 'Registreer een app op apps.exactonline.com en doorloop de OAuth-flow. Noteer je administratie-code (division).',
      },
      {
        title: 'Test de koppeling',
        body: 'Test-call stuurt een ping-request — de eerste echte boeking gebeurt automatisch bij de eerstvolgende factuur.',
      },
    ],
  },
  {
    id: 'mollie',
    name: 'Mollie Betalingen',
    category: 'betalingen',
    tier: 'all',
    iconKey: 'credit-card',
    accentColor: '#000000',
    shortDescription: 'Betaallinks via iDEAL, creditcard, Bancontact. Aanbetalingen direct geregeld.',
    setup: {
      type: 'env',
      envKeys: ['MOLLIE_API_KEY'],
      statusEndpoint: '/api/integrations/mollie/status',
      docsUrl: 'https://mollie.com/dashboard/developers/api-keys',
    },
    wizardSteps: [
      {
        title: 'Wat doet Mollie?',
        body: 'Bij elke geaccepteerde offerte krijgt je klant direct een iDEAL betaallink voor de aanbetaling. Werkt ook voor restbetalingen.',
      },
      {
        title: 'Verbind je Mollie account',
        body: 'Maak een API-sleutel in mollie.com (Ontwikkelaars > API-sleutels). test_ voor test, live_ voor productie.',
        list: ['MOLLIE_API_KEY'],
      },
      {
        title: 'Test de koppeling',
        body: 'Webhook URL wordt automatisch geregistreerd. Test-betaling van €0,01 om de flow te valideren.',
      },
    ],
  },
  {
    id: 'kvk-search',
    name: 'KvK Search',
    category: 'data',
    tier: 'all',
    iconKey: 'building',
    accentColor: '#003e6b',
    shortDescription: 'Autofill bedrijfsgegevens op KvK-nummer of bedrijfsnaam. Spaart 6 typvelden per klant.',
    setup: {
      type: 'env',
      envKeys: ['KVK_API_KEY'],
      statusEndpoint: '/api/integrations/kvk-search/status',
      testEndpoint: '/api/kvk-search',
      docsUrl: 'https://developers.kvk.nl/',
    },
    wizardSteps: [
      {
        title: 'Wat doet KvK Search?',
        body: 'Bij elke nieuwe klant: tik het KvK-nummer of de bedrijfsnaam, kies uit suggesties, en de velden vullen zichzelf — adres, postcode, BTW, vestigingsplaats.',
        list: ['Werkt in /klanten en in de bedrijfsgegevens van /instellingen', 'Fallback op OpenKvK als KVK_API_KEY ontbreekt (gratis, beperkter)'],
      },
      {
        title: 'Optioneel: officiële KvK API',
        body: 'Zonder API-key gebruikt BBQ Architect OpenKvK (gratis, open data). Voor compleetheid + actualiteit kan je een KvK Developer-account aanvragen — ~€0.30 per lookup.',
        list: ['KVK_API_KEY (optioneel, valt anders terug op OpenKvK)'],
      },
      {
        title: 'Test de koppeling',
        body: 'Klik "Test" om te zoeken naar "hopbites" — je zou Hop & Bites Catering moeten zien verschijnen.',
      },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    category: 'communicatie',
    tier: 'all',
    iconKey: 'mail',
    accentColor: '#000000',
    shortDescription: 'Transactional email: offerte-PDF, factuur, contact en boekhouder-pakketten.',
    setup: {
      type: 'env',
      envKeys: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
      statusEndpoint: '/api/integrations/resend/status',
      testEndpoint: '/api/integrations/resend/test-mail',
      docsUrl: 'https://resend.com/api-keys',
    },
    wizardSteps: [
      {
        title: 'Wat doet Resend?',
        body: 'Stuurt alle transactional mail uit BBQ Architect: offerte-PDF naar klant, factuur naar boekhouder, contact-formulier, week-recap.',
        list: ['4 transactional flows live', 'DNS-records via Vercel domains', 'Logs zichtbaar in resend.com dashboard'],
      },
      {
        title: 'Verbind je domain',
        body: 'Maak een API-sleutel in resend.com en verifieer je verzend-domein via DNS. Voeg RESEND_API_KEY en RESEND_FROM_EMAIL toe aan Vercel env vars.',
        list: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL (bv. noreply@hopbites.nl)'],
      },
      {
        title: 'Test de koppeling',
        body: 'Klik "Stuur testmail" om een testbericht naar het support-adres te sturen.',
      },
    ],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'data',
    tier: 'pro',
    iconKey: 'calendar',
    accentColor: '#4285f4',
    shortDescription: 'Synchroniseer BBQ events naar Google Calendar. Tweerichtingsverkeer push + pull.',
    setup: {
      type: 'oauth',
      envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
      statusEndpoint: '/api/integrations/google-calendar/status',
      docsUrl: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
    },
    wizardSteps: [
      {
        title: 'Wat doet Google Calendar?',
        body: 'Elk bevestigd event krijgt automatisch een Google Calendar entry — handig om met collega\'s en partners te delen.',
      },
      {
        title: 'OAuth via Google Cloud',
        body: 'Maak een Google Cloud project, activeer de Calendar API, maak OAuth 2.0 credentials aan en doorloop de flow.',
        list: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
      },
      {
        title: 'Test de sync',
        body: 'Bevestig een test-event en controleer of het in je Google Calendar verschijnt.',
      },
    ],
  },
  {
    id: 'ical-export',
    name: 'iCal Export',
    category: 'data',
    tier: 'all',
    iconKey: 'calendar',
    accentColor: '#34C759',
    shortDescription: 'Exporteer events als .ics — abonneer vanuit Apple Calendar, Outlook of Thunderbird.',
    setup: {
      type: 'none',
      statusEndpoint: '/api/calendar/ical',
    },
    wizardSteps: [
      {
        title: 'Wat doet iCal Export?',
        body: 'Een read-only feed van alle bevestigde events. Werkt direct — geen configuratie nodig. Abonneer vanuit je agenda-app op de iCal feed URL.',
      },
      {
        title: 'Abonneer',
        body: 'Kopieer de iCal feed-URL en plak in Apple Calendar / Outlook / Thunderbird als nieuwe agenda-subscription.',
      },
      {
        title: 'Klaar',
        body: 'Updates komen automatisch — je hoeft niets te beheren.',
      },
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    category: 'compliance',
    tier: 'enterprise',
    iconKey: 'webhook',
    accentColor: '#8b5cf6',
    shortDescription: 'Stuur custom events naar je eigen systemen (offerte geaccepteerd, factuur betaald, HACCP-log).',
    setup: {
      type: 'webhook',
      statusEndpoint: '/api/webhooks',
    },
    wizardSteps: [
      {
        title: 'Wat doen Webhooks?',
        body: 'Bij elk app-event (offerte geaccepteerd, factuur betaald, ...) sturen we een HTTPS-POST naar jouw endpoint. Voor developers met Zapier/Make/eigen scripts.',
      },
      {
        title: 'Registreer endpoint',
        body: 'Voeg een webhook-URL toe en kies welke events je wilt ontvangen. We versturen automatisch JSON met HMAC-signature.',
      },
      {
        title: 'Verifieer signature',
        body: 'In je endpoint: check de X-Hub-Signature header tegen je webhook-secret. Voorbeeld-code in de docs.',
      },
    ],
  },
];

export function findIntegration(id: string): IntegrationManifest | undefined {
  return INTEGRATIONS_MANIFEST.find(i => i.id === id);
}

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  boekhouding: 'Boekhouding',
  communicatie: 'Communicatie',
  betalingen: 'Betalingen',
  data: 'Data & Sync',
  compliance: 'Compliance',
};

export const TIER_LABELS: Record<IntegrationTier, string> = {
  all: '',
  pro: 'Pro vereist',
  enterprise: 'Enterprise',
  binnenkort: 'Binnenkort',
};

// Icoon-mapping voor IntegrationCard — Lucide icon name → render in component.
// Hier alleen string-keys, geen JSX, zodat manifest server-component-safe blijft.
export type IntegrationIconKey = 'receipt' | 'credit-card' | 'building' | 'mail' | 'calendar' | 'webhook';
