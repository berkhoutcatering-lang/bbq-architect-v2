'use server';

/**
 * Server Actions voor de goedkeur-lade.
 *
 * Elke H-agent schrijft hier een voorstel; niemand muteert zelf. Bevestigen
 * levert de payload terug — uitvoeren doet de feature die het voorstel maakte.
 * Zie src/lib/voorstellen.ts voor het waarom van die scheiding.
 *
 * Patroon volgt de rest van de app: Zod-validatie plus re-auth ín de actie,
 * en organization_id expliciet meesturen omdat de WITH CHECK-policy hem eist.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { VOORSTEL_TYPES, AFWIJS_REDENEN, type Voorstel, type VoorstelType } from '@/lib/voorstellen';

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

const TypeSchema = z.enum(VOORSTEL_TYPES);

async function auth() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' as const };

    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' as const };

    return { supabase, userId: user.id, orgId: mem.organization_id as string };
}

/* ── Aanmaken ──────────────────────────────────────────────────────────
   Wordt aangeroepen door een agent, niet door een knop in de UI. De payload
   is bewust ongetypeerd op dit niveau: elk soort voorstel heeft zijn eigen
   vorm, en die valideert de feature die hem uitvoert. Wat hier telt is dat
   het voorstel bestáát in plaats van dat er stilletjes iets gemuteerd wordt. */

const MaakSchema = z.object({
    type: TypeSchema,
    payload: z.unknown(),
    chat_message_id: z.string().max(200).nullable().optional(),
    /** Standaard 24 uur. Korter mag als een voorstel sneller veroudert. */
    geldig_uren: z.coerce.number().int().min(1).max(168).optional(),
});

export async function maakVoorstel(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = MaakSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const a = await auth();
    if ('error' in a) return { error: a.error };

    const rij: Record<string, unknown> = {
        organization_id: a.orgId,
        user_id: a.userId,
        proposal_type: parsed.data.type,
        payload: parsed.data.payload ?? {},
        status: 'pending',
        chat_message_id: parsed.data.chat_message_id ?? null,
    };
    if (parsed.data.geldig_uren) {
        rij.expires_at = new Date(Date.now() + parsed.data.geldig_uren * 3600_000).toISOString();
    }

    const { data, error } = await a.supabase
        .from('ai_action_proposals')
        .insert(rij)
        .select('id')
        .single();
    if (error) return { error: error.message };

    revalidatePath('/voorstellen');
    return { data: { id: data.id as string } };
}

/* ── Ophalen ───────────────────────────────────────────────────────────
   Eerst verlopen markeren, dan pas lezen. Zo krijg je nooit een voorstel te
   zien dat je niet meer mag bevestigen — en hebben we geen extra cron nodig
   op een Hobby-plan waar er al acht staan. */

const HaalSchema = z.object({
    type: TypeSchema.optional(),
    limiet: z.coerce.number().int().min(1).max(200).optional(),
});

