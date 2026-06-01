'use client';

import { useEffect, useState } from 'react';
import { Portal, type PortalOffer, type PortalSettings, type PortalCarbon } from './_components/Portal';
import { LoadingSkeleton, State404, StateExpired, StateAccepted } from './_components/PortalStates';
import { isOfferteAccepted } from '@/lib/statuses';

/* ─────────────────────────────────────────────────────────────────────────
   /q/[id] — publieke offerte-portal, white-label per tenant.
   Hub 2 P1: no-JS fallback in <noscript> zodat klanten met JS uit
   weten dat ze JS nodig hebben voor sign + iDEAL.
   ───────────────────────────────────────────────────────────────────────── */

interface ApiResponse {
  offer: PortalOffer;
  settings: PortalSettings | null;
  carbon: PortalCarbon | null;
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [offer, setOffer] = useState<PortalOffer | null>(null);
  const [settings, setSettings] = useState<PortalSettings | null>(null);
  const [carbon, setCarbon] = useState<PortalCarbon | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<'404' | 'expired' | null>(null);

  useEffect(function () {
    let cancelled = false;
    async function load() {
      const { id: offerId } = await params;
      if (!offerId) {
        if (!cancelled) {
          setErrorState('404');
          setLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/public-offerte/' + encodeURIComponent(offerId), { cache: 'no-store' });
        const result = await res.json() as ApiResponse & { error?: string };
        if (!res.ok || !result.offer) {
          if (!cancelled) {
            /* /api/public-offerte returnt 404 voor "niet gevonden" en 410 voor "verlopen".
               Het verlopen-state komt nu samen met 404 binnen — we kijken op de error-text
               of result.offer.geldig_tot om te bepalen welke state te tonen. */
            const isExpired = res.status === 410 || (typeof result.error === 'string' && /verlopen|expired/i.test(result.error));
            setErrorState(isExpired ? 'expired' : '404');
            setLoading(false);
          }
          return;
        }
        if (!cancelled) {
          setOffer(result.offer);
          setSettings(result.settings || null);
          setCarbon(result.carbon || null);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setErrorState('404');
          setLoading(false);
        }
      }
    }
    load();
    return function () { cancelled = true; };
  }, [params]);

  if (loading) {
    return (
      <>
        <LoadingSkeleton themeId={settings?.brand_theme} />
        {/* No-JS fallback — klanten met JS uit zien dit in plaats van skeleton. */}
        <noscript>
          <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fafaf7', color: '#333', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ maxWidth: 420, textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>JavaScript vereist</h2>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: '#666' }}>
                Deze offerte-pagina werkt met een digitale handtekening en iDEAL-betaling — daarvoor is JavaScript nodig.
                Open de link in een moderne browser (Chrome, Safari, Firefox, Edge) en zet JavaScript aan.
              </p>
              <p style={{ fontSize: 13, color: '#888', marginTop: 18 }}>
                Lukt het niet? Vraag je caterer om een PDF-versie van de offerte.
              </p>
            </div>
          </div>
        </noscript>
      </>
    );
  }

  if (errorState === '404' || !offer) {
    return (
      <State404
        themeId={settings?.brand_theme}
        tenantNaam={settings?.bedrijfsnaam}
        tenantEmail={settings?.email}
        tenantTelefoon={settings?.telefoon}
      />
    );
  }

  if (errorState === 'expired') {
    const deadlineFormatted = offer.geldig_tot
      ? new Date(offer.geldig_tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      : undefined;
    return (
      <StateExpired
        themeId={settings?.brand_theme}
        tenantNaam={settings?.bedrijfsnaam}
        tenantEmail={settings?.email}
        tenantTelefoon={settings?.telefoon}
        deadlineFormatted={deadlineFormatted}
      />
    );
  }

  /* Reeds geaccepteerd? Toon hier de StateAccepted in plaats van Portal.
     Behalve als ?paid=1 in URL — dat is de Mollie-redirect terug na betalen,
     dan willen we het bedankt-scherm tonen via Portal's interne view-state. */
  const isPaidReturn = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('paid') === '1';
  if (isOfferteAccepted(offer.status) && !isPaidReturn) {
    const signedAtFormatted = offer.signed_at
      ? new Date(offer.signed_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
      : undefined;
    return (
      <StateAccepted
        themeId={settings?.brand_theme}
        tenantNaam={settings?.bedrijfsnaam}
        signedAtFormatted={signedAtFormatted}
      />
    );
  }

  return <Portal offer={offer} settings={settings} carbon={carbon} />;
}
