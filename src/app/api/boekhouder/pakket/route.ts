/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { RGS_BY_CODE } from '@/lib/rgsCategories';
import { generateBoekhouderPdf, type PdfBon, type PdfFactuur, type PdfRit } from '@/lib/boekhouderPdf';
import { tariefVoorJaar, bedragAftrekbaar } from '@/lib/ritten-tarieven';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/boekhouder/pakket
 * ───────────────────────────
 * Pillar #4 — genereer maandpakket voor boekhouder.
 *
 * Body: { month: "YYYY-MM" }
 *
 * Stappen:
 *  1. Valideer: alle bonnen in maand zijn classified (geen pending/twijfel)
 *  2. Bouw CSV-content (1 regel per bon + 1 regel per verkoop-factuur)
 *  3. Bouw BTW-overzicht-tekst
 *  4. Maak boekhouder_pakketten-record + lock alle bonnen + facturen
 *  5. Returneer data URL voor client-side download
 *
 * v1: CSV als data:text/csv URL. v2: echte ZIP met foto's via jszip client-side.
 */

interface PakketRequest {
  month: string; // YYYY-MM
  email_to?: string;
}

function csvEscape(s: string | number | null | undefined): string {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function fmtEur(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as PakketRequest;
    const m = String(body.month || '');
    if (!/^\d{4}-\d{2}$/.test(m)) {
      return NextResponse.json({ error: 'month moet YYYY-MM zijn' }, { status: 400 });
    }
    const [yyyy, mm] = m.split('-');
    const start = `${yyyy}-${mm}-01`;
    const nextMonth = Number(mm) === 12
      ? `${Number(yyyy) + 1}-01-01`
      : `${yyyy}-${String(Number(mm) + 1).padStart(2, '0')}-01`;

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    // Check of er al een vergrendeld pakket bestaat voor deze maand.
    // Locked → regenereer PDF/CSV uit bestaande data zonder opnieuw te locken
    // (immutable, audit-trail blijft intact).
    const { data: existing } = await supabase
      .from('boekhouder_pakketten')
      .select('id, status')
      .eq('organization_id', orgId)
      .eq('period_type', 'maand')
      .eq('period_year', Number(yyyy))
      .eq('period_month', Number(mm))
      .limit(1);
    const isRegenerate = existing && existing.length > 0 && (existing[0].status === 'locked' || existing[0].status === 'sent');

    // Haal bonnen op
    const { data: bonnen } = await supabase
      .from('bonnen')
      .select(`
        id, datum, totaal_bedrag, netto_bedrag, btw_laag_bedrag, btw_hoog_bedrag,
        rgs_code, rgs_category_label, ai_classify_status, event_id, leverancier_id, notities,
        leverancier:leverancier_id (naam, type),
        event:event_id (name, date, guests)
      `)
      .eq('organization_id', orgId)
      .gte('datum', start)
      .lt('datum', nextMonth)
      .order('datum', { ascending: true });

    if (!bonnen || bonnen.length === 0) {
      return NextResponse.json({ error: 'Geen bonnen in deze maand' }, { status: 400 });
    }

    // Valideer: alles classified?
    const unclassified = bonnen.filter((b: any) =>
      !b.rgs_code || ['pending', 'twijfel'].includes(b.ai_classify_status || 'pending')
    );
    if (unclassified.length > 0) {
      return NextResponse.json({
        error: `${unclassified.length} bonnen zijn nog niet geclassificeerd of staan op twijfel. Handel eerst af.`,
        unclassified_ids: unclassified.map((b: any) => b.id),
      }, { status: 400 });
    }

    // Haal verkoop-facturen op (status verzonden of betaald)
    const { data: facturen } = await supabase
      .from('facturen')
      .select('id, nummer, datum, client_naam, items, rgs_code, status')
      .eq('organization_id', orgId)
      .gte('datum', start)
      .lt('datum', nextMonth);

    // Kilometerregistratie (zakelijke ritten) — vóór de CSV-bouw nodig
    const { data: rittenRaw } = await supabase
      .from('ritten')
      .select('id, datum, vertrek_adres, aankomst_adres, kilometers, prive_omleiding_km, zakelijk, doel, event_id')
      .eq('organization_id', orgId)
      .gte('datum', start)
      .lt('datum', nextMonth)
      .eq('zakelijk', true)
      .order('datum', { ascending: true });
    const ritEventIds = Array.from(new Set((rittenRaw || []).map((r: any) => r.event_id).filter(Boolean)));
    const ritEventMap = new Map<number, string>();
    if (ritEventIds.length > 0) {
      const { data: evs } = await supabase.from('events').select('id, name').in('id', ritEventIds);
      (evs || []).forEach((e: any) => ritEventMap.set(e.id, e.name));
    }
    const tarief = tariefVoorJaar(Number(yyyy));
    const pdfRitten: PdfRit[] = (rittenRaw || []).map(function (r: any) {
      const km = Math.max(0, Number(r.kilometers || 0) - Number(r.prive_omleiding_km || 0));
      const bedrag = bedragAftrekbaar({
        kilometers: Number(r.kilometers) || 0,
        zakelijk: !!r.zakelijk,
        priveOmleidingKm: Number(r.prive_omleiding_km) || 0,
        datum: r.datum,
      });
      return {
        datum: r.datum,
        vertrek: r.vertrek_adres || '',
        aankomst: r.aankomst_adres || '',
        doel: r.doel || null,
        zakelijke_km: km,
        bedrag_eur: bedrag,
        event_naam: r.event_id ? ritEventMap.get(r.event_id) || null : null,
      };
    });
    const totaalKm = pdfRitten.reduce(function (s, r) { return s + r.zakelijke_km; }, 0);
    const totaalKmBedrag = pdfRitten.reduce(function (s, r) { return s + r.bedrag_eur; }, 0);

    // Bouw CSV
    const headers = [
      'type', 'datum', 'leverancier_of_klant', 'omschrijving',
      'rgs_code', 'rgs_label', 'event',
      'netto_eur', 'btw_9_eur', 'btw_21_eur', 'totaal_eur',
    ];
    const lines: string[] = [headers.join(',')];

    let totalPurchase = 0, totalSales = 0;
    let totalBtw9 = 0, totalBtw21 = 0;
    let totalSalesBtw9 = 0, totalSalesBtw21 = 0;

    for (const b of bonnen as any[]) {
      const cat = b.rgs_code ? RGS_BY_CODE[b.rgs_code] : null;
      const netto = Number(b.netto_bedrag) || 0;
      const btw9 = Number(b.btw_laag_bedrag) || 0;
      const btw21 = Number(b.btw_hoog_bedrag) || 0;
      const totaal = Number(b.totaal_bedrag) || 0;
      totalPurchase += totaal;
      totalBtw9 += btw9;
      totalBtw21 += btw21;
      lines.push([
        'inkoop',
        csvEscape(b.datum || ''),
        csvEscape(b.leverancier?.naam || ''),
        csvEscape((cat?.label || b.rgs_category_label || '') + (b.notities ? ' — ' + b.notities : '')),
        csvEscape(b.rgs_code || ''),
        csvEscape(cat?.label || ''),
        csvEscape(b.event?.name || ''),
        fmtEur(netto), fmtEur(btw9), fmtEur(btw21), fmtEur(totaal),
      ].join(','));
    }

    for (const f of (facturen || []) as any[]) {
      const cat = f.rgs_code ? RGS_BY_CODE[f.rgs_code] : null;
      // Voor verkoop-facturen: BTW komt uit items-JSONB
      const items = Array.isArray(f.items) ? f.items : [];
      let netto = 0, btw9 = 0, btw21 = 0;
      items.forEach((it: any) => {
        const lineTotal = (Number(it.aantal) || 0) * (Number(it.prijs) || 0);
        const pct = Number(it.btw_pct) || 21;
        const btwAmount = lineTotal * pct / (100 + pct);
        netto += lineTotal - btwAmount;
        if (pct === 9) btw9 += btwAmount;
        else if (pct === 21) btw21 += btwAmount;
      });
      const totaal = netto + btw9 + btw21;
      totalSales += totaal;
      totalSalesBtw9 += btw9;
      totalSalesBtw21 += btw21;
      lines.push([
        'verkoop',
        csvEscape(f.datum || ''),
        csvEscape(f.client_naam || ''),
        csvEscape(`Factuur ${f.nummer}`),
        csvEscape(f.rgs_code || 'WOpbCat'),
        csvEscape(cat?.label || 'Omzet catering — food'),
        '',
        fmtEur(netto), fmtEur(btw9), fmtEur(btw21), fmtEur(totaal),
      ].join(','));
    }

    // Totaalregels
    lines.push('');
    lines.push(`TOTAAL INKOOP,,,,,,,,,,${fmtEur(totalPurchase)}`);
    lines.push(`TOTAAL VERKOOP,,,,,,,,,,${fmtEur(totalSales)}`);

    // Kilometerregistratie regels
    if ((rittenRaw || []).length > 0) {
      lines.push('');
      lines.push(`-- KILOMETERREGISTRATIE — ${tarief.toFixed(2)}/km Belastingdienst-tarief --`);
      (rittenRaw || []).forEach(function (r: any) {
        const km = Math.max(0, Number(r.kilometers || 0) - Number(r.prive_omleiding_km || 0));
        const bedrag = bedragAftrekbaar({
          kilometers: Number(r.kilometers) || 0,
          zakelijk: !!r.zakelijk,
          priveOmleidingKm: Number(r.prive_omleiding_km) || 0,
          datum: r.datum,
        });
        lines.push([
          'kilometers',
          csvEscape(r.datum || ''),
          csvEscape(`${r.vertrek_adres} → ${r.aankomst_adres}`),
          csvEscape(r.doel || (r.event_id && ritEventMap.get(r.event_id)) || ''),
          'WBedReisOv',
          'Reiskosten — kilometeraftrek',
          csvEscape(r.event_id && ritEventMap.get(r.event_id) || ''),
          fmtEur(bedrag), '0.00', '0.00', fmtEur(bedrag),
        ].join(','));
      });
      lines.push(`TOTAAL KILOMETERAFTREK,,,,,,${totaalKm} km,,,,${fmtEur(totaalKmBedrag)}`);
    }
    lines.push('');
    lines.push('BTW SAMENVATTING (voor aangifte):');
    lines.push(`Voorbelasting BTW 9% (inkoop food),,,,,,,,${fmtEur(totalBtw9)},,`);
    lines.push(`Voorbelasting BTW 21% (inkoop overig),,,,,,,,,${fmtEur(totalBtw21)},`);
    lines.push(`Verschuldigd BTW 9% (verkoop food),,,,,,,,${fmtEur(totalSalesBtw9)},,`);
    lines.push(`Verschuldigd BTW 21% (verkoop overig),,,,,,,,,${fmtEur(totalSalesBtw21)},`);
    const voorbelasting = totalBtw9 + totalBtw21;
    const verschuldigd = totalSalesBtw9 + totalSalesBtw21;
    const afTeDragen = verschuldigd - voorbelasting;
    lines.push('');
    lines.push(`Totaal voorbelasting,,,,,,,,,,${fmtEur(voorbelasting)}`);
    lines.push(`Totaal verschuldigd,,,,,,,,,,${fmtEur(verschuldigd)}`);
    lines.push(`Af te dragen (verschuldigd − voorbelasting),,,,,,,,,,${fmtEur(afTeDragen)}`);

    const csv = lines.join('\n');
    const csvDataUrl = 'data:text/csv;charset=utf-8;base64,' + Buffer.from(csv, 'utf-8').toString('base64');

    // Voorraad-snapshot (per einde maand)
    const { data: voorraad } = await supabase
      .from('inventory')
      .select('current_stock, last_price_eur, purchase_price, unit')
      .eq('organization_id', orgId);
    const voorraadwaarde = (voorraad || []).reduce(function (s, v: any) {
      const price = Number(v.last_price_eur) || Number(v.purchase_price) || 0;
      const stock = Number(v.current_stock) || 0;
      return s + price * stock;
    }, 0);

    // ─── PDF — BTW-aangifte-concept + bonnen-overzicht ──
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, boekhouder_naam, boekhouder_email, bonnen_retentie_jaar')
      .eq('id', orgId)
      .single();
    // btw_nummer staat op settings (per-org) — apart ophalen
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('btw_nummer')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();
    const btwNummer = settingsRow?.btw_nummer || undefined;
    const retentieJaar = Number(orgRow?.bonnen_retentie_jaar) || 7;

    const periodLabel = new Date(start + 'T00:00:00').toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' });
    const periodEnd = new Date(new Date(nextMonth + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10);

    const pdfBonnen: PdfBon[] = (bonnen as any[]).map(function (b) {
      const lev = Array.isArray(b.leverancier) ? b.leverancier[0] : b.leverancier;
      const ev = Array.isArray(b.event) ? b.event[0] : b.event;
      const cat = b.rgs_code ? RGS_BY_CODE[b.rgs_code] : null;
      return {
        datum: b.datum,
        leverancier_naam: lev?.naam || '(onbekend)',
        rgs_code: b.rgs_code || null,
        rgs_label: cat?.label || b.rgs_category_label || null,
        event_naam: ev?.name || null,
        netto: Number(b.netto_bedrag) || 0,
        btw_9: Number(b.btw_laag_bedrag) || 0,
        btw_21: Number(b.btw_hoog_bedrag) || 0,
        totaal: Number(b.totaal_bedrag) || 0,
        notities: b.notities,
      };
    });

    const pdfFacturen: PdfFactuur[] = ((facturen || []) as any[]).map(function (f) {
      const items = Array.isArray(f.items) ? f.items : [];
      let netto = 0, btw9 = 0, btw21 = 0;
      items.forEach(function (it: any) {
        const lineTotal = (Number(it.aantal) || 0) * (Number(it.prijs) || 0);
        const pct = Number(it.btw_pct) || 21;
        const btwAmount = lineTotal * pct / (100 + pct);
        netto += lineTotal - btwAmount;
        if (pct === 9) btw9 += btwAmount;
        else if (pct === 21) btw21 += btwAmount;
      });
      return {
        datum: f.datum,
        nummer: f.nummer || String(f.id),
        client_naam: f.client_naam || '(onbekend)',
        rgs_code: f.rgs_code || 'WOpbCat',
        netto: netto,
        btw_9: btw9,
        btw_21: btw21,
        totaal: netto + btw9 + btw21,
      };
    });

    const { base64: pdfBase64, filename: pdfFilename } = generateBoekhouderPdf({
      org_name: orgRow?.name || 'Onbekende organisatie',
      org_btw_nr: btwNummer,
      boekhouder_naam: orgRow?.boekhouder_naam || undefined,
      retentie_jaar: retentieJaar,
      period_label: periodLabel,
      period_start: start,
      period_end: periodEnd,
      generated_at: new Date().toISOString(),
      bonnen: pdfBonnen,
      facturen: pdfFacturen,
      kilometers: pdfRitten.length > 0 ? {
        ritten: pdfRitten,
        totaal_km: totaalKm,
        totaal_aftrekbaar_eur: Math.round(totaalKmBedrag * 100) / 100,
        tarief_per_km: tarief,
      } : undefined,
      totals: {
        inkoop_totaal: totalPurchase,
        verkoop_totaal: totalSales,
        btw_voorbelasting_9: totalBtw9,
        btw_voorbelasting_21: totalBtw21,
        btw_verschuldigd_9: totalSalesBtw9,
        btw_verschuldigd_21: totalSalesBtw21,
        btw_af_te_dragen: afTeDragen,
        voorraadwaarde_eur: voorraadwaarde,
      },
    });
    const pdfDataUrl = 'data:application/pdf;base64,' + pdfBase64;

    // Maak / update pakket-record
    const pakketPayload = {
      organization_id: orgId,
      period_type: 'maand',
      period_year: Number(yyyy),
      period_month: Number(mm),
      bonnen_count: bonnen.length,
      facturen_count: (facturen || []).length,
      total_purchases_eur: Math.round(totalPurchase * 100) / 100,
      total_sales_eur: Math.round(totalSales * 100) / 100,
      btw_voorbelasting_eur: Math.round(voorbelasting * 100) / 100,
      btw_verschuldigd_eur: Math.round(verschuldigd * 100) / 100,
      btw_af_te_dragen_eur: Math.round(afTeDragen * 100) / 100,
      voorraadwaarde_eur: Math.round(voorraadwaarde * 100) / 100,
      delivery_method: body.email_to ? 'email' : 'download',
      sent_to_email: body.email_to || null,
      status: 'locked' as const,
      locked_at: new Date().toISOString(),
      locked_by_user_id: user.id,
    };

    let pakketId: number;
    if (isRegenerate) {
      // Locked pakket → alleen regenereren, NIET wijzigen. Audit-trail intact.
      pakketId = existing![0].id;
    } else if (existing && existing.length > 0) {
      // Concept → update + lock
      const { error: updErr } = await supabase
        .from('boekhouder_pakketten')
        .update(pakketPayload)
        .eq('id', existing[0].id);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      pakketId = existing[0].id;
    } else {
      // Nieuw pakket → insert + lock
      const { data: inserted, error: insErr } = await supabase
        .from('boekhouder_pakketten')
        .insert(pakketPayload)
        .select('id')
        .single();
      if (insErr || !inserted) return NextResponse.json({ error: insErr?.message || 'Insert mislukt' }, { status: 500 });
      pakketId = inserted.id;
    }

    // Lock bonnen + facturen — alleen bij eerste keer locken (niet bij regenerate)
    if (!isRegenerate) {
      const bonIds = bonnen.map((b: any) => b.id);
      const factuurIds = (facturen || []).map((f: any) => f.id);
      const lockedAt = new Date().toISOString();
      if (bonIds.length > 0) {
        await supabase
          .from('bonnen')
          .update({ locked_at: lockedAt, locked_by_user_id: user.id, ai_classify_status: 'verified' })
          .in('id', bonIds)
          .eq('organization_id', orgId);
      }
      if (factuurIds.length > 0) {
        await supabase
          .from('facturen')
          .update({ locked_at: lockedAt, locked_by_user_id: user.id })
          .in('id', factuurIds)
          .eq('organization_id', orgId);
      }
    }

    return NextResponse.json({
      ok: true,
      pakket_id: pakketId,
      regenerated: !!isRegenerate,
      bonnen_count: bonnen.length,
      facturen_count: (facturen || []).length,
      kilometers_count: pdfRitten.length,
      btw_voorbelasting: voorbelasting,
      btw_verschuldigd: verschuldigd,
      btw_af_te_dragen: afTeDragen,
      voorraadwaarde,
      csv_data_url: csvDataUrl,
      csv_filename: `boekhouding-${m}.csv`,
      pdf_data_url: pdfDataUrl,
      pdf_filename: pdfFilename,
      zip_data_url: csvDataUrl,
    });
  } catch (err: any) {
    console.error('[boekhouder/pakket]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });

    const { data } = await supabase
      .from('boekhouder_pakketten')
      .select('*')
      .eq('organization_id', orgId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(24);

    return NextResponse.json({ pakketten: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
