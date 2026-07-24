/* background/lib/idempotency — stabiele idempotentiesleutels (crypto.subtle).
 * Spiegelt src/lib/supplierSync/identity.ts idempotencyKey: dezelfde canonieke
 * join → dezelfde sleutel → dezelfde server-ACK, geen duplicaten (§8.5). */

export async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function idempotencyKey(parts) {
    const canonical = [
        parts.organizationId || '',
        String(parts.supplierId),
        parts.supplierAccountKey,
        parts.runScope,
        parts.adapterVersion,
        parts.categoryOrEndpoint,
        parts.cursorOrPage,
    ].join(' ');
    return sha256Hex(canonical);
}
