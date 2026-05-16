/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Bell, Flame, Plus, X, ChevronRight, Car } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useSupabase } from '@/lib/useSupabase';
import { useAuth } from '@/lib/AuthContext';
import { calcMargeForOfferte, calcLineTotals, MAANDEN_KORT, plural } from '@/lib/utils';
import { detectAllConflicts } from '@/lib/conflictDetection';
import EventWizard from '@/components/EventWizard';
import OnboardingChecklist, { type ChecklistData } from '@/components/onboarding/OnboardingChecklist';
import PersonaQuiz from '@/components/onboarding/PersonaQuiz';
import { LoadingState } from '@/components/LoadingState';
import { useBrandLogo } from '@/lib/useBrandLogo';
import { trackOnce } from '@/lib/track';

// Today-redesign components
import GreetingStrip from '@/components/dashboard/today/GreetingStrip';
import EventHero, { type EventHeroEvent } from '@/components/dashboard/today/EventHero';
import AIQuickPrompts from '@/components/dashboard/today/AIQuickPrompts';
import AIPromptDrawer, { type QuickPrompt } from '@/components/dashboard/today/AIPromptDrawer';
import BusinessCharts from '@/components/dashboard/today/BusinessCharts';
import KPIStrip, { type KpiItem } from '@/components/dashboard/today/KPIStrip';
import CompactDagbriefing from '@/components/dashboard/today/CompactDagbriefing';
import AttentionPanel, { type AttentionItem } from '@/components/dashboard/today/AttentionPanel';
import QuickActions from '@/components/dashboard/today/QuickActions';
import BriefingTimeline from '@/components/dashboard/today/BriefingTimeline';

// Today-data helpers
import { computeRevenueMix } from '@/lib/today/revenue-mix';
import { compute6MonthRevenue } from '@/lib/today/revenue-buckets';
import { computeSupplierSpend } from '@/lib/today/supplier-spend';
import {
  trendDaysToNext, trendEventsPerDay, trendMonthRevenue, trendPipelineEuro,
  trendOpenInvoices, trendStockLow, trendStockValue, trendUnbookedReceipts, trendMargin,
} from '@/lib/today/kpi-trends';
import { computeTimelineItems } from '@/lib/today/timeline-items';
import { computeCandidates, type BriefingInput } from '@/lib/today-briefing-rules';

