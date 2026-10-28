/**
 * Server Actions voor Instellingen → Toonbank → Cadeaubonnen (contract toonbank/v1 1.2).
 *
 * Huisregels (zoals ../actions.ts):
 *  - Zod op alle invoer; re-auth BINNEN de action.
 *  - De organisatie komt uit organization_members, nooit uit de client.
 *  - Alleen een Admin: een cadeaubon is als geld.
 *  - Uitgeven, blokkeren en corrigeren lopen via de databasefuncties
 *    (cadeaubon_uitgeven, _blokkeren, _corrigeren uit 20261029120000), met
 *    private.vereis_org en private.toonbank_vereis_admin; elke wijziging is een
 *    mutatie die niet meer verandert.
 *
 * Open [voorstel, niet besloten]: hoe de verkoop van een cadeaubon zelf geboekt
 * wordt (webshop, BBQ Architect of Toonbank; een meervoudige voucher is bij de
 * verkoop geen omzet en heeft geen btw, laten toetsen door de boekhouder). Hier
 * wordt alleen de bon met zijn waarde vastgelegd, met een notitie.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { maakCadeauboncode } from '@/lib/toonbank/cadeaubonnen';
import { normaliseerCadeauboncode } from '@/lib/toonbank/contract';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/instellingen/toonbank/cadeaubonnen';
const GEEN_MIGRATIE = 'De database kent de cadeaubonnen nog niet (migratie 20261029120000).';

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

function databaseFout(error: { code?: string | null; message?: string } | null, standaard: string): string {
    if (!error) return standaard;
    if (error.code === '42883' || error.code === 'PGRST202' || error.code === '42703') return GEEN_MIGRATIE;
    if (error.code === '42501') return 'Alleen een beheerder (Admin) kan cadeaubonnen beheren.';
    if (error.code === 'P0002') return 'Deze cadeaubon bestaat niet (meer).';
    return error.message ?? standaard;
}

export interface UitgegevenCadeaubon {
    id: string;
    code: string;
    waarde_cents: number;
    geldig_tot: string | null;
}

/**
 * Een cadeaubon uitgeven. Zonder code maakt BBQ Architect er een (HB-XXXX-XXXX); bestaat die al,
 * dan nog twee keer een nieuwe. Een opgegeven code (een voorgedrukte bon) die al bestaat: een melding.
 */
export async function cadeaubonUitgeven(input: unknown): Promise<ActionResult<UitgegevenCadeaubon>> {
    const parsed = z.object({
        waardeCents: z.number().int().min(1, 'De waarde is meer dan € 0')
            // Invoercontrole tegen een tikfout (2500 euro in plaats van 25,00), geen regel over cadeaubonnen.
            .max(1_000_000, 'Hooguit € 10.000 per cadeaubon; is het bedrag goed ingetikt?'),
        geldigTot: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geldig tot is een datum').nullable().default(null),
        code: z.string().trim().max(60).nullable().default(null),
        notitie: z.string().trim().max(500, 'Hooguit 500 tekens').nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan cadeaubonnen uitgeven.' };

    const eigen = parsed.data.code ? normaliseerCadeauboncode(parsed.data.code) : null;
    if (eigen !== null && !/^[A-Z0-9-]{4,40}$/.test(eigen)) {
        return { error: 'Een code is 4 tot 40 tekens: letters, cijfers en streepjes.' };
    }
    for (let poging = 0; poging < 3; poging++) {
        const code = eigen ?? maakCadeauboncode();
        const { data, error } = await s.supabase.rpc('cadeaubon_uitgeven', {
            p_org: s.orgId, p_code: code, p_waarde_cents: parsed.data.waardeCents, p_geldig_tot: parsed.data.geldigTot,
            p_notitie: parsed.data.notitie || null, p_door: s.user.id,
        });
        if (error?.code === '23505') {
            if (eigen) return { error: `Cadeaubon ${eigen} bestaat al.` };
            continue;
        }
        if (error || !data) return { error: databaseFout(error, 'Uitgeven mislukt') };
        const r = data as { id: string; code: string; waarde_cents: number; geldig_tot: string | null };
        revalidatePath(PAD);
        return { data: { id: r.id, code: r.code, waarde_cents: Number(r.waarde_cents), geldig_tot: r.geldig_tot ?? null } };
    }
    return { error: 'Er kwam drie keer een code uit die al bestaat. Probeer het opnieuw.' };
}

export async function cadeaubonBlokkeren(input: unknown): Promise<ActionResult<{ status: string }>> {
    const parsed = z.object({
        id: z.string().uuid(),
        blokkeren: z.boolean(),
        reden: z.string().trim().max(500).nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    if (parsed.data.blokkeren && !parsed.data.reden) return { error: 'Geef een reden waarom de cadeaubon geblokkeerd wordt.' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan cadeaubonnen blokkeren.' };

    const { data, error } = await s.supabase.rpc('cadeaubon_blokkeren', {
        p_org: s.orgId, p_id: parsed.data.id, p_blokkeren: parsed.data.blokkeren, p_reden: parsed.data.reden, p_door: s.user.id,
    });
    if (error) return { error: databaseFout(error, 'Blokkeren mislukt') };
    revalidatePath(PAD);
    return { data: { status: String((data as { status?: string } | null)?.status ?? '') } };
}

/** Het saldo corrigeren (plus of min), altijd met een reden: een mutatie correctie. */
export async function cadeaubonCorrigeren(input: unknown): Promise<ActionResult<{ saldo_cents: number }>> {
    const parsed = z.object({
        id: z.string().uuid(),
        bedragCents: z.number().int().refine((n) => n !== 0, 'Een correctie is een bedrag, plus of min, niet 0').refine((n) => Math.abs(n) <= 1_000_000, 'Hooguit € 10.000 per correctie'),
        reden: z.string().trim().min(1, 'Geef een reden voor de correctie').max(500),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan het saldo corrigeren.' };

    const { data, error } = await s.supabase.rpc('cadeaubon_corrigeren', {
        p_org: s.orgId, p_id: parsed.data.id, p_bedrag_cents: parsed.data.bedragCents, p_reden: parsed.data.reden, p_door: s.user.id,
    });
    if (error) return { error: databaseFout(error, 'Corrigeren mislukt') };
    revalidatePath(PAD);
    return { data: { saldo_cents: Number((data as { saldo_cents?: unknown } | null)?.saldo_cents ?? 0) } };
}

/** "Cadeaubonnen aan op de Toonbank": GET status meldt dan instellingen.cadeaubon_aan (binnen 30 seconden). */
export async function zetCadeaubonAan(input: unknown): Promise<ActionResult<{ aan: boolean }>> {
    const parsed = z.object({ aan: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await alsAdmin();
    if (!s) return { error: 'Alleen een beheerder (Admin) kan dit wijzigen.' };

    const { data, error } = await s.supabase.from('winkel_instellingen')
        .update({ toonbank_cadeaubon_aan: parsed.data.aan })
        .eq('organization_id', s.orgId)
        .select('organization_id');
    if (error) return { error: databaseFout(error, 'Bewaren mislukt') };
    if (!data?.length) return { error: 'Er zijn nog geen winkelinstellingen; zet eerst de webshop op.' };
    revalidatePath(PAD);
    return { data: { aan: parsed.data.aan } };
}
