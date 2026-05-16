/**
 * POST /api/email/inbound
 *
 * Ontvangt mail-payloads van de Cloudflare Email Worker, valideert HMAC,
 * resolveert organisatie via subaddressing (`pl-{slug}@in.bbqarchitect.app`),
 * dedupt op message-id, stagest attachments naar Supabase Storage en triggert
 * de universal-parser-pijplijn in de achtergrond via `after()`.
 *
 * Pillar #1 — Forward-and-Forget: deze route is publiek (signed) zodat de
 * leverancier-mail letterlijk de enige actie is die Sam doet.
 *
 * Security:
 *  - HMAC-verificatie verplicht; geen secret = alle requests afgewezen
 *  - Idempotency via UNIQUE (organization_id, raw_message_id)
 *  - Service-role client wordt alleen hier gebruikt; geen client-input vertrouwd
 *  - SPF/DKIM-resultaat wordt gelogd; `failed` als spoofing-verdacht
 */

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import {
    verifyInboundSignature,
    resolveOrgFromAddress,
    stageAttachment,
    markInboxFailed,
    classifyInboundEmail,
    type InboundEmailPayload,
} from '@/lib/emailInbound';
import { createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
    const t0 = Date.now();

    /* ─── 1. HMAC-verify (op rauwe body) ─── */
    const rawBody = await req.text();
    const sig = req.headers.get('x-cf-signature');
    if (!verifyInboundSignature(rawBody, sig)) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    /* ─── 2. Parse payload ─── */
    let payload: InboundEmailPayload;
    try {
        payload = JSON.parse(rawBody) as InboundEmailPayload;
    } catch {
        return NextResponse.json({ error: 'invalid json' }, { status: 400 });
    }

    if (!payload?.to || !payload?.from || !payload?.messageId) {
        return NextResponse.json({ error: 'to, from, messageId verplicht' }, { status: 400 });
    }

    if (!Array.isArray(payload.attachments)) {
        payload.attachments = [];
    }
    if (payload.attachments.length > MAX_ATTACHMENTS) {
        return NextResponse.json({ error: `max ${MAX_ATTACHMENTS} attachments` }, { status: 413 });
    }
    for (const att of payload.attachments) {
        const size = att.sizeBytes ?? Buffer.from(att.base64 || '', 'base64').length;
        if (size > MAX_ATTACHMENT_BYTES) {
            return NextResponse.json({ error: `attachment ${att.filename} > 20MB` }, { status: 413 });
        }
    }

    /* ─── 3. Resolve org via subaddressing ─── */
    const orgId = await resolveOrgFromAddress(payload.to);
    if (!orgId) {
        return NextResponse.json({ error: 'unknown inbox' }, { status: 404 });
    }

    const sb = createServiceSupabase();

    /* ─── 4. Idempotency: UNIQUE (org_id, message_id) ─── */
    const { data: existing } = await sb
        .from('org_email_inbox')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('raw_message_id', payload.messageId)
        .maybeSingle();

    if (existing) {
        return NextResponse.json({ ok: true, deduped: true, inboxId: existing.id });
    }

    /* ─── 5. Insert inbox-row ─── */
    const { data: inbox, error: insertErr } = await sb
        .from('org_email_inbox')
        .insert({
            organization_id: orgId,
            inbound_address: payload.to,
            from_email: payload.from,
            from_name: payload.fromName ?? null,
            subject: payload.subject ?? null,
            raw_message_id: payload.messageId,
            body_excerpt: payload.bodyExcerpt ? payload.bodyExcerpt.slice(0, 500) : null,
            attachment_count: payload.attachments.length,
            spf_pass: payload.spfPass ?? null,
            dkim_pass: payload.dkimPass ?? null,
            status: payload.attachments.length === 0 ? 'parsed' : 'received',
        })
        .select('id')
        .single();

    if (insertErr || !inbox) {
        console.error('[email-inbound] insert faal:', insertErr?.message);
        return NextResponse.json({ error: 'db insert failed' }, { status: 500 });
    }

    /* ─── 6. Stage attachments + classify + trigger parser (non-blocking) ─── */
    after(async () => {
        // 6a. AI-classify in parallel met staging — categorie verschijnt in
        // mailbox-UI ook voor mails zonder attachments. Failure → 'onbekend'.
        const classifyPromise = classifyInboundEmail({
            inboxId: inbox.id,
            organizationId: orgId,
            subject: payload.subject ?? null,
            fromEmail: payload.from,
            bodyExcerpt: payload.bodyExcerpt ?? null,
            attachmentNames: payload.attachments.map(function (a) { return a.filename; }),
        });

        const stagedIds: string[] = [];
        try {
            for (const att of payload.attachments) {
                const staged = await stageAttachment({
                    organizationId: orgId,
                    inboxId: inbox.id,
                    filename: att.filename,
                    mimeType: att.mimeType,
                    base64: att.base64,
                    sizeBytes: att.sizeBytes,
                });
                if (staged) stagedIds.push(staged.id);
            }

            if (stagedIds.length === 0 && payload.attachments.length > 0) {
                await markInboxFailed(inbox.id, 'Geen attachments konden worden opgeslagen');
                return;
            }

            await sb
                .from('org_email_inbox')
                .update({ status: 'parsing' })
                .eq('id', inbox.id);

            /* Trigger universal parser via interne fetch (zelf-host).
               In productie: zelfde origin. */
            const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
            if (!appUrl) {
                console.warn('[email-inbound] APP_URL niet gezet — parser niet getriggerd');
                return;
            }
            await fetch(`${appUrl}/api/parse-attachment`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-internal-token': process.env.INTERNAL_PARSE_TOKEN || '',
                },
                body: JSON.stringify({ inboxId: inbox.id, organizationId: orgId }),
            }).catch((e) => {
                console.error('[email-inbound] parser-trigger faal:', e?.message);
            });
        } catch (e) {
            console.error('[email-inbound] after() crashed:', (e as Error).message);
            await markInboxFailed(inbox.id, (e as Error).message);
        }

        // Wacht op classify zodat de log-line de category bevat (eventuele
        // failures zijn al binnen classifyInboundEmail afgehandeld).
        await classifyPromise.catch(function () { /* swallowed */ });
    });

    return NextResponse.json({
        ok: true,
        inboxId: inbox.id,
        attachmentCount: payload.attachments.length,
        elapsedMs: Date.now() - t0,
    });
}
