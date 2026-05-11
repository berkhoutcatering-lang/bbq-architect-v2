/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createServerSupabase } from '@/lib/supabase-server';
import { RGS_BY_CODE } from '@/lib/rgsCategories';
import { generateBoekhouderPdf, type PdfBon, type PdfFactuur } from '@/lib/boekhouderPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/boekhouder/pakket/email
 * ─────────────────────────────────
 * Pillar #4 — Eind-van-maand 1-klik flow:
 *   1. Genereer PDF + CSV voor de maand
 *   2. Verstuur via Resend naar boekhouder-email (uit org-settings of override)
 *   3. Update boekhouder_pakketten met sent_at
 *
 * Body: { month: "YYYY-MM", to?: string, cc?: string, message?: string }
 *
 * Re-auth + Zod-achtige validatie inline (geen next-safe-action in deps).
 */

interface EmailBody {
  month: string;
  to?: string;
  cc?: string;
  message?: string;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function csvEscape(s: string | number | null | undefined): string {
  if (s == null) return '';
  const str = String(s);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'RESEND_API_KEY niet geconfigureerd' }, { status: 500 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json() as EmailBody;
    const m = String(body.month || '');
    if (!/^\d{4}-\d{2}$/.test(m)) return NextResponse.json({ error: 'month moet YYYY-MM zijn' }, { status: 400 });

    const overrideTo = (body.to || '').trim();
    if (overrideTo && !isValidEmail(overrideTo)) {
      return NextResponse.json({ error: 'Ongeldig email-adres' }, { status: 400 });
    }
    if (body.cc && !isValidEmail(String(body.cc).trim())) {
      return NextResponse.json({ error: 'Ongeldig cc email-adres' }, { status: 400 });
    }

    // Re-authorize inside action — middleware-only zou een CVE zijn
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1);
    const orgId = memberships?.[0]?.organization_id;
    const role = memberships?.[0]?.role;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    if (role !== 'Admin' && role !== 'Pitmaster') {
      return NextResponse.json({ error: 'Alleen Admin of Pitmaster mag boekhouder-pakketten versturen' }, { status: 403 });
    }

    // Periode-grenzen
    const [yyyy, mm] = m.split('-');
    const start = `${yyyy}-${mm}-01`;
    const nextMonth = Number(mm) === 12
      ? `${Number(yyyy) + 1}-01-01`
      : `${yyyy}-${String(Number(mm) + 1).padStart(2, '0')}-01`;

    // Org-info (en boekhouder-default)
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name, boekhouder_naam, boekhouder_email')
      .eq('id', orgId)
      .single();
    const { data: settingsRow } = await supabase
      .from('settings')
      .select('btw_nummer')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();
    const btwNummer = settingsRow?.btw_nummer || undefined;

    const recipientEmail = overrideTo || orgRow?.boekhouder_email || '';
    if (!recipientEmail) {
      return NextResponse.json({
        error: 'Geen boekhouder-email ingesteld. Geef "to" mee of stel boekhouder_email in onder Instellingen.',
      }, { status: 400 });
    }

