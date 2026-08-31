/**
 * Server Actions voor materieel-CRUD (Bundel 7 — server-actions completion).
 *
 * Hard rule 5 (BBQ Architect): Zod-validatie + re-auth INSIDE de actie,
 * niet via middleware-auth alleen. RLS doet tenant-isolatie via
 * `organization_id`-policies op `materieel`.
 *
 * Voorheen ging `/materieel` CRUD direct via `useSupabase.insert/update/
 * remove` vanaf de Client — geen server-side shape-validatie, geen
 * re-auth-check. Een gemanipuleerde request kon willekeurige velden
 * schrijven.
 *
 * Patroon volgt /klanten + /facturen + /voorraad (PR #87-#99).
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { MaterieelSchema } from '@/lib/schemas/materieel';

/* Geen `export type { MaterieelInput }` — een 'use server' module mag alleen
   async functions exporteren, anders crasht de Turbopack server-actions-loader
   runtime. Importeer types direct uit @/lib/schemas/materieel. */

interface ActionResult<T = unknown> {
    data?: T;
    error?: string;
    fields?: Record<string, string[]>;
}

export async function upsertMaterieel(input: unknown): Promise<ActionResult<{ id: number }>> {
    const parsed = MaterieelSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'validation',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { id, ...rest } = parsed.data;

    /* RLS-fix 2026-06-12: WITH CHECK op `materieel` eist organization_id —
       zonder dit veld weigert de database elke nieuwe rij stilletjes. */
    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };

    if (id) {
        const { data, error } = await supabase
            .from('materieel')
            .update(rest)
            .eq('id', id)
            .select('id')
            .single();
        if (error) return { error: error.message };
        revalidatePath('/materieel');
        return { data: { id: data.id } };
    }

    const { data, error } = await supabase
        .from('materieel')
        .insert({ ...rest, organization_id: mem.organization_id })
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath('/materieel');
    return { data: { id: data.id } };
}

export async function deleteMaterieel(id: number): Promise<ActionResult<{ ok: true }>> {
    const parsedId = z.coerce.number().int().positive().safeParse(id);
    if (!parsedId.success) return { error: 'validation' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { error } = await supabase.from('materieel').delete().eq('id', parsedId.data);
    if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('foreign key') || msg.includes('violates')) {
            return { error: 'item heeft nog gekoppelde data — eerst ontkoppelen' };
        }
        return { error: error.message };
    }
    revalidatePath('/materieel');
    return { data: { ok: true } };
}

/* ══════════════════════════════════════════════════════════════════════
   Gastronorm-telling
   ══════════════════════════════════════════════════════════════════════
   Waarom een eigen actie en niet upsertMaterieel per bak: je telt in één keer
   je hele voorraad bakken. Dat zijn twintig regels tegelijk, waarvan de meeste
   op nul staan. Eén ronde in plaats van twintig losse opslagen.

   Modellering: één materieel-regel per FORMAAT, met `aantal`. Zeven identieke
   1/1-65 bakken zijn dus één regel met aantal 7 — niet zeven regels. De maten
   en de inhoud staan in gn_maten en worden hier niet gekopieerd; die zijn
   wereldstandaard en horen niet per cateraar opnieuw ingevuld te worden.

   Aantal 0 betekent: die heb ik niet (meer). Dan verdwijnt de regel, zodat je
   lijst niet volloopt met formaten die je nooit hebt gehad. */

const GnTellingSchema = z.object({
    items: z.array(
        z.object({
            gn_code: z.string().min(1).max(20),
            aantal: z.coerce.number().int().min(0).max(999),
            locatie: z.string().max(200).nullable().optional(),
        })
    ).max(100),
});

export async function saveGnTelling(input: unknown): Promise<ActionResult<{ bewaard: number; verwijderd: number }>> {
    const parsed = GnTellingSchema.safeParse(input);
    if (!parsed.success) {
        return { error: 'validation', fields: parsed.error.flatten().fieldErrors as Record<string, string[]> };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'unauthorized' };

    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!mem?.organization_id) return { error: 'geen actieve organisatie gevonden' };
    const orgId = mem.organization_id;

    /* De maten komen uit de kennisbank, niet uit de invoer: zo kan een
       gemanipuleerde request geen bak met verzonnen afmetingen aanmaken. */
    const codes = parsed.data.items.map((i) => i.gn_code);
    const { data: maten, error: matenErr } = await supabase
        .from('gn_maten')
        .select('code, naam')
        .in('code', codes);
    if (matenErr) return { error: matenErr.message };
    const bekend = new Map((maten ?? []).map((m) => [m.code as string, m.naam as string]));

    const { data: bestaand, error: bestaandErr } = await supabase
        .from('materieel')
        .select('id, gn_code')
        .eq('organization_id', orgId)
        .not('gn_code', 'is', null);
    if (bestaandErr) return { error: bestaandErr.message };
    const perCode = new Map((bestaand ?? []).map((r) => [r.gn_code as string, r.id as number]));

    let bewaard = 0;
    let verwijderd = 0;

    for (const item of parsed.data.items) {
        const naam = bekend.get(item.gn_code);
        if (!naam) continue; // onbekende code — stil overslaan, niet aanmaken

        const bestaandeId = perCode.get(item.gn_code);

        if (item.aantal === 0) {
            if (bestaandeId != null) {
                const { error } = await supabase.from('materieel').delete().eq('id', bestaandeId);
                if (error) return { error: error.message };
                verwijderd++;
            }
            continue;
        }

        const rij = {
            naam,
            type: 'Transport',
            soort: 'gn_bak',
            gn_code: item.gn_code,
            aantal: item.aantal,
            locatie: item.locatie ?? null,
            status: 'ok' as const,
        };

        if (bestaandeId != null) {
            const { error } = await supabase.from('materieel').update(rij).eq('id', bestaandeId);
            if (error) return { error: error.message };
        } else {
            /* organization_id expliciet: de WITH CHECK-policy op materieel eist
               hem, en zonder weigert de database de rij stilletjes. */
            const { error } = await supabase.from('materieel').insert({ ...rij, organization_id: orgId });
            if (error) return { error: error.message };
        }
        bewaard++;
    }

    revalidatePath('/materieel');
    return { data: { bewaard, verwijderd } };
}
