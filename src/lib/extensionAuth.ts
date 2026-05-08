/**
 * API-key helpers voor de Chrome-extensie.
 *
 * Format: `ext_<24 random base32 chars>` — bv. `ext_a3f47x9k2bm8h5t6q1z0wpyc`
 * Opgeslagen: SHA-256 hex van de raw key. Raw key alleen 1× getoond bij creatie.
 *
 * Auth-flow:
 *   Extensie stuurt header `x-extension-key: ext_xxx`
 *   → verifyExtensionKey() hashed input → lookup in DB → returnt {orgId, userId, keyId}
 *   → updates last_used_at + use_count
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServiceSupabase } from './supabase-server';

const KEY_PREFIX = 'ext_';
const KEY_BODY_LEN = 24; // base32 chars after prefix
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

export function generateExtensionKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
    const buf = randomBytes(20);
    let body = '';
    for (let i = 0; i < KEY_BODY_LEN; i++) {
        body += BASE32_ALPHABET[buf[i % buf.length] % 32];
    }
    const rawKey = `${KEY_PREFIX}${body}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = `${KEY_PREFIX}${body.slice(0, 6)}…`;
    return { rawKey, keyHash, keyPrefix };
}

export function hashKey(raw: string): string {
    return createHash('sha256').update(raw.trim()).digest('hex');
}

export interface ExtensionAuthContext {
    keyId: string;
    organizationId: string;
    userId: string;
}

/**
 * Verifieer een binnenkomende key uit `x-extension-key` header.
 * Retourneert null bij ongeldige/revoked/onbekende key.
 * Update last_used_at + use_count fire-and-forget bij succes.
 */
export async function verifyExtensionKey(headerValue: string | null): Promise<ExtensionAuthContext | null> {
    if (!headerValue || !headerValue.startsWith(KEY_PREFIX)) return null;

    const sb = createServiceSupabase();
    const keyHash = hashKey(headerValue);

    const { data, error } = await sb
        .from('org_extension_api_keys')
        .select('id, organization_id, user_id, revoked_at')
        .eq('key_hash', keyHash)
        .maybeSingle();

    if (error || !data) return null;
    if (data.revoked_at) return null;

    /* fire-and-forget bookkeeping */
    void sb
        .from('org_extension_api_keys')
        .update({ last_used_at: new Date().toISOString(), use_count: (await currentUseCount(data.id)) + 1 })
        .eq('id', data.id);

    return {
        keyId: data.id,
        organizationId: data.organization_id,
        userId: data.user_id,
    };
}

async function currentUseCount(keyId: string): Promise<number> {
    const sb = createServiceSupabase();
    const { data } = await sb.from('org_extension_api_keys').select('use_count').eq('id', keyId).maybeSingle();
    return data?.use_count ?? 0;
}