export async function haalVoorstellen(input: unknown = {}): Promise<ActionResult<Voorstel[]>> {
    const parsed = HaalSchema.safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const a = await auth();
    if ('error' in a) return { error: a.error };

    await a.supabase.rpc('voorstellen_verlopen_markeren');

    let q = a.supabase
        .from('ai_action_proposals')
        .select('*')
        .eq('organization_id', a.orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(parsed.data.limiet ?? 50);

    if (parsed.data.type) q = q.eq('proposal_type', parsed.data.type);

    const { data, error } = await q;
    if (error) return { error: error.message };
    return { data: (data ?? []) as Voorstel[] };
}

export async function telOpenVoorstellen(): Promise<ActionResult<{ aantal: number }>> {
    const a = await auth();
    if ('error' in a) return { error: a.error };

    await a.supabase.rpc('voorstellen_verlopen_markeren');

    const { count, error } = await a.supabase
        .from('ai_action_proposals')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', a.orgId)
        .eq('status', 'pending');
    if (error) return { error: error.message };
    return { data: { aantal: count ?? 0 } };
}

/* ── Bevestigen ────────────────────────────────────────────────────────
   Geeft de payload terug in plaats van hem uit te voeren. Heb je onderweg
   iets aangepast, dan wordt de status `edited` in plaats van `confirmed` —
   dat verschil is later goud waard: het zegt hoe vaak een voorstel meteen
   goed was, en dat is de enige eerlijke maat of de agent deugt. */

const BevestigSchema = z.object({
    id: z.string().uuid(),
    payload: z.unknown().optional(),
});

export async function bevestigVoorstel(
    input: unknown
): Promise<ActionResult<{ type: VoorstelType; payload: unknown; gewijzigd: boolean }>> {
    const parsed = BevestigSchema.safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const a = await auth();
    if ('error' in a) return { error: a.error };

    await a.supabase.rpc('voorstellen_verlopen_markeren');

    const { data: bestaand, error: leesErr } = await a.supabase
        .from('ai_action_proposals')
        .select('id, proposal_type, payload, status, expires_at')
        .eq('id', parsed.data.id)
        .eq('organization_id', a.orgId)
        .maybeSingle();
    if (leesErr) return { error: leesErr.message };
    if (!bestaand) return { error: 'voorstel niet gevonden' };

    if (bestaand.status !== 'pending') {
        return {
            error:
                bestaand.status === 'expired'
                    ? 'Dit voorstel is verlopen — laat het opnieuw maken, dan klopt het weer met de huidige prijzen.'
                    : `Dit voorstel is al ${bestaand.status === 'cancelled' ? 'geannuleerd' : 'behandeld'}.`,
        };
    }

    const gewijzigd = parsed.data.payload !== undefined;
    const payload = gewijzigd ? parsed.data.payload : bestaand.payload;

    const { error } = await a.supabase
        .from('ai_action_proposals')
        .update({
            status: gewijzigd ? 'edited' : 'confirmed',
            payload,
            confirmed_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.id)
        .eq('organization_id', a.orgId);
    if (error) return { error: error.message };

    revalidatePath('/voorstellen');
    return { data: { type: bestaand.proposal_type as VoorstelType, payload, gewijzigd } };
}

/* ── Uitvoering vastleggen ─────────────────────────────────────────────
   De feature die het voorstel uitvoert schrijft terug wát er is gemaakt, zodat
   je van een bevestiging naar het resultaat kunt doorklikken. */

export async function koppelResultaat(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), result_id: z.string().max(200) }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const a = await auth();
    if ('error' in a) return { error: a.error };

    const { error } = await a.supabase
        .from('ai_action_proposals')
        .update({ result_id: parsed.data.result_id })
        .eq('id', parsed.data.id)
        .eq('organization_id', a.orgId);
    if (error) return { error: error.message };
    return { data: { ok: true } };
}

/* ── Annuleren ─────────────────────────────────────────────────────────
   Met een reden, want dat is de goedkoopste leerbron in het hele plan: elke
   afwijzing zegt iets, maar alleen als je vraagt waarom. Twee tellen werk. */

export async function annuleerVoorstel(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z
        .object({
            id: z.string().uuid(),
            reden: z.enum(AFWIJS_REDENEN).optional(),
            toelichting: z.string().max(1000).optional(),
        })
        .safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const a = await auth();
    if ('error' in a) return { error: a.error };

    const { data: bestaand } = await a.supabase
        .from('ai_action_proposals')
        .select('payload')
        .eq('id', parsed.data.id)
        .eq('organization_id', a.orgId)
        .maybeSingle();

    const payload =
        bestaand?.payload && typeof bestaand.payload === 'object'
            ? { ...(bestaand.payload as Record<string, unknown>), _afwijzing: { reden: parsed.data.reden ?? null, toelichting: parsed.data.toelichting ?? null } }
            : bestaand?.payload;

    const { error } = await a.supabase
        .from('ai_action_proposals')
        .update({ status: 'cancelled', payload })
        .eq('id', parsed.data.id)
        .eq('organization_id', a.orgId);
    if (error) return { error: error.message };

    revalidatePath('/voorstellen');
    return { data: { ok: true } };
}
