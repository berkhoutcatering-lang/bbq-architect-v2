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

// ── Leverancier zetten op een al bewaarde bon ─────────────────────────
//
// De scan-pagina bewaart een bon meteen na het uitlezen (anders ben je 'm
// kwijt zodra je wegklikt). De leverancier-keuze komt daarna pas. Deze action
// werkt die keuze bij op de rij die er al staat, zonder de file opnieuw te
// uploaden.
//
// Mens-blijft-de-baas: een NIEUWE leverancier wordt alleen aangemaakt als de
// UI expliciet `nieuweNaam` meestuurt — nooit op eigen initiatief van de AI.

const bonLeverancierSchema = z.object({
    bonId: z.number().int().positive(),
    leverancierId: z.number().int().positive().nullable().optional(),
    nieuweNaam: z.string().min(2).max(120).optional(),
});

export async function setBonLeverancierAction(input: unknown) {
    try {
        const { bonId, leverancierId, nieuweNaam } = bonLeverancierSchema.parse(input);
        const { sb, orgId } = await getAuthContext();

        let finalId: number | null = leverancierId ?? null;

        if (nieuweNaam) {
            const naam = nieuweNaam.trim();
            /* Dedup binnen de org — voorkomt dubbele leveranciers bij tikfouten. */
            const { data: bestaand } = await sb
                .from('leveranciers')
                .select('id')
                .eq('organization_id', orgId)
                .ilike('naam', naam)
                .limit(1)
                .maybeSingle();

            if (bestaand) {
                finalId = bestaand.id;
            } else {
                const { data: nieuw, error: levErr } = await sb
                    .from('leveranciers')
                    .insert({ organization_id: orgId, naam, type: 'inkoop' })
                    .select('id')
                    .single();
                if (levErr || !nieuw) throw new Error(levErr?.message ?? 'Kon leverancier niet aanmaken');
                finalId = nieuw.id;
            }
        } else if (finalId !== null) {
            /* Bestaat de gekozen leverancier wel, en binnen deze org? */
            const { data: lev } = await sb
                .from('leveranciers')
                .select('id')
                .eq('organization_id', orgId)
                .eq('id', finalId)
                .maybeSingle();
            if (!lev) throw new Error('Leverancier niet gevonden');
        }

        const { error } = await sb
            .from('bonnen')
            .update({ leverancier_id: finalId })
            .eq('organization_id', orgId)
            .eq('id', bonId);
        if (error) throw new Error(error.message);

        revalidatePath('/archief');
        return { ok: true as const, leverancierId: finalId };
    } catch (e) {
        return {
            ok: false as const,
            error: e instanceof Error ? e.message : 'Kon leverancier niet koppelen',
        };
    }
}

// ── Voorbelasting bevestigen (veiligheidsfase F6) ─────────────────────
//
// BTW van een bon telt pas mee in rubriek 5b als iemand heeft vastgesteld dat
// (a) de uitgave zakelijk is en (b) de bon een geldige factuur is. Zonder deze
// stap vroeg de aangifte structureel te veel terug.
//
// De DB-trigger zet zelf wie/wanneer — die velden komen bewust NIET uit de
// client, anders is de bevestiging niet te vertrouwen.

const voorbelastingSchema = z.object({
    bonId: z.number().int().positive(),
    bevestigd: z.boolean(),
    /* Zakelijk gebruik; bij gemengd gebruik is maar een deel aftrekbaar. */
    zakelijkPct: z.number().int().min(0).max(100).default(100),
});

export async function confirmVoorbelastingAction(input: unknown) {
    try {
        const { bonId, bevestigd, zakelijkPct } = voorbelastingSchema.parse(input);
        const { sb } = await getAuthContext();

        /* Een vergrendelde bon hoort bij een afgesloten periode; die mag de
           aftrek niet meer wijzigen, anders verandert een reeds ingediende
           aangifte met terugwerkende kracht. */
        const { data: bon, error: readErr } = await sb
            .from('bonnen')
            .select('locked_at')
            .eq('id', bonId)
            .single();
        if (readErr) throw new Error(readErr.message);
        if (bon?.locked_at) {
            throw new Error('Bon zit in een afgesloten periode en kan niet meer gewijzigd worden');
        }

        const { error } = await sb
            .from('bonnen')
            .update({
                voorbelasting_bevestigd: bevestigd,
                zakelijk_pct: bevestigd ? zakelijkPct : 100,
            })
            .eq('id', bonId);
        if (error) throw new Error(error.message);

        await logBonAction(sb, bonId, bevestigd ? 'voorbelasting_bevestigd' : 'voorbelasting_ingetrokken');

        revalidatePath('/archief');
        revalidatePath('/financien');
        return { ok: true as const };
    } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : 'Kon voorbelasting niet bijwerken' };
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

// ── PDF verwijderen / Bon verwijderen ─────────────────────────────────

const bonIdSchema = z.object({ bonId: z.number().int().positive() });