    // Bonnen + facturen
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
      return NextResponse.json({ error: 'Geen bonnen om te versturen' }, { status: 400 });
    }

    const unclassified = bonnen.filter((b: any) =>
      !b.rgs_code || ['pending', 'twijfel'].includes(b.ai_classify_status || 'pending')
    );
    if (unclassified.length > 0) {
      return NextResponse.json({
        error: `${unclassified.length} bonnen nog niet geclassificeerd. Eerst afhandelen.`,
        unclassified_count: unclassified.length,
      }, { status: 400 });
    }

    const { data: facturen } = await supabase
      .from('facturen')
      .select('id, nummer, datum, client_naam, items, rgs_code, status')
      .eq('organization_id', orgId)
      .gte('datum', start)
      .lt('datum', nextMonth);

    // Aggregaties
    let totalPurchase = 0, totalSales = 0;
    let totalBtw9 = 0, totalBtw21 = 0;
    let totalSalesBtw9 = 0, totalSalesBtw21 = 0;

    const pdfBonnen: PdfBon[] = [];
    const csvLines: string[] = [];
    csvLines.push('type,datum,leverancier_of_klant,omschrijving,rgs_code,rgs_label,event,netto_eur,btw_9_eur,btw_21_eur,totaal_eur');

    for (const b of bonnen as any[]) {
      const cat = b.rgs_code ? RGS_BY_CODE[b.rgs_code] : null;
      const lev = Array.isArray(b.leverancier) ? b.leverancier[0] : b.leverancier;
      const ev = Array.isArray(b.event) ? b.event[0] : b.event;
      const netto = Number(b.netto_bedrag) || 0;
      const btw9 = Number(b.btw_laag_bedrag) || 0;
      const btw21 = Number(b.btw_hoog_bedrag) || 0;
      const totaal = Number(b.totaal_bedrag) || 0;
      totalPurchase += totaal;
      totalBtw9 += btw9;
      totalBtw21 += btw21;
      pdfBonnen.push({
        datum: b.datum, leverancier_naam: lev?.naam || '(onbekend)',
        rgs_code: b.rgs_code, rgs_label: cat?.label || b.rgs_category_label || null,
        event_naam: ev?.name || null,
        netto, btw_9: btw9, btw_21: btw21, totaal,
        notities: b.notities,
      });
      csvLines.push([
        'inkoop', csvEscape(b.datum || ''), csvEscape(lev?.naam || ''),
        csvEscape((cat?.label || b.rgs_category_label || '') + (b.notities ? ' — ' + b.notities : '')),
        csvEscape(b.rgs_code || ''), csvEscape(cat?.label || ''),
        csvEscape(ev?.name || ''),
        netto.toFixed(2), btw9.toFixed(2), btw21.toFixed(2), totaal.toFixed(2),
      ].join(','));
    }

    const pdfFacturen: PdfFactuur[] = [];
    for (const f of (facturen || []) as any[]) {
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
      const totaal = netto + btw9 + btw21;
      totalSales += totaal;
      totalSalesBtw9 += btw9;
      totalSalesBtw21 += btw21;
      pdfFacturen.push({
        datum: f.datum, nummer: f.nummer || String(f.id),
        client_naam: f.client_naam || '(onbekend)', rgs_code: f.rgs_code || 'WOpbCat',
        netto, btw_9: btw9, btw_21: btw21, totaal,
      });
      csvLines.push([
        'verkoop', csvEscape(f.datum || ''), csvEscape(f.client_naam || ''),
        csvEscape(`Factuur ${f.nummer}`), csvEscape(f.rgs_code || 'WOpbCat'),
        csvEscape(RGS_BY_CODE[f.rgs_code]?.label || 'Omzet catering — food'),
        '', netto.toFixed(2), btw9.toFixed(2), btw21.toFixed(2), totaal.toFixed(2),
      ].join(','));
    }

    const afTeDragen = (totalSalesBtw9 + totalSalesBtw21) - (totalBtw9 + totalBtw21);

    // Voorraad-snapshot
    const { data: voorraad } = await supabase
      .from('inventory')
      .select('current_stock, last_price_eur, purchase_price')
      .eq('organization_id', orgId);
    const voorraadwaarde = (voorraad || []).reduce(function (s: number, v: any) {
      const price = Number(v.last_price_eur) || Number(v.purchase_price) || 0;
      const stock = Number(v.current_stock) || 0;
      return s + price * stock;
    }, 0);

    const periodLabel = new Date(start + 'T00:00:00').toLocaleDateString('nl-NL', { year: 'numeric', month: 'long' });
    const periodEnd = new Date(new Date(nextMonth + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10);

    // Bouw PDF
    const { base64: pdfBase64, filename: pdfFilename } = generateBoekhouderPdf({
      org_name: orgRow?.name || '',
      org_btw_nr: btwNummer,
      boekhouder_naam: orgRow?.boekhouder_naam || undefined,
      period_label: periodLabel,
      period_start: start,
      period_end: periodEnd,
      generated_at: new Date().toISOString(),
      bonnen: pdfBonnen,
      facturen: pdfFacturen,
      totals: {
        inkoop_totaal: totalPurchase, verkoop_totaal: totalSales,
        btw_voorbelasting_9: totalBtw9, btw_voorbelasting_21: totalBtw21,
        btw_verschuldigd_9: totalSalesBtw9, btw_verschuldigd_21: totalSalesBtw21,
        btw_af_te_dragen: afTeDragen, voorraadwaarde_eur: voorraadwaarde,
      },
    });

    const csv = csvLines.join('\n');
    const csvBase64 = Buffer.from(csv, 'utf-8').toString('base64');

    // Email-body — strict-NL, geen marketing
    const orgName = orgRow?.name || 'BBQ Architect';
    const boekhouderNaam = orgRow?.boekhouder_naam || 'boekhouder';
    const customMessage = (body.message || '').trim();
    const html = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f5f0; padding:24px; color:#222;">
<table style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:32px; border-top:4px solid #c4a35a;">
<tr><td>
<h2 style="margin:0 0 16px; font-weight:600; font-size:18px;">Boekhouder-pakket ${periodLabel}</h2>
<p style="margin:0 0 14px; font-size:14px; line-height:1.6;">Beste ${boekhouderNaam},</p>
<p style="margin:0 0 14px; font-size:14px; line-height:1.6;">
Hierbij het boekhouder-pakket van <strong>${orgName}</strong> voor ${periodLabel}.
Bonnen zijn geclassificeerd op RGS-MKB-codes en BTW is gesplitst per categorie.
</p>
${customMessage ? `<p style="margin:0 0 14px; font-size:14px; line-height:1.6; padding:12px 14px; background:#f5f5f0; border-radius:8px;">${customMessage.replace(/</g, '&lt;')}</p>` : ''}
<p style="margin:0 0 14px; font-size:14px; line-height:1.6;"><strong>Samenvatting:</strong></p>
<table style="width:100%; font-size:13px; border-collapse:collapse;">
<tr><td style="padding:4px 0; color:#666;">Bonnen (inkoop)</td><td style="padding:4px 0; text-align:right;">${bonnen.length}</td></tr>
<tr><td style="padding:4px 0; color:#666;">Facturen (verkoop)</td><td style="padding:4px 0; text-align:right;">${pdfFacturen.length}</td></tr>
<tr><td style="padding:4px 0; color:#666;">Totaal inkoop</td><td style="padding:4px 0; text-align:right;">€ ${totalPurchase.toFixed(2)}</td></tr>
<tr><td style="padding:4px 0; color:#666;">Totaal verkoop</td><td style="padding:4px 0; text-align:right;">€ ${totalSales.toFixed(2)}</td></tr>
<tr><td style="padding:4px 0; color:#666;">Af te dragen BTW</td><td style="padding:4px 0; text-align:right; font-weight:600;">€ ${afTeDragen.toFixed(2)}</td></tr>
</table>
<p style="margin:18px 0 8px; font-size:13px; color:#666;">In de bijlagen:</p>
<ul style="margin:0 0 14px; padding-left:18px; font-size:13px; color:#444;">
<li><strong>${pdfFilename}</strong> — BTW-aangifte-concept + bonnen-overzicht</li>
<li><strong>boekhouding-${m}.csv</strong> — alle regels voor import in jouw pakket (Twinfield/Exact/SnelStart)</li>
</ul>
<p style="margin:18px 0 0; font-size:11px; color:#999; padding-top:14px; border-top:1px solid #eee;">
BTW-bedragen komen uit de bron-bon (niet AI-derived). RGS-classificering door AI met human-in-the-loop confirmation. Vragen? Mail terug naar deze afzender.
</p>
</td></tr></table>
<p style="text-align:center; font-size:11px; color:#aaa; margin:18px 0;">Gegenereerd met BBQ Architect</p>
</body></html>`;

    const text = `Boekhouder-pakket ${periodLabel}

Beste ${boekhouderNaam},

Hierbij het boekhouder-pakket van ${orgName} voor ${periodLabel}.

Samenvatting:
- Bonnen (inkoop): ${bonnen.length}
- Facturen (verkoop): ${pdfFacturen.length}
- Totaal inkoop: € ${totalPurchase.toFixed(2)}
- Totaal verkoop: € ${totalSales.toFixed(2)}
- Af te dragen BTW: € ${afTeDragen.toFixed(2)}

Bijlagen:
- ${pdfFilename} (BTW-aangifte + bonnen-overzicht)
- boekhouding-${m}.csv (voor import in Twinfield/Exact/SnelStart)

${customMessage ? '\n' + customMessage + '\n' : ''}

BTW-bedragen uit bron-bon. RGS-classificering door AI met confirmation.

Gegenereerd met BBQ Architect`;

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'BBQ Architect <onboarding@resend.dev>',
      to: [recipientEmail],
      cc: body.cc ? [String(body.cc).trim()] : undefined,
      replyTo: user.email || undefined,
      subject: `Boekhouder-pakket ${orgName} — ${periodLabel}`,
      html, text,
      attachments: [
        { filename: pdfFilename, content: pdfBase64 },
        { filename: `boekhouding-${m}.csv`, content: csvBase64 },
      ],
    });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error.message || 'Resend-fout' }, { status: 500 });
    }

    // Update boekhouder_pakketten met sent_at
    await supabase
      .from('boekhouder_pakketten')
      .update({
        sent_at: new Date().toISOString(),
        sent_to_email: recipientEmail,
        delivery_method: 'email',
        status: 'sent',
      })
      .eq('organization_id', orgId)
      .eq('period_type', 'maand')
      .eq('period_year', Number(yyyy))
      .eq('period_month', Number(mm));

    return NextResponse.json({
      ok: true,
      sent_to: recipientEmail,
      bonnen_count: bonnen.length,
      facturen_count: pdfFacturen.length,
      btw_af_te_dragen: afTeDragen,
    });
  } catch (err: any) {
    console.error('[boekhouder/pakket/email]', err);
    return NextResponse.json({ error: err?.message || 'Onbekende fout' }, { status: 500 });
  }
}
