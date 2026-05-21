/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Briefing-regel-engine: dashboard-signalen → scored candidates.
 *
 * Pure functie zonder side-effects. Wordt aangeroepen vanuit page.tsx
 * met dezelfde data die de zones tonen, levert een gerangschikte lijst
 * van bullet-candidates voor de AI-rewrite-stap.
 */

export type BriefingPriority = 'critical' | 'today' | 'opportunity';
export type BriefingLabel = 'Nu' | 'Vandaag' | 'Risico' | 'Morgen' | 'Daarna';

export type BriefingCandidateType =
  | 'overdue_invoice'
  | 'planning_conflict'
  | 'allergie_gap'
  | 'prep_gap'
  | 'menukaart_missing'
  | 'voorraad_event_link'
  | 'voorraad_low'
  | 'low_marge'
  | 'pipeline_followup'
  | 'btw_deadline'
  | 'concept_invoice'
  | 'inactive_klant'
  | 'all_clear';

export interface BriefingCandidate {
  id: string;
  type: BriefingCandidateType;
  priority: BriefingPriority;
  /** Label-hint voor de AI — die mag dit overschrijven als context het aangeeft. */
  defaultLabel: BriefingLabel;
  score: number;
  context: Record<string, string | number>;
  href: string;
  fallbackText: string;
}

export interface BriefingInput {
  today: string;
  heroEvent: { id: string | number; name: string; date: string; daysAway: number; guests: number } | null;
  heroCompletion: { gangen: boolean; allergies: boolean; prep: boolean; confirmed: boolean } | null;
  verlopenFacturen: { client: string; bedrag: number }[];
  verlopenTotaal: number;
  binnenkortVervallen: { client: string; bedrag: number; dagen: number }[];
  conflicts: number;
  conceptFacturen: { client: string }[];
  upcomingZonderPrep: { id: string | number; name: string; daysAway: number }[];
  /** S4: events met offerte_id maar offerte heeft nog geen menukaart_template_id. */
  upcomingZonderMenukaart: { id: string | number; name: string; daysAway: number; offerteId: string | number }[];
  lowStockItems: { naam: string; categorie: string }[];
  upcomingGuests: number;
  lowMargeOffertes: { client: string; margePct: number }[];
  pipelineCount: number;
  pipelineHighestEuro: number;
  pipelineHighestClient: string | null;
  oldestPipelineDays: number;
  inactiveKlantenCount: number;
  btwDaysUntil: number | null;
  avgMarge: number;
  haccpStatus: 'ok' | 'warn' | 'danger';
  curMonthLabel: string;
}

/**
 * Cross-domain heuristics:
 * - voorraad_low + upcomingGuests > threshold → voorraad_event_link bonus
 * - hero event ≤2 dagen + completion <100 → prep_gap critical
 * - allergie ontbreekt + event ≤7 dagen → allergie_gap critical
 */
