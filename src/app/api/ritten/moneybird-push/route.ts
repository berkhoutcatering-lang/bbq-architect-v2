// Push kwartaal-totaal naar Moneybird als purchase-invoice "Reiskosten".
// Pillar #5: idempotent via UNIQUE (organization_id, jaar, kwartaal) op ritten_moneybird_pushes.
// Re-derive org_id server-side, NOOIT uit body — anders cross-tenant push.

import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { kwartaalRange, bedragAftrekbaar } from '@/lib/ritten-tarieven';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  jaar?: number;
  kwartaal?: 1 | 2 | 3 | 4;
}

export async function POST(req: Request) {
  // CSRF-light: alleen same-origin POST accepteren
  const origin = req.headers.get('origin');
  const expected = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (expected && origin && origin !== expected) {
    return NextResponse.json({ error: 'Cross-origin POST geweigerd' }, { status: 403 });
  }

  const body: Body = await req.json().catch(() => ({}));
  if (!body.jaar || !body.kwartaal || body.kwartaal < 1 || body.kwartaal > 4) {
    return NextResponse.json({ error: 'jaar + kwartaal (1-4) verplicht' }, { status: 400 });
  }

  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { data: membership } = await sb
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });
  }

  const orgId = membership.organization_id;
  const { start, eind } = kwartaalRange(body.jaar, body.kwartaal);

  // Idempotency check
  const { data: existing } = await sb
    .from('ritten_moneybird_pushes')
    .select('moneybird_invoice_id')
    .eq('organization_id', orgId)
    .eq('jaar', body.jaar)
    .eq('kwartaal', body.kwartaal)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: `Q${body.kwartaal} ${body.jaar} is al gepusht (Moneybird invoice ${existing.moneybird_invoice_id}). Verwijder eerst in Moneybird om opnieuw te pushen.`,
      },
      { status: 409 },
    );
  }

  // Verzamel zakelijke ritten
  const { data: ritten, error: rittenErr } = await sb
    .from('ritten')
    .select('kilometers, prive_omleiding_km, zakelijk, datum')
    .gte('datum', start)
    .lte('datum', eind)
    .eq('zakelijk', true);
  if (rittenErr) return NextResponse.json({ error: rittenErr.message }, { status: 500 });

  if (!ritten || ritten.length === 0) {
    return NextResponse.json({ error: 'Geen zakelijke ritten in dit kwartaal' }, { status: 400 });
  }

  const totaalKm = ritten.reduce((s, r) => s + (r.kilometers - (r.prive_omleiding_km ?? 0)), 0);
  const totaalBedrag = ritten.reduce(
    (s, r) =>
      s +
      bedragAftrekbaar({
        kilometers: r.kilometers,
        zakelijk: r.zakelijk,
        priveOmleidingKm: r.prive_omleiding_km,
        datum: r.datum,
      }),
    0,
  );

  // Moneybird-koppeling check
  const { data: org } = await sb
    .from('organizations')
    .select('feature_flags')
    .eq('id', orgId)
    .maybeSingle();
  const mb = (org?.feature_flags as Record<string, unknown> | null)?.moneybird as
    | { access_token?: string; administration_id?: string; scope_version?: string }
    | undefined;
  if (!mb?.access_token || !mb?.administration_id) {
    return NextResponse.json(
      { error: 'Moneybird niet gekoppeld. Ga naar Instellingen → Integraties.' },
      { status: 400 },
    );
  }
  if (mb.scope_version !== '2') {
    return NextResponse.json(
      {
        error:
          'Moneybird-toestemming bijwerken vereist (nieuwe scopes voor Reizen). Open Instellingen → Integraties → "Moneybird opnieuw koppelen".',
      },
      { status: 401 },
    );
  }

  // Push naar Moneybird
  const mbRes = await fetch(
    `https://moneybird.com/api/v2/${mb.administration_id}/purchase_invoices.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mb.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        purchase_invoice: {
          reference: `Reiskosten Q${body.kwartaal} ${body.jaar}`,
          date: eind,
          details_attributes: [
            {
              description: `${totaalKm} zakelijke km × € 0,23 (kilometervergoeding 2026)`,
              amount: 1,
              price: totaalBedrag,
              tax_rate_id: null, // kilometervergoeding is BTW-vrij
            },
          ],
        },
      }),
    },
  );
  const mbBody = (await mbRes.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!mbRes.ok) {
    return NextResponse.json(
      { error: `Moneybird error: ${mbBody?.error ?? mbRes.statusText}` },
      { status: 502 },
    );
  }

  // Log push (idempotency-anchor)
  await sb.from('ritten_moneybird_pushes').insert({
    organization_id: orgId,
    jaar: body.jaar,
    kwartaal: body.kwartaal,
    moneybird_invoice_id: mbBody.id ?? 'unknown',
    totaal_km: totaalKm,
    totaal_bedrag: totaalBedrag,
    pushed_by: user.id,
  });

  return NextResponse.json({
    ok: true,
    moneybird_invoice_id: mbBody.id,
    totaal_km: totaalKm,
    totaal_bedrag: totaalBedrag.toFixed(2),
  });
}
