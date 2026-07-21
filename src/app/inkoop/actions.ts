'use server';
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /inkoop Server Actions
 * ──────────────────────
 * - updateOverride: gebruiker schoof een qty / koos andere leverancier / removed
 * - sendOrderToSupplier: snapshot items → PDF → Storage → email → status='sent'
 *
 * Conventies (zelfde als andere actions.ts in dit project):
 *   - Re-auth in elke action body.
 *   - Tenant uit session, nooit uit client-input.
 *   - Returnt { ok: boolean, ... } shape voor client-side toast.
 *   - Geen 'next-safe-action' lib — handgeschreven wrapper conform pattern.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Resend } from 'resend';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import React, { type ReactElement } from 'react';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { setOverride as setOverrideDAL } from '@/lib/dal/orderOverrides';
import {
    getConceptOrderById,
    markOrderSent,
    markOrderReceived,
    type OrderItemSnapshot,
} from '@/lib/dal/inkoopOrders';
import { buildBestelvoorstel } from '@/lib/dal/bestelvoorstel';
import { InkoopOrderPdf, determineBtwPct } from '@/lib/pdf/InkoopOrderPdf';

// ── Auth helper ───────────────────────────────────────────────────────
async function getAuthContext() {
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Niet ingelogd');
    const { data: member } = await sb
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();
    if (!member) throw new Error('Geen actieve organisatie');
    return { sb, user, orgId: member.organization_id as string, role: member.role as string };
}

// ── updateOverride ────────────────────────────────────────────────────
const overrideSchema = z.object({
    concept_order_id: z.string().uuid(),
    inventory_id: z.number().int().positive(),
    override_qty: z.number().nonnegative().nullable().optional(),
    override_leverancier_id: z.number().int().positive().nullable().optional(),
    removed: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
});

export async function updateOverrideAction(input: unknown) {
    try {
        const parsed = overrideSchema.parse(input);
        const { sb, orgId } = await getAuthContext();

        // Authz: concept_order moet bij deze org horen.
        const order = await getConceptOrderById(sb, parsed.concept_order_id);
        if (!order || order.organization_id !== orgId) {
            throw new Error('Geen toegang tot deze order');
        }
        if (order.status !== 'concept') {
            throw new Error('Deze order is al verzonden — wijzigen niet meer mogelijk');
        }

        await setOverrideDAL(sb, orgId, parsed.concept_order_id, parsed.inventory_id, {
            override_qty: parsed.override_qty,
            override_leverancier_id: parsed.override_leverancier_id,
            removed: parsed.removed,
            note: parsed.note,
        });

        revalidatePath('/inkoop');
        return { ok: true as const };
    } catch (e) {
        console.error('[inkoop/updateOverride]', e);
        return { ok: false as const, error: e instanceof Error ? e.message : 'Override mislukt' };
    }
}

// ── assignSupplierToUnmatched ─────────────────────────────────────────
// Klassieker uit MissingSupplierBanner: gebruiker kiest een leverancier voor
// een ingredient dat niet in inventory zit (of leverancier_id is null).
// We koppelen 'm aan inventory.leverancier_id, niet aan een specifieke order.
const assignSchema = z.object({
    inventory_id: z.number().int().positive(),
    leverancier_id: z.number().int().positive(),
});

export async function assignSupplierAction(input: unknown) {
    try {
        const { inventory_id, leverancier_id } = assignSchema.parse(input);
        const { sb } = await getAuthContext();
        const { error } = await sb
            .from('inventory')
            .update({ leverancier_id })
            .eq('id', inventory_id);
        if (error) throw new Error(error.message);
        revalidatePath('/inkoop');
        return { ok: true as const };
    } catch (e) {
        console.error('[inkoop/assignSupplier]', e);
        return { ok: false as const, error: e instanceof Error ? e.message : 'Toewijzen mislukt' };
    }
}

// ── sendOrderToSupplier ───────────────────────────────────────────────
const sendSchema = z.object({
    concept_order_id: z.string().uuid(),
    note: z.string().max(2000).optional(),
});

