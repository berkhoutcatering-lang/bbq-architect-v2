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
 *
 * Kerst-Box (oktober 2026, online betalen uit): een lead met event_type
 * "Kerst-Box" wordt meteen een winkel-order met betaalwijze 'bij_afhalen'
 * (src/lib/winkel/kerst.ts). De klant krijgt de Kerst-bevestiging in plaats
 * van de cateringmail; Mathijs krijgt alleen een mail als het omzetten
 * mislukt — de bestelling staat dan als lead in Verkoop → Kerst.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { mailLeadBevestiging, mailLeadNotificatie, sendServerMail } from '@/lib/serverMail';
import { evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';
import { basisUit } from '@/lib/winkel/context';
import { kerstTotaalCenten, leesKerstLead, plaatsKerstBestelling, type KerstAanvraag } from '@/lib/winkel/kerst';
import { afhaaldagVoluit, euroKerst, stuurKerstBevestiging, stuurKerstMail, voornaamVan } from '@/lib/winkel/kerstMail';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';

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
  /* Kerst-Box: de bestelling gestructureerd naast de bon (kerst.ts leest hem). */
  bestelling: z.unknown().optional(),
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

  const kerst = leesKerstLead({ event_type: d.event_type, event_datum: d.event_datum, gasten: d.gasten, bericht: d.bericht, bestelling: d.bestelling });
  if (kerst) {
    await verwerkKerst(req, t, lead.id, { naam: d.naam, email: d.email, telefoon: empty(d.telefoon) }, kerst);
    return NextResponse.json({ success: true });
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
      telefoon: t.settings?.telefoon || undefined,
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

type TenantRes = NonNullable<Awaited<ReturnType<typeof resolveTenant>>>;

/**
 * De lead staat er al. Nu de order, en de bevestiging aan de klant — die is
 * beloofd ("je krijgt meteen een bevestiging"), dus hij gaat ook als het
 * omzetten mislukt, met het bedrag uit de prijzen van de webshop. Gooit nooit.
 */
async function verwerkKerst(
  req: NextRequest,
  t: TenantRes,
  leadId: number,
  contact: { naam: string; email: string; telefoon: string | null },
  a: KerstAanvraag,
) {
  const store = maakSupabaseStore(t.supabase);
  try {
    const tenant = await store.laadTenant(t.org.slug);
    if (!tenant) throw new Error('tenant niet gevonden');
    const uit = await plaatsKerstBestelling(
      { store, mail: stuurKerstBevestiging, naPlaatsen: (orgId) => evalueerWinkelMeldingen(orgId) },
      tenant,
      { id: leadId, ...contact },
      a,
    );
    if (uit.ok) {
      await t.supabase.from('leads').update({ status: 'gewonnen', omzet_fout: null }).eq('id', leadId);
      return;
    }
    await naMislukken(req, t, leadId, contact, a, uit.ok === false ? uit.reden : 'onbekend', store);
  } catch (e) {
    await naMislukken(req, t, leadId, contact, a, e instanceof Error ? e.message : 'onbekende fout', store);
  }
}

async function naMislukken(
  req: NextRequest,
  t: TenantRes,
  leadId: number,
  contact: { naam: string; email: string; telefoon: string | null },
  a: KerstAanvraag,
  reden: string,
  store: ReturnType<typeof maakSupabaseStore>,
) {
  console.warn('[public-lead-form] Kerst-Box niet omgezet, lead', leadId, ':', reden);
  try {
    await t.supabase.from('leads').update({ omzet_fout: reden }).eq('id', leadId);
  } catch { /* kolom ontbreekt nog (migratie niet toegepast): de lead staat er wel */ }

  let totaal = 0;
  try {
    totaal = kerstTotaalCenten(a, await store.laadArtikelen(t.org.id));
  } catch {
    totaal = kerstTotaalCenten(a, []);
  }
  const velden = { voornaam: voornaamVan(contact.naam), nummer: `A-${leadId}`, personen: a.personen, vegetarisch: a.vegetarisch, bier: a.bier, wijn: a.wijn, cremant: a.cremant, champagne: a.champagne, afhaaldag: a.afhaaldag, totaalCenten: totaal };
  const klant = await stuurKerstMail('ontvangen', contact.email, velden, t.settings?.email ?? null).catch(() => ({ success: false }));

  /* Mathijs moet dit weten: de klant denkt dat het vaststaat. */
  if (t.settings?.email) {
    const link = `${basisUit(req)}/verkoop/kerst`;
    const regels = [
      `${contact.naam} bestelde een Kerst-Box, maar die kon niet automatisch in de productie.`,
      '',
      `Reden: ${reden}`,
      '',
      `Personen: ${a.personen}${a.vegetarisch ? ` (waarvan vegetarisch ${a.vegetarisch})` : ''}${a.onzeker ? ' — nog niet zeker' : ''}`,
      ...(a.bier ? [`Bierproeverij: ${a.bier}`] : []),
      ...(a.wijn ? [`Wijnproeverij: ${a.wijn}`] : []),
      ...(a.cremant ? [`Crémant: ${a.cremant} ${a.cremant === 1 ? 'fles' : 'flessen'}`] : []),
      ...(a.champagne ? [`Champagne: ${a.champagne} ${a.champagne === 1 ? 'fles' : 'flessen'}`] : []),
      `Afhalen: ${afhaaldagVoluit(a.afhaaldag)}`,
      `Totaal: ${euroKerst(totaal)}, betalen bij afhalen`,
      `Contact: ${contact.email}${contact.telefoon ? ` · ${contact.telefoon}` : ''}`,
      '',
      `De klant ${klant.success ? 'heeft de bevestiging gekregen' : 'heeft GEEN bevestiging gekregen (mail mislukt)'}.`,
      `Los het op en zet hem om in Verkoop → Kerst: ${link}`,
    ];
    await sendServerMail({
      to: t.settings.email,
      subject: `Kerst-Box-bestelling van ${contact.naam} staat nog niet in de productie`,
      text: regels.join('\n'),
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${regels.map((r) => (r ? r.replace(/&/g, '&amp;').replace(/</g, '&lt;') : '<br>')).join('<br>')}</div>`,
    }).catch(() => undefined);
  }
}
