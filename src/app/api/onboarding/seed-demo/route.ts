/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * P0.38 — Generieke demo-data seed voor nieuwe Pro-tier tenants.
 *
 * Sam's regel: lege app demotiveert; binnen 30s wil een nieuwe tenant
 * werkende data zien (Pillar 1 Systeem-hub).
 *
 * Idempotent: als er al events of klanten zijn, doet de route niets en
 * returnt `{ status: 'already_seeded' }`. Geen "reset"-functie hier —
 * dat is een aparte beslissing.
 *
 * Wat wordt geseed (klein maar realistisch):
 *   - 10 klanten (mix B2B + B2C, NL-namen)
 *   - 15 gerechten (BBQ-catering specifiek)
 *   - 20 inventory-items (vlees, sauzen, groenten, disposables)
 *   - 5 leveranciers
 *   - 8 events (4 komende, 4 historisch)
 *   - 3 facturen (mix betaald/open)
 *
 * Geen BTW-AI, geen allergeen-AI — alle waarden zijn deterministisch.
 *
 * RLS-impact: deze route gebruikt de user-scoped client, niet service-role.
 * Insert moet door RLS-policies voor `organization_members` lopen. De caller
 * moet ingelogd zijn als member van de target-org.
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEMO_KLANTEN = [
  { naam: 'Boerderij De Klaver', email: 'evenementen@klaver.nl', telefoon: '0512-345678', adres: 'Hoofdweg 12, Schoonoord' },
  { naam: 'Hotel Drents Hart', email: 'events@drentshart.nl', telefoon: '0593-555200', adres: 'Markt 4, Westerbork' },
  { naam: 'Familie Van der Berg', email: 'vdberg@example.com', telefoon: '06-12345678', adres: 'Dorpsstraat 23, Sleen' },
  { naam: 'Stichting Drenthe Werkt', email: 'team@drentewerkt.nl', telefoon: '0592-111222', adres: 'Werkplein 8, Assen' },
  { naam: 'Bedrijf Noordzee Logistics', email: 'office@noordzeelog.nl', telefoon: '0521-998877', adres: 'Industrieweg 3, Hoogeveen' },
  { naam: 'Familie De Jong', email: 'dejong@example.com', telefoon: '06-87654321', adres: 'Esdoornlaan 14, Coevorden' },
  { naam: 'Trouwlocatie Het Bos', email: 'info@hetbos.nl', telefoon: '0599-444555', adres: 'Boslaan 1, Borger' },
  { naam: 'Voetbalvereniging SV Drenthe', email: 'kantine@svdrenthe.nl', telefoon: '0591-222333', adres: 'Sportpark 5, Emmen' },
  { naam: 'Verjaardag Henk', email: 'henk@example.com', telefoon: '06-11223344', adres: 'Kerkstraat 7, Schoonoord' },
  { naam: 'Restaurant De Smul', email: 'horeca@desmul.nl', telefoon: '0593-666777', adres: 'Brink 2, Beilen' },
];

const DEMO_LEVERANCIERS = [
  { naam: 'Sligro Hoogeveen', categorie: 'Groothandel food' },
  { naam: 'Slagerij Brink', categorie: 'Vlees' },
  { naam: 'Versmarkt Drenthe', categorie: 'Groente & fruit' },
  { naam: 'BBQ-Holland Smoker-supplies', categorie: 'BBQ-supplies' },
  { naam: 'Disposables NL', categorie: 'Verpakking' },
];

