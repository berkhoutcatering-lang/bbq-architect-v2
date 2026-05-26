'use server';

/**
 * Server Actions voor het Bonnenkistje (P0.10, P0.12, P0.13).
 *
 * Conventies:
 *   - Re-auth in elke action body (middleware-only = CVE-magneet).
 *   - Tenant uit session, nooit uit client-input.
 *   - revalidatePath() per gewijzigde route.
 *   - Returnt { ok: true | false, error?: string } voor client-side toast.
 *   - Geen 'next-safe-action' lib gebruikt — match bestaand pattern in
 *     andere actions.ts files in dit project (lichte handgeschreven wrapper).
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import {
    lockBon as lockBonDAL,
    unlockBon as unlockBonDAL,
    logBonAction,
} from '@/lib/dal/bonnen';
import {
    createShareToken,
    revokeShareToken as revokeShareTokenDAL,
} from '@/lib/archief/shareTokens';
import type { SearchInput } from '@/lib/dal/bonnen';

// ── Helper: auth + orgId ──────────────────────────────────────────────

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

// ── Lock / Unlock ──────────────────────────────────────────────────────

const lockBonSchema = z.object({ bonId: z.number().int().positive() });

export async function lockBonAction(input: unknown) {
    try {
        const { bonId } = lockBonSchema.parse(input);
        const { sb } = await getAuthContext();
        await lockBonDAL(sb, bonId);
        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon bon niet vergrendelen' };
    }
}

export async function unlockBonAction(input: unknown) {
    try {
        const { bonId } = lockBonSchema.parse(input);
        const { sb } = await getAuthContext();
        await unlockBonDAL(sb, bonId);  // RPC checkt Admin-role
        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon bon niet ontgrendelen' };
    }
}

// ── Status + Tags update ──────────────────────────────────────────────

const statusSchema = z.object({
    bonId: z.number().int().positive(),
    status: z.enum(['pending', 'bevestigd', 'twijfel', 'vergrendeld']),
});

export async function updateBonStatusAction(input: unknown) {
    try {
        const { bonId, status } = statusSchema.parse(input);
        const { sb } = await getAuthContext();
        const { error } = await sb
            .from('bonnen')
            .update({ status })
            .eq('id', bonId);
        if (error) throw new Error(error.message);
        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon status niet wijzigen' };
    }
}

const tagsSchema = z.object({
    bonId: z.number().int().positive(),
    tags: z.array(z.string().min(1).max(50)).max(20),
});

export async function updateBonTagsAction(input: unknown) {
    try {
        const { bonId, tags } = tagsSchema.parse(input);
        const { sb } = await getAuthContext();
        const { error } = await sb
            .from('bonnen')
            .update({ tags })
            .eq('id', bonId);
        if (error) throw new Error(error.message);
        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon tags niet opslaan' };
    }
}

// ── Inbox → Archief (Pillar #5) ───────────────────────────────────────

const moveInboxSchema = z.object({ inboxId: z.number().int().positive() });

export async function moveInboxToArchiveAction(input: unknown) {
    try {
        const { inboxId } = moveInboxSchema.parse(input);
        const { sb, user, orgId } = await getAuthContext();

        // 1. Lees inbox-row (RLS check)
        const { data: inbox, error: inboxErr } = await sb
            .from('org_email_inbox')
            .select('id, from_email, subject, received_at, category, raw_path, attachments, organization_id, bon_id')
            .eq('id', inboxId)
            .eq('organization_id', orgId)
            .single();

        if (inboxErr || !inbox) {
            return { ok: false as const, error: 'Mail niet gevonden' };
        }
        if (inbox.bon_id) {
            return { ok: false as const, error: 'Deze mail is al verwerkt' };
        }

        // 2. Maak een lege bon-shell met source='email' en winkel uit afzender-domein.
        //    De factuur-attachment wordt later in een vervolg-action volledig
        //    verwerkt (OCR + categorisatie via bestaande bon-process pipeline).
        //    Voor v1: maak de bon, link inbox.bon_id, gebruiker vult details aan.
        const fromDomain = String(inbox.from_email).split('@')[1] ?? 'onbekend';
        const winkel = fromDomain.split('.')[0];

        const { data: newBon, error: bonErr } = await sb
            .from('bonnen')
            .insert({
                organization_id: orgId,
                winkel,
                datum: (inbox.received_at as string).slice(0, 10),
                status: 'pending',
                source: 'email',
                notities: `Uit email: ${inbox.subject}`,
            })
            .select('id')
            .single();

        if (bonErr || !newBon) {
            return { ok: false as const, error: bonErr?.message ?? 'Kon bon niet aanmaken' };
        }

        // 3. Link inbox → bon (zodat 'ie niet nog een keer verwerkt wordt).
        await sb
            .from('org_email_inbox')
            .update({ bon_id: newBon.id })
            .eq('id', inboxId);

        // 4. Audit-log entry
        await logBonAction(
            sb,
            newBon.id as number,
            'ai_scan',
            `Aangemaakt vanuit inbox-mail van ${inbox.from_email}`,
            { inbox_id: inboxId, user_id: user.id },
        );

        revalidatePath('/archief');
        return { ok: true as const, bonId: newBon.id as number };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon mail niet verwerken' };
    }
}

// ── Share-link (Pillar #4 / P0.12) ────────────────────────────────────

const createShareSchema = z.object({
    filterJson: z.record(z.string(), z.unknown()).default({}),
    ttlDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
    recipientName: z.string().min(1).max(100).optional(),
    recipientEmail: z.string().email().optional(),
    label: z.string().max(200).optional(),
});

export async function createShareTokenAction(input: unknown) {
    try {
        const parsed = createShareSchema.parse(input);
        const { sb, user, orgId } = await getAuthContext();

        const share = await createShareToken(sb, {
            orgId,
            createdBy: user.id,
            filterJson: parsed.filterJson as SearchInput,
            ttlDays: parsed.ttlDays,
            recipientName: parsed.recipientName,
            recipientEmail: parsed.recipientEmail,
            label: parsed.label,
        });

        // Audit-log
        await logBonAction(
            sb,
            0,  // share is org-niveau, niet gebonden aan een specifieke bon
            'share_created',
            `Deellink aangemaakt voor ${parsed.recipientName ?? parsed.recipientEmail ?? 'onbekend'}`,
            {
                share_token_id: share.id,
                ttl_days: parsed.ttlDays,
                user_id: user.id,
            },
        ).catch(() => { /* schenk een share-audit op bonId=0 mag falen */ });

        const url = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/share/${share.token}`
            : `/share/${share.token}`;

        return {
            ok: true as const,
            token: share.token,
            url,
            expiresAt: share.expires_at,
        };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon deellink niet maken' };
    }
}

const revokeSchema = z.object({ tokenId: z.number().int().positive() });

export async function revokeShareTokenAction(input: unknown) {
    try {
        const { tokenId } = revokeSchema.parse(input);
        const { sb } = await getAuthContext();
        await revokeShareTokenDAL(sb, tokenId);
        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon deellink niet intrekken' };
    }
}

// ── getSignedUrl (voor BonPreview client) ─────────────────────────────

const signedUrlSchema = z.object({ bonId: z.number().int().positive() });

export async function getSignedUrlAction(input: unknown) {
    try {
        const { bonId } = signedUrlSchema.parse(input);
        const { sb } = await getAuthContext();
        const { getBonSignedUrl } = await import('@/lib/dal/bonnen');
        const result = await getBonSignedUrl(sb, bonId, 3600);
        if (!result) return { ok: false as const, error: 'Bestand niet gevonden' };
        return { ok: true as const, url: result.url, mime: result.mime };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon URL niet ophalen' };
    }
}
