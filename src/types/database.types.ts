// =============================================
// BBQ Architect — Database Types
// Gegenereerd uit supabase-schema.sql + schema-migration.sql
// =============================================

// ── Multi-Tenant Types ──
export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  feature_flags: Record<string, boolean> | null;
  website_url: string | null;
  plan: 'starter' | 'professional' | 'enterprise';
  plan_valid_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'Admin' | 'Pitmaster' | 'Medewerker';
  status: 'invited' | 'active' | 'inactive';
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  // joined from profiles
  naam?: string;
  email?: string;
  avatar_url?: string;
}

export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  invited_by: string;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface Profile {
  id: number;
  user_id: string | null;
  naam: string;
  email: string;
  rol: string;
  status: string;
  avatar_url: string | null;
  organization_id: string | null;
}

export interface Settings {
  id: number;
  bedrijfsnaam: string;
  ondertitel: string;
  email: string;
  telefoon: string;
  adres: string;
  kvk: string;
  btw: string;
  iban: string;
  factuur_prefix: string;
  offerte_prefix: string;
  default_btw: number;
  betaaltermijn: number;
  offerte_geldig: number;
  logo_url: string | null;
  logo_dark_url: string | null;
  brand_primary: string | null;
  brand_accent: string | null;
  created_at: string;
  updated_at: string;
}

export interface Recept {
  id: number;
  naam: string;
  categorie: string;
  porties: number;
  preptime: number;
  ingredienten: IngredientItem[] | string;
  instructies: string;
  notitie: string;
  created_at: string;
}

export interface IngredientItem {
  naam: string;
  hoeveelheid?: number | string;
  eenheid?: string;
}

export interface FactuurItem {
  omschrijving?: string;
  qty?: number;
  prijs?: number;
  btw?: number;
}

export interface Factuur {
  id: number;
  nummer: string;
  status: 'concept' | 'verzonden' | 'betaald' | 'verlopen' | 'vervallen' | 'geannuleerd';
  client_naam: string;
  client_adres: string;
  datum: string;
  vervaldatum: string;
  items: FactuurItem[];
  /* FK naar bron-offerte; gevuld door auto-create bij acceptatie. UNIQUE per
     offerte — voorkomt dubbele facturen. Vereist migratie 007. */
  offerte_id?: number | null;
  /* FK naar gekoppeld event — handig voor "openstaande facturen per event". */
  event_id?: number | null;
  created_at: string;
}

export interface OfferteItem {
  omschrijving?: string;
  qty?: number;
  prijs?: number;
  btw?: number;
}

export interface Offerte {
  id: number;
  nummer: string;
  status: 'concept' | 'verzonden' | 'geaccepteerd' | 'afgewezen' | 'akkoord' | 'betaald' | 'verlopen' | 'geannuleerd' | 'definitief' | 'goedgekeurd';
  client_naam: string;
  client_adres: string;
  datum: string;
  geldig_tot: string;
  notitie: string;
  items: OfferteItem[];
  aantal_gasten?: number;
  basis_prijs_pp?: number;
  menu_selectie?: Record<string, MenuSelectieItem[]> | MenuSelectieItem[] | string;
  vaste_kosten?: VasteKost[];
  korting?: number;
  event_id?: number;
  public_token?: string;
  organization_id?: string;
  created_at: string;
}

export interface MenuSelectieItem {
  naam?: string;
  gerecht_naam?: string;
}

export interface VasteKost {
  naam?: string;
  bedrag: number | string;
}

export interface DbEvent {
  id: number;
  name: string;
  date: string;
  guests: number;
  location: string;
  ppp: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'optie';
  client_naam: string;
  client_adres: string;
  client_tel: string;
  client_email: string;
  type: string;
  notitie: string;
  menu: number[] | string;
  offerte_id?: number;
  created_at: string;
}

export interface PrepTask {
  id: number;
  event_id: number;
  text: string;
  dagen: number;
  done: boolean;
  created_at: string;
}

export interface RtrItem {
  id: number;
  text: string;
  done: boolean;
}

export interface PackList {
  id: number;
  event_id: number;
  items: PackListItem[];
  created_at: string;
}

export interface PackListItem {
  naam?: string;
  qty?: number;
  checked?: boolean;
}

export interface HaccpRecord {
  id: number;
  event_id?: number;
  datum: string;
  tijd: string;
  wat: string;
  temp: number;
  type: 'kern' | 'opslag' | 'ontvangst' | 'bereiding' | 'uitgifte';
  notitie: string;
  status: 'ok' | 'warn' | 'danger' | 'afwijking';
  created_at: string;
}

export interface Leverancier {
  id: number;
  naam: string;
  type: string;
  contact: string;
  email: string;
  tel: string;
  created_at: string;
}

export interface Inkooplijst {
  id: number;
  event_id: number;
  items: InkoopItem[];
  created_at: string;
}

export interface InkoopItem {
  naam?: string;
  qty?: number;
  unit?: string;
  checked?: boolean;
}

export interface Materieel {
  id: number;
  naam: string;
  type: string;
  status: 'ok' | 'onderhoud' | 'defect';
  aanschaf_datum: string;
  notitie: string;
  locatie?: string | null;
  fotos?: string[] | null;
  logboek: LogboekEntry[];
  created_at: string;
}

