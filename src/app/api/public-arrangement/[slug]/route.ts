/**
 * Publieke arrangement-configurator-endpoint ("Zelf offerte samenstellen").
 *
 * Tweede publieke ingang naast /api/public-lead-form. Een websitebezoeker stelt
 * zelf een arrangement samen (per categorie een niveau) en ziet direct een
 * indicatieprijs. Net als de rest van de publieke kant:
 *   - tenant-resolve via organizations.slug (UNIQUE)
 *   - lezen/schrijven via SERVICE-ROLE client (bypass RLS) — geen anon-policy
 *   - Zod-validatie + honeypot (`website`) + rate-limit per IP + AVG-consent
 *
 * GET  → het primaire actieve+publieke arrangement van de cateraar, genormaliseerd
 *        voor de configurator (categorie → niveaus → items + indicatieprijs).
 * POST → maakt een lead (source='arrangement') met een zelfstandige keuze-snapshot
 *        + indicatie-omzet, en mailt bevestiging (klant) + notificatie (operator).
 *
 * Hard rule (deterministisch, nooit AI/-client-afgeleid):
 *   De prijs wordt SERVER-SIDE herberekend uit de DB-niveauprijzen — de door de
 *   client meegestuurde prijzen worden genegeerd. pp = Σ gekozen_niveau.prijs_pp,
 *   indicatie = pp × gasten. De échte prijs blijft mensenwerk in de offerte.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { mailLeadBevestiging, mailLeadNotificatie } from '@/lib/serverMail';
import type {
  ArrangementConfigResponse, CategoriePublic, MenuSelectieRegel, MenuSelectieSnapshot,
} from '@/types/arrangement';

/* ── tenant + settings (publiek-veilige subset) ────────────────────────────── */
async function resolveTenant(slug: string) {
  const supabase = createServiceSupabase();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, slug')
    .eq('slug', slug)
    .single();
  if (!org) return null;
  const { data: settings } = await supabase
    .from('settings')
    .select('bedrijfsnaam, ondertitel, email, telefoon, brand_theme, brand_primary')
    .eq('organization_id', org.id)
    .single();
  return { org, settings: settings ?? null, supabase };
}

/* Primair arrangement = eerste actieve + publieke (laagste volgorde). */
async function loadPrimaryArrangement(
  supabase: ReturnType<typeof createServiceSupabase>,
  orgId: string,
) {
  const { data: arr } = await supabase
    .from('arrangementen')
    .select('id, naam, gasten_default, min_gasten')
    .eq('organization_id', orgId)
    .eq('actief', true)
    .eq('publiek', true)
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!arr) return null;

  const { data: cats } = await supabase
    .from('arrangement_categorieen')
    .select('id, naam, icon, hint, volgorde')
    .eq('arrangement_id', arr.id)
    .order('volgorde', { ascending: true });

  const catIds = (cats ?? []).map((c) => c.id);
  const { data: niveaus } = catIds.length
    ? await supabase
        .from('categorie_niveaus')
        .select('id, categorie_id, naam, indicatie_prijs_pp, items, populair, volgorde')
        .in('categorie_id', catIds)
        .order('volgorde', { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };

  return { arr, cats: cats ?? [], niveaus: (niveaus ?? []) };
}

type NiveauRow = {
  id: string; categorie_id: string; naam: string;
  indicatie_prijs_pp: number | string; items: unknown; populair: boolean; volgorde: number;
};

const asItems = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];

/* ── GET — arrangement voor de configurator ────────────────────────────────── */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

  const t = await resolveTenant(slug);
  if (!t) return NextResponse.json({ error: 'Caterer niet gevonden' }, { status: 404 });

  const loaded = await loadPrimaryArrangement(t.supabase, t.org.id);
  if (!loaded) {
    return NextResponse.json(
      { error: 'no_arrangement', message: 'Deze cateraar heeft nog geen samen-te-stellen arrangement.' },
      { status: 404 },
    );
  }

  const niveausByCat = new Map<string, NiveauRow[]>();
  for (const n of loaded.niveaus as NiveauRow[]) {
    const list = niveausByCat.get(n.categorie_id) ?? [];
    list.push(n);
    niveausByCat.set(n.categorie_id, list);
  }

  const categories: CategoriePublic[] = loaded.cats
    .map((c) => ({
      id: c.id,
      naam: c.naam,
      icon: c.icon || 'utensils',
      hint: c.hint ?? null,
      levels: (niveausByCat.get(c.id) ?? []).map((n) => ({
        id: n.id,
        naam: n.naam,
        prijs: Number(n.indicatie_prijs_pp) || 0,
        items: asItems(n.items),
        populair: !!n.populair,
      })),
    }))
    .filter((c) => c.levels.length > 0);

  const body: ArrangementConfigResponse = {
    tenant: {
      naam: t.settings?.bedrijfsnaam || 'Catering',
      tagline: t.settings?.ondertitel || null,
      telefoon: t.settings?.telefoon || null,
      email: t.settings?.email || null,
    },
    brandTheme: t.settings?.brand_theme || 'warm-amber',
    arrangement: {
      id: loaded.arr.id,
      naam: loaded.arr.naam,
      gastenDefault: loaded.arr.gasten_default || 50,
      minGasten: Math.max(1, Number(loaded.arr.min_gasten) || 1),
      categories,
    },
  };
  return NextResponse.json(body);
}

/* ── POST — lead opslaan ───────────────────────────────────────────────────── */
const PostSchema = z.object({
  arrangement_id: z.string().uuid('Ongeldig arrangement'),
  gasten: z.coerce.number().int().min(1).max(100000),
  budget: z.string().max(100).optional().or(z.literal('')),
  /* { categorie_id: niveau_id } */
  selecties: z.record(z.string().uuid(), z.string().uuid()),
  naam: z.string().min(1, 'Naam is verplicht').max(200),
  email: z.string().email('Ongeldig e-mailadres').max(200),
  telefoon: z.string().max(50).optional().or(z.literal('')),
  gdpr_consent: z.literal(true, { message: 'Ga akkoord met de privacy-voorwaarden' }),
  website: z.string().max(0).optional(),   // honeypot
});

