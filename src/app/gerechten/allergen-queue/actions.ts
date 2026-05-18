'use server';

/* ═══════════════════════════════════════════════════════════════
   Server Actions voor allergen-queue (Pillar #2 echte UI-confirm)
   ─────────────────────────────────────────────────────────────
   Hard-rule 2: AI mag voorstellen (ai_suggested=true) maar mens bevestigt.
   Hard-rule 6: Server Actions re-authorizen tegen org_id (middleware-only = CVE-risk).
   ─────────────────────────────────────────────────────────────── */

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type ActionResult = { ok: true } | { ok: false; error: string };

/* Centrale auth-check. Returnt user-id + org-id of een error-result.
   Wordt door alle 3 acties hergebruikt. */
async function authorize(): Promise<{ ok: true; userId: string; orgId: string } | { ok: false; error: string }> {
    const sb = await createServerSupabase();
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) return { ok: false, error: 'Niet ingelogd' };

    const { data: mem, error: memErr } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (memErr || !mem) return { ok: false, error: 'Geen actieve organisatie gevonden' };

    return { ok: true, userId: user.id, orgId: mem.organization_id as string };
}

/* Type-guards voor input — handmatig (Zod is transitive dep, niet hard-required).
   Server Action input komt vanuit client formdata of args; we trust niets. */
function isPositiveInt(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function isAllergenCode(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    // EU14 + V/VE proxy-flags — strict matchen
    return /^(G|L|N|P|E|S|F|C|W|M|SE|SU|SD|LU|V|VE)$/.test(v);
}

/* ── Confirm één allergen-rij ─────────────────────────────────── */
export async function confirmComponentAllergen(
    componentId: number,
    allergenCode: string,
): Promise<ActionResult> {
    if (!isPositiveInt(componentId)) return { ok: false, error: 'Ongeldig component_id' };
    if (!isAllergenCode(allergenCode)) return { ok: false, error: 'Ongeldige allergen_code' };

    const auth = await authorize();
    if (!auth.ok) return auth;

    const sb = await createServerSupabase();
    // RLS doet check op organization_id, maar we filteren ook expliciet zodat
    // een lek in RLS niet meteen cross-org confirm toestaat (defense-in-depth).
    const { error } = await sb
        .from('component_allergens')
        .update({ confirmed_at: new Date().toISOString(), confirmed_by: auth.userId })
        .eq('component_id', componentId)
        .eq('allergen_code', allergenCode)
        .eq('organization_id', auth.orgId);

    if (error) return { ok: false, error: error.message };

    revalidatePath('/gerechten/allergen-queue');
    return { ok: true };
}

/* ── Verwerp een AI-suggested allergen (false positive) ───────── */
export async function rejectComponentAllergen(
    componentId: number,
    allergenCode: string,
): Promise<ActionResult> {
    if (!isPositiveInt(componentId)) return { ok: false, error: 'Ongeldig component_id' };
    if (!isAllergenCode(allergenCode)) return { ok: false, error: 'Ongeldige allergen_code' };

    const auth = await authorize();
    if (!auth.ok) return auth;

    const sb = await createServerSupabase();
    // Reject = delete; we behouden bevestigde rijen door alleen ai_suggested=true te raken.
    const { error } = await sb
        .from('component_allergens')
        .delete()
        .eq('component_id', componentId)
        .eq('allergen_code', allergenCode)
        .eq('organization_id', auth.orgId)
        .eq('ai_suggested', true)
        .is('confirmed_at', null);

    if (error) return { ok: false, error: error.message };

    revalidatePath('/gerechten/allergen-queue');
    return { ok: true };
}

/* ── Bulk-confirm alle AI-suggested allergens van één component ─ */
export async function bulkConfirmComponent(componentId: number): Promise<ActionResult> {
    if (!isPositiveInt(componentId)) return { ok: false, error: 'Ongeldig component_id' };

    const auth = await authorize();
    if (!auth.ok) return auth;

    const sb = await createServerSupabase();
    const { error } = await sb
        .from('component_allergens')
        .update({ confirmed_at: new Date().toISOString(), confirmed_by: auth.userId })
        .eq('component_id', componentId)
        .eq('organization_id', auth.orgId)
        .eq('ai_suggested', true)
        .is('confirmed_at', null);

    if (error) return { ok: false, error: error.message };

    revalidatePath('/gerechten/allergen-queue');
    return { ok: true };
}