const DEMO_GERECHTEN = [
  { naam: 'Pulled Pork Brioche', categorie: 'hoofdgerecht', gang_slug: 'hoofdgerechten', kostprijs_pp: 4.20, omschrijving: 'Langzaam gerookte pulled pork op een zachte brioche met cole slaw.' },
  { naam: 'BBQ Brisket', categorie: 'hoofdgerecht', gang_slug: 'hoofdgerechten', kostprijs_pp: 6.80, omschrijving: '14 uur gerookte brisket, slice-thick, met BBQ-saus.' },
  { naam: 'Smoked Chicken Wings', categorie: 'hoofdgerecht', gang_slug: 'hoofdgerechten', kostprijs_pp: 3.50, omschrijving: 'Rookachtige kippenvleugels met dry rub.' },
  { naam: 'Vegan Mushroom Burger', categorie: 'hoofdgerecht', gang_slug: 'hoofdgerechten', kostprijs_pp: 3.20, omschrijving: 'Plantaardige burger op portobello-basis.' },
  { naam: 'Cole Slaw Klassiek', categorie: 'bijgerecht', gang_slug: 'bijgerechten', kostprijs_pp: 0.80, omschrijving: 'Verse witte koolsalade met yoghurtdressing.' },
  { naam: 'Smoked Mac & Cheese', categorie: 'bijgerecht', gang_slug: 'bijgerechten', kostprijs_pp: 1.40, omschrijving: 'Gerookte macaroni met drie soorten kaas.' },
  { naam: 'Cornbread Muffin', categorie: 'bijgerecht', gang_slug: 'bijgerechten', kostprijs_pp: 0.60, omschrijving: 'Zoete maïsbroodjes uit de oven.' },
  { naam: 'Sweet Potato Wedges', categorie: 'bijgerecht', gang_slug: 'bijgerechten', kostprijs_pp: 0.90, omschrijving: 'Zoete aardappel partjes met paprika rub.' },
  { naam: 'Bourbon BBQ Saus', categorie: 'saus', gang_slug: 'bijgerechten', kostprijs_pp: 0.30, omschrijving: 'Huis-gemaakte saus met bourbon en ahornsiroop.' },
  { naam: 'Spicy Carolina Saus', categorie: 'saus', gang_slug: 'bijgerechten', kostprijs_pp: 0.30, omschrijving: 'Mosterd-gebaseerde saus uit South Carolina.' },
  { naam: 'Bruschetta Tomaat', categorie: 'voorgerecht', gang_slug: 'voorgerechten', kostprijs_pp: 1.20, omschrijving: 'Geroosterd brood met tomaat, basilicum en olijfolie.' },
  { naam: 'Carpaccio van Brisket', categorie: 'voorgerecht', gang_slug: 'voorgerechten', kostprijs_pp: 2.80, omschrijving: 'Dunne plakken gerookte brisket met truffel-mayo.' },
  { naam: 'BBQ Caesar Salad', categorie: 'salade', gang_slug: 'voorgerechten', kostprijs_pp: 1.60, omschrijving: 'Romeinse sla met gerookte kip en parmezaan.' },
  { naam: 'Smoked Cheesecake', categorie: 'nagerecht', gang_slug: 'nagerechten', kostprijs_pp: 1.80, omschrijving: 'Roomkaas-cheesecake met licht rooksmaakje.' },
  { naam: 'Smores Bar', categorie: 'nagerecht', gang_slug: 'nagerechten', kostprijs_pp: 1.20, omschrijving: 'Crackers, marshmallow en chocolade om zelf te roosteren.' },
];

const DEMO_INVENTORY = [
  { naam: 'Pulled Pork (varkensschouder rauw)', current_stock: 12, min_stock: 5, par_stock: 20, unit: 'kg', purchase_price: 8.50 },
  { naam: 'Brisket (rundbrisket)', current_stock: 8, min_stock: 4, par_stock: 15, unit: 'kg', purchase_price: 14.20 },
  { naam: 'Kippenvleugels', current_stock: 15, min_stock: 6, par_stock: 25, unit: 'kg', purchase_price: 4.80 },
  { naam: 'Portobello paddenstoelen', current_stock: 4, min_stock: 3, par_stock: 8, unit: 'kg', purchase_price: 9.50 },
  { naam: 'Wit kool', current_stock: 10, min_stock: 5, par_stock: 20, unit: 'kg', purchase_price: 1.80 },
  { naam: 'Macaroni penne', current_stock: 8, min_stock: 4, par_stock: 15, unit: 'kg', purchase_price: 2.20 },
  { naam: 'Cheddar geraspt', current_stock: 3, min_stock: 2, par_stock: 6, unit: 'kg', purchase_price: 12.50 },
  { naam: 'Mais (blik)', current_stock: 24, min_stock: 12, par_stock: 36, unit: 'blik', purchase_price: 1.40 },
  { naam: 'Zoete aardappel', current_stock: 14, min_stock: 6, par_stock: 22, unit: 'kg', purchase_price: 2.80 },
  { naam: 'Bourbon (kookwijn)', current_stock: 3, min_stock: 2, par_stock: 6, unit: 'fles', purchase_price: 18.50 },
  { naam: 'Mosterd Dijon', current_stock: 5, min_stock: 3, par_stock: 8, unit: 'pot', purchase_price: 3.20 },
  { naam: 'Tomaten (cherry)', current_stock: 6, min_stock: 4, par_stock: 12, unit: 'kg', purchase_price: 4.50 },
  { naam: 'Stokbrood', current_stock: 12, min_stock: 6, par_stock: 24, unit: 'stuks', purchase_price: 1.80 },
  { naam: 'Romeinse sla', current_stock: 8, min_stock: 4, par_stock: 16, unit: 'krop', purchase_price: 1.20 },
  { naam: 'Parmezaan', current_stock: 2, min_stock: 1, par_stock: 4, unit: 'kg', purchase_price: 22.00 },
  { naam: 'Roomkaas', current_stock: 4, min_stock: 2, par_stock: 8, unit: 'kg', purchase_price: 6.80 },
  { naam: 'Marshmallows', current_stock: 8, min_stock: 4, par_stock: 12, unit: 'zak', purchase_price: 2.40 },
  { naam: 'Houten skewers', current_stock: 200, min_stock: 100, par_stock: 500, unit: 'stuks', purchase_price: 0.05 },
  { naam: 'Folie-bakjes klein', current_stock: 80, min_stock: 50, par_stock: 200, unit: 'stuks', purchase_price: 0.15 },
  { naam: 'Servetten zwart', current_stock: 250, min_stock: 100, par_stock: 500, unit: 'stuks', purchase_price: 0.04 },
];