/**
 * removeBonFileAction — gooit het bestand achter een bon weg (Storage + DB).
 *
 * Use case: Sam wil opnieuw scannen ("nieuwe AI-functies sinds vorige scan")
 * zonder dat hij de bon-record met al z'n metadata kwijt is. De bon blijft
 * staan, file_path/file_mime/image_hash worden NULL, status reset naar
 * 'pending' zodat 'ie weer in het inkomende-werk-vakje valt.
 *
 * Wat behouden blijft:
 *   - audit_log entries
 *   - voorraadkoppelingen (stock_movements.bon_id)
 *   - share tokens
 *   - bon_items / raw_analysis (zodat extracted_text doorzoekbaar blijft
 *     tot er nieuwe scan-resultaten komen)
 *
 * Storage cleanup gebruikt service-role client (RLS strikt op bonnen-bucket).
 */
export async function removeBonFileAction(input: unknown) {
    try {
        const { bonId } = bonIdSchema.parse(input);
        const { sb, user, orgId } = await getAuthContext();

        // 1. Lees bon (RLS valideert ownership + locked-check)
        const { data: bon, error: readErr } = await sb
            .from('bonnen')
            .select('id, file_path, locked_at, organization_id')
            .eq('id', bonId)
            .eq('organization_id', orgId)
            .single();

        if (readErr || !bon) {
            return { ok: false as const, error: 'Bon niet gevonden' };
        }
        if (bon.locked_at) {
            return {
                ok: false as const,
                error:
                    'Deze bon is vergrendeld voor de aangifte. Eerst ontgrendelen voor je het bestand kunt verwijderen.',
            };
        }
        if (!bon.file_path) {
            return { ok: false as const, error: 'Aan deze bon hangt geen bestand.' };
        }

        // 2. Verwijder uit Storage (service-role, RLS-bypass nodig voor delete)
        const { createServiceSupabase } = await import('@/lib/supabase-server');
        const serviceSb = createServiceSupabase();
        const { error: storageErr } = await serviceSb.storage
            .from('bonnen')
            .remove([bon.file_path as string]);

        if (storageErr) {
            // Niet-fataal: log en ga door met DB cleanup. Beter een orphaned
            // storage-blob dan een halve state in DB.
            console.warn('[removeBonFile] storage remove failed:', storageErr.message);
        }

        // 3. DB: file-velden op NULL, status terug naar pending
        const { error: updErr } = await sb
            .from('bonnen')
            .update({
                file_path: null,
                file_mime: null,
                image_hash: null,
                status: 'pending',
            })
            .eq('id', bonId);

        if (updErr) throw new Error(updErr.message);

        // 4. Audit-log entry
        await logBonAction(
            sb,
            bonId,
            'update',
            'PDF verwijderd — klaar voor nieuwe scan',
            { user_id: user.id, removed_file_path: bon.file_path },
        ).catch(() => { /* audit-trigger doet de hoofdwerk */ });

        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return {
            ok: false as const,
            error: e instanceof Error ? e.message : 'Kon bestand niet verwijderen',
        };
    }
}

/**
 * deleteBonAction — hard delete van een bon (DB + Storage).
 *
 * Verwijdert ALLE data: bon-record, file, audit (via cascade), stock-koppelingen.
 * Geen soft-delete: Sam wil "clean slate" voor het opnieuw scannen.
 *
 * Beveiliging:
 *   - vergrendelde bonnen kunnen niet weg (RLS-check + applicatie-check)
 *   - audit-trigger uit migratie 138000 is delete-safe (NULL user_id okay)
 */
export async function deleteBonAction(input: unknown) {
    try {
        const { bonId } = bonIdSchema.parse(input);
        const { sb, orgId } = await getAuthContext();

        // 1. Lees bon voor file_path + lock-check
        const { data: bon, error: readErr } = await sb
            .from('bonnen')
            .select('id, file_path, locked_at, organization_id')
            .eq('id', bonId)
            .eq('organization_id', orgId)
            .single();

        if (readErr || !bon) {
            return { ok: false as const, error: 'Bon niet gevonden' };
        }
        if (bon.locked_at) {
            return {
                ok: false as const,
                error: 'Vergrendelde bonnen kunnen niet verwijderd worden. Eerst ontgrendelen.',
            };
        }

        // 2. Verwijder file uit Storage (service-role)
        if (bon.file_path) {
            const { createServiceSupabase } = await import('@/lib/supabase-server');
            const serviceSb = createServiceSupabase();
            await serviceSb.storage.from('bonnen').remove([bon.file_path as string]);
        }

        // 3. DELETE bon-record. Audit-trigger logt 'delete' automatisch.
        const { error: delErr } = await sb.from('bonnen').delete().eq('id', bonId);

        if (delErr) throw new Error(delErr.message);

        revalidatePath('/archief');
        return { ok: true as const };
    } catch (e) {
        return {
            ok: false as const,
            error: e instanceof Error ? e.message : 'Kon bon niet verwijderen',
        };
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
