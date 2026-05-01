/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell, Flame, Plus, X, ChevronRight,
} from 'lucide-react';
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

// 5-zone components (Today-redesign)
import HeroEvent from '@/components/dashboard/HeroEvent';
import VandaagChecklist, { type VandaagTask } from '@/components/dashboard/VandaagChecklist';
import AlertStrip, { type AlertItem } from '@/components/dashboard/AlertStrip';
import ZoneLabel from '@/components/dashboard/ZoneLabel';
import ZonePuls, { type PulsData } from '@/components/dashboard/ZonePuls';
import ZoneOperatie, { type OperatieData } from '@/components/dashboard/ZoneOperatie';
import ZoneKans, { type KansData } from '@/components/dashboard/ZoneKans';
import ZoneActiviteit, { type ActiviteitData } from '@/components/dashboard/ZoneActiviteit';
import AiBriefing from '@/components/dashboard/AiBriefing';
import { computeCandidates, type BriefingInput } from '@/lib/today-briefing-rules';
import type { TimelineEvent } from '@/components/charts/HorizontalTimeline';
import type { HeatmapCell } from '@/components/charts/HeatmapRow';
import type { DotStreakDay } from '@/components/charts/DotStreak';

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
  const hc = useSupabase('haccp_records', []);
  const bnn = useSupabase('bonnen', []);
  const crs = useSupabase('courses', []);
  const ealg = useSupabase('event_allergies', []);

  const events: any[] = ev.data || [];
  const facturen: any[] = fac.data || [];
  const offertes: any[] = off.data || [];
  const inventory: any[] = inv.data || [];
  const suggestions: any[] = sug.data || [];
  const gerechtenData: any[] = ger.data || [];
  const prepTasks: any[] = pt.data || [];
  const klanten: any[] = kl.data || [];
  const haccpRecords: any[] = hc.data || [];
  const bonnen: any[] = bnn.data || [];
  const courses: any[] = crs.data || [];
  const eventAllergies: any[] = ealg.data || [];

  const [currentTime, setCurrentTime] = useState(new Date());
  const [greeting, setGreeting] = useState('Welkom');
  const [isMounted, setIsMounted] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Goedemorgen');
    else if (hour < 18) setGreeting('Goedemiddag');
    else setGreeting('Goedenavond');
    return () => clearInterval(timer);
  }, []);

  /* Activation-tracking — fire-and-forget. */
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
    .sort((a: any, b: any) => a.date < b.date ? -1 : 1);

  const heroEvent = nextEventsList[0] || null;

  // Week en maand
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
  const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);
  const weekEvents = events.filter((e: any) => e.date >= startOfWeekStr && e.date <= endOfWeekStr && e.status !== 'geannuleerd');

  const curMonthPrefix = new Date().toISOString().slice(0, 7);
  const monthEvents = events.filter((e: any) => e.date?.startsWith(curMonthPrefix));
  const monthRevenue = monthEvents.reduce((s: number, e: any) => s + ((e.guests || 0) * (e.ppp || 0)), 0);
  const heroRevenue = heroEvent ? (heroEvent.guests || 0) * (heroEvent.ppp || 0) : 0;

  // 14-d revenue buckets — per dag
  const revenue14d: number[] = (() => {
    const buckets: number[] = new Array(14).fill(0);
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (13 - i));
      const iso = d.toISOString().slice(0, 10);
      events.forEach((e: any) => {
        if (e.date === iso && e.status !== 'geannuleerd') {
          buckets[i] += (e.guests || 0) * (e.ppp || 0);
        }
      });
    }
    return buckets;
  })();

  // ─── Command-center signalen ──────────────────────────────────────────
  const upcomingForConflict = events.filter((e: any) =>
    e.date >= today && e.status !== 'cancelled' && e.status !== 'geannuleerd'
  );
  const conflictResult = detectAllConflicts(upcomingForConflict);
  const criticalConflicts = conflictResult.conflicts.filter(c => c.severity === 'critical');

  const verlopenFacturen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd' && f.vervaldatum && f.vervaldatum < today
  );
  const binnenkortVervallen = facturen.filter((f: any) =>
    f.status !== 'betaald' && f.status !== 'geannuleerd'
    && f.vervaldatum && f.vervaldatum >= today && f.vervaldatum <= today7Iso
  );
  const facturenOpTijd = openFacturen.length - verlopenFacturen.length - binnenkortVervallen.length;
  const calcFactuurBedrag = (f: any) =>
    (f.items || []).reduce((s: number, it: any) => s + (it.qty || 0) * (it.prijs || 0), 0);
  const verlopenTotaal = verlopenFacturen.reduce((s: number, f: any) => s + calcFactuurBedrag(f), 0);

  const heroCompletion = heroEvent ? {
    coursesIngevuld: courses.some((c: any) => c.event_id === heroEvent.id),
    allergiesIngevuld: eventAllergies.some((a: any) => a.event_id === heroEvent.id),
    prepIngeplannd: prepTasks.some((p: any) => p.event_id === heroEvent.id),
    confirmed: heroEvent.status === 'confirmed',
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

  // Concept-facturen voor afgeronde events
  const conceptFacturenVoorAfgerondeEvents = facturen.filter((f: any) => {
    if (f.status !== 'concept') return false;
    const linkedEvent = events.find((e: any) => e.client_naam === f.client_naam || e.id === f.event_id);
    return linkedEvent && linkedEvent.date < today;
  });

  // Aankomende events zonder prep (binnen 7d)
  const eventIdsMetPrep = new Set(prepTasks.map((t: any) => t.event_id));
  const upcomingZonderPrep = events.filter((e: any) => {
    if (!e.date || e.date < today || e.date > today7Iso) return false;
    if (e.status === 'geannuleerd') return false;
    return !eventIdsMetPrep.has(e.id);
  });

  // Marge-statistiek
  const offertesMetMenu = offertes.filter((o: any) => o.menu_selectie);
  const margins = offertesMetMenu.map((o: any) => _calcMarge(o).margePct || 0);
  const avgMarge = margins.length > 0 ? margins.reduce((s, m) => s + m, 0) / margins.length : 0;
  const marginHealthy = margins.filter(m => m >= 40).length;
  const marginTight = margins.filter(m => m >= 25 && m < 40).length;
  const marginLoss = margins.filter(m => m < 25).length;

  // HACCP laatste 7 dagen
  const haccpDays: DotStreakDay[] = (() => {
    const days: DotStreakDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const recsForDay = haccpRecords.filter((r: any) => {
        const ts = (r.created_at || r.datum || '').slice(0, 10);
        return ts === iso;
      });
      let level: DotStreakDay['level'] = 'empty';
      if (recsForDay.length > 0) {
        if (recsForDay.some((r: any) => r.status === 'danger' || r.status === 'afwijking')) level = 'danger';
        else if (recsForDay.some((r: any) => r.status === 'warn')) level = 'warn';
        else level = 'ok';
      }
      days.push({ date: iso, level });
    }
    return days;
  })();
  const haccpStatus: 'ok' | 'warn' | 'danger' =
    haccpDays.some(d => d.level === 'danger') ? 'danger' :
    haccpDays.some(d => d.level === 'warn') ? 'warn' : 'ok';

  // Klanten zonder recent event — voor potentiële kans-nudge
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoIso = sixMonthsAgo.toISOString().slice(0, 10);
  const klantenZonderRecentEvent = klanten.filter((k: any) => {
    const lastEvent = events
      .filter((e: any) => e.client_naam === k.naam && e.date)
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    return !lastEvent || lastEvent.date < sixMonthsAgoIso;
  }).slice(0, 5);

  // Onboarding-data
  const onboardingData: ChecklistData = {
    hasLogo: !!brand?.logoUrl,
    hasOwnGerecht: gerechtenData.length > 0,
    hasRealOfferte: offertes.length > 0,
    hasSentOfferte: offertes.some((o: any) => o.status === 'verzonden' || o.status === 'geaccepteerd'),
  };

  // Track first_offerte_sent
  const sentOffertesCount = offertes.filter((o: any) => o.status === 'verzonden' || o.status === 'geaccepteerd').length;
  useEffect(() => {
    if (sentOffertesCount > 0) {
      trackOnce('first_offerte_sent', 'first_offerte_sent', { count: sentOffertesCount });
    }
  }, [sentOffertesCount]);

  // ─── ZONE-DATA derivations ────────────────────────────────────────────

  // Zone 1 — Vandaag-checklist (max 7)
  const vandaagTasks: VandaagTask[] = (() => {
    const tasks: VandaagTask[] = [];
    verlopenFacturen.slice(0, 2).forEach((f: any) => {
      tasks.push({
        id: `f_${f.id}`,
        label: `Stuur herinnering ${f.client_naam || 'klant'}`,
        status: 'open',
        href: '/facturen',
        hint: `${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(calcFactuurBedrag(f))} vervallen`,
      });
    });
    upcomingZonderPrep.slice(0, 2).forEach((e: any) => {
      tasks.push({
        id: `pr_${e.id}`,
        label: `Plan prep voor ${e.name || 'event'}`,
        status: 'open',
        href: '/prep-counter',
      });
    });
    conceptFacturenVoorAfgerondeEvents.slice(0, 2).forEach((f: any) => {
      tasks.push({
        id: `cf_${f.id}`,
        label: `Stuur factuur ${f.client_naam || 'klant'}`,
        status: 'open',
        href: '/facturen',
      });
    });
    if (heroCompletion && heroEvent) {
      if (!heroCompletion.coursesIngevuld) {
        tasks.push({
          id: 'hc_courses',
          label: `Vul gangen in voor ${heroEvent.name || 'event'}`,
          status: 'open',
          href: `/events/${heroEvent.id}/hub`,
        });
      }
      if (!heroCompletion.allergiesIngevuld) {
        tasks.push({
          id: 'hc_alg',
          label: `Check allergieën ${heroEvent.name || 'event'}`,
          status: 'open',
          href: `/events/${heroEvent.id}/hub`,
        });
      }
    }
    if (lowStockItems.length > 0 && tasks.length < 6) {
      tasks.push({
        id: 'low_stock',
        label: `${plural(lowStockItems.length, 'item', 'items')} onder minimum`,
        status: 'open',
        href: '/voorraad',
      });
    }
    if (pendingSuggestions.length > 0 && tasks.length < 7) {
      tasks.push({
        id: 'sug',
        label: `${pendingSuggestions.length} AI-suggesties open`,
        status: 'open',
        href: '/agenda',
        hint: 'controleer en accepteer',
      });
    }
    return tasks.slice(0, 7);
  })();

  // Alert-strip (alleen kritieke / waarschuwingen)
  const alerts: AlertItem[] = [];
  if (criticalConflicts.length > 0) {
    alerts.push({
      id: 'cnf',
      severity: 'critical',
      message: `${plural(criticalConflicts.length, 'planning-conflict')} in agenda`,
      href: '/agenda',
    });
  }
  if (verlopenFacturen.length > 0) {
    alerts.push({
      id: 'vlp',
      severity: 'critical',
      message: `${plural(verlopenFacturen.length, 'factuur', 'facturen')} vervallen`,
      href: '/facturen',
    });
  }
  if (btwDeadline && btwDeadline.daysUntil <= 14) {
    alerts.push({
      id: 'btw',
      severity: btwDeadline.daysUntil <= 7 ? 'warning' : 'info',
      message: `BTW-aangifte over ${plural(btwDeadline.daysUntil, 'dag', 'dagen')}`,
      href: '/financien',
    });
  }

  // Zone 2 — Puls
  const pulsData: PulsData = {
    revenue: {
      monthTotal: monthRevenue,
      monthLabel: MAANDEN_KORT?.[new Date().getMonth()] ||
        new Date().toLocaleDateString('nl-NL', { month: 'short' }),
      weeks: (() => {
        // 14 dagen → 4 weken (3-4 dagen per bucket)
        const out: { label: string; value: number }[] = [];
        const span = Math.ceil(14 / 4);
        for (let w = 0; w < 4; w++) {
          const start = w * span;
          const end = w === 3 ? 14 : Math.min(14, start + span);
          const sum = revenue14d.slice(start, end).reduce((s, v) => s + v, 0);
          out.push({ label: `wk${w + 1}`, value: sum });
        }
        return out;
      })(),
    },
    margin: {
      healthy: marginHealthy,
      tight: marginTight,
      loss: marginLoss,
      avgPct: avgMarge,
    },
    invoices: {
      onTime: Math.max(0, facturenOpTijd),
      soon: binnenkortVervallen.length,
      overdue: verlopenFacturen.length,
      totalOpen: openFacturenBedrag,
    },
    pipeline: [
      { label: 'concept', count: offertes.filter((o: any) => o.status === 'concept').length },
      { label: 'verzonden', count: offertes.filter((o: any) => o.status === 'verzonden').length },
      {
        label: 'akkoord',
        count: offertes.filter((o: any) =>
          o.status === 'geaccepteerd' || o.status === 'goedgekeurd' || o.status === 'akkoord'
        ).length,
      },
      {
        label: 'afgesloten',
        count: offertes.filter((o: any) => o.status === 'definitief' || o.status === 'betaald').length,
      },
    ],
  };

  // Zone 3 — Operatie
  const operatieData: OperatieData = {
    events: nextEventsList.map((e: any): TimelineEvent => ({
      id: e.id,
      date: e.date,
      label: e.name || e.title || 'Event',
      guests: e.guests,
      status: e.status,
      color: e.status === 'confirmed' ? 'var(--green)'
        : e.status === 'optie' ? 'var(--amber)'
        : 'var(--brand)',
    })),
    inventory: (() => {
      const cats = new Map<string, { total: number; low: number }>();
      inventory.forEach((i: any) => {
        const cat = (i.categorie || 'overig').toString().toLowerCase();
        if (!cats.has(cat)) cats.set(cat, { total: 0, low: 0 });
        const c = cats.get(cat)!;
        c.total += 1;
        if ((i.current_stock || 0) < (i.min_stock || 0)) c.low += 1;
      });
      const cells: HeatmapCell[] = Array.from(cats.entries())
        .sort(([, a], [, b]) => b.low - a.low || b.total - a.total)
        .slice(0, 6)
        .map(([cat, info]) => ({
          label: cat,
          value: info.low,
          level: info.low === 0 ? 'ok' : info.low > 2 ? 'danger' : 'warn',
          href: `/voorraad?cat=${encodeURIComponent(cat)}`,
        }));
      return cells;
    })(),
    prep: (() => {
      if (!heroEvent) return [];
      const tasks = prepTasks.filter((t: any) => t.event_id === heroEvent.id);
      const total = tasks.length;
      const done = tasks.filter((t: any) => t.done).length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      return [{
        eventName: heroEvent.name || heroEvent.client_naam || 'Eerstvolgende',
        pct,
      }];
    })(),
    haccp: { days: haccpDays, status: haccpStatus },
  };

  // Zone 4 — Kans (AI nudges + open offertes)
  const kansData: KansData = (() => {
    const nudges: KansData['nudges'] = [];
    if (verlopenFacturen.length > 0) {
      nudges.push({
        id: 'k_overdue',
        message: `${plural(verlopenFacturen.length, 'verlopen factuur', 'verlopen facturen')} — stuur herinneringen`,
        href: '/facturen',
        tone: 'warning',
        impact: verlopenTotaal,
      });
    }
    if (lowMargeOffertes.length > 0) {
      nudges.push({
        id: 'k_marge',
        message: `${plural(lowMargeOffertes.length, 'offerte', 'offertes')} met lage marge — herzie prijs`,
        href: '/offertes',
        tone: 'warning',
        impact: lowMargeOffertes.reduce((s: number, o: any) => {
          const t = calcLineTotals(o.items).totaal || (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0);
          return s + t * 0.1;
        }, 0),
      });
    }
    if (klantenZonderRecentEvent.length > 0) {
      nudges.push({
        id: 'k_klant',
        message: `${plural(klantenZonderRecentEvent.length, 'klant', 'klanten')} 6+ maanden niet gezien`,
        href: '/klanten',
        tone: 'info',
      });
    }
    if (conceptFacturenVoorAfgerondeEvents.length > 0) {
      nudges.push({
        id: 'k_concept',
        message: `${plural(conceptFacturenVoorAfgerondeEvents.length, 'concept-factuur', 'concept-facturen')} voor afgeronde events`,
        href: '/facturen',
        tone: 'warning',
      });
    }
    if (avgMarge > 65 && nudges.length === 0) {
      nudges.push({
        id: 'k_goed',
        message: `Gemiddelde marge ${avgMarge.toFixed(0)}% — uitstekend`,
        href: '/financien',
        tone: 'positive',
      });
    }
    const offertesList: KansData['offertes'] = openOffertes
      .slice(0, 4)
      .map((o: any) => ({
        id: o.id,
        client: o.client_naam || 'Onbekende klant',
        amount: calcLineTotals(o.items).totaal || (o.aantal_gasten || 0) * (o.basis_prijs_pp || 0),
        daysOpen: o.created_at
          ? Math.ceil((Date.now() - new Date(o.created_at).getTime()) / 86400000)
          : 0,
        status: o.status,
        href: '/offertes',
      }));
    return { nudges, offertes: offertesList };
  })();

  // Zone 5 — Activiteit
  const activiteitData: ActiviteitData = (() => {
    type Item = { ts: number; text: string; dot: string; href: string };
    const feed: Item[] = [];
    events.slice(0, 5).forEach((e: any) => {
      if (!e.created_at) return;
      feed.push({
        text: `Event: ${e.name || e.title || 'nieuw'}`,
        ts: new Date(e.created_at).getTime(),
        dot: 'var(--green)',
        href: e.id ? `/events/${e.id}/hub` : '/agenda',
      });
    });
    offertes.slice(0, 5).forEach((o: any) => {
      if (!o.created_at) return;
      feed.push({
        text: `Offerte: ${o.client_naam || 'nieuw'}`,
        ts: new Date(o.created_at).getTime(),
        dot: 'var(--brand)',
        href: '/offertes',
      });
    });
    facturen.slice(0, 5).forEach((f: any) => {
      if (!f.created_at) return;
      feed.push({
        text: `Factuur: ${f.nummer || f.client_naam || 'concept'}`,
        ts: new Date(f.created_at).getTime(),
        dot: 'var(--amber)',
        href: '/facturen',
      });
    });
    feed.sort((a, b) => b.ts - a.ts);
    const items = feed.slice(0, 8).map((it, i) => ({
      id: `act_${i}`,
      text: it.text,
      time: new Date(it.ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
      dot: it.dot,
      href: it.href,
    }));
    return { items };
  })();

  // ─── AI-briefing candidates ─────────────────────────────────────────
  const briefingInput: BriefingInput = {
    today,
    heroEvent: heroEvent ? {
      id: heroEvent.id,
      name: heroEvent.name || heroEvent.title || 'event',
      date: heroEvent.date,
      daysAway: Math.max(0, Math.ceil(
        (new Date(heroEvent.date).getTime() - new Date(today).getTime()) / 86400000
      )),
      guests: heroEvent.guests || 0,
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
    pipelineHighestEuro: kansData.offertes[0]?.amount || 0,
    pipelineHighestClient: kansData.offertes[0]?.client || null,
    oldestPipelineDays: kansData.offertes.reduce((m, o) => Math.max(m, o.daysOpen), 0),
    inactiveKlantenCount: klantenZonderRecentEvent.length,
    btwDaysUntil: btwDeadline?.daysUntil ?? null,
    avgMarge,
    haccpStatus,
    curMonthLabel: pulsData.revenue.monthLabel,
  };

  const briefingCandidates = computeCandidates(briefingInput);
  const firstName = user?.user_metadata?.name
    ? String(user.user_metadata.name).split(' ')[0]
    : undefined;

  if (!isMounted) {
    return <LoadingState label="Dashboard laden" />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] selection:bg-[var(--color-accent-gold)]/30">
      <PersonaQuiz />

      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[var(--color-bg-primary)]/80 border-b border-[var(--color-bg-elevated)]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 shrink-0 sidebar-hidden-spacer" />
            <div className="relative sidebar-hidden-logo">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#222228] to-[#111115] flex items-center justify-center border border-[var(--color-border-hover)]">
                <Flame className="w-5 h-5 text-[var(--color-accent-gold)]" />
              </div>
              <div className="absolute inset-0 rounded-full bg-[var(--color-accent-gold)]/5 blur-md" />
            </div>
            <div className="sidebar-hidden-logo">
              <h1 className="text-[14px] font-semibold tracking-[0.08em] text-[var(--text)] font-['Outfit']">
                BBQ ARCHITECT
              </h1>
              <p className="text-[9px] tracking-[0.25em] text-[var(--muted)] uppercase">
                Hop &amp; Bites · Ambacht
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="relative p-2 md:p-2.5 rounded-xl bg-[#111115] border border-[var(--card-solid)] hover:border-[var(--color-border-hover)] transition-colors">
              <Bell className="w-4 h-4 text-[var(--color-text-muted)]" />
              {alerts.some(a => a.severity === 'critical') && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[var(--color-bg-primary)]" />
              )}
            </button>
            <div className="ml-1 md:ml-2 text-right">
              <p className="text-[10px] md:text-[11px] text-[var(--muted)] font-medium capitalize">
                {currentTime.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-[12px] md:text-[13px] font-light text-[var(--muted)] tabular-nums">
                {currentTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10 dashboard-main">
        <style>{`.dashboard-main a, .dashboard-main a *, .dashboard-main button, .dashboard-main button * { text-decoration: none !important; }`}</style>

        {/* Begroeting + één primaire CTA */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--text)' }}>
              {greeting}
              {user?.user_metadata?.name ? `, ${user.user_metadata.name.split(' ')[0]}` : ''}
            </span>
            <span style={{ marginLeft: 10 }}>
              · {currentTime.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
          <button onClick={() => setWizardOpen(true)} className="btn btn-brand">
            <Plus size={14} /> Nieuw event
          </button>
        </div>

        {/* Onboarding-checklist (auto-hide na voltooiing) */}
        <OnboardingChecklist data={onboardingData} />

        {/* Dagbriefing absorbeert critical alerts (push). Bestaande floating chat blijft (pull).
            AlertStrip is verplaatst naar sub-pagina's; op / is alle critical-content al
            in de briefing-bullets. */}
        <AiBriefing candidates={briefingCandidates} firstName={firstName} />

        {/* ─── ZONE 1 — NU ─── */}
        <ZoneLabel>nu</ZoneLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
            gap: 24,
            marginBottom: 56,
          }}
          className="zone-nu-grid"
        >
          <HeroEvent
            event={heroEvent}
            completion={heroCompletion ? {
              gangen: heroCompletion.coursesIngevuld,
              allergies: heroCompletion.allergiesIngevuld,
              prep: heroCompletion.prepIngeplannd,
              confirmed: heroCompletion.confirmed,
            } : undefined}
            revenue={heroRevenue}
            onNewEvent={() => setWizardOpen(true)}
          />
          <VandaagChecklist tasks={vandaagTasks} />
        </div>

        {/* ─── ZONE 2 — PULS ─── */}
        <ZoneLabel>puls</ZoneLabel>
        <div style={{ marginBottom: 56 }}>
          <ZonePuls data={pulsData} />
        </div>

        {/* ─── ZONE 3 — OPERATIE ─── */}
        <ZoneLabel>operatie</ZoneLabel>
        <div style={{ marginBottom: 56 }}>
          <ZoneOperatie
            data={operatieData}
            onEventClick={(e) => {
              const fullEvent = events.find((ev: any) => ev.id === e.id);
              if (fullEvent) setSelectedEvent(fullEvent);
            }}
          />
        </div>

        {/* ─── ZONE 4 — KANS ─── */}
        <ZoneLabel>kans</ZoneLabel>
        <div style={{ marginBottom: 56 }}>
          <ZoneKans data={kansData} />
        </div>

        {/* ─── ZONE 5 — ACTIVITEIT ─── */}
        <ZoneLabel>activiteit</ZoneLabel>
        <ZoneActiviteit data={activiteitData} />

        {/* Responsive degradatie */}
        <style>{`
          @media (max-width: 1024px) {
            .zone-nu-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </main>

      {selectedEvent && (
        <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      <EventWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => ev.refetch?.()}
      />
    </div>
  );
}

/** Drawer: details van een event */
function EventDetailDrawer({ event, onClose }: { event: any; onClose: () => void }) {
  const revenue = (event.guests || 0) * (event.ppp || 0);
  const days = Math.max(0, Math.ceil((new Date(event.date).getTime() - new Date().getTime()) / 86400000));
  return (
    <div
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
      <div
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
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