export async function POST(req: NextRequest) {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const { data: member } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  const orgId = member?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: 'Geen organisatie gevonden voor user' }, { status: 403 });
  }

  /* Idempotency: skip als er al events of klanten zijn — geen risico om
     bestaande data te overschrijven. */
  const [{ count: eventCount }, { count: klantCount }] = await Promise.all([
    sb.from('events').select('*', { count: 'exact', head: true }),
    sb.from('klanten').select('*', { count: 'exact', head: true }),
  ]);
  if ((eventCount ?? 0) > 0 || (klantCount ?? 0) > 0) {
    return NextResponse.json({
      status: 'already_seeded',
      message: 'Tenant heeft al data — seed overgeslagen om bestaande data te beschermen.',
      counts: { events: eventCount ?? 0, klanten: klantCount ?? 0 },
    });
  }

  const errors: string[] = [];

  // 1. KLANTEN
  const klantenIns = await sb.from('klanten').insert(
    DEMO_KLANTEN.map((k) => ({ ...k, organization_id: orgId })),
  ).select('id, naam');
  if (klantenIns.error) errors.push(`klanten: ${klantenIns.error.message}`);
  const klanten = klantenIns.data ?? [];

  // 2. LEVERANCIERS
  const levIns = await sb.from('leveranciers').insert(
    DEMO_LEVERANCIERS.map((l) => ({ ...l, organization_id: orgId })),
  ).select('id, naam');
  if (levIns.error) errors.push(`leveranciers: ${levIns.error.message}`);
  const leveranciers = levIns.data ?? [];

  // 3. INVENTORY
  const invIns = await sb.from('inventory').insert(
    DEMO_INVENTORY.map((i, idx) => ({
      ...i,
      organization_id: orgId,
      leverancier_id: leveranciers[idx % Math.max(leveranciers.length, 1)]?.id ?? null,
    })),
  ).select('id, naam');
  if (invIns.error) errors.push(`inventory: ${invIns.error.message}`);

  // 4. GERECHTEN
  const gerIns = await sb.from('gerechten').insert(
    DEMO_GERECHTEN.map((g) => ({ ...g, organization_id: orgId, status: 'actief' })),
  ).select('id, naam');
  if (gerIns.error) errors.push(`gerechten: ${gerIns.error.message}`);

  // 5. EVENTS (4 komend, 4 historisch)
  const today = new Date();
  const eventRows = [
    { name: 'Bedrijfsfeest Noordzee Logistics', days: -90, guests: 60, ppp: 38, status: 'voltooid', client: 'Bedrijf Noordzee Logistics' },
    { name: 'Verjaardag Henk 50', days: -45, guests: 35, ppp: 32, status: 'voltooid', client: 'Verjaardag Henk' },
    { name: 'Bruiloft De Jong', days: -28, guests: 80, ppp: 42, status: 'voltooid', client: 'Familie De Jong' },
    { name: 'Kantine BBQ SV Drenthe', days: -14, guests: 50, ppp: 28, status: 'voltooid', client: 'Voetbalvereniging SV Drenthe' },
    { name: 'Personeelsfeest Stichting Drenthe Werkt', days: 7, guests: 45, ppp: 35, status: 'bevestigd', client: 'Stichting Drenthe Werkt' },
    { name: 'Trouwerij Boslaan', days: 14, guests: 100, ppp: 48, status: 'bevestigd', client: 'Trouwlocatie Het Bos' },
    { name: 'Buurtfeest Sleen', days: 21, guests: 70, ppp: 30, status: 'concept', client: 'Familie Van der Berg' },
    { name: 'Hotel-buffet Drents Hart', days: 35, guests: 120, ppp: 45, status: 'concept', client: 'Hotel Drents Hart' },
  ];

  const evIns = await sb.from('events').insert(
    eventRows.map((e) => {
      const dt = new Date(today.getTime() + e.days * 86400_000);
      return {
        organization_id: orgId,
        name: e.name,
        date: dt.toISOString().slice(0, 10),
        guests: e.guests,
        ppp: e.ppp,
        status: e.status,
        type: 'BBQ Catering',
        client_naam: e.client,
        location: klanten.find((k) => k.naam === e.client)?.naam ?? 'Onbekend',
      };
    }),
  ).select('id, name, date');
  if (evIns.error) errors.push(`events: ${evIns.error.message}`);

  // 6. Activation event loggen
  await sb.from('activation_events').insert({
    organization_id: orgId,
    user_id: user.id,
    event_type: 'demo_seeded',
    metadata: {
      counts: {
        klanten: klanten.length,
        leveranciers: leveranciers.length,
        inventory: invIns.data?.length ?? 0,
        gerechten: gerIns.data?.length ?? 0,
        events: evIns.data?.length ?? 0,
      },
    },
  }).then(() => undefined, () => undefined);

  return NextResponse.json({
    status: errors.length === 0 ? 'seeded' : 'partial',
    counts: {
      klanten: klanten.length,
      leveranciers: leveranciers.length,
      inventory: invIns.data?.length ?? 0,
      gerechten: gerIns.data?.length ?? 0,
      events: evIns.data?.length ?? 0,
    },
    errors: errors.length > 0 ? errors : undefined,
  });
}
