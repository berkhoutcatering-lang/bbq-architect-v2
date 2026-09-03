import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { estimateCarbon } from '@/lib/carbonFootprint';
import { checkRateLimit } from '@/lib/rateLimit';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Geen publieke token' }, { status: 400 });
  }

  /* P0.16 — anti-scraping rate-limit voor publieke endpoint zonder auth.
     20 reqs/min per IP volstaat voor normaal klant-gedrag (paar refreshes,
     PDF-preview, deelbare link). Token entropy is OK: `public_token` is een
     UUID (gen_random_uuid → 122 bits), dus geen enumeration-risico — alleen
     scraping als iemand een lijst tokens al heeft. */
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rl = checkRateLimit(`public-offerte:${ip}`, 20);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Te veel verzoeken — probeer over een minuut opnieuw.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.resetInSeconds),
          'X-RateLimit-Limit': '20',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() + rl.resetInSeconds * 1000),
        },
      },
    );
  }

  const supabase = createServiceSupabase();
  const { data: offer, error } = await supabase
    .from('offertes')
    .select('*')
    .eq('public_token', token)
    .single();

  if (error || !offer) {
    return NextResponse.json({ error: 'Offerte niet gevonden of verlopen.' }, { status: 404 });
  }

  let settings = null;
  if (offer.organization_id) {
    const { data } = await supabase
      .from('settings')
      .select('bedrijfsnaam, ondertitel, email, telefoon, adres, website, betaalvoorwaarden, logo_url, brand_primary, brand_accent, brand_secondary, brand_background, brand_card, brand_text, brand_theme, default_btw, menukaart_template_id, menukaart_overrides')
      .eq('organization_id', offer.organization_id)
      .single();
    settings = data ?? null;
  }

  /* Server-side carbon-estimate (Pillar #2 + 2026-trend ESG). De /q/[id]
     route heeft geen authenticated supabase-client, dus we doen de lookup
     hier met service-role en sturen het mee in de response. */
  let carbon: ReturnType<typeof estimateCarbon> | null = null;
  if (offer.organization_id) {
    try {
      const menuSel = typeof offer.menu_selectie === 'string'
        ? (function () { try { return JSON.parse(offer.menu_selectie); } catch { return null; } })()
        : offer.menu_selectie;

      const dishNamen = new Set<string>();
      if (Array.isArray(menuSel)) {
        for (const x of menuSel) {
          const n = typeof x === 'string' ? x : (x?.gerecht_naam || x?.naam);
          if (n) dishNamen.add(String(n).toLowerCase());
        }
      } else if (menuSel && typeof menuSel === 'object') {
        for (const arr of Object.values(menuSel)) {
          if (!Array.isArray(arr)) continue;
          for (const x of arr) {
            const n = typeof x === 'string' ? x : (x?.gerecht_naam || x?.naam);
            if (n) dishNamen.add(String(n).toLowerCase());
          }
        }
      }

      if (dishNamen.size > 0) {
        const { data: gerechten } = await supabase
          .from('gerechten')
          .select('naam, ingredienten')
          .eq('organization_id', offer.organization_id);
        const allIngs: Array<{ naam: string; hoeveelheid?: number; eenheid?: string }> = [];
        for (const g of (gerechten || []) as Array<{ naam: string; ingredienten: any }>) {
          if (!dishNamen.has(g.naam.toLowerCase())) continue;
          const ings = typeof g.ingredienten === 'string'
            ? (function () { try { return JSON.parse(g.ingredienten); } catch { return []; } })()
            : g.ingredienten;
          if (Array.isArray(ings)) {
            for (const it of ings) {
              if (typeof it?.naam === 'string') {
                allIngs.push({
                  naam: it.naam,
                  hoeveelheid: typeof it.hoeveelheid === 'number' ? it.hoeveelheid : undefined,
                  eenheid: typeof it.eenheid === 'string' ? it.eenheid : undefined,
                });
              }
            }
          }
        }
        if (allIngs.length > 0) {
          carbon = estimateCarbon(allIngs);
        }
      }
    } catch {
      // Carbon-fail is non-blocking: portal werkt zonder.
      carbon = null;
    }
  }

  /* Kan deze cateraar online betalingen aannemen? Zonder Mollie-sleutel loopt
     "Bevestig & betaal aanbetaling" nergens op uit: de klant kiest een bank,
     krijgt geen betaalscherm, en belandt op de bedankpagina. Het portaal moet
     dan geen betaling beloven en ook geen bank vragen. */
  const betalenMogelijk = Boolean(process.env.MOLLIE_API_KEY);

  return NextResponse.json({ offer, settings, carbon, betalenMogelijk });
}
