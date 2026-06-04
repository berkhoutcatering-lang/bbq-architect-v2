/* ── Arrangement-configurator — gedeelde types ────────────────────────────────
   "Zelf offerte samenstellen": de cateraar bouwt een arrangement (categorie →
   3 niveaus → items + indicatieprijs); de klant kiest per categorie een niveau
   en ziet een directe indicatieprijs. Eindprijs blijft mensenwerk in de offerte.

   Drie lagen:
   • *Row-types     — ruwe DB-rijen (admin/service-role).
   • *Public-types  — genormaliseerde publieke vorm (GET /api/public-arrangement).
   • MenuSelectie*  — zelfstandige snapshot opgeslagen in leads.menu_selectie.
   ──────────────────────────────────────────────────────────────────────────── */

/* ── DB-rijen (admin via authenticated client / service-role) ──────────────── */
export interface ArrangementRow {
  id: string;
  organization_id: string;
  naam: string;
  slug: string | null;
  gasten_default: number;
  min_gasten: number;
  actief: boolean;
  publiek: boolean;
  volgorde: number;
  created_at: string;
  updated_at: string;
}

export interface ArrangementCategorieRow {
  id: string;
  arrangement_id: string;
  organization_id: string;
  naam: string;
  icon: string;
  hint: string | null;
  volgorde: number;
  created_at: string;
  updated_at: string;
}

export interface CategorieNiveauRow {
  id: string;
  categorie_id: string;
  organization_id: string;
  naam: string;
  indicatie_prijs_pp: number;
  items: string[];
  populair: boolean;
  volgorde: number;
  created_at: string;
  updated_at: string;
}

/* ── Publieke, genormaliseerde vorm (door de configurator geconsumeerd) ────── */
export interface NiveauPublic {
  id: string;
  naam: string;
  prijs: number;        // = indicatie_prijs_pp
  items: string[];
  populair: boolean;
}

export interface CategoriePublic {
  id: string;
  naam: string;
  icon: string;
  hint: string | null;
  levels: NiveauPublic[];
}

export interface ArrangementPublic {
  id: string;
  naam: string;
  gastenDefault: number;
  minGasten?: number;          // configureerbaar minimum (cateraar); default 1
  categories: CategoriePublic[];
}

/** Antwoord van GET /api/public-arrangement/[slug]. */
export interface ArrangementConfigResponse {
  tenant: {
    naam: string;
    tagline: string | null;
    telefoon: string | null;
    email: string | null;
  };
  brandTheme: string;          // settings.brand_theme → themeStyleVars
  arrangement: ArrangementPublic;
}

/* ── Lead-snapshot (leads.menu_selectie) ───────────────────────────────────── */
export interface MenuSelectieRegel {
  categorie: string;
  niveau: string;
  prijs_pp: number;
  items: string[];
}

export interface MenuSelectieSnapshot {
  arrangement_id: string;
  arrangement_naam: string;
  gasten: number;
  pp: number;                  // Σ gekozen_niveau.prijs_pp
  regels: MenuSelectieRegel[];
}
