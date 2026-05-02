/**
 * Bucketing van Vandaag-data → 4-kolom shift-briefing items voor BriefingTimeline.
 *
 * Bron-data komt uit dezelfde derivations als AiBriefing (events, facturen,
 * prep_tasks, voorraad, offertes, btw-deadline). Hier bucketen we ze in:
 *  - Vandaag: directe acties (verlopen, conflicten, prep voor event van vandaag)
 *  - Morgen: prep voor events met daysAway=1
 *  - Deze week: prep 2-7d, openstaande pipeline, low stock met klanten in zicht
 *  - Komende maand: btw-deadline, prep 8-30d, inactive klanten
 */

export type BriefingTimelineWhen = 'Vandaag' | 'Morgen' | 'Deze week' | 'Komende maand';
export type BriefingTimelineTone = 'red' | 'amber' | 'blue' | 'green' | 'gray';

export interface BriefingTimelineItem {
  id: string;
  when: BriefingTimelineWhen;
  title: string;
  body: string;
  icon: string;
  tone: BriefingTimelineTone;
  duration: string;
  action: string;
  href: string;
  aiTag?: boolean;
}

export interface TimelineInput {
  verlopenFacturen: { client: string; bedrag: number }[];
  verlopenTotaal: number;
  conceptFacturen: { client: string }[];
  conflictsCount: number;
  upcomingZonderPrep: { id: string | number; name: string; daysAway: number }[];
  lowStockItems: { naam: string; categorie: string }[];
  upcomingGuests: number;
  pipelineCount: number;
  pipelineHighestEuro: number;
  pipelineHighestClient: string | null;
  oldestPipelineDays: number;
  btwDaysUntil: number | null;
  heroEvent: { id: string | number; name: string; daysAway: number } | null;
  unbookedReceiptsCount: number;
}

function pluralFactuur(n: number): string {
  return n === 1 ? 'factuur' : 'facturen';
}

