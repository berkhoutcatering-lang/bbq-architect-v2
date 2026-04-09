/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Calendar, ChefHat, Clock, FileText, TrendingUp, AlertTriangle, ArrowRight,
  Package, Users, Euro, Flame, CheckCircle2, Bell, Settings, Search, BarChart3,
  MapPin, ChevronRight, ChevronDown, Sparkles, Shield, Star, ShoppingCart, UtensilsCrossed
} from "lucide-react";
import { useSupabase } from '@/lib/useSupabase';
import { fmt, fmtNl, safeJsonParse, calcMargeForOfferte, calcLineTotals, MAANDEN_KORT } from '@/lib/utils';
import MetallicCard from '@/components/MetallicCard';
import { StatusDot } from '@/components/StatusBadge';
import WeekStrip from '@/components/WeekStrip';
import EventWizard from '@/components/EventWizard';
import OnboardingProgress from '@/components/OnboardingProgress';
import DrillDownKPI from '@/components/DrillDownKPI';

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

  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState("Welkom");
  const [isMounted, setIsMounted] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showAllNudges, setShowAllNudges] = useState(false);

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
  events.slice(0, 5).forEach((e: any) => recentFeed.push({ text: `Event toegevoegd: ${e.title || 'Nieuw'}`, time: e.created_at || 'recent', dot: '#10b981', ts: new Date(e.created_at || Date.now()).getTime() }));
  offertes.slice(0, 5).forEach((o: any) => recentFeed.push({ text: `Offerte: ${o.client_naam || 'Nieuw'}`, time: o.created_at || 'recent', dot: '#3b82f6', ts: new Date(o.created_at || Date.now()).getTime() }));
  facturen.slice(0, 5).forEach((f: any) => recentFeed.push({ text: `Factuur gegenereerd: ${f.factuur_nummer || 'Concept'}`, time: f.created_at || 'recent', dot: '#f59e0b', ts: new Date(f.created_at || Date.now()).getTime() }));
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

  if (!isMounted) {
    return (
      <div className="min-h-screen bg-[#121215] flex items-center justify-center text-white/50">
        <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121215] text-white selection:bg-[#c4a35a]/30">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#121215]/80 border-b border-[#151518]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Spacer for hamburger on mobile */}
            <div className="w-8 shrink-0 sidebar-hidden-spacer" />
            <div className="relative sidebar-hidden-logo">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[#2a2a30]">
                <Flame className="w-5 h-5 text-[#c4a35a]" />
              </div>
              <div className="absolute inset-0 rounded-full bg-[#c4a35a]/5 blur-md" />
            </div>
            <div className="sidebar-hidden-logo">
              <h1 className="text-[14px] font-semibold tracking-[0.08em] text-white font-['Outfit']">BBQ ARCHITECT</h1>
              <p className="text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">Hop & Bites • Ambacht</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="relative p-2 md:p-2.5 rounded-xl bg-[#111115] border border-[#1e1e22] hover:border-[#2a2a30] transition-colors">
              <Bell className="w-4 h-4 text-[#555558]" />
              {liveActions.some((a) => a.urgency === "high") && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#121215]" />
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

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-5 md:py-8 font-['Outfit']">
        <div className="mb-6 md:mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl md:text-3xl font-extralight text-white tracking-tight mb-1">
              {greeting}, <span className="font-normal">Pitmaster</span>
            </h2>
            <p className="text-[13px] md:text-[14px] text-[var(--muted)] font-light">Command Center — alles onder controle.</p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #c4a35a, #a8893e)', color: '#000' }}
          >
            <span className="text-lg leading-none">+</span>
            <span className="hidden md:inline">Nieuw Event</span>
          </button>
        </div>

        <WeekStrip events={nextEventsList} />

        {/* Onboarding Progress */}
        <OnboardingProgress
          klanten={klanten}
          offertes={offertes}
          events={events}
          facturen={facturen}
          haccpRecords={haccpRecords}
          inventory={inventory}
          gerechten={gerechtenData}
        />

        {/* Zone 1: Aandacht Nu */}
        {liveActions.length > 0 && (
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
              <Bell className="w-3.5 h-3.5 inline-block mr-2 text-red-400" />
              Aandacht nodig
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {liveActions.map((action) => {
                const isHigh = action.urgency === 'high';
                return (
                  <Link key={action.id} href={action.link}>
                    <MetallicCard
                      className="p-4 group"
                      accent={isHigh ? '#ef4444' : '#f59e0b'}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isHigh ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                          {isHigh
                            ? <AlertTriangle className="w-4 h-4 text-red-400" />
                            : <Clock className="w-4 h-4 text-amber-400" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-medium truncate ${isHigh ? 'text-red-400' : 'text-amber-300'}`}>
                            {action.message}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-1 transition-transform shrink-0" />
                      </div>
                    </MetallicCard>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Zone 2: AI Inzichten */}
        {aiNudges.length > 0 && (
          <div className="mb-6 md:mb-8">
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
              <Sparkles className="w-3.5 h-3.5 inline-block mr-2 text-[#c4a35a]" />
              AI Inzichten
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visibleNudges.map((nudge, idx) => {
                const borderColor = nudge.type === 'warning' ? '#f59e0b' : nudge.type === 'positive' ? '#10b981' : '#3b82f6';
                const bgTint = nudge.type === 'warning' ? 'bg-amber-500/10' : nudge.type === 'positive' ? 'bg-emerald-500/10' : 'bg-blue-500/10';
                const textColor = nudge.type === 'warning' ? 'text-amber-300' : nudge.type === 'positive' ? 'text-emerald-300' : 'text-blue-300';
                return (
                  <Link key={nudge.id} href={nudge.link}>
                    <div
                      className="opacity-0 animate-[fadeInUp_0.4s_ease-out_forwards]"
                      style={{ animationDelay: `${idx * 80}ms` }}
                    >
                      <MetallicCard className="p-4 group relative overflow-hidden" accent={borderColor}>
                        <div
                          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
                          style={{ background: `linear-gradient(to bottom, ${borderColor}, transparent)` }}
                        />
                        <div className="flex items-center gap-3 pl-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bgTint}`}>
                            <span className="text-[16px] leading-none">{nudge.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${textColor}`}>
                              {nudge.message}
                            </p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-[var(--muted)] group-hover:translate-x-1 transition-transform shrink-0" />
                        </div>
                      </MetallicCard>
                    </div>
                  </Link>
                );
              })}
            </div>
            {aiNudges.length > 4 && (
              <button
                onClick={() => setShowAllNudges(!showAllNudges)}
                className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)] hover:text-white transition-colors uppercase tracking-[0.1em] mx-auto"
              >
                {showAllNudges ? 'Minder tonen' : `Meer tonen (${aiNudges.length - 4})`}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${showAllNudges ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )}

        {/* Zone 3: Zaak-gezondheid */}
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          <BarChart3 className="w-3.5 h-3.5 inline-block mr-2 text-[#3b82f6]" />
          Zaak-gezondheid
        </h3>
        <div className="dash-kpi-grid">
          <DrillDownKPI
            icon={<Calendar className="w-4 h-4 text-[#3b82f6]" />}
            label="Bevestigde Events"
            value={confirmedEvents.length.toString()}
            subtitle={`totaal geregistreerd dit jaar`}
            accentColor="#3b82f6"
            trend="+12%"
            href="/events"
            items={nextEventsList.slice(0, 4).map((e: any) => ({
              label: `${e.name || 'Event'} — ${e.guests || 0}p`,
              value: formatDate(e.date).day + ' ' + formatDate(e.date).month,
              href: '/agenda',
              color: e.status === 'confirmed' ? '#3b82f6' : 'var(--muted)',
            }))}
          />
          <DrillDownKPI
            icon={<Euro className="w-4 h-4 text-emerald-400" />}
            label="Gerealiseerde Omzet"
            value={formatCurrency(totalRevenue)}
            subtitle={`${betaaldFacturen.length} betaalde facturen`}
            accentColor="#34d399"
            trend="+8.2%"
            href="/financien"
            items={(() => {
              const topFacturen = betaaldFacturen
                .map((f: any) => {
                  let bedrag = 0;
                  (f.items || []).forEach((item: any) => { bedrag += (item.qty || 0) * (item.prijs || 0); });
                  return { label: f.client_naam || f.factuur_nummer || 'Factuur', value: formatCurrency(bedrag) };
                })
                .sort((a: any, b: any) => parseFloat(b.value.replace(/[^\d,-]/g, '').replace(',', '.')) - parseFloat(a.value.replace(/[^\d,-]/g, '').replace(',', '.')))
                .slice(0, 4);
              return topFacturen;
            })()}
          />
          <DrillDownKPI
            icon={<FileText className="w-4 h-4 text-[#8b8bf0]" />}
            label="Open Facturen & Prognose"
            value={formatCurrency(prognose + openFacturenBedrag)}
            subtitle={`${formatCurrency(openFacturenBedrag)} facturen / ${formatCurrency(prognose)} open offertes`}
            accentColor="#8b8bf0"
            trend="-3%"
            href="/facturen"
            items={[
              { label: 'Open facturen', value: formatCurrency(openFacturenBedrag), color: '#f59e0b' },
              { label: 'Open offertes', value: formatCurrency(prognose), color: '#8b8bf0' },
              ...openFacturen.slice(0, 3).map((f: any) => {
                let bedrag = 0;
                (f.items || []).forEach((item: any) => { bedrag += (item.qty || 0) * (item.prijs || 0); });
                return { label: f.client_naam || f.factuur_nummer || 'Factuur', value: formatCurrency(bedrag), href: '/facturen' };
              }),
            ]}
          />
          <DrillDownKPI
            icon={<Users className="w-4 h-4 text-sky-400" />}
            label="Totaal Gasten"
            value={events.reduce((sum: number, e: any) => sum + (e.guests || 0), 0).toString()}
            subtitle="over alle geregistreerde events"
            accentColor="#38bdf8"
            trend="+24%"
            href="/events"
            items={(() => {
              const byType: Record<string, number> = {};
              events.forEach((e: any) => {
                const type = e.type || 'Overig';
                byType[type] = (byType[type] || 0) + (e.guests || 0);
              });
              return Object.entries(byType)
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([type, guests]) => ({ label: type, value: `${guests} gasten` }));
            })()}
          />
        </div>

        <div className="dash-content-grid">
          <div className="dash-main-col">

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-[#c4a35a]/10 border border-[#c4a35a]/20">
                    <Calendar className="w-4 h-4 text-[#c4a35a]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-white tracking-tight">Aankomende Events</h3>
                    <p className="text-[11px] text-[var(--muted-light)]">Geplande reserveringen en opties</p>
                  </div>
                </div>
                <Link href="/events" className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)] hover:text-white transition-colors uppercase tracking-[0.1em]">
                  Alle events <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {nextEventsList.length === 0 ? (
                <p className="text-center text-[13px] text-[#444447] py-6">Geen aankomende events.</p>
              ) : (
                <div className="space-y-2">
                  {nextEventsList.map((event: any) => {
                    const date = formatDate(event.date);
                    return (
                      <Link key={event.id} href={`/agenda`} className="group flex items-center gap-3 md:gap-5 p-3 md:p-4 rounded-xl bg-[#0e0e10] hover:bg-[#121216] border border-transparent hover:border-[#1e1e22] transition-all duration-300">
                        <div className="flex-shrink-0 w-11 md:w-14 text-center">
                          <p className="text-[18px] md:text-[22px] font-light text-white leading-none">{date.day}</p>
                          <p className="text-[9px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] text-[var(--muted)] mt-0.5">{date.month}</p>
                        </div>
                        <div className="w-px h-8 md:h-10 bg-[var(--border)]" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 md:mb-1">
                            <StatusDot status={event.status} />
                            <p className="text-[12px] md:text-[13.5px] font-medium text-white truncate">{event.name}</p>
                          </div>
                          <div className="flex items-center gap-3 md:gap-4 text-[10px] md:text-[11.5px] text-[var(--muted)]">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {event.guests}p</span>
                            <span className="flex items-center gap-1 truncate"><MapPin className="w-3 h-3 shrink-0" /> {event.location || 'Onbekend'}</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 hidden sm:block">
                          <p className="text-[15px] font-light text-white tabular-nums">{formatCurrency((event.guests || 0) * (event.ppp || 0))}</p>
                          <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mt-0.5">{event.status === 'confirmed' ? 'Bevestigd' : event.status === 'completed' ? 'Afgerond' : event.status === 'optie' ? 'Optie' : 'Nieuw'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#333] group-hover:text-[#666] transition-colors flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </MetallicCard>

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-400/10 border border-emerald-400/20">
                    <ChefHat className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-white tracking-tight">Actuele Productielijst (Prep)</h3>
                    <p className="text-[11px] text-[#444447]">{prepEvents.length > 0 ? `${prepEvents[0].client_naam} • ${prepEvents[0].datum}` : "Geen geaccepteerde/goedgekeurde offertes nabij."}</p>
                  </div>
                </div>
                {prepEvents.length > 0 && <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">{prepEvents[0].aantal_gasten}p</span>}
              </div>

              {prepEvents.length > 0 ? (
                <div className="space-y-4">
                  {prepEvents.slice(0, 2).map((offerte: any, oIndex: number) => {
                    const sel = safeJsonParse(offerte.menu_selectie, {});
                    const prepItems: { dish: string; gang: string }[] = [];
                    gangenData.sort((a: any, b: any) => (a.volgorde || 0) - (b.volgorde || 0)).forEach((g: any) => {
                      const dishes = sel[g.slug] || [];
                      dishes.forEach((d: any) => {
                        const dishName = typeof d === 'string' ? d : (d.naam || d.gerecht_naam || 'Onbekend gerecht');
                        prepItems.push({ dish: dishName, gang: g.naam });
                      });
                    });

                    return prepItems.length > 0 ? (
                      <div key={offerte.id} className="space-y-2">
                        {oIndex > 0 && <div className="h-px w-full bg-[#151518] my-4" />}
                        <div className="mb-2 text-[12px] font-semibold text-[#8b8b8f] tracking-wide">{offerte.client_naam}</div>
                        {prepItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-4 p-3.5 rounded-xl bg-[#0e0e10] border border-[#151518]">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#1a1a1e]">
                              <Clock className="w-4 h-4 text-[#444447]" />
                            </div>
                            <div className="flex-1">
                              <p className="text-[13px] text-white font-medium">{item.dish}</p>
                              <p className="text-[11px] text-[var(--muted-light)]">{item.gang}</p>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.15em] px-2.5 py-1 rounded-full text-[var(--muted)] bg-[#1a1a1e] border border-[var(--border)]">
                              Prep To Do
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-[13px] text-[#444447]">Geen actuele prep voor vandaag</p>
                </div>
              )}
            </MetallicCard>

          </div>

          <div className="dash-side-col">

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted)] mb-3 md:mb-4">Snelle Acties</h3>
              <div className="dash-actions-grid">
                {[
                  { icon: <FileText className="w-4 h-4" />, label: "Offertes", href: "/offertes" },
                  { icon: <Calendar className="w-4 h-4" />, label: "Agenda", href: "/agenda" },
                  { icon: <ShoppingCart className="w-4 h-4" />, label: "Inkoop", href: "/inkoop" },
                  { icon: <UtensilsCrossed className="w-4 h-4" />, label: "Menu", href: "/menu-engineering" },
                  { icon: <Shield className="w-4 h-4" />, label: "HACCP", href: "/haccp" },
                  { icon: <Calendar className="w-4 h-4" />, label: "Kalender", href: "/api/calendar/ical" },
                  { icon: <Settings className="w-4 h-4" />, label: "Integraties", href: "/instellingen/integraties" },
                  { icon: <BarChart3 className="w-4 h-4" />, label: "Analytics", href: "/financien" },
                ].map((action) => (
                  <Link key={action.label} href={action.href} className="flex flex-col items-center justify-center gap-2 p-3 md:p-4 min-h-[64px] rounded-xl bg-[#0e0e10] border border-[#151518] hover:border-[#3b82f6]/30 hover:bg-[#121216] active:scale-95 transition-all duration-200 group">
                    <div className="text-[#555] group-hover:text-[#3b82f6] transition-colors">{action.icon}</div>
                    <span className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.08em] text-[#555] group-hover:text-[#888] transition-colors text-center leading-tight">{action.label}</span>
                  </Link>
                ))}
              </div>
            </MetallicCard>

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <h3 className="text-[15px] font-medium text-white tracking-tight">Meldingen Center</h3>
              </div>
              {liveActions.length > 0 ? (
                <div className="space-y-2">
                  {liveActions.map((action, i) => (
                    <Link key={i} href={action.link} className="flex items-center gap-3 p-3 rounded-xl bg-[#0e0e10] hover:bg-[#121216] border border-transparent hover:border-[#1e1e22] transition-all duration-300 group">
                      <StatusDot status={action.urgency} />
                      <span className="text-[12.5px] font-medium text-[var(--muted)] group-hover:text-white transition-colors flex-1 line-clamp-1">{action.message}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-light)] group-hover:text-white transition-colors" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-[13px] text-[#444447]">Geen lopende acties of alerts ontdekt.</div>
              )}
            </MetallicCard>

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <div className="flex flex-col mb-5">
                <h3 className="text-[15px] font-medium text-white tracking-tight leading-none">Recente activiteit</h3>
                <p className="text-[10px] text-[#444447] mt-1.5 uppercase tracking-wider">Laatste updates van vandaag</p>
              </div>
              <div className="space-y-4">
                {recentActivity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between pb-3 last:pb-0 last:border-0 border-b border-[#151518]/50">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.dot }} />
                      <span className="text-[12.5px] font-medium text-[#888]">{item.text}</span>
                    </div>
                    <span className="text-[10px] font-medium text-[#444447] whitespace-nowrap ml-4">
                      {item.time === 'recent' ? 'nu' : new Date(item.ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                {recentActivity.length === 0 && (
                  <p className="text-[13px] text-[#444447]">Nog geen activiteit geregistreerd.</p>
                )}
              </div>
            </MetallicCard>

            <MetallicCard className="p-4 md:p-6" hover={false}>
              <h3 className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#555558] mb-4">Pipeline Top Offertes</h3>
              {openOffertes.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {openOffertes.sort((a: any, b: any) => { const ta = calcLineTotals(a.items).totaal || (a.aantal_gasten || 0) * (a.basis_prijs_pp || 0); const tb = calcLineTotals(b.items).totaal || (b.aantal_gasten || 0) * (b.basis_prijs_pp || 0); return tb - ta; }).slice(0, 4).map((off: any) => {
                      const fromItems = calcLineTotals(off.items).totaal;
                      const eventTotal = fromItems > 0 ? fromItems : (off.aantal_gasten || 0) * (off.basis_prijs_pp || 0);
                      const percentage = prognose > 0 ? (eventTotal / prognose) * 100 : 0;
                      return (
                        <div key={off.id}>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[11px] text-[var(--muted)] truncate max-w-[140px] font-medium">{off.client_naam || off.nummer}</span>
                            <span className="text-[11px] text-[var(--muted)] tabular-nums">{formatCurrency(eventTotal)}</span>
                          </div>
                          <div className="h-1 bg-[#151518] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-[#c4a35a] to-[#d4b36a] transition-all duration-700" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#151518] flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#555558]">Totaal Prognose</span>
                    <span className="text-[15px] font-medium text-white tabular-nums">{formatCurrency(prognose)}</span>
                  </div>
                </>
              ) : (
                <div className="text-[13px] text-[#444447]">Geen actuele pijplijn of concept offertes.</div>
              )}
            </MetallicCard>

            <div className="relative px-6 py-5">
              <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#c4a35a]/30 to-transparent" />
              <blockquote className="pl-5">
                <p className="text-[12px] text-[var(--muted)] italic leading-relaxed font-light">
                  &ldquo;A perfect dish is no accident. It&apos;s the seamless execution of logistics, craft, and fire.&rdquo;
                </p>
                <footer className="mt-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-light)]">— Mathijs Berkhout</footer>
              </blockquote>
            </div>

          </div>
        </div>
      </main>

      <EventWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => ev.refetch?.()}
      />
    </div>
  );
}
