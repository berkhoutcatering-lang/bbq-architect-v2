/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar, ChefHat, Clock, FileText, TrendingUp, AlertTriangle, ArrowRight,
  Package, Users, Euro, Flame, CheckCircle2, Bell, Settings, Search, BarChart3,
  MapPin, ChevronRight, ChevronDown, Sparkles, Shield, Star, ShoppingCart, UtensilsCrossed,
  Plus, FileScan, X, TrendingDown
} from "lucide-react";
import { useSupabase } from '@/lib/useSupabase';
import { fmt, fmtNl, safeJsonParse, calcMargeForOfferte, calcLineTotals, MAANDEN_KORT } from '@/lib/utils';
import { detectAllConflicts } from '@/lib/conflictDetection';
import MetallicCard from '@/components/MetallicCard';
import { StatusDot } from '@/components/StatusBadge';
import WeekStrip from '@/components/WeekStrip';
import EventWizard from '@/components/EventWizard';
import OnboardingProgress from '@/components/OnboardingProgress';
import DrillDownKPI from '@/components/DrillDownKPI';
import DashboardBrandHero from '@/components/DashboardBrandHero';
import PriceUpdateReminder from '@/components/PriceUpdateReminder';
import { LoadingState } from '@/components/LoadingState';

export default function DashboardPage() {
  const ev = useSupabase('events', []);
  const fac = useSupabase('facturen', []);
  const off = useSupabase('offertes', []);
  const inv = useSupabase('inventory', []);
  const sug = useSupabase('prep_suggestions', []);
  const gan = useSupabase('gangen', []);
  const ger = useSupabase('gerechten', []);
  const pt = useSupabase('prep_tasks', []);
  const kl = useSupabase('klanten', []);
  const hc = useSupabase('haccp_records', []);
  /* Voor command-center insights: bonnen + courses + allergies — voedt
     bonnen-loop status, completion-checklist op hero-event, en BTW-saldo. */
  const bnn = useSupabase('bonnen', []);
  const crs = useSupabase('courses', []);
  const ealg = useSupabase('event_allergies', []);

  const events: any[] = ev.data || [];
  const facturen: any[] = fac.data || [];
  const offertes: any[] = off.data || [];
  const inventory: any[] = inv.data || [];
  const suggestions: any[] = sug.data || [];
  const gangenData: any[] = gan.data || [];
  const gerechtenData: any[] = ger.data || [];
  const prepTasks: any[] = pt.data || [];
  const klanten: any[] = kl.data || [];
  const haccpRecords: any[] = hc.data || [];
  const bonnen: any[] = bnn.data || [];
  const courses: any[] = crs.data || [];
  const eventAllergies: any[] = ealg.data || [];

  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState("Welkom");
  const [isMounted, setIsMounted] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showAllNudges, setShowAllNudges] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [weekDrawerOpen, setWeekDrawerOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Goedemorgen");
    else if (hour < 18) setGreeting("Goedemiddag");
    else setGreeting("Goedenavond");
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const jaarNu = new Date().getFullYear().toString();

  const confirmedEvents = events.filter((e: any) => e.status === 'confirmed');
  const betaaldFacturen = facturen.filter((f: any) => f.status === 'betaald');
  let totalRevenue = 0;
  betaaldFacturen.forEach((f: any) => {
    (f.items || []).forEach((item: any) => { totalRevenue += (item.qty || 0) * (item.prijs || 0); });
  });

  const openFacturen = facturen.filter((f: any) => f.status !== 'betaald' && f.status !== 'geannuleerd');
  let openFacturenBedrag = 0;
  openFacturen.forEach((f: any) => {
    (f.items || []).forEach((item: any) => { openFacturenBedrag += (item.qty || 0) * (item.prijs || 0); });
  });

  const lowStockItems = inventory.filter((item: any) => (item.current_stock || 0) < (item.min_stock || 0));
  const pendingSuggestions = suggestions.filter((s: any) => s.status === 'pending');

  const openOffertes = offertes.filter((o: any) => o.status === 'concept' || o.status === 'verzonden');
  const prognose = openOffertes.reduce((sum: number, o: any) => {
    const fromItems = calcLineTotals(o.items).totaal;
    return sum + (fromItems > 0 ? fromItems : (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0));
  }, 0);

  function _calcMarge(o: any) {
    return calcMargeForOfferte(o, gerechtenData, inventory);
  }

  const lowMargeOffertes = offertes.filter(function (o: any) {
    if (!o.menu_selectie || (Array.isArray(o.menu_selectie) && o.menu_selectie.length === 0)) return false;
    const m = _calcMarge(o);
    return m.margePct < 40;
  }).slice(0, 3);

  const nextEventsList = events
    .filter((e: any) => e.date >= today && e.status !== 'geannuleerd')
    .sort((a: any, b: any) => a.date < b.date ? -1 : 1)
    .slice(0, 4);

  const nextEventForPrep = nextEventsList.length > 0 ? nextEventsList[0] : null;

  const prepEvents = offertes
    .filter((o: any) => (o.status === 'geaccepteerd' || o.status === 'goedgekeurd') && o.datum >= today)
    .sort((a: any, b: any) => a.datum < b.datum ? -1 : 1)
    .slice(0, 3);

  const liveActions: { id: string; urgency: string; message: string; link: string; icon: string }[] = [];
  if (lowStockItems.length > 0) {
    liveActions.push({ id: 'a1', urgency: 'high', message: `${lowStockItems.length} items onder minimum voorraad`, link: '/voorraad', icon: 'Package' });
  }
  if (pendingSuggestions.length > 0) {
    liveActions.push({ id: 'a2', urgency: 'medium', message: `${pendingSuggestions.length} Pitmaster Ai suggesties`, link: '/agenda', icon: 'Wand2' });
  }
  if (openFacturen.length > 0) {
    liveActions.push({ id: 'a3', urgency: 'medium', message: `${openFacturen.length} openstaande facturen`, link: '/facturen', icon: 'FileText' });
  }
  lowMargeOffertes.forEach((o: any) => {
    const m = _calcMarge(o);
    liveActions.push({ id: `o_${o.id}`, urgency: 'high', message: `Offerte ${o.client_naam} marge: ${m.margePct.toFixed(1)}%`, link: '/offertes', icon: 'AlertTriangle' });
  });

  // --- AI Inzichten nudges ---
  const aiNudges: { id: string; type: 'warning' | 'info' | 'positive'; icon: string; message: string; link: string }[] = [];

  // 1. Verlopen offertes
  const verlopenOffertes = offertes.filter((o: any) => {
    if (!o.geldig_tot) return false;
    if (o.status === 'geaccepteerd' || o.status === 'goedgekeurd' || o.status === 'afgewezen' || o.status === 'geannuleerd') return false;
    return o.geldig_tot < today;
  });
  if (verlopenOffertes.length > 0) {
    aiNudges.push({ id: 'n_verlopen', type: 'warning', icon: '\u23F0', message: `${verlopenOffertes.length} offerte(s) verlopen \u2014 overweeg follow-up`, link: '/offertes' });
  }

  // 2. Onverzonden facturen voor afgeronde events
  const conceptFacturenVoorAfgerondeEvents = facturen.filter((f: any) => {
    if (f.status !== 'concept') return false;
    const linkedEvent = events.find((e: any) => e.client_naam === f.client_naam || e.id === f.event_id);
    return linkedEvent && linkedEvent.date < today;
  });
  if (conceptFacturenVoorAfgerondeEvents.length > 0) {
    aiNudges.push({ id: 'n_concept_fac', type: 'warning', icon: '\uD83D\uDCC4', message: `${conceptFacturenVoorAfgerondeEvents.length} concept-facturen voor afgeronde events \u2014 verstuur ze`, link: '/facturen' });
  }

  // 3. Aankomend event zonder prep-taken (within 7 days)
  const zevenDagenVooruitDate = new Date();
  zevenDagenVooruitDate.setDate(zevenDagenVooruitDate.getDate() + 7);
  const zevenDagenVooruit = zevenDagenVooruitDate.toISOString().slice(0, 10);
  const eventIdsMetPrep = new Set(prepTasks.map((t: any) => t.event_id));
  const upcomingZonderPrep = events.filter((e: any) => {
    if (!e.date || e.date < today || e.date > zevenDagenVooruit) return false;
    if (e.status === 'geannuleerd') return false;
    return !eventIdsMetPrep.has(e.id);
  });
  upcomingZonderPrep.forEach((e: any) => {
    const diffMs = new Date(e.date).getTime() - new Date(today).getTime();
    const diffDagen = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    aiNudges.push({ id: `n_prep_${e.id}`, type: 'warning', icon: '\uD83D\uDD25', message: `Event ${e.name || e.title || 'Onbekend'} over ${diffDagen} dagen heeft geen prep-taken`, link: '/agenda' });
  });

  // 4. Lage marge waarschuwing (re-use lowMargeOffertes)
  lowMargeOffertes.forEach((o: any) => {
    const m = _calcMarge(o);
    aiNudges.push({ id: `n_marge_${o.id}`, type: 'warning', icon: '\u26A0\uFE0F', message: `Offerte ${o.client_naam} \u2014 marge slechts ${m.margePct.toFixed(1)}%`, link: '/offertes' });
  });

  // 5. Week overzicht
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);
  const weekEvents = events.filter((e: any) => e.date >= startOfWeekStr && e.date <= endOfWeekStr && e.status !== 'geannuleerd');
  if (weekEvents.length > 0) {
    const totalGuests = weekEvents.reduce((sum: number, e: any) => sum + (e.guests || 0), 0);
    aiNudges.push({ id: 'n_week', type: 'info', icon: '\uD83D\uDCC5', message: `Deze week: ${weekEvents.length} events, ${totalGuests} gasten totaal`, link: '/agenda' });
  }

  // 6. Voorraad-suggestie op basis van aankomende events
  const upcomingGuests = nextEventsList.reduce(function (sum: number, e: any) { return sum + (e.guests || 0); }, 0);
  if (upcomingGuests > 0 && lowStockItems.length > 0) {
    aiNudges.push({
      id: 'n_voorraad_predict',
      type: 'warning',
      icon: '📦',
      message: `${upcomingGuests} gasten aankomend — ${lowStockItems.length} ingrediënten onder minimum`,
      link: '/voorraad'
    });
  }

  // 7. Seizoens-tip
  const currentMonth = new Date().getMonth();
  if (currentMonth >= 4 && currentMonth <= 8) {
    const festivalEvents = events.filter(function (e: any) { return e.type === 'Festival' && e.date >= today; });
    if (festivalEvents.length === 0) {
      aiNudges.push({
        id: 'n_seizoen',
        type: 'positive' as any,
        icon: '🌞',
        message: 'BBQ-seizoen! Overweeg festival-aanbiedingen voor extra omzet',
        link: '/events'
      });
    }
  }

  // 8. Positieve nudge bij goede marge
  const avgMarge = offertes.filter(function (o: any) { return o.menu_selectie; }).reduce(function (sum: number, o: any) {
    return sum + (_calcMarge(o).margePct || 0);
  }, 0) / Math.max(1, offertes.filter(function (o: any) { return o.menu_selectie; }).length);
  if (avgMarge > 65) {
    aiNudges.push({ id: 'n_marge_goed', type: 'positive' as any, icon: '🎯', message: `Gemiddelde marge ${avgMarge.toFixed(0)}% — uitstekend!`, link: '/financien' });
  }

  const visibleNudges = showAllNudges ? aiNudges : aiNudges.slice(0, 4);
  // --- End AI Inzichten ---

  const recentFeed: { text: string; time: string; dot: string; ts: number }[] = [];
  events.slice(0, 5).forEach((e: any) => recentFeed.push({ text: `Event toegevoegd: ${e.title || 'Nieuw'}`, time: e.created_at || 'recent', dot: 'var(--emerald)', ts: new Date(e.created_at || Date.now()).getTime() }));
  offertes.slice(0, 5).forEach((o: any) => recentFeed.push({ text: `Offerte: ${o.client_naam || 'Nieuw'}`, time: o.created_at || 'recent', dot: 'var(--blue)', ts: new Date(o.created_at || Date.now()).getTime() }));
  facturen.slice(0, 5).forEach((f: any) => recentFeed.push({ text: `Factuur gegenereerd: ${f.factuur_nummer || 'Concept'}`, time: f.created_at || 'recent', dot: 'var(--amber)', ts: new Date(f.created_at || Date.now()).getTime() }));
  recentFeed.sort((a, b) => b.ts - a.ts);
  const recentActivity = recentFeed.slice(0, 4);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return { day: '?', month: '?', year: '?' };
    const parts = dateStr.includes('-') && dateStr.split('-')[0].length === 4 ? dateStr.split('-').reverse() : dateStr.split('-');
    const day = parts[0];
    const monthIndex = parseInt(parts[1]) - 1;
    const year = parts[2] || parts[0];
    const months = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return { day, month: months[monthIndex >= 0 && monthIndex < 12 ? monthIndex : 0], year };
  };

  // HERO-data: eerstkomend event + deze week totals
  const heroEvent = nextEventsList[0] || null;
  const daysToHero = heroEvent ? Math.max(0, Math.ceil((new Date(heroEvent.date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))) : 0;
  const weekGuests = weekEvents.reduce((s: number, e: any) => s + (e.guests || 0), 0);
  const weekRevenue = weekEvents.reduce((s: number, e: any) => s + ((e.guests || 0) * (e.ppp || 0)), 0);
  const heroRevenue = heroEvent ? (heroEvent.guests || 0) * (heroEvent.ppp || 0) : 0;

  // Maand statistieken
  const curMonthPrefix = new Date().toISOString().slice(0, 7);
  const monthEvents = events.filter((e: any) => e.date?.startsWith(curMonthPrefix));
  const monthRevenue = monthEvents.reduce((s: number, e: any) => s + ((e.guests || 0) * (e.ppp || 0)), 0);

  /* ─────────────── Command-Center signalen ─────────────── */

  /* 1. Live conflict-detectie op alle aankomende events (smoker / venue / capacity).
        Critical conflicten worden bovenaan getoond als rode banner. */
  const upcomingForConflict = events.filter((e: any) => e.date >= today && e.status !== 'cancelled' && e.status !== 'geannuleerd');
  const conflictResult = detectAllConflicts(upcomingForConflict);
  const criticalConflicts = conflictResult.conflicts.filter(c => c.severity === 'critical');

  /* 2. Verlopen + binnenkort-vervallen facturen — concrete actie i.p.v. €totaal. */
  const today7 = new Date(); today7.setDate(today7.getDate() + 7);
  const today7Iso = today7.toISOString().slice(0, 10);
  const verlopenFacturen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd' && f.vervaldatum && f.vervaldatum < today
  );
  const binnenkortVervallen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd'
    && f.vervaldatum && f.vervaldatum >= today && f.vervaldatum <= today7Iso
  );
  function calcFactuurBedrag(f: any): number {
    let s = 0;
    (f.items || []).forEach((it: any) => { s += (it.qty || 0) * (it.prijs || 0); });
    return s;
  }
  const verlopenTotaal = verlopenFacturen.reduce((s: number, f: any) => s + calcFactuurBedrag(f), 0);

  /* 3. Hero-event completion checklist: courses ingevuld? allergieën? prep-tasks?
        Action-driven: één klik in de juiste sectie repareert het ontbrekende. */
  const heroCompletion = heroEvent ? {
    coursesIngevuld: courses.some((c: any) => c.event_id === heroEvent.id),
    allergiesIngevuld: eventAllergies.some((a: any) => a.event_id === heroEvent.id),
    prepIngeplannd: prepTasks.some((p: any) => p.event_id === heroEvent.id),
    margePct: (() => {
      const offerte = offertes.find((o: any) => o.id === heroEvent.offerte_id);
      if (!offerte) return null;
      const m = _calcMarge(offerte);
      return m.margePct > 0 ? m.margePct : null;
    })(),
  } : null;

  /* 4. BTW-aangifte deadline: 1e van de maand na elk kwartaal
        (apr/jul/okt/jan). Als binnen 7 dagen → countdown banner. */
  function nextBtwDeadline(): { daysUntil: number; dateLabel: string } | null {
    const now = new Date();
    const m = now.getMonth();
    /* Aangifte-maand 1e dag: maart=apr-aangifte, juni=jul, sept=okt, dec=jan-volgend-jaar */
    const deadlineMonths = [3, 6, 9, 0]; /* apr, jul, okt, jan(nextyr) */
    let dd: Date | null = null;
    for (const dm of deadlineMonths) {
      const yr = (dm === 0 && m >= 9) ? now.getFullYear() + 1 : now.getFullYear();
      const candidate = new Date(yr, dm, 1);
      if (candidate > now) { dd = candidate; break; }
    }
    if (!dd) return null;
    const diff = Math.ceil((dd.getTime() - now.getTime()) / 86400000);
    return {
      daysUntil: diff,
      dateLabel: dd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }),
    };
  }
  const btwDeadline = nextBtwDeadline();
  const btwTeDragen = facturen.filter((f: any) => f.status === 'betaald').reduce((s: number, f: any) => {
    let bedrag = 0;
    (f.items || []).forEach((it: any) => { bedrag += (it.qty || 0) * (it.prijs || 0) * ((it.btw || 0) / 100); });
    return s + bedrag;
  }, 0);
  const btwVoorbelasting = bonnen.reduce((s: number, b: any) => s + (Number(b.btw_laag_bedrag) || 0) + (Number(b.btw_hoog_bedrag) || 0), 0);
  const btwSaldo = btwTeDragen - btwVoorbelasting;

  /* 5. Bonnen-loop status: deze maand verwerkt + uitgaven per top-leverancier. */
  const bonnenDezeMaand = bonnen.filter((b: any) => b.datum && b.datum.startsWith(curMonthPrefix));
  const uitgavenDezeMaand = bonnenDezeMaand.reduce((s: number, b: any) => s + (Number(b.totaal_bedrag) || 0), 0);

  /* 6. Klanten zonder recent event — leadgen-suggestie. */
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().slice(0, 10);
  const klantenZonderRecentEvent = klanten.filter((k: any) => {
    const lastEvent = events
      .filter((e: any) => e.client_naam === k.naam && e.date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    return !lastEvent || lastEvent.date < sixMonthsAgoIso;
  }).slice(0, 5);

  if (!isMounted) {
    return <LoadingState label="Dashboard laden" />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] selection:bg-[var(--color-accent-gold)]/30">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--color-bg-elevated)]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Spacer for hamburger on mobile */}
            <div className="w-8 shrink-0 sidebar-hidden-spacer" />
            <div className="relative sidebar-hidden-logo">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)]">
                <Flame className="w-5 h-5 text-[var(--color-accent-gold)]" />
              </div>
              <div className="absolute inset-0 rounded-full bg-[var(--color-accent-gold)]/5 blur-md" />
            </div>
            <div className="sidebar-hidden-logo">
              <h1 className="text-[14px] font-semibold tracking-[0.08em] text-[var(--text)] font-['Outfit']">BBQ ARCHITECT</h1>
              <p className="text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">Hop & Bites • Ambacht</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="relative p-2 md:p-2.5 rounded-xl bg-[#111115] border border-[var(--card-solid)] hover:border-[var(--color-border-hover)] transition-colors">
              <Bell className="w-4 h-4 text-[var(--color-text-muted)]" />
              {liveActions.some((a) => a.urgency === "high") && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[var(--color-bg-primary)]" />
              )}
            </button>
            <div className="ml-1 md:ml-2 text-right">
              <p className="text-[10px] md:text-[11px] text-[var(--muted)] font-medium capitalize">
                {isMounted ? currentTime.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" }) : "Laden..."}
              </p>
              <p className="text-[12px] md:text-[13px] font-light text-[var(--muted)] tabular-nums">
                {isMounted ? currentTime.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-5 md:py-8 font-['Outfit'] dashboard-main">
        <style>{`.dashboard-main a, .dashboard-main a *, .dashboard-main button, .dashboard-main button * { text-decoration: none !important; }`}</style>
        {/* ═════════ COMMAND CENTER · ACTIE-BAR ═════════ */}
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[22px] md:text-[26px] font-bold text-[var(--text)] font-['Outfit'] leading-tight">Command center</h2>
            <p className="text-[12px] text-[var(--muted)] mt-0.5">
              {(criticalConflicts.length + verlopenFacturen.length) > 0
                ? `${criticalConflicts.length + verlopenFacturen.length} ${(criticalConflicts.length + verlopenFacturen.length) === 1 ? 'item' : 'items'} vragen aandacht`
                : 'Alles loopt — geen open kritieke items'}
            </p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-bold transition-all active:scale-95 border border-white/20 bg-white text-black hover:bg-white/90 shrink-0"
          >
            <Plus size={14} />
            <span className="hidden md:inline">Nieuw Event</span>
          </button>
        </div>

        {/* ═════════ KRITIEKE BANNER · smoker-conflicten ═════════ */}
        {criticalConflicts.length > 0 && (
          <div className="mb-4 p-4 rounded-xl border" style={{
            background: 'rgba(239,68,68,.06)',
            borderColor: 'rgba(239,68,68,.3)',
          }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold mb-1" style={{ color: 'var(--red)' }}>
                  {criticalConflicts.length} {criticalConflicts.length === 1 ? 'kritiek planning-conflict' : 'kritieke planning-conflicten'}
                </div>
                {criticalConflicts.slice(0, 3).map((c, i) => (
                  <div key={i} className="text-[12px] text-[var(--muted)] mb-0.5">{c.note}</div>
                ))}
                <Link href="/agenda" className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold" style={{ color: 'var(--red)' }}>
                  Open Agenda <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ═════════ FACTUUR-ACTIES · verlopen of binnenkort vervallen ═════════ */}
        {(verlopenFacturen.length > 0 || binnenkortVervallen.length > 0) && (
          <div className="mb-4 p-4 rounded-xl border" style={{
            background: verlopenFacturen.length > 0 ? 'rgba(245,158,11,.06)' : 'rgba(96,165,250,.06)',
            borderColor: verlopenFacturen.length > 0 ? 'rgba(245,158,11,.3)' : 'rgba(96,165,250,.3)',
          }}>
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 shrink-0 mt-0.5" style={{ color: verlopenFacturen.length > 0 ? 'var(--amber)' : 'var(--blue)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold mb-1" style={{ color: verlopenFacturen.length > 0 ? 'var(--amber)' : 'var(--blue)' }}>
                  {verlopenFacturen.length > 0
                    ? `${verlopenFacturen.length} verlopen facturen · ${formatCurrency(verlopenTotaal)}`
                    : `${binnenkortVervallen.length} facturen vervallen binnen 7 dagen`}
                </div>
                {[...verlopenFacturen, ...binnenkortVervallen].slice(0, 3).map((f: any) => {
                  const daysOverdue = Math.floor((new Date(today).getTime() - new Date(f.vervaldatum).getTime()) / 86400000);
                  return (
                    <div key={f.id} className="text-[12px] text-[var(--muted)] mb-0.5">
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{f.nummer}</span>
                      {' · '}{f.client_naam || '—'}
                      {' · '}<span style={{ color: daysOverdue > 0 ? 'var(--red)' : 'var(--amber)' }}>
                        {daysOverdue > 0 ? `${daysOverdue}d te laat` : `vervalt ${f.vervaldatum}`}
                      </span>
                      {' · '}{formatCurrency(calcFactuurBedrag(f))}
                    </div>
                  );
                })}
                <Link href="/facturen" className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold" style={{ color: verlopenFacturen.length > 0 ? 'var(--amber)' : 'var(--blue)' }}>
                  Stuur herinneringen <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ═════════ BTW-AANGIFTE COUNTDOWN — alleen binnen 14 dagen ═════════ */}
        {btwDeadline && btwDeadline.daysUntil <= 14 && (
          <div className="mb-4 p-4 rounded-xl border" style={{
            background: 'rgba(167,139,250,.06)',
            borderColor: 'rgba(167,139,250,.3)',
          }}>
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--purple)' }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold mb-1" style={{ color: 'var(--purple)' }}>
                  BTW-aangifte over {btwDeadline.daysUntil} dag{btwDeadline.daysUntil === 1 ? '' : 'en'} ({btwDeadline.dateLabel})
                </div>
                <div className="text-[12px] text-[var(--muted)]">
                  Te dragen: {formatCurrency(btwTeDragen)} · Voorbelasting: {formatCurrency(btwVoorbelasting)} ·
                  <span style={{ color: btwSaldo >= 0 ? 'var(--text)' : 'var(--green)', fontWeight: 600 }}> Saldo: {btwSaldo >= 0 ? formatCurrency(btwSaldo) : '+' + formatCurrency(Math.abs(btwSaldo)) + ' terug'}</span>
                </div>
                <Link href="/boekhouding" className="inline-flex items-center gap-1 mt-2 text-[11px] font-semibold" style={{ color: 'var(--purple)' }}>
                  Open BTW-overzicht <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Progress (alleen voor nieuwe users) — automatisch verborgen wanneer voltooid */}
        <OnboardingProgress
          klanten={klanten}
          offertes={offertes}
          events={events}
          facturen={facturen}
          haccpRecords={haccpRecords}
          inventory={inventory}
          gerechten={gerechtenData}
        />

        {/* ═════════ HERO ─ eerstkomend event + week overzicht ═════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mb-6">
          {/* Links: Focus op eerstkomend event — verrijkt met marge + completion-checklist */}
          {heroEvent ? (
            <button
              onClick={() => window.location.href = `/events/${heroEvent.id}/hub`}
              className="text-left p-6 md:p-8 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors cursor-pointer"
              style={{ background: 'var(--card)' }}
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">Eerstkomende event</span>
                <span className="text-[10px] text-[var(--muted)]">→ Open event-hub</span>
              </div>
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[26px] md:text-[32px] font-['Outfit'] font-bold text-[var(--text)] leading-tight mb-1 truncate">{heroEvent.name}</h3>
                  <p className="text-[13px] text-[var(--muted)]">{heroEvent.location || 'Locatie tbd'}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[52px] font-bold text-[var(--text)] leading-none tabular-nums">{daysToHero}</div>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-semibold mt-1">dag{daysToHero === 1 ? '' : 'en'}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="p-3 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">Datum</div>
                  <div className="text-[13px] text-[var(--text)] font-bold tabular-nums">{formatDate(heroEvent.date).day} {formatDate(heroEvent.date).month}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">Gasten</div>
                  <div className="text-[13px] text-[var(--text)] font-bold tabular-nums">{heroEvent.guests || 0}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">Omzet</div>
                  <div className="text-[13px] text-[var(--text)] font-bold tabular-nums">{formatCurrency(heroRevenue)}</div>
                </div>
                <div className="p-3 rounded-lg bg-[var(--color-bg-deep)] border border-[var(--card-solid)]">
                  <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">Marge</div>
                  <div className="text-[13px] font-bold tabular-nums" style={{
                    color: heroCompletion?.margePct == null ? 'var(--muted)'
                      : heroCompletion.margePct >= 65 ? 'var(--green)'
                      : heroCompletion.margePct >= 50 ? 'var(--amber)'
                      : 'var(--red)',
                  }}>
                    {heroCompletion?.margePct != null ? heroCompletion.margePct.toFixed(0) + '%' : '—'}
                  </div>
                </div>
              </div>
              {/* Completion-checklist: één blik laat zien wat nog moet */}
              {heroCompletion && (
                <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--muted)' }}>
                  <span className="flex items-center gap-1" style={{ color: heroCompletion.coursesIngevuld ? 'var(--green)' : 'var(--amber)' }}>
                    {heroCompletion.coursesIngevuld ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    Gangen
                  </span>
                  <span className="flex items-center gap-1" style={{ color: heroCompletion.allergiesIngevuld ? 'var(--green)' : 'var(--muted-light)' }}>
                    {heroCompletion.allergiesIngevuld ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    Allergieën
                  </span>
                  <span className="flex items-center gap-1" style={{ color: heroCompletion.prepIngeplannd ? 'var(--green)' : 'var(--amber)' }}>
                    {heroCompletion.prepIngeplannd ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    Prep
                  </span>
                </div>
              )}
            </button>
          ) : (
            <div className="p-6 md:p-8 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)]">
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Calendar className="w-10 h-10 text-[var(--muted-light)] opacity-40 mb-3" />
                <h3 className="text-[18px] font-bold text-[var(--text)] mb-1">Nog geen events gepland</h3>
                <p className="text-[12px] text-[var(--muted)] mb-4">Plan je eerste BBQ-event en zie hier de aftelling</p>
                <button onClick={() => setWizardOpen(true)} className="px-4 py-2 rounded-lg text-[12px] font-bold bg-[var(--color-accent-gold)] text-black">+ Nieuw Event</button>
              </div>
            </div>
          )}

          {/* Rechts: Week + financials — consistent dark tiles */}
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setWeekDrawerOpen(true)}
              className="text-left p-5 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[var(--muted)]">Deze week</span>
                <span className="text-[10px] text-[var(--muted)]">klik voor lijst</span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-[36px] font-bold text-[var(--text)] leading-none tabular-nums">{weekEvents.length}</span>
                <span className="text-[12px] text-[var(--muted)] font-semibold">event{weekEvents.length === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                <Users className="w-3 h-3 inline mr-1" /> {weekGuests} gasten · <Euro className="w-3 h-3 inline mx-0.5" /> {formatCurrency(weekRevenue)}
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <Link href="/facturen" className="no-underline">
                <div className="p-4 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors cursor-pointer h-full">
                  <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--muted)] mb-2">Open facturen</div>
                  <div className="text-[20px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(openFacturenBedrag)}</div>
                  <div className="text-[10px] text-[var(--muted)] mt-1">
                    {openFacturen.length} stuks
                    {verlopenFacturen.length > 0 && <span style={{ color: 'var(--red)' }}> · {verlopenFacturen.length} te laat</span>}
                  </div>
                </div>
              </Link>
              {/* Toont pipeline OF bonnen-loop activiteit; pipeline=€0 is uninformatief
                  als alle offertes al geaccepteerd zijn. */}
              {prognose > 0 ? (
                <Link href="/offertes" className="no-underline">
                  <div className="p-4 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors cursor-pointer h-full">
                    <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--muted)] mb-2">Pipeline</div>
                    <div className="text-[20px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(prognose)}</div>
                    <div className="text-[10px] text-[var(--muted)] mt-1">{openOffertes.length} offertes open</div>
                  </div>
                </Link>
              ) : (
                <Link href="/inkoop" className="no-underline">
                  <div className="p-4 rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] hover:border-white/20 transition-colors cursor-pointer h-full">
                    <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-[var(--muted)] mb-2">Bonnen deze maand</div>
                    <div className="text-[20px] font-bold text-[var(--text)] tabular-nums">{bonnenDezeMaand.length}</div>
                    <div className="text-[10px] text-[var(--muted)] mt-1">{formatCurrency(uitgavenDezeMaand)} uitgaven</div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ═════════ AI-ADVIES · top inzichten met concrete actie ═════════ */}
        {(klantenZonderRecentEvent.length > 0 || lowMargeOffertes.length > 0 || lowStockItems.length > 0 || verlopenOffertes.length > 0) && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] flex items-center gap-2">
                <Sparkles className="w-3 h-3" style={{ color: 'var(--color-accent-gold)' }} />
                AI-advies
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Lead-suggestie: klanten zonder recent event */}
              {klantenZonderRecentEvent.length > 0 && (
                <Link href="/klanten" className="no-underline">
                  <div className="p-4 rounded-xl border h-full hover:border-white/20 transition-colors cursor-pointer"
                    style={{ background: 'var(--card)', borderColor: 'var(--card-solid)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(196,163,90,.12)' }}>
                        <Star className="w-4 h-4" style={{ color: 'var(--color-accent-gold)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                          {klantenZonderRecentEvent.length} klanten 6+ maand zonder event
                        </div>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--muted)' }}>
                          Stuur een seizoens-aanbod om relatie warm te houden
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--muted-light)' }}>
                          {klantenZonderRecentEvent.slice(0, 3).map((k: any) => k.naam).join(' · ')}
                          {klantenZonderRecentEvent.length > 3 && ' · …'}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-light)' }} />
                    </div>
                  </div>
                </Link>
              )}

              {/* Lage marge waarschuwing */}
              {lowMargeOffertes.length > 0 && (
                <Link href="/offertes" className="no-underline">
                  <div className="p-4 rounded-xl border h-full hover:border-white/20 transition-colors cursor-pointer"
                    style={{ background: 'var(--card)', borderColor: 'rgba(239,68,68,.25)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(239,68,68,.12)' }}>
                        <TrendingDown className="w-4 h-4" style={{ color: 'var(--red)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                          {lowMargeOffertes.length} offertes onder 40% marge
                        </div>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--muted)' }}>
                          Verhoog prijs of versmal menu vóór verzenden
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--muted-light)' }}>
                          {lowMargeOffertes.slice(0, 2).map((o: any) => {
                            const m = _calcMarge(o);
                            return `${o.client_naam || o.nummer} (${m.margePct.toFixed(0)}%)`;
                          }).join(' · ')}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-light)' }} />
                    </div>
                  </div>
                </Link>
              )}

              {/* Verlopen offertes follow-up */}
              {verlopenOffertes.length > 0 && (
                <Link href="/offertes" className="no-underline">
                  <div className="p-4 rounded-xl border h-full hover:border-white/20 transition-colors cursor-pointer"
                    style={{ background: 'var(--card)', borderColor: 'rgba(245,158,11,.25)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(245,158,11,.12)' }}>
                        <Clock className="w-4 h-4" style={{ color: 'var(--amber)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                          {verlopenOffertes.length} offertes verlopen
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--muted)' }}>
                          Geldig-tot datum gepasseerd zonder klant-beslissing — bel of mail follow-up
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-light)' }} />
                    </div>
                  </div>
                </Link>
              )}

              {/* Voorraad onder minimum */}
              {lowStockItems.length > 0 && (
                <Link href="/voorraad" className="no-underline">
                  <div className="p-4 rounded-xl border h-full hover:border-white/20 transition-colors cursor-pointer"
                    style={{ background: 'var(--card)', borderColor: 'rgba(96,165,250,.25)' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'rgba(96,165,250,.12)' }}>
                        <Package className="w-4 h-4" style={{ color: 'var(--blue)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold mb-1" style={{ color: 'var(--text)' }}>
                          {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'items'} onder minimum voorraad
                        </div>
                        <div className="text-[11px] mb-2" style={{ color: 'var(--muted)' }}>
                          Bestel bij voor het volgende event
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--muted-light)' }}>
                          {lowStockItems.slice(0, 3).map((i: any) => `${i.naam}: ${i.current_stock || 0}/${i.min_stock}${i.unit || ''}`).join(' · ')}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--muted-light)' }} />
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* ═════════ PRIJSLIJST UPDATE REMINDER — elke 4 wkn (AGF 2 wkn) ═════════ */}
        <PriceUpdateReminder />

        {/* ═════════ GROTE ACTIE KAARTEN ═════════ */}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">Snel aan de slag</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { icon: Plus, label: 'Nieuw Event', desc: 'Boeking starten', action: () => setWizardOpen(true) },
            { icon: FileText, label: 'Offerte', desc: 'Aan klant sturen', href: '/offertes' },
            { icon: FileScan, label: 'Factuur scannen', desc: 'AI leest mee', href: '/price-intelligence' },
            { icon: Calendar, label: 'Agenda', desc: 'Planning bekijken', href: '/agenda' },
            { icon: Package, label: 'Voorraad', desc: 'Tekorten checken', href: '/voorraad' },
            { icon: UtensilsCrossed, label: 'Menu', desc: 'Gerechten beheer', href: '/menu-engineering' },
          ].map((a) => {
            const inner = (
              <div className="group p-4 rounded-xl cursor-pointer h-full transition-all duration-150"
                style={{
                  border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)',
                  background: 'var(--card)',
                  boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand-primary) 8%, transparent), 0 4px 12px color-mix(in srgb, var(--brand-primary) 6%, transparent)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--brand-primary) 40%, transparent), 0 4px 16px color-mix(in srgb, var(--brand-primary) 20%, transparent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 1px color-mix(in srgb, var(--brand-primary) 8%, transparent), 0 4px 12px color-mix(in srgb, var(--brand-primary) 6%, transparent)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 35%, transparent)' }}>
                  <a.icon className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
                </div>
                <div className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{a.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{a.desc}</div>
              </div>
            );
            return a.href ? (
              <Link key={a.label} href={a.href} className="no-underline">{inner}</Link>
            ) : (
              <button key={a.label} onClick={a.action} className="text-left w-full bg-transparent p-0 border-0">{inner}</button>
            );
          })}
        </div>

        {/* ═════════ KOMENDE EVENTS (groot) + PIPELINE (klein) ═════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-6">
          <MetallicCard className="p-5 md:p-6" hover={false}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--color-accent-gold)]/10">
                  <Calendar className="w-4 h-4 text-[var(--color-accent-gold)]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-medium text-[var(--text)]">Aankomende events</h3>
                  <p className="text-[11px] text-[var(--muted)]">Klik voor details</p>
                </div>
              </div>
              <Link href="/events" className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1">
                Alles <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {nextEventsList.length === 0 ? (
              <div className="text-center py-10">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-[var(--muted-light)] opacity-40" />
                <p className="text-[13px] text-[var(--muted)] mb-3">Nog geen events gepland</p>
                <button onClick={() => setWizardOpen(true)} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--color-accent-gold)] text-black">+ Nieuw event</button>
              </div>
            ) : (
              <div className="space-y-2">
                {nextEventsList.map((event: any) => {
                  const date = formatDate(event.date);
                  const days = Math.max(0, Math.ceil((new Date(event.date).getTime() - new Date(today).getTime()) / 86400000));
                  return (
                    <button key={event.id} onClick={() => setSelectedEvent(event)} className="w-full group flex items-center gap-4 p-3 rounded-xl bg-[var(--color-bg-deep)] hover:border-white/20 border border-transparent transition-all text-left">
                      <div className="flex-shrink-0 w-12 text-center">
                        <div className="text-[20px] font-bold text-[var(--text)] leading-none">{date.day}</div>
                        <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-semibold mt-0.5">{date.month}</div>
                      </div>
                      <div className="w-px h-10 bg-[var(--border)]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <StatusDot status={event.status} />
                          <span className="text-[13px] font-bold text-[var(--text)] truncate">{event.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10.5px] text-[var(--muted)]">
                          <span><Users className="w-3 h-3 inline mr-1" />{event.guests}p</span>
                          <span className="truncate"><MapPin className="w-3 h-3 inline mr-1" />{event.location || 'tbd'}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-[13px] font-bold text-[var(--text)] tabular-nums">{formatCurrency((event.guests || 0) * (event.ppp || 0))}</div>
                        <div className="text-[9px] uppercase tracking-[0.15em] text-[var(--muted)] font-semibold">over {days} dag{days === 1 ? '' : 'en'}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--muted-light)] group-hover:text-[var(--text)] transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </MetallicCard>

          {/* Pipeline top offertes */}
          <MetallicCard className="p-5 md:p-6" hover={false}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--blue)]/10">
                  <TrendingUp className="w-4 h-4 text-[var(--blue)]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-medium text-[var(--text)]">Top offertes</h3>
                  <p className="text-[11px] text-[var(--muted)]">Open in pipeline</p>
                </div>
              </div>
              <Link href="/offertes" className="text-[11px] font-medium text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1">Alles <ArrowRight className="w-3 h-3" /></Link>
            </div>
            {openOffertes.length > 0 ? (
              <>
                <div className="space-y-3">
                  {openOffertes.sort((a: any, b: any) => {
                    const ta = calcLineTotals(a.items).totaal || (a.aantal_gasten || 0) * (a.basis_prijs_pp || 0);
                    const tb = calcLineTotals(b.items).totaal || (b.aantal_gasten || 0) * (b.basis_prijs_pp || 0);
                    return tb - ta;
                  }).slice(0, 5).map((off: any) => {
                    const fromItems = calcLineTotals(off.items).totaal;
                    const eventTotal = fromItems > 0 ? fromItems : (off.aantal_gasten || 0) * (off.basis_prijs_pp || 0);
                    const percentage = prognose > 0 ? (eventTotal / prognose) * 100 : 0;
                    return (
                      <Link key={off.id} href="/offertes" className="block group">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-[11.5px] text-[var(--text)] truncate max-w-[140px] font-medium group-hover:text-[var(--color-accent-gold)] transition-colors">{off.client_naam || off.nummer}</span>
                          <span className="text-[11.5px] text-[var(--text)] tabular-nums">{formatCurrency(eventTotal)}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-white/70 transition-all duration-700" style={{ width: `${percentage}%` }} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-5 pt-4 border-t border-[var(--card-solid)] flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">Totaal prognose</span>
                  <span className="text-[16px] font-bold text-[var(--text)] tabular-nums">{formatCurrency(prognose)}</span>
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-[12px] text-[var(--muted)]">Geen open offertes</div>
            )}
          </MetallicCard>
        </div>

        {/* ═════════ ZAAK-GEZONDHEID (4 grote stats) ═════════ */}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">Zaak in één oogopslag</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <BigStatCard icon={Calendar} color="var(--blue)" label="Bevestigde events" value={confirmedEvents.length.toString()} sub="dit jaar" href="/events" />
          <BigStatCard icon={Euro} color="var(--emerald)" label="Omzet gerealiseerd" value={formatCurrency(totalRevenue)} sub={`${betaaldFacturen.length} betaalde facturen`} href="/financien" />
          <BigStatCard icon={Users} color="var(--sky)" label="Totaal gasten" value={events.reduce((sum: number, e: any) => sum + (e.guests || 0), 0).toString()} sub="over alle events" href="/events" />
          <BigStatCard icon={Euro} color="var(--color-accent-gold)" label="Deze maand" value={formatCurrency(monthRevenue)} sub={`${monthEvents.length} event${monthEvents.length === 1 ? '' : 's'}`} />
        </div>

        {/* ═════════ AI INZICHTEN (klein, collapsed) ═════════ */}
        {aiNudges.length > 0 && (
          <MetallicCard className="p-5 mb-6" hover={false}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--color-accent-gold)]/10">
                <Sparkles className="w-4 h-4 text-[var(--color-accent-gold)]" />
              </div>
              <div>
                <h3 className="text-[14px] font-medium text-[var(--text)]">AI inzichten</h3>
                <p className="text-[11px] text-[var(--muted)]">{aiNudges.length} tip{aiNudges.length === 1 ? '' : 's'} voor jouw zaak</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {visibleNudges.map((nudge) => {
                const textColor = nudge.type === 'warning' ? 'text-amber-300' : nudge.type === 'positive' ? 'text-emerald-300' : 'text-blue-300';
                return (
                  <Link key={nudge.id} href={nudge.link} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--color-bg-deep)] hover:bg-[#17171c] transition-colors no-underline" style={{ textDecoration: 'none' }}>
                    <span className="text-[16px]">{nudge.icon}</span>
                    <span className={`text-[12px] ${textColor} flex-1 truncate`} style={{ textDecoration: 'none' }}>{nudge.message}</span>
                    <ArrowRight className="w-3 h-3 text-[var(--muted-light)]" />
                  </Link>
                );
              })}
            </div>
            {aiNudges.length > 4 && (
              <button onClick={() => setShowAllNudges(!showAllNudges)} className="mt-3 text-[11px] text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1 mx-auto">
                {showAllNudges ? 'Minder tonen' : `Nog ${aiNudges.length - 4} tips tonen`}
                <ChevronDown className={`w-3 h-3 transition-transform ${showAllNudges ? 'rotate-180' : ''}`} />
              </button>
            )}
          </MetallicCard>
        )}

        {/* ═════════ RECENTE ACTIVITEIT (compact) ═════════ */}
        {recentActivity.length > 0 && (
          <MetallicCard className="p-5" hover={false}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)] mb-3">Recente activiteit</h3>
            <div className="flex flex-col gap-2">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.dot }} />
                  <span className="text-[12px] text-[var(--text)] flex-1 truncate">{item.text}</span>
                  <span className="text-[10px] text-[var(--muted)] tabular-nums">{item.time === 'recent' ? 'nu' : new Date(item.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </MetallicCard>
        )}
      </main>

      {/* ═════════ DRAWERS ═════════ */}
      {selectedEvent && <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {weekDrawerOpen && <WeekDetailDrawer events={weekEvents} onClose={() => setWeekDrawerOpen(false)} onSelect={(e) => { setWeekDrawerOpen(false); setSelectedEvent(e); }} />}

      <EventWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => ev.refetch?.()}
      />
    </div>
  );
}