export default function DashboardPage() {
  const { user } = useAuth();
  const brand = useBrandLogo();
  const ev = useSupabase('events', []);
  const fac = useSupabase('facturen', []);
  const off = useSupabase('offertes', []);
  const inv = useSupabase('inventory', []);
  const sug = useSupabase('prep_suggestions', []);
  const ger = useSupabase('gerechten', []);
  const pt = useSupabase('prep_tasks', []);
  const kl = useSupabase('klanten', []);
  const bnn = useSupabase('bonnen', []);
  const lev = useSupabase('leveranciers', []);
  const crs = useSupabase('courses', []);
  const ealg = useSupabase('event_allergies', []);
  const ma = useSupabase('marge_alerts', []);

  const events: any[] = ev.data || [];
  const facturen: any[] = fac.data || [];
  const offertes: any[] = off.data || [];
  const inventory: any[] = inv.data || [];
  const suggestions: any[] = sug.data || [];
  const gerechtenData: any[] = ger.data || [];
  const prepTasks: any[] = pt.data || [];
  const klanten: any[] = kl.data || [];
  const bonnen: any[] = bnn.data || [];
  const leveranciers: any[] = lev.data || [];
  const courses: any[] = crs.data || [];
  const eventAllergies: any[] = ealg.data || [];
  const margeAlerts: any[] = (ma.data || []).filter((a: any) => a.status === 'open');

  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState('Welkom');
  const [isMounted, setIsMounted] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [aiPrompt, setAiPrompt] = useState<QuickPrompt | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    const hour = new Date().getHours();
    if (hour < 6) setGreeting('Goedenacht');
    else if (hour < 12) setGreeting('Goedemorgen');
    else if (hour < 18) setGreeting('Goedemiddag');
    else setGreeting('Goedenavond');
    return () => clearInterval(timer);
  }, []);

  // Activation-tracking — fire-and-forget
  useEffect(() => {
    if (user?.id) {
      trackOnce('signup_completed', `signup_${user.id}`, { userId: user.id });
    }
  }, [user?.id]);

  // ─── Basis-derivations ────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const today7 = new Date(); today7.setDate(today7.getDate() + 7);
  const today7Iso = today7.toISOString().slice(0, 10);

  const openFacturen = facturen.filter((f: any) => f.status !== 'betaald' && f.status !== 'geannuleerd');
  let openFacturenBedrag = 0;
  openFacturen.forEach((f: any) => {
    (f.items || []).forEach((it: any) => { openFacturenBedrag += (it.qty || 0) * (it.prijs || 0); });
  });

  const lowStockItems = inventory.filter((i: any) => (i.current_stock || 0) < (i.min_stock || 0));
  const pendingSuggestions = suggestions.filter((s: any) => s.status === 'pending');

  const openOffertes = offertes.filter((o: any) => o.status === 'concept' || o.status === 'verzonden');
  const _calcMarge = (o: any) => calcMargeForOfferte(o, gerechtenData, inventory);

  const lowMargeOffertes = offertes.filter((o: any) => {
    if (!o.menu_selectie || (Array.isArray(o.menu_selectie) && o.menu_selectie.length === 0)) return false;
    return _calcMarge(o).margePct < 40;
  }).slice(0, 3);

  const nextEventsList = events
    .filter((e: any) => e.date >= today && e.status !== 'geannuleerd')
    .sort((a: any, b: any) => (a.date < b.date ? -1 : 1));

  const heroRow = nextEventsList[0] || null;

  const curMonthPrefix = new Date().toISOString().slice(0, 7);
  const monthEvents = events.filter((e: any) => e.date?.startsWith(curMonthPrefix));
  const monthRevenue = monthEvents.reduce((s: number, e: any) => s + ((e.guests || 0) * (e.ppp || 0)), 0);
  const heroRevenue = heroRow ? (heroRow.guests || 0) * (heroRow.ppp || 0) : 0;

  // ─── Command-center signalen ──────────────────────────────────────────
  const upcomingForConflict = events.filter((e: any) =>
    e.date >= today && e.status !== 'cancelled' && e.status !== 'geannuleerd',
  );
  const conflictResult = detectAllConflicts(upcomingForConflict);
  const criticalConflicts = conflictResult.conflicts.filter((c) => c.severity === 'critical');

  const verlopenFacturen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd' && f.vervaldatum && f.vervaldatum < today,
  );
  const binnenkortVervallen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd'
    && f.vervaldatum && f.vervaldatum >= today && f.vervaldatum <= today7Iso,
  );
  const calcFactuurBedrag = (f: any) =>
    (f.items || []).reduce((s: number, it: any) => s + (it.qty || 0) * (it.prijs || 0), 0);
  const verlopenTotaal = verlopenFacturen.reduce((s: number, f: any) => s + calcFactuurBedrag(f), 0);

  const heroCompletion = heroRow ? {
    coursesIngevuld: courses.some((c: any) => c.event_id === heroRow.id),
    allergiesIngevuld: eventAllergies.some((a: any) => a.event_id === heroRow.id),
    prepIngeplannd: prepTasks.some((p: any) => p.event_id === heroRow.id),
    confirmed: heroRow.status === 'confirmed',
  } : null;

  function nextBtwDeadline(): { daysUntil: number; dateLabel: string } | null {
    const now = new Date();
    const m = now.getMonth();
    const deadlineMonths = [3, 6, 9, 0];
    let dd: Date | null = null;
    for (const dm of deadlineMonths) {
      const yr = (dm === 0 && m >= 9) ? now.getFullYear() + 1 : now.getFullYear();
      const candidate = new Date(yr, dm, 1);
      if (candidate > now) { dd = candidate; break; }
    }
    if (!dd) return null;
    const diff = Math.ceil((dd.getTime() - now.getTime()) / 86400000);
    return { daysUntil: diff, dateLabel: dd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) };
  }
  const btwDeadline = nextBtwDeadline();

  const conceptFacturenVoorAfgerondeEvents = facturen.filter((f: any) => {
    if (f.status !== 'concept') return false;
    const linkedEvent = events.find((e: any) => e.client_naam === f.client_naam || e.id === f.event_id);
    return linkedEvent && linkedEvent.date < today;
  });

  const eventIdsMetPrep = new Set(prepTasks.map((t: any) => t.event_id));
  const upcomingZonderPrep = events.filter((e: any) => {
    if (!e.date || e.date < today || e.date > today7Iso) return false;
    if (e.status === 'geannuleerd') return false;
    return !eventIdsMetPrep.has(e.id);
  });

  const upcomingZonderPrepMonth = events.filter((e: any) => {
    if (!e.date || e.date < today) return false;
    if (e.status === 'geannuleerd') return false;
    const daysAway = Math.ceil((new Date(e.date).getTime() - new Date(today).getTime()) / 86400000);
    return daysAway <= 30 && !eventIdsMetPrep.has(e.id);
  });

  const offertesMetMenu = offertes.filter((o: any) => o.menu_selectie);
  const margins = offertesMetMenu.map((o: any) => _calcMarge(o).margePct || 0);
  const avgMarge = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;

  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().slice(0, 10);
  const klantenZonderRecentEvent = klanten.filter((k: any) => {
    const lastEvent = events
      .filter((e: any) => e.client_naam === k.naam && e.date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    return !lastEvent || lastEvent.date < sixMonthsAgoIso;
  }).slice(0, 5);

  const onboardingData: ChecklistData = {
    hasLogo: !!brand?.logoUrl,
    hasOwnGerecht: gerechtenData.length > 0,
    hasRealOfferte: offertes.length > 0,
    hasSentOfferte: offertes.some((o: any) => o.status === 'verzonden' || o.status === 'geaccepteerd'),
  };

  const sentOffertesCount = offertes.filter((o: any) => o.status === 'verzonden' || o.status === 'geaccepteerd').length;
  useEffect(() => {
    if (sentOffertesCount > 0) {
      trackOnce('first_offerte_sent', 'first_offerte_sent', { count: sentOffertesCount });
    }
  }, [sentOffertesCount]);

  const unbookedReceiptsCount = bonnen.filter((b: any) => !b.processed_at).length;

  // ─── EventHero data ────────────────────────────────────────────────────
  const heroEvent: EventHeroEvent | null = heroRow ? {
    id: heroRow.id,
    name: heroRow.name || heroRow.title || 'Event',
    date: heroRow.date,
    daysAway: Math.max(0, Math.ceil((new Date(heroRow.date).getTime() - new Date(today).getTime()) / 86400000)),
    guests: heroRow.guests || 0,
    revenue: heroRevenue,
    location: heroRow.location || null,
    status: heroRow.status || null,
    type: heroRow.type || 'BBQ Catering',
  } : null;

  // ─── BusinessCharts data ──────────────────────────────────────────────
  const revenueMix = computeRevenueMix(events);
  const monthBuckets = compute6MonthRevenue(events);
  const supplierRows = computeSupplierSpend(bonnen, leveranciers, 5);

  // ─── KPIStrip data ────────────────────────────────────────────────────
  const pipelineEuro = openOffertes.reduce((s: number, o: any) => {
    return s + (calcLineTotals(o.items).totaal || (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0));
  }, 0);
  const stockValue = inventory.reduce(
    (s: number, i: any) => s + (i.current_stock || 0) * (i.prijs_per_unit || i.inkoop_prijs || 0),
    0,
  );

  const kpis: KpiItem[] = [
    {
      id: 'days-next',
      label: 'Tot volgend event',
      value: heroEvent ? `${heroEvent.daysAway}` : '—',
      sub: heroEvent ? `${heroEvent.name}` : 'Geen event',
      tone: 'default',
      trend: trendDaysToNext(events),
      href: '/agenda',
    },
    {
      id: 'events-week',
      label: 'Events deze week',
      value: `${nextEventsList.filter((e: any) => e.date <= today7Iso).length}`,
      sub: 'komende 7 dagen',
      tone: 'default',
      trend: trendEventsPerDay(events),
      href: '/agenda',
    },
    {
      id: 'revenue',
      label: 'Omzet deze maand',
      value: `€ ${Math.round(monthRevenue).toLocaleString('nl-NL')}`,
      sub: MAANDEN_KORT?.[new Date().getMonth()] || '',
      tone: 'ok',
      trend: trendMonthRevenue(events),
      href: '/financien',
    },
    {
      id: 'pipeline',
      label: 'Pipeline offertes',
      value: `€ ${Math.round(pipelineEuro).toLocaleString('nl-NL')}`,
      sub: `${openOffertes.length} ${openOffertes.length === 1 ? 'offerte' : 'offertes'} open`,
      tone: 'default',
      trend: trendPipelineEuro(offertes),
      href: '/offertes',
    },
    {
      id: 'open-inv',
      label: 'Open facturen',
      value: `€ ${Math.round(openFacturenBedrag).toLocaleString('nl-NL')}`,
      sub: `${openFacturen.length} stuks · ${verlopenFacturen.length} > 30 dgn`,
      tone: verlopenFacturen.length > 0 ? 'warn' : 'default',
      trend: trendOpenInvoices(facturen),
      href: '/facturen',
    },
    {
      id: 'margin',
      label: 'Marge gemiddeld',
      value: avgMarge > 0 ? `${avgMarge.toFixed(1)}%` : '—',
      sub: 'Doel ≥ 60%',
      tone: avgMarge >= 60 ? 'ok' : avgMarge >= 40 ? 'warn' : avgMarge > 0 ? 'bad' : 'default',
      trend: trendMargin(avgMarge),
      href: '/financien',
    },
    {
      id: 'stock-val',
      label: 'Voorraadwaarde',
      value: `€ ${Math.round(stockValue).toLocaleString('nl-NL')}`,
      sub: `${inventory.length} items`,
      tone: 'default',
      trend: trendStockValue(inventory),
      href: '/voorraad',
    },
    {
      id: 'stock-low',
      label: 'Onder minimum',
      value: `${lowStockItems.length}`,
      sub: lowStockItems.length > 0 ? 'Bestelling nodig' : 'Op niveau',
      tone: lowStockItems.length > 0 ? 'bad' : 'ok',
      trend: trendStockLow(inventory),
      href: '/voorraad',
    },
    {
      id: 'receipts',
      label: 'Bonnen te boeken',
      value: `${unbookedReceiptsCount}`,
      sub: 'Wacht op verwerking',
      tone: unbookedReceiptsCount > 5 ? 'warn' : 'default',
      trend: trendUnbookedReceipts(unbookedReceiptsCount),
      href: '/financien',
    },
  ];

  // ─── BriefingCandidates voor CompactDagbriefing ─────────────────────────
  // Memoized op data-refs zodat minuut-tick-renders geen nieuwe candidates-array
  // produceren (cache-check + onnodige React-werk). useSupabase muteert deze
  // refs alleen na een echte DB-refetch.
  const briefingInput: BriefingInput = useMemo(() => ({
    today,
    heroEvent: heroEvent ? {
      id: heroEvent.id,
      name: heroEvent.name,
      date: heroEvent.date,
      daysAway: heroEvent.daysAway,
      guests: heroEvent.guests,
    } : null,
    heroCompletion: heroCompletion ? {
      gangen: heroCompletion.coursesIngevuld,
      allergies: heroCompletion.allergiesIngevuld,
      prep: heroCompletion.prepIngeplannd,
      confirmed: heroCompletion.confirmed,
    } : null,
    verlopenFacturen: verlopenFacturen.map((f: any) => ({
      client: f.client_naam || 'klant',
      bedrag: calcFactuurBedrag(f),
    })),
    verlopenTotaal,
    binnenkortVervallen: binnenkortVervallen.map((f: any) => ({
      client: f.client_naam || 'klant',
      bedrag: calcFactuurBedrag(f),
      dagen: f.vervaldatum
        ? Math.max(0, Math.ceil((new Date(f.vervaldatum).getTime() - new Date(today).getTime()) / 86400000))
        : 0,
    })),
    conflicts: criticalConflicts.length,
    conceptFacturen: conceptFacturenVoorAfgerondeEvents.map((f: any) => ({
      client: f.client_naam || 'klant',
    })),
    upcomingZonderPrep: upcomingZonderPrep.slice(0, 5).map((e: any) => ({
      id: e.id,
      name: e.name || e.title || 'event',
      daysAway: e.date
        ? Math.max(0, Math.ceil((new Date(e.date).getTime() - new Date(today).getTime()) / 86400000))
        : 0,
    })),
    lowStockItems: lowStockItems.slice(0, 5).map((i: any) => ({
      naam: i.naam || 'item',
      categorie: (i.categorie || 'overig').toString().toLowerCase(),
    })),
    upcomingGuests: nextEventsList
      .filter((e: any) => {
        const d = e.date ? Math.ceil((new Date(e.date).getTime() - new Date(today).getTime()) / 86400000) : 999;
        return d <= 7;
      })
      .reduce((s: number, e: any) => s + (e.guests || 0), 0),
    lowMargeOffertes: lowMargeOffertes.map((o: any) => ({
      client: o.client_naam || 'klant',
      margePct: _calcMarge(o).margePct || 0,
    })),
    pipelineCount: openOffertes.length,
    pipelineHighestEuro: openOffertes.reduce((m: number, o: any) =>
      Math.max(m, calcLineTotals(o.items).totaal || (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0)), 0),
    pipelineHighestClient: openOffertes
      .sort((a: any, b: any) =>
        (calcLineTotals(b.items).totaal || (b.aantal_gasten || 0) * (b.basis_prijs_pp || 0)) -
        (calcLineTotals(a.items).totaal || (a.aantal_gasten || 0) * (a.basis_prijs_pp || 0)),
      )[0]?.client_naam || null,
    oldestPipelineDays: openOffertes.reduce((m: number, o: any) => {
      if (!o.created_at) return m;
      return Math.max(m, Math.ceil((Date.now() - new Date(o.created_at).getTime()) / 86400000));
    }, 0),
    inactiveKlantenCount: klantenZonderRecentEvent.length,
    btwDaysUntil: btwDeadline?.daysUntil ?? null,
    avgMarge,
    haccpStatus: 'ok',
    curMonthLabel: MAANDEN_KORT?.[new Date().getMonth()] || '',
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [today, events, facturen, offertes, inventory, prepTasks, klanten, gerechtenData, btwDeadline?.daysUntil]);

  const briefingCandidates = useMemo(
    () => computeCandidates(briefingInput),
    [briefingInput],
  );

  const firstName = user?.user_metadata?.name
    ? String(user.user_metadata.name).split(' ')[0]
    : undefined;

  // ─── BriefingTimeline items ───────────────────────────────────────────
  const timelineItems = useMemo(() => computeTimelineItems({
    verlopenFacturen: briefingInput.verlopenFacturen,
    verlopenTotaal,
    conceptFacturen: briefingInput.conceptFacturen,
    conflictsCount: briefingInput.conflicts,
    upcomingZonderPrep: upcomingZonderPrepMonth.slice(0, 8).map((e: any) => ({
      id: e.id,
      name: e.name || e.title || 'event',
      daysAway: e.date
        ? Math.max(0, Math.ceil((new Date(e.date).getTime() - new Date(today).getTime()) / 86400000))
        : 0,
    })),
    lowStockItems: briefingInput.lowStockItems,
    upcomingGuests: briefingInput.upcomingGuests,
    pipelineCount: briefingInput.pipelineCount,
    pipelineHighestEuro: briefingInput.pipelineHighestEuro,
    pipelineHighestClient: briefingInput.pipelineHighestClient,
    oldestPipelineDays: briefingInput.oldestPipelineDays,
    btwDaysUntil: briefingInput.btwDaysUntil,
    heroEvent: heroEvent ? { id: heroEvent.id, name: heroEvent.name, daysAway: heroEvent.daysAway } : null,
    unbookedReceiptsCount,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [briefingInput, verlopenTotaal, upcomingZonderPrepMonth, heroEvent?.id, heroEvent?.daysAway, unbookedReceiptsCount]);

  // ─── AttentionPanel items ─────────────────────────────────────────────
  const attentionItems: AttentionItem[] = [];
  if (lowStockItems.length > 0) {
    attentionItems.push({
      id: 'att-stock',
      severity: lowStockItems.length > 3 ? 'high' : 'medium',
      icon: 'alert-triangle',
      title: `${plural(lowStockItems.length, 'item', 'items')} onder minimum`,
      detail: lowStockItems.slice(0, 3).map((i: any) => i.naam).join(', '),
      cta: 'Open bestelling',
      href: '/voorraad',
    });
  }
  if (verlopenFacturen.length > 0) {
    attentionItems.push({
      id: 'att-overdue',
      severity: 'high',
      icon: 'mail-warning',
      title: `${plural(verlopenFacturen.length, 'factuur', 'facturen')} > 30 dagen`,
      detail: verlopenFacturen.slice(0, 2).map((f: any) =>
        `${f.client_naam || 'klant'} € ${Math.round(calcFactuurBedrag(f)).toLocaleString('nl-NL')}`,
      ).join(' · '),
      cta: 'Stuur herinnering',
      href: '/facturen',
    });
  }
  if (lowMargeOffertes.length > 0) {
    attentionItems.push({
      id: 'att-marge',
      severity: 'medium',
      icon: 'percent',
      title: `${plural(lowMargeOffertes.length, 'offerte', 'offertes')} met lage marge`,
      detail: lowMargeOffertes.map((o: any) => `${o.client_naam || 'klant'}`).join(' · '),
      cta: 'Open offerte',
      href: '/offertes',
    });
  }
  if (pendingSuggestions.length > 0) {
    attentionItems.push({
      id: 'att-sug',
      severity: 'low',
      icon: 'thermometer',
      title: `${pendingSuggestions.length} AI-suggesties open`,
      detail: 'Controleer en accepteer in agenda.',
      cta: 'Bekijk',
      href: '/agenda',
    });
  }
  // Pillar #4 cross-hub cascade: leverancier-prijsshift → marge_alerts op
  // open offertes. Engine: scanMargeAlerts() in src/lib/dal/margeAlerts.ts.
  if (margeAlerts.length > 0) {
    const worst = margeAlerts.reduce(function (a: any, b: any) {
      return Math.abs(Number(b.pct_change) || 0) > Math.abs(Number(a.pct_change) || 0) ? b : a;
    });
    const totalImpact = margeAlerts.reduce(function (s: number, a: any) {
      return s + (Number(a.total_marge_impact_eur) || 0);
    }, 0);
    const pct = Number(worst.pct_change) || 0;
    attentionItems.push({
      id: 'att-marge-alert',
      severity: Math.abs(pct) >= 10 ? 'high' : 'medium',
      icon: 'percent',
      title: `${margeAlerts.length} prijsshift${margeAlerts.length === 1 ? '' : 's'} raken open offertes`,
      detail: totalImpact !== 0
        ? `Marge-impact € ${Math.round(totalImpact).toLocaleString('nl-NL')} — top: ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%.`
        : `Top-shift ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%.`,
      cta: 'Bekijk impact',
      href: '/voorraad',
    });
  }

  // Pre-mount loading
  if (!isMounted) {
    return <LoadingState label="Vandaag laden" />;
  }

  return (
    <div
      className="mobile-safe-bottom min-h-screen text-[var(--text)] selection:bg-[var(--color-accent-gold)]/30"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <PersonaQuiz />

      <header
        className="dashboard-header sticky top-0 z-40 backdrop-blur-xl"
        style={{
          background: 'color-mix(in srgb, var(--color-bg-primary) 80%, transparent)',
          borderBottom: '1px solid var(--color-bg-elevated)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="dashboard-header__inner max-w-[1500px] mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* w-12 ≈ 48px = ruimte voor hamburger (44px) + 4px gap; spacer verborgen op desktop ≥md */}
            <div className="w-12 shrink-0 sidebar-hidden-spacer" />
            <div className="relative sidebar-hidden-logo shrink-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #222228, #111115)',
                  border: '1px solid var(--color-border-hover)',
                }}
              >
                <Flame className="w-5 h-5" style={{ color: 'var(--color-accent-gold)' }} />
              </div>
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: 'rgba(196,163,90,.05)', filter: 'blur(8px)' }}
              />
            </div>
            <div className="sidebar-hidden-logo dashboard-header__title min-w-0">
              <h1
                className="text-[14px] font-semibold tracking-[0.08em] truncate"
                style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}
              >
                BBQ ARCHITECT
              </h1>
              <p
                className="text-[9px] tracking-[0.25em] uppercase truncate"
                style={{ color: 'var(--muted)' }}
              >
                Hop &amp; Bites · Ambacht
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              aria-label="Notificaties"
              className="relative p-2 md:p-2.5 rounded-xl transition-colors min-w-touch min-h-touch flex items-center justify-center"
              style={{ background: '#111115', border: '1px solid var(--card-solid)' }}
            >
              <Bell className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              {(verlopenFacturen.length > 0 || criticalConflicts.length > 0) && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                  style={{ background: 'var(--red)', border: '2px solid var(--color-bg-primary)' }}
                />
              )}
            </button>
            <div className="dashboard-header__time ml-1 md:ml-2 text-right">
              <p
                className="text-[11px] md:text-[11px] font-medium capitalize whitespace-nowrap"
                style={{ color: 'var(--muted)' }}
              >
                <span className="hidden sm:inline">
                  {currentTime.toLocaleDateString('nl-NL', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>
                <span className="sm:hidden">
                  {currentTime.toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </p>
              <p
                className="text-[12px] md:text-[13px] font-light tabular-nums"
                style={{ color: 'var(--muted)' }}
              >
                {currentTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 md:px-8 py-6 md:py-10 dashboard-main">
        <style>{`.dashboard-main a, .dashboard-main a *, .dashboard-main button, .dashboard-main button * { text-decoration: none !important; }`}</style>

        {/* Top: greeting + nieuw-event CTA */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          <GreetingStrip
            greeting={greeting}
            brandName={brand?.bedrijfsnaam || 'Hop & Bites'}
            currentTime={currentTime}
            daysToNextEvent={heroEvent ? heroEvent.daysAway : null}
          />
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <Link href="/administratie/rittenregistratie" className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Car size={14} /> Rit registreren
            </Link>
            <button onClick={() => setWizardOpen(true)} className="btn btn-brand">
              <Plus size={14} /> Nieuw event
            </button>
          </div>
        </div>

        {/* Onboarding-checklist (auto-hide na voltooiing) */}
        <OnboardingChecklist data={onboardingData} />

        {/* ── 1. EventHero ── */}
        <EventHero
          event={heroEvent}
          onOpen={() => heroRow && setSelectedEvent(heroRow)}
          onNewEvent={() => setWizardOpen(true)}
        />

        {/* ── 2. AIQuickPrompts ── */}
        <AIQuickPrompts onPrompt={setAiPrompt} />

        {/* ── 3. BusinessCharts ── */}
        <BusinessCharts
          revenueMix={revenueMix}
          monthBuckets={monthBuckets}
          suppliers={supplierRows}
          monthLabel={MAANDEN_KORT?.[new Date().getMonth()] || ''}
          updatedAt={currentTime.toISOString()}
          onOpenFinancien={() => { window.location.href = '/financien'; }}
        />

        {/* ── 4. KPIStrip ── */}
        <KPIStrip kpis={kpis} updatedAt={currentTime.toISOString()} />

        {/* ── 5. CompactDagbriefing + Attention/QuickActions ── */}
        <div
          className="dagbrief-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <CompactDagbriefing candidates={briefingCandidates} firstName={firstName} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AttentionPanel items={attentionItems} />
          </div>
        </div>

        <QuickActions />

        {/* ── 6. BriefingTimeline ── */}
        <BriefingTimeline items={timelineItems} />

        <style>{`
          @media (max-width: 1024px) {
            .dagbrief-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </main>

      <AnimatePresence>
        {selectedEvent ? (
          <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        ) : null}
      </AnimatePresence>

      <EventWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => ev.refetch?.()}
      />

      <AIPromptDrawer prompt={aiPrompt} onClose={() => setAiPrompt(null)} />
    </div>
  );
}

/** Drawer: details van een event */
function EventDetailDrawer({ event, onClose }: { event: any; onClose: () => void }) {
  const revenue = (event.guests || 0) * (event.ppp || 0);
  const days = Math.max(0, Math.ceil((new Date(event.date).getTime() - new Date().getTime()) / 86400000));
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduceMotion ? false : { x: '100%' }}
        animate={{ x: 0 }}
        exit={reduceMotion ? undefined : { x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
        style={{
          width: 'min(560px, 100vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.2em',
                color: 'var(--brand)',
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              Nog {plural(days, 'dag', 'dagen')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-artisan)',
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              {event.name || 'Event'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {event.location || 'Locatie nog niet ingesteld'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              padding: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <DrawerStat label="Datum" value={event.date} />
            <DrawerStat label="Gasten" value={`${event.guests || 0}p`} />
            <DrawerStat label="Status" value={event.status || 'nieuw'} />
          </div>
          <div
            style={{
              padding: 16,
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, rgba(255,191,0,.15), rgba(255,191,0,.05))',
              border: '1px solid var(--brand-tint-border)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '.2em',
                color: 'var(--brand)',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Verwachte omzet
            </div>
            <div
              style={{
                fontSize: 28,
                fontFamily: 'var(--font-artisan)',
                fontWeight: 600,
                color: 'var(--brand)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(revenue)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {event.guests || 0} gasten × €{(event.ppp || 0).toFixed(2)} per persoon
            </div>
          </div>
          {event.client_naam ? <DrawerStat label="Klant" value={event.client_naam} /> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href={`/events/${event.id}/hub`}
              className="btn btn-brand"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Open event
            </Link>
            <Link
              href="/agenda"
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Naar agenda <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DrawerStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-deep)',
        border: '1px solid var(--card-solid)',
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.15em',
          color: 'var(--muted)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  );
}
