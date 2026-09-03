'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon, BrandMark, AllergenChip } from './Icon';
import { allergensFor } from './allergens';
import { themeStyleVars, getThemeMode } from './themes';
import { getBtwPct, type BtwCategory } from '@/lib/btw-rules';
import { SignModal } from './SignModal';
import { Bedankt } from './Bedankt';
import './portal.css';

/* ──────────────────────────────────────────────────────────────────────
   Type-shapes — komen 1-op-1 van /api/public-offerte/[token] response.
   ────────────────────────────────────────────────────────────────────── */

export interface PortalOfferItem {
  qty?: number;
  prijs?: number;
  omschrijving?: string;
  beschrijving?: string;
  btw?: number;
  /* BTW-categorie-hint (bv. wizard-items) — rate wordt via btw-rules.ts
     opgezocht, nooit hier hardcoded (hard rule 1). */
  btw_category?: string;
}

export interface PortalVasteKost {
  bedrag?: number | string;
  omschrijving?: string;
}

export interface PortalMenuSelDish {
  gerecht_id?: string | number;
  naam?: string;
  gerecht_naam?: string;
  beschrijving?: string;
  foto_url?: string;
  allergenen?: string[];
  tag?: string;
}

export interface PortalOffer {
  id: number | string;
  nummer?: string;
  status?: string;
  public_token: string;
  client_naam?: string;
  client_email?: string;
  client_adres?: string;
  datum?: string;
  geldig_tot?: string;
  aantal_gasten?: number;
  basis_prijs_pp?: number;
  items?: PortalOfferItem[] | string;
  korting?: number;
  vaste_kosten?: PortalVasteKost[];
  menu_selectie?: PortalMenuSelDish[] | Record<string, PortalMenuSelDish[]> | string[];
  notitie?: string;
  signed_by?: string;
  signed_at?: string;
  signed_pdf_url?: string;
  evenement_naam?: string;
  evenement_locatie?: string;
}

export interface PortalSettings {
  bedrijfsnaam?: string;
  ondertitel?: string;
  telefoon?: string;
  email?: string;
  adres?: string;
  website?: string;
  brand_theme?: string;
  default_btw?: number;
}

export interface PortalCarbon {
  score?: string;
  total_g_per_pp?: number;
  total_g?: number;
  matched_count?: number;
}

export interface PortalProps {
  offer: PortalOffer;
  settings: PortalSettings | null;
  carbon: PortalCarbon | null;
  showCo2?: boolean;
}

/* ──────────────────────────────────────────────────────────────────────
   Money / date / menu helpers — alles Dutch locale.
   ────────────────────────────────────────────────────────────────────── */

const _eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
export function fmt(n: number): string {
  return _eur.format(n || 0).replace(' ', ' ');
}

function formatDate(d: string | undefined | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('nl-NL', opts);
  } catch {
    return d;
  }
}

interface ParsedTotals {
  food: number;
  service: number;
  btwFood: number;
  btwService: number;
  subtotalExcl: number;
  totalIncl: number;
  deposit: number;
  remaining: number;
  depositDeadline: string;
}

/* BTW-split: 9% over food-items (default), 21% over service-items.
   Server-side BTW-rate per item heeft voorrang als beschikbaar (item.btw).
   Items zonder expliciete btw vallen onder settings.default_btw (default 9%). */