const euro = (n: number) => '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const rl = checkRateLimit(`public-arrangement:${ip}`, 5);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Te veel aanvragen — probeer over een minuut opnieuw.' },
      { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } },
    );
  }

  let raw: unknown;
  try { raw = await req.json(); }
  catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

  const parsed = PostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const d = parsed.data;

  /* Honeypot: doe alsof het lukte, verwerk niets. */
  if (d.website && d.website.length > 0) return NextResponse.json({ success: true });

  const t = await resolveTenant(slug);
  if (!t) return NextResponse.json({ error: 'Caterer niet gevonden' }, { status: 404 });

  /* Arrangement moet van deze org zijn + actief + publiek. */
  const { data: arr } = await t.supabase
    .from('arrangementen')
    .select('id, naam, min_gasten')
    .eq('id', d.arrangement_id)
    .eq('organization_id', t.org.id)
    .eq('actief', true)
    .eq('publiek', true)
    .maybeSingle();
  if (!arr) return NextResponse.json({ error: 'Arrangement niet gevonden' }, { status: 404 });

  /* Categorieën + niveaus van DIT arrangement — autoritaire bron voor de prijs. */
  const { data: cats } = await t.supabase
    .from('arrangement_categorieen')
    .select('id, naam, volgorde')
    .eq('arrangement_id', arr.id)
    .order('volgorde', { ascending: true });

  const catIds = (cats ?? []).map((c) => c.id);
  const { data: niveaus } = catIds.length
    ? await t.supabase
        .from('categorie_niveaus')
        .select('id, categorie_id, naam, indicatie_prijs_pp, items')
        .in('categorie_id', catIds)
    : { data: [] as NiveauRow[] };

  const niveauById = new Map<string, NiveauRow>();
  for (const n of (niveaus ?? []) as NiveauRow[]) niveauById.set(n.id, n);

  /* Bouw autoritaire regels in categorie-volgorde; negeer onbekende keuzes. */
  const regels: MenuSelectieRegel[] = [];
  let pp = 0;
  for (const c of cats ?? []) {
    const chosen = d.selecties[c.id];
    if (!chosen) continue;
    const n = niveauById.get(chosen);
    if (!n || n.categorie_id !== c.id) continue;   // keuze hoort niet bij deze categorie → negeren
    const prijs = Number(n.indicatie_prijs_pp) || 0;
    pp += prijs;
    regels.push({ categorie: c.naam, niveau: n.naam, prijs_pp: prijs, items: asItems(n.items) });
  }

  if (regels.length === 0) {
    return NextResponse.json({ error: 'Geen geldige keuzes ontvangen' }, { status: 400 });
  }

  /* Server dwingt het cateraar-minimum af (autoritair, niet client-vertrouwd). */
  const gasten = Math.max(Number(arr.min_gasten) || 1, d.gasten);
  const indicatie = Math.round(pp * gasten * 100) / 100;

  const snapshot: MenuSelectieSnapshot = {
    arrangement_id: arr.id,
    arrangement_naam: arr.naam,
    gasten,
    pp: Math.round(pp * 100) / 100,
    regels,
  };

  /* Leesbare samenvatting voor de operator-notificatie + als bericht-fallback. */
  const bericht =
    `Zelf samengesteld arrangement — indicatie ${euro(indicatie)} voor ${gasten} gasten (${euro(pp)} p.p.):\n`
    + regels.map((r) => `• ${r.categorie} — ${r.niveau} (${euro(r.prijs_pp)} p.p.)`).join('\n');

  const empty = (s?: string) => (s && s.length > 0 ? s : null);

  const { data: lead, error } = await t.supabase
    .from('leads')
    .insert({
      organization_id: t.org.id,
      naam: d.naam,
      email: d.email,
      telefoon: empty(d.telefoon),
      gasten,
      budget_indicatie: empty(d.budget),
      bericht,
      client_naam: d.naam,
      status: 'nieuw',
      source: 'arrangement',
      menu_selectie: snapshot,
      menu_prijs_indicatie: indicatie,
    })
    .select('id')
    .single();

  if (error || !lead) {
    console.error('[public-arrangement] insert error:', error?.message);
    return NextResponse.json({ error: 'Aanvraag kon niet worden opgeslagen — probeer later opnieuw.' }, { status: 500 });
  }

  /* Mails best-effort — een mislukte mail mag de aanvraag niet laten falen. */
  const bedrijfsnaam = t.settings?.bedrijfsnaam || 'Catering';
  const brandColor = t.settings?.brand_primary || undefined;
  const ondertitel = t.settings?.ondertitel || undefined;
  try {
    await mailLeadBevestiging({
      clientEmail: d.email, clientNaam: d.naam,
      eventType: 'Zelf samengesteld arrangement', bedrijfsnaam, brandColor, ondertitel,
    });
    if (t.settings?.email) {
      await mailLeadNotificatie({
        operatorEmail: t.settings.email,
        naam: d.naam, email: d.email, telefoon: empty(d.telefoon) || undefined,
        eventType: 'Zelf samengesteld arrangement',
        gasten, budget: empty(d.budget) || undefined, bericht,
        bedrijfsnaam, brandColor,
      });
    }
  } catch (e) {
    console.warn('[public-arrangement] mail niet verstuurd:', e instanceof Error ? e.message : 'unknown');
  }

  return NextResponse.json({ success: true, indicatie });
}
