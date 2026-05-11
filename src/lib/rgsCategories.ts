/**
 * RGS-catering subset
 * ───────────────────
 * Pillar #1 (RGS-native categorisering) — voor de boekhouder-pakket-flow.
 *
 * Dit is GEEN volledige RGS 3.8 dump. Het is een werkbare subset van ~25
 * codes die een NL BBQ-catering-eenmanszaak in praktijk gebruikt. Een echte
 * boekhouder kan deze codes 1-op-1 mappen op zijn grootboek.
 *
 * Codes volgen de RGS-MKB-conventie (verkorte versie van RGS 3.8 voor MKB).
 * Bron-structuur: https://www.referentiegrootboekschema.nl/
 *
 * Bij intake-gesprek met Sam's boekhouder: vraag "welke codes wijken af?"
 * en update deze lijst. Niet zelf gokken voor exotische situaties.
 *
 * Hard rule: AI mag categorie suggereren, BTW-percentage komt uit
 * BTW_RULES_2026 (zie hieronder) — nooit AI-derived.
 */

export type RgsKind = 'kosten' | 'investering' | 'opbrengst' | 'overig';
export type RgsBtw = '9' | '21' | '0' | 'geen' | 'twijfel';

export interface RgsCategory {
  code: string;          // RGS-code, bv. 'WKpr' of 'WAkpAkpAir'
  label: string;         // Korte NL-omschrijving voor UI
  hint: string;          // Wanneer kies je deze? — helpt AI én cateraar
  kind: RgsKind;
  /** Default BTW-percentage. AI gebruikt dit als suggestie maar de bon-foto
   *  bepaalt uiteindelijk wat in btw_laag_bedrag/btw_hoog_bedrag staat. */
  btw_default: RgsBtw;
  /** Mag deze categorie aan een specifiek event gekoppeld worden?
   *  Pillar #2 — catering-context-aware classify. */
  event_couplable: boolean;
  /** Twijfel-categorie? Forceert review als AI deze suggereert. */
  always_review?: boolean;
}

