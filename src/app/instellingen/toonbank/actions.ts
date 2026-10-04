/**
 * Server Actions voor Instellingen → Toonbank (BA-7a).
 *
 * Huisregels:
 *  - Zod op alle invoer; re-auth BINNEN de action.
 *  - De organisatie komt uit organization_members, nooit uit de client.
 *  - Alleen een Admin beheert tablets, rollen en inlogcodes: dit is de
 *    toegang tot de kassa.
 *  - Koppelcode en inlogcode gaan alleen als scrypt-hash naar de database
 *    (deviceAuth.hashPin). De koppelcode komt één keer terug om te tonen; de
 *    inlogcode nooit.
 *  - Tablets maken, opnieuw koppelen en intrekken lopen via de
 *    databasefuncties (toonbank_apparaat_*, met private.vereis_org); rol en
 *    inlogcode via personeel, met RLS.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { hashPin } from '@/lib/prep/deviceAuth';
import { hashKoppelcode, maakKoppelcode } from '@/lib/toonbank/koppelcode';
import { zwakkeInlogcode, type NieuweKoppelcode } from '@/lib/toonbank/beheer';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/instellingen/toonbank';

async function alsAdmin() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!data?.organization_id || data.role !== 'Admin') return null;
    return { supabase, user, orgId: data.organization_id as string };
}

function eersteFout(e: z.ZodError): string {
    return e.issues[0]?.message ?? 'Controleer de velden';
}

export async function tabletToevoegen(input: unknown): Promise<ActionResult<NieuweKoppelcode>> {
    const parsed = z.object({
        naam: z.string().trim().min(1, 'Geef de tablet een naam').max(60, 'Hooguit 60 tekens'),
        locatie: z.enum(['winkel', 'event']).default('winkel'),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan tablets toevoegen.' };

    const koppelcode = maakKoppelcode();
    const { data, error } = await s.supabase.rpc('toonbank_apparaat_nieuw', {
        p_org: s.orgId, p_naam: parsed.data.naam, p_locatie: parsed.data.locatie, p_koppelcode_hash: await hashKoppelcode(koppelcode), p_door: s.user.id,
    });
    if (error || !data) return { error: error?.message ?? 'Tablet toevoegen mislukt' };
    const r = data as { apparaat_id: string; code: string; naam: string; koppelcode_geldig_tot: string };
    revalidatePath(PAD);
    return { data: { apparaat_id: r.apparaat_id, code: r.code, naam: r.naam, koppelcode, geldig_tot: r.koppelcode_geldig_tot } };
}

export async function nieuweKoppelcode(input: unknown): Promise<ActionResult<NieuweKoppelcode>> {
    const parsed = z.object({ apparaatId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan tablets koppelen.' };

    const koppelcode = maakKoppelcode();
    const { data, error } = await s.supabase.rpc('toonbank_apparaat_koppelcode', {
        p_org: s.orgId, p_apparaat_id: parsed.data.apparaatId, p_koppelcode_hash: await hashKoppelcode(koppelcode),
    });
    if (error || !data) return { error: error?.code === 'P0002' ? 'Deze tablet bestaat niet of is ingetrokken.' : error?.message ?? 'Nieuwe code mislukt' };
    const r = data as { apparaat_id: string; code: string; naam: string; koppelcode_geldig_tot: string };
    revalidatePath(PAD);
    return { data: { apparaat_id: r.apparaat_id, code: r.code, naam: r.naam, koppelcode, geldig_tot: r.koppelcode_geldig_tot } };
}

export async function tabletIntrekken(input: unknown): Promise<ActionResult<{ uitkomst: string }>> {
    const parsed = z.object({
        apparaatId: z.string().uuid(),
        reden: z.string().trim().max(200).nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan tablets intrekken.' };

    const { data, error } = await s.supabase.rpc('toonbank_apparaat_intrekken', {
        p_org: s.orgId, p_apparaat_id: parsed.data.apparaatId, p_reden: parsed.data.reden, p_door: s.user.id,
    });
    if (error) return { error: error.code === 'P0002' ? 'Deze tablet bestaat niet.' : error.message };
    revalidatePath(PAD);
    return { data: { uitkomst: String((data as { uitkomst?: string } | null)?.uitkomst ?? 'ingetrokken') } };
}

export async function zetToonbankRol(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        personeelId: z.string().uuid(),
        rol: z.enum(['medewerker', 'eigenaar']).nullable(),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan rollen geven.' };

    const { data, error } = await s.supabase.from('personeel')
        .update({ toonbank_rol: parsed.data.rol })
        .eq('id', parsed.data.personeelId)
        .eq('organization_id', s.orgId)
        .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'Medewerker niet gevonden.' };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/**
 * De inlogcode zetten (4 tot 6 cijfers). Dit is dezelfde code als op de
 * keuken-tablet (personeel.kds_pin_hash): één code per persoon. Een nieuwe
 * code heft een blokkade op.
 */
export async function zetInlogcode(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        personeelId: z.string().uuid(),
        inlogcode: z.string().regex(/^\d{4,6}$/, 'Een inlogcode is 4 tot 6 cijfers'),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan inlogcodes zetten.' };
    if (zwakkeInlogcode(parsed.data.inlogcode)) {
        return { error: 'Kies een code die niet zo makkelijk te raden is (geen 1111 of 1234).' };
    }

    const { data, error } = await s.supabase.from('personeel')
        .update({ kds_pin_hash: await hashPin(parsed.data.inlogcode), kds_pin_lockout_until: null })
        .eq('id', parsed.data.personeelId)
        .eq('organization_id', s.orgId)
        .select('id');
    if (error) return { error: error.message };
    if (!data?.length) return { error: 'Medewerker niet gevonden.' };
    revalidatePath(PAD);
    return { data: { ok: true } };
}
