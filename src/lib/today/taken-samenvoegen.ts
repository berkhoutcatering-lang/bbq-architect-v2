/**
 * Eén takenlijst uit drie briefings.
 *
 * Op Vandaag stonden drie blokken die grotendeels hetzelfde vertelden: de
 * AI-dagbriefing, "Aandacht nodig" en de shift-briefing. "3 facturen vervallen"
 * kwam er drie keer voorbij, in drie bewoordingen:
 *
 *   dagbriefing      "3 facturen vervallen · €3.608"
 *   aandacht nodig   "3 facturen > 30 dagen"
 *   shift-briefing   "3 facturen herinneren · 5 min"
 *
 * Daardoor voelde het scherm vol terwijl er drie dingen te doen waren. Hier
 * komen de drie stromen samen in één lijst: gesorteerd op urgentie, met de bron
 * als klein label, en één actie per regel.
 *
 * De blokken blijven bestaan als bron — dit vervangt alleen hoe ze op het
 * scherm komen.
 */

export type TaakUrgentie = 'nu' | 'vandaag' | 'deze-week' | 'later';
export type TaakBron = 'dagbriefing' | 'aandacht' | 'shift';

export interface Taak {
  id: string;
  urgentie: TaakUrgentie;
  /** Tijdsindicatie, bv. "5 min". Leeg als we het niet weten. */
  tijd: string;
  titel: string;
  detail: string;
  /** Tekst op de knop, bv. "Verstuur". */
  actie: string;
  href: string;
  bron: TaakBron;
}

const URGENTIE_VOLGORDE: Record<TaakUrgentie, number> = {
  nu: 0, vandaag: 1, 'deze-week': 2, later: 3,
};

/** Kleur per urgentie. Alleen rood en amber dragen betekenis. */
export const URGENTIE_KLEUR: Record<TaakUrgentie, string> = {
  nu: 'var(--red)',
  vandaag: 'var(--amber)',
  'deze-week': 'var(--brand-gold)',
  later: 'var(--muted)',
};

export const BRON_LABEL: Record<TaakBron, string> = {
  dagbriefing: 'Dagbriefing',
  aandacht: 'Aandacht',
  shift: 'Planning',
};

/**
 * Twee taken zijn hetzelfde als ze over hetzelfde gáán, ook al staat er andere
 * tekst. We leiden een onderwerp af uit titel plus detail: de zelfstandige
 * naamwoorden die ertoe doen plus het eerste getal. "3 facturen vervallen",
 * "3 facturen > 30 dagen" en "3 facturen herinneren" krijgen dan alle drie
 * `factuur:3`.
 */
export function onderwerpVan(titel: string, detail: string): string {
  const tekst = (titel + ' ' + detail).toLowerCase();
  const aantal = (tekst.match(/\b(\d+)\b/) || [])[1] || '';

  const woorden: [RegExp, string][] = [
    [/factu/, 'factuur'],
    [/offerte/, 'offerte'],
    [/\bbon(nen)?\b/, 'bon'],
    [/voorraad|minimum|bestel/, 'voorraad'],
    [/prep|mise|voorbereid/, 'prep'],
    [/btw|aangifte/, 'btw'],
    [/marge/, 'marge'],
    [/allergi|allergen/, 'allergie'],
    [/crew|personeel|uren/, 'crew'],
    [/haccp|temperat/, 'haccp'],
  ];
  for (const [patroon, sleutel] of woorden) {
    if (patroon.test(tekst)) return sleutel + ':' + aantal;
  }
  /* Geen bekend onderwerp: val terug op de titel zelf, dan ontdubbelen we
     alleen letterlijk gelijke regels. */
  return 'overig:' + titel.toLowerCase().trim();
}

/**
 * Voegt de drie stromen samen. Bij een dubbeling wint de bron met de concreetste
 * actie: de shift-briefing weet hoe lang iets duurt en wat de knop moet zeggen,
 * de dagbriefing schrijft de mooiste zin. We houden de eerste die we tegenkomen
 * en vullen ontbrekende velden aan uit de latere.
 */
export function voegTakenSamen(stromen: {
  dagbriefing: Taak[];
  aandacht: Taak[];
  shift: Taak[];
}): Taak[] {
  /* Volgorde bepaalt wie wint bij een dubbeling. Shift eerst: die heeft een
     tijdsindicatie en een werkwoord op de knop. */
  const alles = [...stromen.shift, ...stromen.aandacht, ...stromen.dagbriefing];

  const perOnderwerp = new Map<string, Taak>();
  for (const taak of alles) {
    const sleutel = onderwerpVan(taak.titel, taak.detail);
    const bestaand = perOnderwerp.get(sleutel);
    if (!bestaand) {
      perOnderwerp.set(sleutel, taak);
      continue;
    }
    /* Aanvullen wat de winnaar mist, zodat we geen informatie weggooien. */
    perOnderwerp.set(sleutel, {
      ...bestaand,
      tijd: bestaand.tijd || taak.tijd,
      detail: bestaand.detail || taak.detail,
      href: bestaand.href || taak.href,
      /* De hoogste urgentie van de twee telt. */
      urgentie:
        URGENTIE_VOLGORDE[taak.urgentie] < URGENTIE_VOLGORDE[bestaand.urgentie]
          ? taak.urgentie
          : bestaand.urgentie,
    });
  }

  return [...perOnderwerp.values()].sort(
    (a, b) => URGENTIE_VOLGORDE[a.urgentie] - URGENTIE_VOLGORDE[b.urgentie],
  );
}
