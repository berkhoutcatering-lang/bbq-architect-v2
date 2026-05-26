/**
 * Deelbare read-only share-tokens voor boekhouder (Pillar #4 / P0.12).
 *
 * Werking:
 *   1. Cateraar maakt link via DeelLinkSheet → createShareToken().
 *   2. Token = 32 random bytes hex (64-char string), cryptografisch random.
 *   3. Public route /share/[token]/page.tsx resolveert token →
 *      org_id + filter_json + checks (expires_at, revoked_at).
 *   4. Public route gebruikt service-role client (anon kan eigen org niet zien).
 *   5. Access wordt geregistreerd (access_count + last_accessed_at + IP).
 *
 * Security:
 *   - 32 bytes random = 256 bits entropy, ondoenlijk te bruteforcen.
 *   - revoked_at gecheckt op elke access (geen caching van resolved token).
 *   - expires_at hard cutoff, geen grace-period.
 *   - filter_json is bevroren bij creatie (boekhouder ziet niet plotseling extra bonnen).
 *   - IP-logging voor AVG: legitimate interest (audit-trail bij abuse).
 */
import 'server-only';
import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchInput } from '@/lib/dal/bonnen';

export type ShareTtlDays = 7 | 30 | 90;

export interface CreateShareInput {
    orgId: string;
    createdBy: string;
    filterJson: SearchInput;
    ttlDays: ShareTtlDays;
    recipientName?: string;
    recipientEmail?: string;
    label?: string;
}

export interface ShareToken {
    id: number;
    token: string;
    organization_id: string;
    filter_json: SearchInput;
    recipient_name: string | null;
    recipient_email: string | null;
    label: string | null;
    expires_at: string;
    revoked_at: string | null;
    access_count: number;
    last_accessed_at: string | null;
    created_at: string;
}

/**
 * Genereer 64-char hex token. 32 bytes = 256 bits entropy.
 */
export function generateShareToken(): string {
    return randomBytes(32).toString('hex');
}

/**
 * Maak een nieuwe deellink.
 * Caller: Server Action vanuit DeelLinkSheet UI.
 */
export async function createShareToken(
    sb: SupabaseClient,
    input: CreateShareInput,
): Promise<ShareToken> {
    const token = generateShareToken();
    const expiresAt = new Date(Date.now() + input.ttlDays * 86_400_000).toISOString();

    const { data, error } = await sb
        .from('bon_share_tokens')
        .insert({
            token,
            organization_id: input.orgId,
            created_by: input.createdBy,
            filter_json: input.filterJson as unknown as Record<string, unknown>,
            recipient_name: input.recipientName ?? null,
            recipient_email: input.recipientEmail ?? null,
            label: input.label ?? null,
            expires_at: expiresAt,
        })
        .select()
        .single();

    if (error) throw error;
    return data as ShareToken;
}

/**
 * Resolve token → ShareToken row.
 * MOET aangeroepen worden met service-role client (anon kan niet via RLS).
 * Returnt null als token onbekend, verlopen of ingetrokken is.
 */
export async function resolveShareToken(
    serviceSb: SupabaseClient,
    token: string,
): Promise<ShareToken | null> {
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/.test(token)) {
        return null;  // ongeldig formaat → niet eens proberen
    }

    const { data, error } = await serviceSb
        .from('bon_share_tokens')
        .select('*')
        .eq('token', token)
        .single();

    if (error || !data) return null;

    const share = data as ShareToken;

    // Verlopen?
    if (new Date(share.expires_at).getTime() < Date.now()) return null;

    // Ingetrokken?
    if (share.revoked_at) return null;

    return share;
}

/**
 * Registreer een access. Niet-blokkerend: fail silently.
 */
export async function recordShareAccess(
    serviceSb: SupabaseClient,
    tokenId: number,
    ipAddress: string | null,
): Promise<void> {
    try {
        await serviceSb
            .from('bon_share_tokens')
            .update({
                access_count: undefined,  // increment via RPC ipv +1 race-condition
                last_accessed_at: new Date().toISOString(),
                last_accessed_ip: ipAddress,
            })
            .eq('id', tokenId);

        // Atomische increment via RPC (vermijdt lost-update).
        await serviceSb.rpc('increment_share_access', { p_token_id: tokenId });
    } catch (e) {
        // Niet-fataal — log voor monitoring.
        console.error('[shareTokens] recordShareAccess failed:', e);
    }
}

/**
 * Intrekken: zet revoked_at i.p.v. DELETE.
 * Caller: Server Action vanuit "Beheer deellinks" UI.
 */
export async function revokeShareToken(
    sb: SupabaseClient,
    tokenId: number,
): Promise<void> {
    const { error } = await sb
        .from('bon_share_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId);
    if (error) throw error;
}

/**
 * Lijst actieve tokens voor de huidige org (voor "Beheer deellinks" UI).
 */
export async function listActiveShareTokens(
    sb: SupabaseClient,
    orgId: string,
): Promise<ShareToken[]> {
    const { data, error } = await sb
        .from('bon_share_tokens')
        .select('*')
        .eq('organization_id', orgId)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) return [];
    return (data ?? []) as ShareToken[];
}