/** De 25 codes die 95% van Hop & Bites-bonnen dekken. */
export const RGS_CATERING_CATEGORIES: RgsCategory[] = [
  // ─── Kostprijs omzet (food/event-direct) ─────────────────────
  {
    code: 'WKprIng',
    label: 'Ingrediënten — vlees / vis / hoofdcomponenten',
    hint: 'Slager, vleesgroothandel, vis. Hoofdmoot van de food-cost.',
    kind: 'kosten', btw_default: '9', event_couplable: true,
  },
  {
    code: 'WKprIngBij',
    label: 'Ingrediënten — bijgerechten / groenten / brood',
    hint: 'Groente, brood, sauzen, kruiden. Sligro/Makro food-deel.',
    kind: 'kosten', btw_default: '9', event_couplable: true,
  },
  {
    code: 'WKprDrnk',
    label: 'Dranken — alcoholisch + non-alcoholisch',
    hint: 'Bier, wijn, fris. BTW 21% want alcohol; non-alc ook 21% voor service.',
    kind: 'kosten', btw_default: '21', event_couplable: true,
  },
  {
    code: 'WKprVerp',
    label: 'Verpakkingsmateriaal + disposables',
    hint: 'Bordjes, bestek, servetten, foliebakken, ijs.',
    kind: 'kosten', btw_default: '21', event_couplable: true,
  },
  {
    code: 'WKprBrand',
    label: 'BBQ-brandstof — hout / briketten / gas',
    hint: 'Smoker-hout, briketten, propaan. Direct event-gekoppeld.',
    kind: 'kosten', btw_default: '21', event_couplable: true,
  },

  // ─── Personeel ───────────────────────────────────────────────
  {
    code: 'WPerLnIH',
    label: 'Inhuur ZZP / freelance personeel',
    hint: 'Lars, Pieter, andere chefs op factuur. NIET loondienst.',
    kind: 'kosten', btw_default: '21', event_couplable: true,
  },
  {
    code: 'WPerLnLD',
    label: 'Lonen loondienst',
    hint: 'Alleen als je vaste werknemers hebt. Complex — kruis-check boekhouder.',
    kind: 'kosten', btw_default: 'geen', event_couplable: false, always_review: true,
  },

  // ─── Auto + vervoer ──────────────────────────────────────────
  {
    code: 'WBedAuBz',
    label: 'Brandstof zakelijke rit (auto v/d zaak)',
    hint: 'Tank-bon waar je zakelijke rit van kan onderbouwen.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedAuOnd',
    label: 'Auto-onderhoud + verzekering + APK',
    hint: 'Garagebon, autoverzekering, MRB.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedReisOv',
    label: 'Reiskosten — overige (parkeren, OV)',
    hint: 'Parkeer-tickets, OV-chipkaart-tegoed.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Huisvesting + utilities ─────────────────────────────────
  {
    code: 'WBedHuur',
    label: 'Huur werkplaats / loods',
    hint: 'Vaste huur prep-locatie.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedEnGW',
    label: 'Gas / water / elektra werkplaats',
    hint: 'Energie-rekening prep-locatie.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Materieel + inventaris ──────────────────────────────────
  {
    code: 'WAfsInv',
    label: 'Investering inventaris — smoker / koelcel / aanhanger',
    hint: 'Aankoop boven €450 = activeren + afschrijven. Onder = direct kosten.',
    kind: 'investering', btw_default: '21', event_couplable: false, always_review: true,
  },
  {
    code: 'WBedKlGer',
    label: 'Klein gereedschap + kleine inventaris',
    hint: 'Onder €450: tangen, thermometers, GN-bakken.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedKlOndH',
    label: 'Onderhoud materieel / kleding',
    hint: 'Wasserij chef-kleding, reparatie smoker, verzekering aanhanger.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Marketing + verkoop ─────────────────────────────────────
  {
    code: 'WVbReclMa',
    label: 'Marketing — social media / advertenties',
    hint: 'Meta/Google ads, Mailchimp, fotograaf social content.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WVbWebHos',
    label: 'Website + domeinen + hosting',
    hint: 'Domain, hosting, Vercel, Stripe-fees (verkoop).',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Software + abonnementen ─────────────────────────────────
  {
    code: 'WBedSwAbon',
    label: 'Software-abonnementen (zakelijk)',
    hint: 'BBQ Architect, Microsoft 365, Adobe, AI-tools, etc.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedTele',
    label: 'Telefoon + internet',
    hint: 'Zakelijk abonnement of zakelijk deel privé-abonnement.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Administratie + advies ──────────────────────────────────
  {
    code: 'WBedAdvAcc',
    label: 'Boekhouder + accountant + fiscaal advies',
    hint: 'Jaarwerk, BTW-aangifte-review.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedAdvJur',
    label: 'Juridisch advies + verzekering',
    hint: 'Aansprakelijkheid, rechtsbijstand.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },

  // ─── Twijfel-buckets ─────────────────────────────────────────
  {
    code: 'WBedRepKan',
    label: 'Kantoorbenodigdheden + drukwerk',
    hint: 'Pennen, papier, visitekaartjes.',
    kind: 'kosten', btw_default: '21', event_couplable: false,
  },
  {
    code: 'WBedKostOv',
    label: 'Overige kosten — kruis-check vereist',
    hint: 'Onduidelijk? Sluis naar twijfel-stapel, boekhouder beslist.',
    kind: 'kosten', btw_default: 'twijfel', event_couplable: false, always_review: true,
  },

  // ─── Niet-aftrekbaar / privé ─────────────────────────────────
  {
    code: 'WPriv',
    label: 'Privé-opname (niet aftrekbaar)',
    hint: 'Verschuiven naar privé-rekening; geen kost voor de zaak.',
    kind: 'overig', btw_default: 'geen', event_couplable: false, always_review: true,
  },

  // ─── Opbrengsten (voor verkoop-facturen) ─────────────────────
  {
    code: 'WOpbCat',
    label: 'Omzet catering — food (BTW 9%)',
    hint: 'Standaard food-deel van een buffet/event.',
    kind: 'opbrengst', btw_default: '9', event_couplable: true,
  },
  {
    code: 'WOpbCatDrnk',
    label: 'Omzet catering — dranken/service (BTW 21%)',
    hint: 'Drankarrangement + service-uren + leveringskosten.',
    kind: 'opbrengst', btw_default: '21', event_couplable: true,
  },
];

/** Map voor snelle lookup */
export const RGS_BY_CODE: Record<string, RgsCategory> = Object.fromEntries(
  RGS_CATERING_CATEGORIES.map(c => [c.code, c])
);

/** Welke codes komen typisch voor op een aankoop-bon? */
export const PURCHASE_CODES = RGS_CATERING_CATEGORIES
  .filter(c => c.kind === 'kosten' || c.kind === 'investering')
  .map(c => c.code);

/** Welke codes komen typisch voor op een verkoop-factuur? */
export const SALES_CODES = RGS_CATERING_CATEGORIES
  .filter(c => c.kind === 'opbrengst')
  .map(c => c.code);

/** Helper: krijg display-info voor een code */
export function rgsLookup(code: string | null | undefined): RgsCategory | null {
  if (!code) return null;
  return RGS_BY_CODE[code] || null;
}

/** Status van AI-classificatie op een bon/factuur. */
export type AiClassifyStatus = 'pending' | 'auto_accepted' | 'manual' | 'twijfel' | 'verified';
