/**
 * Publiek aanvraagformulier-endpoint (Lead Funnel) — tenant via organizations.slug.
 *
 * Geen auth-gate: een websitebezoeker zonder account moet een offerte kunnen
 * aanvragen. Daarom net als /api/contact + /api/public-offerte:
 *   - tenant-resolve via organizations.slug (UNIQUE)
 *   - lezen/schrijven via SERVICE-ROLE client (bypass RLS) — geen anon-policy
 *   - Zod-validatie + honeypot (`website`) + rate-limit per IP + AVG-consent
 *
 * GET  → publiek-veilige settings (bedrijfsnaam + thema) om het formulier te stylen.
 * POST → maakt een lead (source='public_form') + mailt bevestiging (klant) en
 *        notificatie (operator = settings.email).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { mailLeadBevestiging, mailLeadNotificatie } from '@/lib/serverMail';

/* Publiek-veilige settings-subset voor het formulier (géén interne velden). */
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

  const t = await resolveTenant(slug);
  if (!t) return NextResponse.json({ error: 'Caterer niet gevonden' }, { status: 404 });

  /* Heeft deze cateraar een publiek arrangement? → tweede ingang ("Zelf offerte
     samenstellen") tonen op het aanvraagformulier. */
  const { count: arrangementCount } = await t.supabase
    .from('arrangementen')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', t.org.id)
    .eq('actief', true)
    .eq('publiek', true);

  return NextResponse.json({
    bedrijfsnaam: t.settings?.bedrijfsnaam || 'Catering',
    ondertitel: t.settings?.ondertitel || null,
    brand_theme: t.settings?.brand_theme || 'warm-amber',
    telefoon: t.settings?.telefoon || null,
    email: t.settings?.email || null,
    hasArrangement: (arrangementCount ?? 0) > 0,
  });
}

const LeadSchema = z.object({
  naam: z.string().min(1, 'Naam is verplicht').max(200),
  email: z.string().email('Ongeldig e-mailadres').max(200),
  telefoon: z.string().max(50).optional().or(z.literal('')),
  event_datum: z.string().max(20).optional().or(z.literal('')),
  gasten: z.coerce.number().int().min(0).max(100000).optional(),
  locatie: z.string().max(300).optional().or(z.literal('')),
  event_type: z.string().max(100).optional().or(z.literal('')),
  budget_indicatie: z.string().max(100).optional().or(z.literal('')),
  bericht: z.string().max(5000).optional().or(z.literal('')),
  /* AVG — expliciete opt-in vereist. */
  gdpr_consent: z.literal(true, { message: 'Ga akkoord met de privacy-voorwaarden' }),
  /* Honeypot — bot vult dit, mens niet (CSS-hidden in het formulier). */
  website: z.string().max(0).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  const rl = checkRateLimit(`public-lead:${ip}`, 5);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Te veel aanvragen — probeer over een minuut opnieuw.' },
      { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } },
    );
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  /* Honeypot: stuur 200 OK zodat de bot denkt dat het werkte, verwerk niets. */
  if (parsed.data.website && parsed.data.website.length > 0) {
    return NextResponse.json({ success: true });
  }

  const t = await resolveTenant(slug);
  if (!t) return NextResponse.json({ error: 'Caterer niet gevonden' }, { status: 404 });

  const d = parsed.data;
  const empty = (s?: string) => (s && s.length > 0 ? s : null);

  const { data: lead, error } = await t.supabase
    .from('leads')
    .insert({
      organization_id: t.org.id,
      naam: d.naam,
      email: d.email,
      telefoon: empty(d.telefoon),
      event_datum: empty(d.event_datum),
      gasten: d.gasten ?? null,
      locatie: empty(d.locatie),
      event_type: empty(d.event_type),
      budget_indicatie: empty(d.budget_indicatie),
      bericht: empty(d.bericht),
      client_naam: d.naam,
      status: 'nieuw',
      source: 'public_form',
    })
    .select('id')
    .single();

  if (error || !lead) {
    console.error('[public-lead-form] insert error:', error?.message);
    return NextResponse.json({ error: 'Aanvraag kon niet worden opgeslagen — probeer later opnieuw.' }, { status: 500 });
  }

  /* E-mails best-effort: een mislukte mail mag de aanvraag niet laten falen
     (de lead staat al veilig in de pijplijn). */
  const bedrijfsnaam = t.settings?.bedrijfsnaam || 'Catering';
  const brandColor = t.settings?.brand_primary || undefined;
  const ondertitel = t.settings?.ondertitel || undefined;
  try {
    await mailLeadBevestiging({
      clientEmail: d.email, clientNaam: d.naam,
      eventDatum: empty(d.event_datum) || undefined, eventType: empty(d.event_type) || undefined,
      bedrijfsnaam, brandColor, ondertitel,
    });
    if (t.settings?.email) {
      await mailLeadNotificatie({
        operatorEmail: t.settings.email,
        naam: d.naam, email: d.email, telefoon: empty(d.telefoon) || undefined,
        eventDatum: empty(d.event_datum) || undefined, eventType: empty(d.event_type) || undefined,
        gasten: d.gasten ?? null, locatie: empty(d.locatie) || undefined,
        budget: empty(d.budget_indicatie) || undefined, bericht: empty(d.bericht) || undefined,
        bedrijfsnaam, brandColor,
      });
    }
  } catch (e) {
    console.warn('[public-lead-form] mail niet verstuurd:', e instanceof Error ? e.message : 'unknown');
  }

  return NextResponse.json({ success: true });
}