export async function sendOrderToSupplierAction(input: unknown) {
    try {
        const parsed = sendSchema.parse(input);
        const { sb, user, orgId } = await getAuthContext();

        // 1. Order ophalen + authz.
        const order = await getConceptOrderById(sb, parsed.concept_order_id);
        if (!order || order.organization_id !== orgId) throw new Error('Geen toegang tot deze order');
        if (order.status !== 'concept') throw new Error('Deze order is al verzonden');

        // 2. Recompute de bestelvoorstel-snapshot zodat we de meest actuele
        //    qty's verzenden (overrides toegepast). We filteren op deze ene
        //    leverancier-bucket.
        const summary = await buildBestelvoorstel(sb, orgId, 14, { persistConcepts: false });
        const bucket = summary.per_leverancier.find(function (b) {
            return b.leverancier_id === order.leverancier_id
                || (b.leverancier_id == null && order.leverancier_id == null);
        });
        if (!bucket || bucket.items.length === 0) {
            throw new Error('Geen items om te versturen — heroplaad de pagina');
        }

        // 3. Leverancier-meta voor email-veld + adres.
        let leverancierMeta: { id: number; naam: string; email: string | null; adres: string | null } | null = null;
        if (order.leverancier_id != null) {
            // NB: leveranciers heeft geen adres-kolom — bewust niet selecteren.
            const { data: lev } = await sb
                .from('leveranciers')
                .select('id, naam, email')
                .eq('id', order.leverancier_id)
                .single();
            if (lev) leverancierMeta = { ...(lev as any), adres: null };
        }
        if (!leverancierMeta || !leverancierMeta.email) {
            throw new Error('Deze leverancier heeft geen e-mailadres — vul eerst contactgegevens aan onder Leveranciers');
        }

        // 4. Afzender-meta. Bedrijfsgegevens + branding staan in de `settings`
        //    tabel (zelfde bron als de offerte-PDF en /q-portal), scoped op
        //    organization_id — NIET op organizations (heeft geen settings-kolom).
        const { data: orgRow } = await sb
            .from('organizations')
            .select('name')
            .eq('id', orgId)
            .single();
        const { data: bedrijf } = await sb
            .from('settings')
            .select('bedrijfsnaam, adres, btw, btw_nummer, kvk, logo_url, brand_primary')
            .eq('organization_id', orgId)
            .maybeSingle();
        const afzender = {
            bedrijfsnaam: bedrijf?.bedrijfsnaam || orgRow?.name || 'BBQ Catering',
            adres: bedrijf?.adres || null,
            btw_nummer: bedrijf?.btw_nummer || bedrijf?.btw || null,
            kvk_nummer: bedrijf?.kvk || null,
            logo_url: bedrijf?.logo_url || null,
            brand_color: bedrijf?.brand_primary || '#c4a35a',
        };

        // 5. Items → snapshot met BTW-split.
        let subtotaal = 0;
        let btwLaag = 0;
        let btwHoog = 0;
        const itemsSnapshot: OrderItemSnapshot[] = bucket.items.map(function (it): OrderItemSnapshot {
            const pct = determineBtwPct(it.categorie);
            const line = Math.round(it.est_total_eur * 100) / 100;
            subtotaal += line;
            if (pct === 9) btwLaag += line * 0.09;
            else btwHoog += line * 0.21;
            return {
                inventory_id: it.inventory_id,
                naam: it.naam,
                qty: it.qty,
                unit: it.unit,
                unit_price_eur: it.unit_price_eur,
                line_total_eur: line,
                btw_pct: pct,
                categorie: it.categorie ?? null,
                events: it.events,
            };
        });
        subtotaal = Math.round(subtotaal * 100) / 100;
        btwLaag = Math.round(btwLaag * 100) / 100;
        btwHoog = Math.round(btwHoog * 100) / 100;
        const totaal = Math.round((subtotaal + btwLaag + btwHoog) * 100) / 100;

        // 6. PDF renderen.
        const ordernummer = `${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
        const datum = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

        // InkoopOrderPdf returnt een <Document>; cast naar DocumentProps zodat
        // @react-pdf/renderer.renderToBuffer signatuur matched (zelfde pattern
        // als /api/menukaart/pdf in dit project).
        const pdfElement = React.createElement(InkoopOrderPdf, {
            ordernummer,
            datum,
            leverancier: {
                naam: leverancierMeta.naam,
                email: leverancierMeta.email,
                adres: leverancierMeta.adres,
            },
            afzender,
            items: itemsSnapshot,
            subtotaal_eur: subtotaal,
            btw_laag_eur: btwLaag,
            btw_hoog_eur: btwHoog,
            totaal_eur: totaal,
            notitie: parsed.note ?? null,
        }) as unknown as ReactElement<DocumentProps>;
        const pdfBuffer = await renderToBuffer(pdfElement);

        // 7. Upload naar Storage. Folder-conventie matcht RLS-policy.
        const storagePath = `${orgId}/${order.id}.pdf`;
        const svc = createServiceSupabase();
        const { error: upErr } = await svc.storage
            .from('inkoop-orders')
            .upload(storagePath, pdfBuffer, {
                contentType: 'application/pdf',
                upsert: true,
            });
        if (upErr) throw new Error('PDF uploaden mislukt: ' + upErr.message);

        // Signed-URL (24u) zodat de UI 'm meteen kan tonen.
        const { data: signed } = await svc.storage
            .from('inkoop-orders')
            .createSignedUrl(storagePath, 60 * 60 * 24);
        const pdfUrl = signed?.signedUrl || storagePath;

        // 8. Mail versturen via Resend (server-side, niet via fetch).
        const apiKey = process.env.RESEND_API_KEY;
        let emailDelivered = false;
        let emailError: string | null = null;
        if (apiKey) {
            try {
                const resend = new Resend(apiKey);
                await resend.emails.send({
                    from: process.env.RESEND_FROM_EMAIL || `${afzender.bedrijfsnaam} <onboarding@resend.dev>`,
                    to: [leverancierMeta.email],
                    subject: `Bestelling ${ordernummer} — ${afzender.bedrijfsnaam}`,
                    html: buildEmailHtml({
                        leverancierNaam: leverancierMeta.naam,
                        ordernummer,
                        totaal,
                        notitie: parsed.note ?? null,
                        bedrijfsnaam: afzender.bedrijfsnaam,
                        brandColor: afzender.brand_color || '#c4a35a',
                    }),
                    attachments: [
                        {
                            filename: `bestelling-${ordernummer}.pdf`,
                            content: pdfBuffer,
                        },
                    ],
                });
                emailDelivered = true;
            } catch (e: any) {
                emailError = e?.message || 'onbekende fout';
                console.error('[inkoop/send] resend error', e);
            }
        } else {
            emailError = 'RESEND_API_KEY niet geconfigureerd';
        }

        // 9. Order op sent zetten + audit-log entry.
        await markOrderSent(sb, order.id, {
            items: itemsSnapshot,
            subtotal_eur: subtotaal,
            btw_laag_eur: btwLaag,
            btw_hoog_eur: btwHoog,
            total_eur: totaal,
            sent_to_email: leverancierMeta.email,
            pdf_url: pdfUrl,
            send_note: parsed.note,
        });

        // Durable orderregels — bron voor in-flight-verrekening + ontvangst-loop.
        // Best-effort: faalt dit, dan is de order nog steeds verzonden (snapshot in
        // concept_inkoop_orders.items blijft de fallback).
        try {
            await sb.from('inkoop_order_lines').delete()
                .eq('concept_order_id', order.id)
                .eq('organization_id', orgId);
            const orderLines = bucket.items.map(function (it) {
                return {
                    organization_id: orgId,
                    concept_order_id: order.id,
                    inventory_id: it.inventory_id,
                    supplier_product_id: it.supplier_product_id ?? null,
                    naam: it.naam,
                    qty_needed: it.qty_needed,
                    qty_ordered: it.qty_ordered,
                    qty_received: null,
                    unit: it.unit,
                    unit_price_eur: it.unit_price_eur,
                    btw_pct: determineBtwPct(it.categorie),
                    categorie: it.categorie ?? null,
                };
            });
            if (orderLines.length > 0) {
                const { error: lineErr } = await sb.from('inkoop_order_lines').insert(orderLines);
                if (lineErr) console.warn('[inkoop/send] inkoop_order_lines insert failed (non-fatal):', lineErr.message);
            }
        } catch (lineErr) {
            console.warn('[inkoop/send] inkoop_order_lines write failed (non-fatal):', lineErr);
        }

        // Audit log — best-effort, niet de hele action laten falen als ie stuk gaat.
        try {
            // record_id voor audit_log is bigint, dus we hashen de uuid naar een
            // numerieke representatie via timestamp + suffix. Voor audit-trail
            // is dat genoeg om te koppelen via metadata.order_id (echte uuid).
            const fakeRecordId = Number(BigInt('0x' + order.id.replace(/-/g, '').slice(0, 12)));
            await sb.from('audit_log').insert({
                organization_id: orgId,
                record_table: 'concept_inkoop_orders',
                record_id: fakeRecordId,
                action: 'update',
                user_id: user.id,
                changes: {
                    status: { before: 'concept', after: 'sent' },
                    items_count: { before: 0, after: itemsSnapshot.length },
                    total_eur: { before: 0, after: totaal },
                },
                metadata: {
                    bron: 'sendOrderToSupplier',
                    order_id: order.id,
                    ordernummer,
                    leverancier_id: order.leverancier_id,
                    sent_to_email: leverancierMeta.email,
                    email_delivered: emailDelivered,
                    email_error: emailError,
                },
            });
        } catch (auditErr) {
            console.warn('[inkoop/send] audit_log insert failed (non-fatal):', auditErr);
        }

        revalidatePath('/inkoop');
        return {
            ok: true as const,
            ordernummer,
            pdf_url: pdfUrl,
            email_delivered: emailDelivered,
            email_error: emailError,
        };
    } catch (e) {
        console.error('[inkoop/sendOrderToSupplier]', e);
        return { ok: false as const, error: e instanceof Error ? e.message : 'Versturen mislukt' };
    }
}

// ── receiveOrderAction ────────────────────────────────────────────────
// Ontvangst boeken: per regel het werkelijk geleverde aantal → voorraad omhoog
// via de atomaire RPC (stock_movements type='receive'); de order gaat op
// 'received' zodra alle regels vol binnen zijn. Sluit de ontvangst-loop.
const receiveSchema = z.object({
    concept_order_id: z.string().uuid(),
    lines: z.array(z.object({
        line_id: z.string().uuid(),
        qty_received: z.number().nonnegative(),
        unit_price_eur: z.number().nonnegative().nullable().optional(),
        reason: z.string().max(300).nullable().optional(),
    })).min(1),
});

export async function receiveOrderAction(input: unknown) {
    try {
        const parsed = receiveSchema.parse(input);
        const { sb, orgId } = await getAuthContext();

        const order = await getConceptOrderById(sb, parsed.concept_order_id);
        if (!order || order.organization_id !== orgId) throw new Error('Geen toegang tot deze order');
        if (order.status !== 'sent') throw new Error('Alleen verzonden orders kunnen ontvangen worden');

        await markOrderReceived(sb, orgId, order.id, parsed.lines.map(function (l) {
            return {
                line_id: l.line_id,
                qty_received: l.qty_received,
                unit_price_eur: l.unit_price_eur ?? null,
                reason: l.reason ?? null,
            };
        }));

        revalidatePath('/inkoop');
        revalidatePath('/voorraad');
        return { ok: true as const };
    } catch (e) {
        console.error('[inkoop/receiveOrder]', e);
        return { ok: false as const, error: e instanceof Error ? e.message : 'Ontvangen mislukt' };
    }
}

function buildEmailHtml(p: {
    leverancierNaam: string;
    ordernummer: string;
    totaal: number;
    notitie: string | null;
    bedrijfsnaam: string;
    brandColor: string;
}): string {
    const escH = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
<div style="border-bottom:3px solid ${p.brandColor};padding-bottom:14px;margin-bottom:20px;">
  <h2 style="margin:0;font-weight:600;">${escH(p.bedrijfsnaam)}</h2>
  <p style="margin:4px 0 0;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Bestelling ${escH(p.ordernummer)}</p>
</div>
<p>Beste ${escH(p.leverancierNaam)},</p>
<p>In de bijlage vindt u de bestelling voor de komende events. Totaalbedrag incl. BTW: <strong>€ ${p.totaal.toFixed(2).replace('.', ',')}</strong>.</p>
${p.notitie ? `<div style="background:#fafafa;border-left:3px solid ${p.brandColor};padding:12px 16px;margin:18px 0;font-size:13px;color:#333;">${escH(p.notitie)}</div>` : ''}
<p>Mocht een item niet leverbaar zijn, neem dan even contact op zodat we kunnen aanpassen.</p>
<p style="color:#888;font-size:13px;">Met vriendelijke groet,<br><strong>${escH(p.bedrijfsnaam)}</strong></p>
<p style="margin-top:32px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#aaa;">Verzonden via BBQ Architect.</p>
</body></html>`;
}
