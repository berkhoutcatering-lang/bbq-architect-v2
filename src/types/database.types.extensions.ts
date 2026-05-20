/**
 * Database-types extensions.
 *
 * `database.types.ts` wordt normaal gegenereerd via `supabase gen types
 * typescript` en is dus authoritative voor de huidige DB-schema. Wanneer
 * we handmatig velden zouden toevoegen aan die file, gaan ze verloren bij
 * de volgende regen.
 *
 * Daarom: alle UI-velden die in DB voorkomen maar (nog) niet in het
 * generated schema staan, worden hier toegevoegd via TypeScript's
 * `declare module` merge-pattern. Bij regen blijven onze extras intact.
 *
 * Voeg hier alleen velden toe die in productie-data écht voorkomen,
 * niet velden die we "ooit nog willen". Voor die laatste categorie: maak
 * eerst een migratie, dan komt het automatisch in `database.types.ts`.
 *
 * Importeer deze file ÉÉN keer in `src/types/index.ts` zodat de
 * augmentations globally beschikbaar zijn.
 */

import './database.types';

declare module './database.types' {
  /* Gerecht — velden uit legacy DB-rijen die UI rendert. Migratie 014/15
     (recepten → gerechten merge) liet kolommen achter die nog niet in
     het gen-schema staan. */
  interface Gerecht {
    gang_slug?: string;
    foto_url?: string | null;
    tags?: string[];
    allergenen?: string[];
    ingredienten?: Array<{ naam: string; qty?: number; unit?: string; hoeveelheid?: number | string; eenheid?: string }>;
    bron?: string;
    kostprijs_pp?: number;
    verkoopprijs?: number;
  }

  /* Gang — minimum + extra_prijs_pp voor menu-configuratie per offerte. */
  interface Gang {
    minimum?: number;
    extra_prijs_pp?: number;
  }
}

/* Nieuwe rij-types die in DB bestaan maar nog niet als interface in
   database.types.ts staan. Wordt geëxporteerd vanaf src/types/index.ts. */

export interface MargeAlert {
  id: number;
  status: string;
  pct_change?: number | string;
  total_marge_impact_eur?: number | string;
  organization_id?: string;
  created_at?: string;
}

export interface MenuTemplateRow {
  id: number;
  organization_id?: string;
  naam: string;
  is_default?: boolean;
  /* Genormaliseerd JSON: { gang_slug: [{ gerecht_id, naam }, ...], ... } of
     legacy serialised-string-shape. UI handelt beide vormen af. */
  menu_selectie?: Record<string, unknown> | string | null;
  beschrijving?: string;
  basis_prijs_pp?: number | string;
  created_at?: string;
  updated_at?: string;
}