export function computeCandidates(input: BriefingInput): BriefingCandidate[] {
  const out: BriefingCandidate[] = [];

  // 1. Verlopen facturen
  if (input.verlopenFacturen.length > 0) {
    out.push({
      id: 'overdue',
      type: 'overdue_invoice',
      priority: 'critical',
      defaultLabel: 'Nu',
      score: 90 + Math.min(8, input.verlopenFacturen.length),
      context: {
        count: input.verlopenFacturen.length,
        bedrag: input.verlopenTotaal,
      },
      href: '/facturen',
      fallbackText: `${input.verlopenFacturen.length} facturen vervallen · €${Math.round(input.verlopenTotaal).toLocaleString('nl-NL')}`,
    });
  }

  // 2. Planning-conflicten
  if (input.conflicts > 0) {
    out.push({
      id: 'conflicts',
      type: 'planning_conflict',
      priority: 'critical',
      defaultLabel: 'Nu',
      score: 95,
      context: { count: input.conflicts },
      href: '/agenda',
      fallbackText: `${input.conflicts} planning-conflict${input.conflicts !== 1 ? 'en' : ''} in agenda`,
    });
  }

  // 3. Hero event allergie-gap
  if (input.heroEvent && input.heroCompletion && !input.heroCompletion.allergies && input.heroEvent.daysAway <= 7) {
    const closeBy = input.heroEvent.daysAway <= 2;
    out.push({
      id: 'allergie',
      type: 'allergie_gap',
      priority: closeBy ? 'critical' : 'today',
      defaultLabel: 'Risico',
      score: closeBy ? 88 : 75,
      context: {
        event: input.heroEvent.name,
        days: input.heroEvent.daysAway,
      },
      href: `/events/${input.heroEvent.id}/hub`,
      fallbackText: `Allergieën ${input.heroEvent.name} niet bevestigd · over ${input.heroEvent.daysAway} ${input.heroEvent.daysAway === 1 ? 'dag' : 'dagen'}`,
    });
  }

  // 4. Hero event prep-gap
  if (input.heroEvent && input.heroCompletion && (!input.heroCompletion.gangen || !input.heroCompletion.prep)) {
    const missing: string[] = [];
    if (!input.heroCompletion.gangen) missing.push('gangen');
    if (!input.heroCompletion.prep) missing.push('prep');
    const closeBy = input.heroEvent.daysAway <= 3;
    out.push({
      id: 'prep',
      type: 'prep_gap',
      priority: closeBy ? 'today' : 'opportunity',
      defaultLabel: closeBy ? 'Vandaag' : 'Daarna',
      score: closeBy ? 70 : 50,
      context: {
        event: input.heroEvent.name,
        days: input.heroEvent.daysAway,
        missing: missing.join(' + '),
      },
      href: `/events/${input.heroEvent.id}/hub`,
      fallbackText: `Vul ${missing.join(' en ')} aan voor ${input.heroEvent.name}`,
    });
  }

  // 4b. Menukaart ontbreekt voor upcoming events (S4-fase-1).
  // Caterende ondernemer moet bewust kiezen om brand-default te accepteren OF
  // de menukaart aanpassen. NULL template_id = niet bewust gekozen.
  if (input.upcomingZonderMenukaart.length > 0) {
    const closest = input.upcomingZonderMenukaart[0];
    const closeBy = closest.daysAway <= 14;
    const veryClose = closest.daysAway <= 3;
    out.push({
      id: 'menukaart_missing',
      type: 'menukaart_missing',
      priority: veryClose ? 'today' : closeBy ? 'today' : 'opportunity',
      defaultLabel: veryClose ? 'Nu' : closeBy ? 'Vandaag' : 'Daarna',
      score: veryClose ? 75 : closeBy ? 55 : 35,
      context: {
        event: closest.name,
        days: closest.daysAway,
        count: input.upcomingZonderMenukaart.length,
      },
      href: `/offertes/${closest.offerteId}/menukaart-editor`,
      fallbackText: input.upcomingZonderMenukaart.length === 1
        ? `Menukaart maken voor ${closest.name}`
        : `${input.upcomingZonderMenukaart.length} events zonder menukaart — start bij ${closest.name}`,
    });
  }

  // 5. Cross-domain: voorraad-laag + komend event
  if (input.lowStockItems.length > 0 && input.upcomingGuests > 0) {
    const sample = input.lowStockItems.slice(0, 2).map(i => i.naam).join(' + ');
    out.push({
      id: 'voorraad_event',
      type: 'voorraad_event_link',
      priority: 'today',
      defaultLabel: 'Vandaag',
      score: 78,
      context: {
        items: sample,
        count: input.lowStockItems.length,
        guests: input.upcomingGuests,
      },
      href: '/voorraad',
      fallbackText: `Bestel ${sample} · ${input.upcomingGuests} gasten aankomend`,
    });
  } else if (input.lowStockItems.length > 0) {
    out.push({
      id: 'voorraad',
      type: 'voorraad_low',
      priority: 'opportunity',
      defaultLabel: 'Daarna',
      score: 40,
      context: { count: input.lowStockItems.length },
      href: '/voorraad',
      fallbackText: `${input.lowStockItems.length} ingrediënten onder minimum`,
    });
  }

  // 6. Concept-facturen voor afgeronde events
  if (input.conceptFacturen.length > 0) {
    out.push({
      id: 'concept_invoice',
      type: 'concept_invoice',
      priority: 'today',
      defaultLabel: 'Vandaag',
      score: 65,
      context: { count: input.conceptFacturen.length },
      href: '/facturen',
      fallbackText: `${input.conceptFacturen.length} concept-factu${input.conceptFacturen.length === 1 ? 'ur' : 'ren'} klaar om te versturen`,
    });
  }

  // 7. Lage marge
  if (input.lowMargeOffertes.length > 0) {
    out.push({
      id: 'low_marge',
      type: 'low_marge',
      priority: 'today',
      defaultLabel: 'Risico',
      score: 55,
      context: {
        count: input.lowMargeOffertes.length,
        worstClient: input.lowMargeOffertes[0]?.client || '',
        worstPct: input.lowMargeOffertes[0]?.margePct || 0,
      },
      href: '/offertes',
      fallbackText: `${input.lowMargeOffertes.length} offerte${input.lowMargeOffertes.length === 1 ? '' : 's'} onder 40% marge`,
    });
  }

  // 8. Pipeline follow-up (oudste verzonden offerte >7d)
  if (input.pipelineCount > 0 && input.oldestPipelineDays > 7) {
    out.push({
      id: 'pipeline',
      type: 'pipeline_followup',
      priority: 'opportunity',
      defaultLabel: 'Daarna',
      score: 45,
      context: {
        count: input.pipelineCount,
        days: input.oldestPipelineDays,
        client: input.pipelineHighestClient || '',
        bedrag: input.pipelineHighestEuro,
      },
      href: '/offertes',
      fallbackText: input.pipelineHighestClient
        ? `${input.pipelineHighestClient} wacht ${input.oldestPipelineDays} dagen · €${Math.round(input.pipelineHighestEuro).toLocaleString('nl-NL')}`
        : `${input.pipelineCount} offertes open in pipeline`,
    });
  }

  // 9. BTW-deadline
  if (input.btwDaysUntil !== null && input.btwDaysUntil <= 14) {
    const close = input.btwDaysUntil <= 7;
    out.push({
      id: 'btw',
      type: 'btw_deadline',
      priority: close ? 'today' : 'opportunity',
      defaultLabel: close ? 'Vandaag' : 'Daarna',
      score: close ? 60 : 35,
      context: { days: input.btwDaysUntil },
      href: '/financien',
      fallbackText: `BTW-aangifte over ${input.btwDaysUntil} dag${input.btwDaysUntil === 1 ? '' : 'en'}`,
    });
  }

  // 10. Inactieve klanten
  if (input.inactiveKlantenCount > 0 && out.filter(c => c.priority !== 'opportunity').length < 3) {
    out.push({
      id: 'inactive_klant',
      type: 'inactive_klant',
      priority: 'opportunity',
      defaultLabel: 'Daarna',
      score: 25,
      context: { count: input.inactiveKlantenCount },
      href: '/klanten',
      fallbackText: `${input.inactiveKlantenCount} klanten 6+ maanden niet gezien`,
    });
  }

  // Sort: priority bucket eerst, dan score desc
  const priorityRank: Record<BriefingPriority, number> = { critical: 0, today: 1, opportunity: 2 };
  out.sort((a, b) => {
    if (priorityRank[a.priority] !== priorityRank[b.priority]) {
      return priorityRank[a.priority] - priorityRank[b.priority];
    }
    return b.score - a.score;
  });

  /* Calendar-aware: als hero-event ≤2 dagen weg is, weg met
     lange-termijn opportunities (inactive_klant, pipeline_followup zonder
     concrete deadline). Operator op event-dag wil geen lead-gen-tip. */
  const eventModeNear = input.heroEvent !== null && input.heroEvent.daysAway <= 2;
  let filtered = out;
  if (eventModeNear) {
    filtered = out.filter(c =>
      c.type !== 'inactive_klant' &&
      !(c.type === 'pipeline_followup' && c.priority === 'opportunity')
    );
  }

  // Als ≥3 critical/today, snij opportunity weg
  const urgent = filtered.filter(c => c.priority !== 'opportunity').length;
  const trimmed = urgent >= 3 ? filtered.filter(c => c.priority !== 'opportunity') : filtered;

  // All-clear fallback
  if (trimmed.length === 0) {
    return [
      {
        id: 'allclear',
        type: 'all_clear',
        priority: 'opportunity',
        defaultLabel: 'Daarna',
        score: 0,
        context: { month: input.curMonthLabel },
        href: '/',
        fallbackText: 'Geen blokkades. Goed moment voor planning.',
      },
    ];
  }

  return trimmed.slice(0, 5);
}