function calcTotals(offer: PortalOffer, defaultBtw: number, geldigTot?: string): ParsedTotals {
  let items: PortalOfferItem[] = [];
  if (typeof offer.items === 'string') {
    try { items = JSON.parse(offer.items); } catch { items = []; }
  } else if (Array.isArray(offer.items)) {
    items = offer.items;
  }

  let food = 0;
  let service = 0;
  let btwFood = 0;
  let btwService = 0;
  items.forEach(function (it) {
    const line = (it.qty || 0) * (it.prijs || 0);
    /* Rate-volgorde: expliciete btw op het item → btw_category via de
       centrale btw-rules (food_catering = 9% enz.) → settings-default.
       Fix 2026-06-12: wizard-menu-items kregen onterecht 21% "service"
       omdat de category-hint genegeerd werd. */
    let rate = typeof it.btw === 'number' ? it.btw : NaN;
    if (Number.isNaN(rate) && it.btw_category) {
      try { rate = getBtwPct(it.btw_category as BtwCategory); } catch { rate = NaN; }
    }
    if (Number.isNaN(rate)) rate = defaultBtw;
    if (rate >= 20) {
      service += line;
      btwService += line * (rate / 100);
    } else {
      food += line;
      btwFood += line * (rate / 100);
    }
  });

  // Vaste kosten optellen bij service (transport, crew, materieel = altijd 21%)
  (offer.vaste_kosten || []).forEach(function (k) {
    const bedrag = Number(k.bedrag) || 0;
    service += bedrag;
    btwService += bedrag * 0.21;
  });

  const korting = Number(offer.korting) || 0;
  const subtotalExcl = food + service - korting;
  const totalIncl = subtotalExcl + btwFood + btwService;
  const deposit = Math.round(totalIncl * 0.3 * 100) / 100;
  const remaining = totalIncl - deposit;
  return {
    food, service, btwFood, btwService, subtotalExcl, totalIncl, deposit, remaining,
    depositDeadline: formatDate(geldigTot, { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/* Menu_selectie heeft drie historische shapes (string[], object keyed by gang_slug,
   of array van dish-objecten). Normaliseer naar gang-groepen voor render. */
interface MenuGroup {
  num: string;
  course: string;
  dishes: PortalMenuSelDish[];
}

const COURSE_LABELS: Record<string, { num: string; label: string }> = {
  voorgerecht:     { num: '01', label: 'Voorgerecht' },
  voorgerechten:   { num: '01', label: 'Voorgerecht' },
  hoofdgerecht:    { num: '02', label: 'Hoofdgerecht' },
  hoofdgerechten:  { num: '02', label: 'Hoofdgerecht' },
  bijgerecht:      { num: '03', label: 'Bijgerecht' },
  bijgerechten:    { num: '03', label: 'Bijgerecht' },
  dessert:         { num: '04', label: 'Dessert' },
  desserts:        { num: '04', label: 'Dessert' },
  bites:           { num: '00', label: 'Bites' },
  hapjes:          { num: '00', label: 'Hapjes' },
};

function parseMenu(menuSel: PortalOffer['menu_selectie']): MenuGroup[] {
  if (!menuSel) return [];

  // shape 1: object keyed by gang-slug
  if (!Array.isArray(menuSel) && typeof menuSel === 'object') {
    const groups: MenuGroup[] = [];
    const keys = Object.keys(menuSel).sort(function (a, b) {
      const na = COURSE_LABELS[a.toLowerCase()]?.num || '99';
      const nb = COURSE_LABELS[b.toLowerCase()]?.num || '99';
      return na.localeCompare(nb);
    });
    for (const k of keys) {
      const arr = (menuSel as Record<string, PortalMenuSelDish[]>)[k];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const meta = COURSE_LABELS[k.toLowerCase()] || { num: '–', label: k };
      groups.push({ num: meta.num, course: meta.label, dishes: arr });
    }
    return groups;
  }

  // shape 2: flat array of dishes (no course grouping) → bucket onder "Menu"
  if (Array.isArray(menuSel)) {
    const dishes: PortalMenuSelDish[] = menuSel.map(function (item) {
      if (typeof item === 'string') {
        return { naam: item } as PortalMenuSelDish;
      }
      return item;
    });
    return [{ num: '–', course: 'Menu', dishes }];
  }

  return [];
}

/* ──────────────────────────────────────────────────────────────────────
   UI components — pure presentational, get data via props.
   ────────────────────────────────────────────────────────────────────── */

function HueDot({ hue }: { hue: number }) {
  return <span className="chip-dot" style={{ background: `oklch(0.65 0.12 ${hue})` }} />;
}

function MapCard({ locatieNaam, locatieAdres, mapsQuery }: { locatieNaam: string; locatieAdres?: string; mapsQuery: string }) {
  return (
    <div className="pp-map">
      <div className="pp-map-canvas" style={{ background: 'var(--surface-3)' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .9 }}>
          <div style={{ position: 'absolute', left: '-10%', top: '32%', width: '120%', height: 7, background: 'var(--surface-2)', transform: 'rotate(-7deg)' }} />
          <div style={{ position: 'absolute', left: '-10%', top: '64%', width: '120%', height: 5, background: 'var(--surface-2)', transform: 'rotate(4deg)' }} />
          <div style={{ position: 'absolute', left: '24%', top: '-10%', width: 5, height: '120%', background: 'var(--surface-2)', transform: 'rotate(6deg)' }} />
          <div style={{ position: 'absolute', left: '70%', top: '-10%', width: 6, height: '120%', background: 'var(--surface-2)', transform: 'rotate(-3deg)' }} />
          <div style={{ position: 'absolute', left: '48%', top: '8%', width: '34%', height: '40%', borderRadius: 6, background: 'color-mix(in srgb, var(--brand-2) 12%, var(--surface-2))' }} />
          <div style={{ position: 'absolute', left: '8%', top: '52%', width: '26%', height: '30%', borderRadius: 6, background: 'color-mix(in srgb, var(--brand-1) 10%, var(--surface-2))' }} />
        </div>
        <div className="pp-map-pin"><Icon name="pin" size={26} /></div>
      </div>
      <div className="pp-map-foot">
        <span style={{ color: 'var(--text-muted)' }}>
          {locatieNaam}{locatieAdres ? ' · ' + locatieAdres : ''}
        </span>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`} target="_blank" rel="noreferrer">
          Open in Maps <Icon name="external" size={13} stroke={2} />
        </a>
      </div>
    </div>
  );
}

function EventCard({ offer }: { offer: PortalOffer }) {
  const datum = formatDate(offer.datum);
  const tijd = '—';
  const locatieNaam = offer.evenement_locatie || offer.client_adres || '—';
  const cells = [
    { ico: 'calendar', k: 'Datum', v: datum || '—' },
    { ico: 'clock', k: 'Tijd', v: tijd },
    { ico: 'pin', k: 'Locatie', v: locatieNaam },
    { ico: 'users', k: 'Gasten', v: offer.aantal_gasten ? `${offer.aantal_gasten} personen` : '—' },
  ];
  return (
    <div className="pp-card pp-event">
      <div className="pp-event-grid">
        {cells.map(function (c) {
          return (
            <div className="pp-event-cell" key={c.k}>
              <Icon name={c.ico} size={17} className="pp-event-ico" />
              <div>
                <div className="pp-event-k">{c.k}</div>
                <div className="pp-event-v">{c.v}</div>
              </div>
            </div>
          );
        })}
      </div>
      {locatieNaam && locatieNaam !== '—' && (
        <MapCard locatieNaam={locatieNaam} mapsQuery={locatieNaam} />
      )}
    </div>
  );
}

function Dish({ d }: { d: PortalMenuSelDish }) {
  const allergens = allergensFor(d.allergenen || []);
  const naam = d.naam || d.gerecht_naam || 'Gerecht';
  return (
    <div className="pp-card pp-dish">
      {d.foto_url ? (
        <div className="pp-dish-media" style={{ backgroundImage: `url(${d.foto_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      ) : (
        <div className="ph pp-dish-media">
          <span className="ph-label"><Icon name="image" size={11} stroke={1.6} />{naam}</span>
        </div>
      )}
      <div className="pp-dish-body">
        <div className="pp-dish-row">
          <span className="pp-dish-name">{naam}</span>
          {d.tag && <span className="pp-dish-tag">{d.tag}</span>}
        </div>
        {d.beschrijving && <p className="pp-dish-desc">{d.beschrijving}</p>}
        {allergens.length > 0 && (
          <div className="pp-allergens">
            {allergens.map(function (a) { return <AllergenChip a={a} key={a.id} />; })}
          </div>
        )}
      </div>
    </div>
  );
}

function Menu({ groups }: { groups: MenuGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <>
      {groups.map(function (c) {
        return (
          <div className="pp-course" key={c.num + c.course}>
            <div className="pp-course-head">
              <span className="pp-course-num">{c.num}</span>
              <span className="pp-course-title">{c.course}</span>
              <span className="pp-course-rule" />
            </div>
            <div className="pp-course-list">
              {c.dishes.map(function (d, i) {
                return <Dish d={d} key={(d.naam || 'd') + i} />;
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function TotalCard({ t, defaultBtw }: { t: ParsedTotals; defaultBtw: number }) {
  return (
    <div className="pp-card pp-total">
      <div className="pp-total-head">
        <h3>Totaaloverzicht</h3>
        <span className="pp-eyebrow">incl. BTW</span>
      </div>
      <div className="pp-total-rows">
        <div className="pp-trow">
          <span className="k">Subtotaal (excl. BTW)</span>
          <span className="v">{fmt(t.subtotalExcl)}</span>
        </div>
        <div className="pp-btw">
          {t.btwFood > 0 && (
            <div className="pp-btw-row">
              {/* Label uit de werkelijke verhouding — defaultBtw kan 21 zijn
                  terwijl de food-bucket 9% rekent (fix 2026-06-12). */}
              <span className="k"><span className="pp-btw-pct">{t.food > 0 ? Math.round((t.btwFood / t.food) * 100) : 9}%</span> over food</span>
              <span className="v">{fmt(t.btwFood)}</span>
            </div>
          )}
          {t.btwService > 0 && (
            <div className="pp-btw-row">
              <span className="k"><span className="pp-btw-pct">21%</span> over service</span>
              <span className="v">{fmt(t.btwService)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="pp-grand">
        <span className="k">Totaal<small>BTW inbegrepen</small></span>
        <span className="v">{fmt(t.totalIncl)}</span>
      </div>
      <div className="pp-deposit">
        <div className="pp-deposit-row">
          <span className="pp-deposit-k">
            <Icon name="wallet" size={15} style={{ color: 'var(--brand-1)' }} />
            Aanbetaling 30%
          </span>
          <span className="pp-deposit-v">{fmt(t.deposit)}</span>
        </div>
        {t.depositDeadline && (
          <div className="pp-deposit-sub">
            Te voldoen voor <b style={{ color: 'var(--text)' }}>{t.depositDeadline}</b> om je datum vast te zetten.
          </div>
        )}
        <div className="pp-rest">Resterend bedrag {fmt(t.remaining)} — na afloop van het event.</div>
      </div>
    </div>
  );
}

function Co2Card({ carbon }: { carbon: PortalCarbon }) {
  const total = carbon.total_g ? Math.round(carbon.total_g / 1000) : 0;
  const perGuest = carbon.total_g_per_pp ? Math.round((carbon.total_g_per_pp / 1000) * 10) / 10 : 0;
  const carKm = Math.round(total / 0.175); // ~175g CO2 per km auto
  const pct = Math.min(100, Math.round((perGuest / 8) * 100)); // 8kg pp = "vol" balk
  return (
    <div className="pp-card pp-card-pad">
      <div className="pp-co2-head">
        <div className="pp-co2-ico"><Icon name="leaf" size={17} /></div>
        <div>
          <div className="pp-co2-title">CO₂-voetafdruk</div>
          <div className="pp-co2-sub">Berekend over het hele menu</div>
        </div>
        <span className="chip" style={{ marginLeft: 'auto' }}>
          <HueDot hue={150} />
          {carbon.score || '—'}
        </span>
      </div>
      <div className="pp-co2-score">
        <span className="n">{total}</span>
        <span className="u">kg CO₂e · {perGuest} kg p.p.</span>
      </div>
      <div className="pp-co2-bar">
        <div className="pp-co2-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="pp-co2-eq">
        <Icon name="car" size={15} style={{ color: 'var(--brand-3)' }} />
        Gelijk aan ± {carKm.toLocaleString('nl-NL')} km met de auto.
      </div>
    </div>
  );
}

function AdjustForm({ open, sent, clientNaam, tenantNaam, onSubmit }: { open: boolean; sent: boolean; clientNaam: string; tenantNaam: string; onSubmit: () => void }) {
  return (
    <div className="pp-adjust" style={{ maxHeight: open ? 460 : 0 }}>
      <div className="pp-card pp-card-pad" style={{ marginTop: 12 }}>
        {sent ? (
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span className="pp-state-ico ok" style={{ width: 38, height: 38, marginBottom: 0 }}>
              <Icon name="check" size={19} />
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Bericht verstuurd</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                {tenantNaam} neemt snel contact met je op over je aanpassing.
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>Iets aanpassen?</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Laat het ons weten — we passen de offerte graag voor je aan.
            </div>
            <div className="pp-field">
              <label>Naam</label>
              <input className="pp-input" placeholder="Je naam" defaultValue={clientNaam} />
            </div>
            <div className="pp-field">
              <label>Telefoon</label>
              <input className="pp-input" placeholder="06 12 34 56 78" />
            </div>
            <div className="pp-field">
              <label>Bericht</label>
              <textarea className="pp-input" placeholder="Bijv. graag 4 extra gasten en een vega hoofdgerecht erbij." />
            </div>
            <button className="btn btn-ghost" onClick={onSubmit}>
              <Icon name="mail" size={16} />
              Verstuur naar {tenantNaam}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Orchestrator — manages view state (quote ↔ bedankt) + sign+pay flow.
   ────────────────────────────────────────────────────────────────────── */

export function Portal({ offer, settings, carbon, showCo2 = true }: PortalProps) {
  const tenant = {
    naam: settings?.bedrijfsnaam || 'BBQ Architect',
    telefoon: settings?.telefoon || '',
    email: settings?.email || '',
  };
  const defaultBtw = settings?.default_btw ?? 9;
  const totals = calcTotals(offer, defaultBtw, offer.geldig_tot);
  const menuGroups = parseMenu(offer.menu_selectie);
  const themeStyle = themeStyleVars(settings?.brand_theme);
  const themeMode = getThemeMode(settings?.brand_theme);

  const initialAccepted = offer.status === 'geaccepteerd' || offer.status === 'betaald';
  const [view, setView] = useState<'quote' | 'bedankt'>(initialAccepted ? 'bedankt' : 'quote');
  const [signOpen, setSignOpen] = useState(false);
  const [signStep, setSignStep] = useState<'sign' | 'ideal'>('sign');
  const [bank, setBank] = useState<string | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustSent, setAdjustSent] = useState(false);

  const ppRef = useRef<HTMLDivElement>(null);
  const adjustRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const heroMediaRef = useRef<HTMLDivElement>(null);

  // Detect desktop layout — driver voor sidebar vs inline totals
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(function () {
    function check() { setIsDesktop(window.innerWidth >= 980); }
    check();
    window.addEventListener('resize', check);
    return function () { window.removeEventListener('resize', check); };
  }, []);

  // Parallax — scroll vertaalt naar hero-media transform
  useEffect(function () {
    const sc = ppRef.current;
    if (!sc || !heroMediaRef.current) return;
    const onScroll = function () {
      if (heroMediaRef.current) {
        heroMediaRef.current.style.transform = `translateY(${sc.scrollTop * 0.22}px) scale(1.06)`;
      }
    };
    sc.addEventListener('scroll', onScroll, { passive: true });
    return function () { sc.removeEventListener('scroll', onScroll); };
  }, []);

  /* Scrollde naar een container die geen scroll-container is: ppRef wees naar
     een gewone div, dus scrollTo() deed niets en de knop leek dood.
     scrollIntoView werkt ongeacht welke voorouder daadwerkelijk scrolt.
     Smooth-scroll wordt niet overal uitgevoerd (in-app browsers, WebViews en
     omgevingen met animaties uit doen er niets mee), dus vallen we terug op een
     directe sprong als er na 350 ms niets is bewogen. Anders lijkt de knop dood. */
  function scrollNaar(el: HTMLElement | null) {
    if (!el) return;
    const voor = window.scrollY || document.documentElement.scrollTop || 0;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(function () {
      const na = window.scrollY || document.documentElement.scrollTop || 0;
      if (Math.abs(na - voor) < 8) el.scrollIntoView({ block: 'start' });
    }, 350);
  }

  function scrollToMenu() {
    scrollNaar(menuRef.current);
  }

  function scrollToAdjust() {
    if (!showAdjust) setShowAdjust(true);
    setTimeout(function () {
      scrollNaar(adjustRef.current);
    }, 60);
  }

  function openSign() {
    setSignStep('sign');
    setSignOpen(true);
  }
  function closeSign() {
    setSignOpen(false);
    setSubmitError(null);
  }

  /* Single-action acceptance: handtekening posten naar /api/accept-offerte,
     bij success → Mollie payment-create voor de aanbetaling met issuer pre-selected. */
  async function handleAcceptAndPay() {
    if (!signatureData || !signedBy.trim() || !bank) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const acceptRes = await fetch('/api/accept-offerte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offerteId: offer.id,
          publicToken: offer.public_token,
          signedBy: signedBy.trim(),
          signatureUrl: signatureData,
        }),
      });
      const acceptJson = await acceptRes.json();
      if (!acceptRes.ok || !acceptJson.success) {
        const msg = acceptJson?.fields
          ? Object.values(acceptJson.fields).flat().join(', ')
          : (acceptJson?.error || 'Accept mislukt');
        setSubmitError(String(msg));
        setSubmitting(false);
        return;
      }

      /* Mollie payment-create voor aanbetaling. Workflow heeft net factuur
         gemaakt (workflow.factuur.factuurId). We doen 'm via een POST naar
         /api/payments/mollie met de factuur-id en de gekozen iDEAL-issuer.
         Redirect naar Mollie checkout. Bij success: webhook → /q/[id]/bedankt
         via redirect_url. */
      const factuurId = acceptJson?.workflow?.factuur?.factuurId;
      if (factuurId) {
        const payRes = await fetch('/api/payments/mollie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factuurId,
            bedragOverride: totals.deposit, // aanbetaling, niet hele factuur
            issuer: bank,
            redirectUrl: typeof window !== 'undefined'
              ? `${window.location.origin}/q/${offer.id}?paid=1`
              : undefined,
          }),
        });
        const payJson = await payRes.json();
        if (payRes.ok && payJson?.checkoutUrl) {
          window.location.href = payJson.checkoutUrl;
          return;
        }
        /* Mollie niet beschikbaar — fallback: toon bedankt, factuur staat
           in concept, klant kan via mail betalen. Niet ideaal maar
           niet-blokkerend zodat e-sign + accept gerouteerd zijn. */
        setView('bedankt');
        setSignOpen(false);
        setSubmitting(false);
        return;
      }

      // Geen factuur uit workflow → show bedankt, accept is gelukt
      setView('bedankt');
      setSignOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Onbekende fout');
    }
    setSubmitting(false);
  }

  if (view === 'bedankt') {
    return (
      <div className="pp-theme" data-mode={themeMode} style={themeStyle}>
        <Bedankt
          tenant={tenant}
          clientNaam={offer.client_naam || ''}
          deposit={totals.deposit}
          signedAt={offer.signed_at}
          eventNaam={offer.evenement_naam || `Offerte ${offer.nummer || ''}`.trim()}
          eventDatum={offer.datum}
          eventLocatie={offer.evenement_locatie || offer.client_adres}
          signedPdfUrl={offer.signed_pdf_url}
        />
      </div>
    );
  }

  return (
    <div className="pp-theme" data-mode={themeMode} style={themeStyle}>
      <div className={'pp' + (isDesktop ? ' is-desktop' : '')} ref={ppRef}>
        {/* HERO */}
        <div className="pp-hero">
          <div className="pp-hero-media" ref={heroMediaRef}>
            <div className="ph ph-hero" style={{ width: '100%', height: '100%' }}>
              <span className="ph-label">
                <Icon name="image" size={11} stroke={1.6} />
                BBQ-feest · sfeerfoto van {tenant.naam}
              </span>
            </div>
          </div>
          <div className="pp-hero-scrim" />
          <div className="pp-hero-logo">
            <span className="pp-hero-logo-mark"><BrandMark size={16} /></span>
            <span className="pp-hero-logo-name">{tenant.naam}</span>
          </div>
          <div>
            <div className="pp-hero-eyebrow">Offerte · {offer.evenement_naam || 'Catering'}</div>
            <h1 className="pp-hero-title">Offerte voor {offer.client_naam || 'klant'}</h1>
            <div className="pp-hero-sub">
              {offer.datum && <span>{formatDate(offer.datum)}</span>}
              {offer.evenement_locatie && (<><span className="dot" /><span>{offer.evenement_locatie}</span></>)}
              {offer.aantal_gasten && (<><span className="dot" /><span>{offer.aantal_gasten} gasten</span></>)}
            </div>
          </div>
          <button className="pp-hero-scroll" onClick={scrollToMenu}>
            Bekijk je menu <Icon name="chevDown" size={15} />
          </button>
        </div>

        {/* EVENT CARD */}
        <div style={isDesktop ? { maxWidth: 1180, margin: '0 auto', padding: '0 40px' } : { padding: '0 16px' }}>
          <EventCard offer={offer} />
        </div>

        {/* BODY */}
        <div className="pp-body">
          <div className="pp-main" ref={menuRef}>
            <Menu groups={menuGroups} />
            {!isDesktop && (
              <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TotalCard t={totals} defaultBtw={defaultBtw} />
                {showCo2 && carbon && carbon.matched_count && carbon.matched_count > 0 ? <Co2Card carbon={carbon} /> : null}
                <div ref={adjustRef}>
                  <AdjustForm
                    open={showAdjust}
                    sent={adjustSent}
                    clientNaam={offer.client_naam || ''}
                    tenantNaam={tenant.naam}
                    onSubmit={function () { setAdjustSent(true); }}
                  />
                </div>
              </div>
            )}
          </div>
          {isDesktop && (
            <aside className="pp-aside">
              <TotalCard t={totals} defaultBtw={defaultBtw} />
              {showCo2 && carbon && carbon.matched_count && carbon.matched_count > 0 ? <Co2Card carbon={carbon} /> : null}
              <div className="pp-actions">
                <button className="btn btn-primary" onClick={openSign}>
                  <Icon name="pen" size={17} />
                  Bevestig &amp; betaal aanbetaling
                </button>
                <button className="btn btn-ghost" onClick={function () { setShowAdjust(function (s) { return !s; }); }}>
                  <Icon name="edit" size={16} />
                  Vraag aanpassing
                </button>
                {offer.signed_pdf_url && (
                  <a className="btn btn-link" href={offer.signed_pdf_url} target="_blank" rel="noreferrer">
                    <Icon name="download" size={16} />
                    Download PDF
                  </a>
                )}
              </div>
              <div ref={adjustRef}>
                <AdjustForm
                  open={showAdjust}
                  sent={adjustSent}
                  clientNaam={offer.client_naam || ''}
                  tenantNaam={tenant.naam}
                  onSubmit={function () { setAdjustSent(true); }}
                />
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Mobile bottom-bar */}
      {!isDesktop && (
        <div className="pp-bottombar">
          <div className="pp-bottombar-top">
            <div className="pp-bottombar-tot">Aanbetaling nu<b>{fmt(totals.deposit)}</b></div>
            <button className="btn btn-primary" onClick={openSign}>
              <Icon name="pen" size={16} />
              Bevestig &amp; betaal
            </button>
          </div>
          <div className="pp-bottombar-links">
            <button onClick={scrollToAdjust}>
              <Icon name="edit" size={14} />
              Vraag aanpassing
            </button>
            {offer.signed_pdf_url && (
              <a href={offer.signed_pdf_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none' }}>
                <Icon name="download" size={14} />
                Download PDF
              </a>
            )}
          </div>
        </div>
      )}

      {/* Sign + pay modal */}
      {signOpen && (
        <SignModal
          isDesktop={isDesktop}
          step={signStep}
          setStep={setSignStep}
          bank={bank}
          setBank={setBank}
          tenant={tenant}
          clientNaam={offer.client_naam || ''}
          deposit={totals.deposit}
          signedBy={signedBy}
          setSignedBy={setSignedBy}
          signatureData={signatureData}
          setSignatureData={setSignatureData}
          submitting={submitting}
          submitError={submitError}
          onClose={closeSign}
          onConfirmPay={handleAcceptAndPay}
        />
      )}
    </div>
  );
}