export interface LogboekEntry {
  datum?: string;
  notitie?: string;
}

export interface InventoryItem {
  id: number;
  organization_id?: string;
  naam: string;
  categorie: string;
  current_stock: number;
  min_stock: number;
  par_level: number;
  unit: string;
  purchase_price: number;
  supplier: string;
  yield_factor?: number;
  tht?: string | null;            // ISO date — Tenminste Houdbaar Tot
  avg_daily?: number;              // gemiddeld dagelijks verbruik
  allergenen?: string[];
  used_in?: string[];              // recept/event-namen waarin gebruikt
  last_count_at?: string | null;
  created_at: string;
}

export interface StockMovement {
  id: number;
  organization_id: string;
  inventory_id: number;
  type: 'count' | 'usage' | 'receive' | 'adjust' | 'waste';
  qty: number;                    // signed (- voor verbruik, + voor ontvangst)
  resulting_stock?: number | null;
  by_user?: string | null;
  by_user_id?: string | null;
  note?: string | null;
  created_at: string;
}

export interface PrepSuggestion {
  id: number;
  task_name: string;
  ingredient_naam: string;
  tekort: number;
  unit: string;
  scheduled_at: string;
  status: 'pending' | 'done';
  created_at: string;
}

export interface TimeLog {
  id: number;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'stopped' | 'completed' | 'signed';
  locatie: string;
  notitie: string;
  created_at: string;
}

export interface Bon {
  id: number;
  created_at: string;
  winkel: string;
  datum: string;
  totaal_bedrag: number;
  image_url: string | null;
  raw_analysis: unknown[];
  notities: string | null;
}

export interface AiConversationFolder {
  id: number;
  naam: string;
  kleur: string;
  created_at: string;
}

export interface AiConversation {
  id: number;
  folder_id: number | null;
  titel: string;
  modus: 'brainstorm' | 'qa' | 'algemeen';
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Gerecht (used in menu-engineering, not in base schema but referenced in code) ──
export interface Gerecht {
  id: number;
  naam: string;
  gang_id?: number;
  categorie?: string;
  beschrijving?: string;
  prijs?: number;
  ingredient_costs?: GerechIngredientCost[];
  created_at?: string;
}

export interface GerechIngredientCost {
  naam: string;
  qty_pp: number;
  unit: string;
  yield?: number;
}

export interface Gang {
  id: number;
  naam: string;
  slug: string;
  volgorde: number;
  created_at?: string;
}

// ── Website CMS Types ──
export interface WebsiteHero {
  id: number;
  src: string;
  alt: string;
  volgorde: number;
  actief: boolean;
}

export interface WebsiteFaq {
  id: number;
  vraag: string;
  antwoord: string;
  volgorde: number;
  actief: boolean;
}

export interface WebsiteGallery {
  id: number;
  src: string;
  label: string;
  categorie: string;
  volgorde: number;
  actief: boolean;
}

export interface WebsiteGerecht {
  id: any;
  naam: string;
  beschrijving: string;
  gang_slug: string;
  volgorde: number;
  actief: boolean;
  foto: string | null;
  extra_info: string | null;
  allergenen: string[];
}

export interface WebsiteGang {
  id: any;
  naam: string;
  slug: string;
  volgorde: number;
  minimum: number;
  extra_prijs_pp: number;
  actief: boolean;
}

export interface WebsiteSettings {
  id: number;
  email: string;
  telefoon: string;
  adres: string;
  kvk: string;
  btw_nummer: string;
}

export interface Klant {
  id: number;
  naam: string;
  bedrijf: string;
  adres: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  email: string;
  type: string;
  notities: string;
  created_at: string;
}

export interface EventReflectie {
  id: number;
  event_id: number;
  overschot: string;
  tekort: string;
  kwaliteit: string;
  verbeterpunten: string;
  score: number;
  notities: string;
  fotos: string[];
  created_at: string;
}

// ── Health, Changelog & Onboarding Types ──

export interface OnboardingEvent {
  id: number;
  organization_id: string;
  user_id: string | null;
  milestone: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChangelogEntry {
  id: number;
  version: string;
  title: string;
  description: string;
  category: 'feature' | 'improvement' | 'fix' | 'breaking';
  published_at: string;
  created_at: string;
}

export interface ChangelogRead {
  id: number;
  user_id: string;
  last_read_at: string;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  organization_id: string;
  user_id: string | null;
  action: string;
  page: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  content: string;
  category: string;
  search_tags: string[];
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupportTicket {
  id: number;
  organization_id: string;
  user_id: string;
  subject: string;
  message: string;
  category: 'vraag' | 'bug' | 'feature' | 'urgent';
  status: 'open' | 'in_behandeling' | 'opgelost' | 'gesloten';
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthScore {
  orgId: string;
  orgName: string;
  overall: number; // 0-100
  activity: number; // 0-100
  dataRichness: number; // 0-100
  adoption: number; // 0-100
  teamSize: number; // 0-100
  lastActivity: string | null;
  daysInactive: number;
  status: 'healthy' | 'at-risk' | 'critical' | 'churned';
}