/** Grote kliibare stat-kaart — clean, geen felle accenten */
function BigStatCard({ icon: Icon, color, label, value, sub, href }: { icon: any; color: string; label: string; value: string; sub: string; href?: string }) {
  void color; // color prop behouden voor compat, maar niet visueel gebruikt
  const content = (
    <div className="p-5 rounded-xl h-full transition-all"
      style={{
        border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)',
        background: 'var(--card)',
        boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand-primary) 6%, transparent)',
      }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--brand-primary) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)' }}>
          <Icon className="w-4 h-4" style={{ color: 'var(--brand-primary)' }} />
        </div>
        <span className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: 'var(--muted)' }}>{label}</span>
      </div>
      <div className="text-[26px] font-bold tabular-nums leading-tight" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="no-underline">{content}</Link> : content;
}

/** Drawer: details van een event */
function EventDetailDrawer({ event, onClose }: { event: any; onClose: () => void }) {
  const revenue = (event.guests || 0) * (event.ppp || 0);
  const days = Math.max(0, Math.ceil((new Date(event.date).getTime() - new Date().getTime()) / 86400000));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-accent-gold)', fontWeight: 700, marginBottom: 4 }}>Nog {days} dag{days === 1 ? '' : 'en'}</div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 24, fontWeight: 300, color: 'var(--text)' }}>{event.name || 'Event'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{event.location || 'Locatie nog niet ingesteld'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--muted)', marginBottom: 4 }}>Datum</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{event.date}</div>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--muted)', marginBottom: 4 }}>Gasten</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{event.guests || 0}p</div>
            </div>
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--muted)', marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>{event.status || 'nieuw'}</div>
            </div>
          </div>
          <div style={{ padding: 16, borderRadius: 10, background: 'linear-gradient(135deg, rgba(196,163,90,.15), rgba(168,137,62,.05))', border: '1px solid rgba(196,163,90,.3)' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.2em', color: 'var(--color-accent-gold)', fontWeight: 700, marginBottom: 6 }}>Verwachte omzet</div>
            <div style={{ fontSize: 32, fontFamily: 'Outfit, sans-serif', fontWeight: 400, color: 'var(--color-accent-gold)', fontVariantNumeric: 'tabular-nums' }}>
              {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(revenue)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {event.guests || 0} gasten × €{(event.ppp || 0).toFixed(2)} per persoon
            </div>
          </div>
          {event.client_naam && (
            <div style={{ padding: 14, borderRadius: 10, background: 'var(--color-bg-deep)', border: '1px solid var(--card-solid)' }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.15em', color: 'var(--muted)', marginBottom: 4 }}>Klant</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{event.client_naam}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href={`/agenda`} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: 'var(--color-accent-gold)', color: 'var(--brand-background, #000)', textAlign: 'center', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Open in agenda</Link>
            <Link href={`/events`} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--card-solid)', color: 'var(--text)', textAlign: 'center', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Event bewerken</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Drawer: lijst van events deze week */
function WeekDetailDrawer({ events, onClose, onSelect }: { events: any[]; onClose: () => void; onSelect: (e: any) => void }) {
  const totalGuests = events.reduce((s, e) => s + (e.guests || 0), 0);
  const totalRevenue = events.reduce((s, e) => s + ((e.guests || 0) * (e.ppp || 0)), 0);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', overflow: 'auto' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 300, color: 'var(--text)' }}>Deze week</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{events.length} event{events.length === 1 ? '' : 's'} · {totalGuests} gasten · {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(totalRevenue)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 6 }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Geen events gepland deze week.</div>
          ) : (
            events.sort((a, b) => a.date < b.date ? -1 : 1).map((ev) => (
              <button key={ev.id} onClick={() => onSelect(ev)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--card-solid)', cursor: 'pointer', color: 'var(--text)', textAlign: 'left' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{ev.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{ev.date} · {ev.guests || 0}p · {ev.location || 'tbd'}</div>
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-gold)', fontVariantNumeric: 'tabular-nums' }}>
                  {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format((ev.guests || 0) * (ev.ppp || 0))}
                </span>
                <ChevronRight size={14} style={{ color: 'var(--muted-light)' }} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