export function computeTimelineItems(input: TimelineInput): BriefingTimelineItem[] {
  const out: BriefingTimelineItem[] = [];

  // ── VANDAAG ────────────────────────────────────────────────────────
  if (input.verlopenFacturen.length > 0) {
    out.push({
      id: 'tl-overdue',
      when: 'Vandaag',
      title: `${input.verlopenFacturen.length} ${pluralFactuur(input.verlopenFacturen.length)} herinneren`,
      body: input.verlopenFacturen.slice(0, 2).map((f) => `${f.client} (€ ${Math.round(f.bedrag).toLocaleString('nl-NL')})`).join(' · '),
      icon: 'mail-warning',
      tone: 'red',
      duration: '5 min',
      action: 'Verstuur',
      href: '/facturen',
    });
  }
  if (input.conflictsCount > 0) {
    out.push({
      id: 'tl-conflicts',
      when: 'Vandaag',
      title: `${input.conflictsCount} planning-conflict${input.conflictsCount === 1 ? '' : 'en'}`,
      body: 'Twee events op dezelfde tijd — los op om dubbele bezetting te voorkomen.',
      icon: 'alert-triangle',
      tone: 'red',
      duration: '10 min',
      action: 'Open agenda',
      href: '/agenda',
    });
  }
  if (input.unbookedReceiptsCount > 0) {
    out.push({
      id: 'tl-receipts',
      when: 'Vandaag',
      title: `${input.unbookedReceiptsCount} bonnen verwerken`,
      body: 'Scan & boek voor BTW-aangifte.',
      icon: 'receipt',
      tone: 'gray',
      duration: '20 min',
      action: 'Open bonnen',
      href: '/financien',
    });
  }
  if (input.conceptFacturen.length > 0) {
    out.push({
      id: 'tl-concept',
      when: 'Vandaag',
      title: `${input.conceptFacturen.length} concept-${pluralFactuur(input.conceptFacturen.length)} versturen`,
      body: input.conceptFacturen.slice(0, 2).map((f) => f.client).join(' · '),
      icon: 'file-text',
      tone: 'amber',
      duration: '8 min',
      action: 'Open',
      href: '/facturen',
    });
  }

  // ── MORGEN ─────────────────────────────────────────────────────────
  for (const e of input.upcomingZonderPrep) {
    if (e.daysAway === 1) {
      out.push({
        id: `tl-prep-${e.id}`,
        when: 'Morgen',
        title: `Prep voor ${e.name}`,
        body: 'Event morgen — start prep, check vlees, rubs, koeling.',
        icon: 'flame',
        tone: 'amber',
        duration: '60 min',
        action: 'Open prep',
        href: '/prep-counter',
      });
    }
  }

  // ── DEZE WEEK ──────────────────────────────────────────────────────
  for (const e of input.upcomingZonderPrep) {
    if (e.daysAway >= 2 && e.daysAway <= 7) {
      out.push({
        id: `tl-prep-${e.id}`,
        when: 'Deze week',
        title: `Prep schema voor ${e.name}`,
        body: `Event over ${e.daysAway} dagen — plan prep en bestel ingrediënten.`,
        icon: 'clipboard-list',
        tone: 'amber',
        duration: '20 min',
        action: 'Plan',
        href: '/prep-counter',
        aiTag: true,
      });
    }
  }

  if (input.pipelineCount > 0 && input.oldestPipelineDays >= 3) {
    out.push({
      id: 'tl-pipeline',
      when: 'Deze week',
      title: `${input.pipelineCount} ${input.pipelineCount === 1 ? 'offerte open' : 'offertes open'}`,
      body: input.pipelineHighestClient
        ? `${input.pipelineHighestClient} (€ ${Math.round(input.pipelineHighestEuro).toLocaleString('nl-NL')}) wacht ${input.oldestPipelineDays} dgn op reactie.`
        : 'Stuur reminders naar klanten die het langst wachten.',
      icon: 'mail-check',
      tone: 'red',
      duration: '15 min',
      action: 'Bel klant',
      href: '/offertes',
    });
  }

  if (input.lowStockItems.length > 0 && input.upcomingGuests > 20) {
    out.push({
      id: 'tl-stock-event',
      when: 'Deze week',
      title: `Voorraad onder minimum`,
      body: `${input.lowStockItems.length} items laag · ${input.upcomingGuests} gasten op komst.`,
      icon: 'alert-triangle',
      tone: 'amber',
      duration: '15 min',
      action: 'Bestel',
      href: '/voorraad',
    });
  }

  // ── KOMENDE MAAND ─────────────────────────────────────────────────
  if (input.btwDaysUntil !== null && input.btwDaysUntil > 0 && input.btwDaysUntil <= 60) {
    out.push({
      id: 'tl-btw',
      when: 'Komende maand',
      title: `BTW-aangifte over ${input.btwDaysUntil} ${input.btwDaysUntil === 1 ? 'dag' : 'dagen'}`,
      body: 'Sommeer voorbelasting per maand en check uitgaande facturen.',
      icon: 'shield-check',
      tone: 'gray',
      duration: '30 min',
      action: 'Open BTW',
      href: '/financien',
    });
  }

  for (const e of input.upcomingZonderPrep) {
    if (e.daysAway >= 8 && e.daysAway <= 30) {
      out.push({
        id: `tl-prep-${e.id}`,
        when: 'Komende maand',
        title: `Voorbereiding ${e.name}`,
        body: `Event over ${e.daysAway} dagen — bestel hout, plan pekel en rub.`,
        icon: 'calendar-check',
        tone: 'gray',
        duration: '—',
        action: 'Open prep',
        href: '/prep-counter',
      });
    }
  }

  return out;
}

/** Helper: groepeer items per `when`-bucket. */
export function groupTimelineItems(
  items: BriefingTimelineItem[],
): Record<BriefingTimelineWhen, BriefingTimelineItem[]> {
  const buckets: Record<BriefingTimelineWhen, BriefingTimelineItem[]> = {
    Vandaag: [],
    Morgen: [],
    'Deze week': [],
    'Komende maand': [],
  };
  for (const item of items) {
    buckets[item.when].push(item);
  }
  return buckets;
}
