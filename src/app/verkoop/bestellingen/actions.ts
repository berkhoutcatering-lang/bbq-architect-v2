/**
 * Server Actions voor de bestellingen-hub (operator-kant).
 * Plan: docs/bestelstroom-bouwplan.md §4.
 *
 * Huisregels (zie ook verkoop/leads/actions.ts):
 *  - Zod op alle invoer.
 *  - Re-auth BINNEN de action; de proxy alleen is niet genoeg.
 *  - RLS scope't naar de org; hier wordt nooit een organization_id uit de
 *    client aangenomen.
 *
 * Wat hier NIET gebeurt: een bestelling aanmaken. Dat loopt via
 * /api/public-bestelling en plaats_bestelling(), met de rijen vergrendeld.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';

type ActionResult<T = unknown> = { data: T } | { error: string };

const STATUSSEN = ['nieuw', 'bevestigd', 'klaar', 'opgehaald', 'geannuleerd'] as const;

async function ingelogd() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    return user ? { supabase, user } : null;
}

/**
 * De allergie-poort, aan de operator-kant. Dit is de enige actie die een
 * bestelling met een allergienotitie kan vrijgeven voor 'bevestigd'. Wie
 * geklikt heeft blijft staan: dat is geen controle achteraf maar de reden dat
 * de klant erop kan vertrouwen dat iemand het gelezen heeft.
 */
export async function markeerAllergieGelezen(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.coerce.number().int() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('bestellingen')
        .update({ allergie_gezien_at: new Date().toISOString(), allergie_gezien_door: s.user.id })
        .eq('id', parsed.data.id)
        .is('allergie_gezien_at', null);
    if (error) return { error: error.message };

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}

/**
 * Statuswijziging. De database weigert 'bevestigd' zolang er een ongelezen
 * allergienotitie is (constraint bestellingen_allergie_gezien). De hub
 * schakelt die knop al uit, maar deze vertaling is er voor als het toch
 * gebeurt — via een bulkactie, een script, wat dan ook.
 */
export async function zetBestellingStatus(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.coerce.number().int(), status: z.enum(STATUSSEN) }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('bestellingen')
        .update({ status: parsed.data.status })
        .eq('id', parsed.data.id);

    if (error) {
        if (error.code === '23514' && error.message.includes('bestellingen_allergie_gezien')) {
            return { error: 'Deze bestelling heeft een allergienotitie die nog niemand gelezen heeft. Lees hem eerst.' };
        }
        return { error: error.message };
    }

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}

/**
 * "Naam op de doospagina." Automatisch gevuld met het eerste woord, maar
 * "Fam. Berkhout" wordt dan "Welkom Fam." op tafel. Corrigeren mag zolang er
 * nog niet gekoppeld is — daarna staat hij in de andere app.
 */
export async function zetVoornaam(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        id: z.coerce.number().int(),
        voornaam: z.string().trim().min(1, 'Vul een naam in').max(80),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { data, error } = await s.supabase
        .from('bestellingen')
        .update({ voornaam: parsed.data.voornaam })
        .eq('id', parsed.data.id)
        .neq('koppel_status', 'gekoppeld')
        .select('id')
        .maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: 'Deze bestelling is al gekoppeld; de naam staat nu in de Experience-app.' };

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}

/**
 * De sticker is geprint. Vanaf dit moment let de database erop: wijzigt het
 * aantal personen, de naam of het afhaalmoment daarna nog, dan zet een trigger
 * `sticker_herprint_nodig` aan en toont de hub "opnieuw printen". Niemand hoeft
 * daaraan te denken.
 */
export async function noteerStickerGeprint(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.coerce.number().int() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('bestellingen')
        .update({ sticker_geprint_at: new Date().toISOString(), sticker_herprint_nodig: false })
        .eq('id', parsed.data.id);
    if (error) return { error: error.message };

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}

/* ── Afhaalmomenten ───────────────────────────────────────────────────────────
   De capaciteit zit in de vakken, niet in een totaalplafond. Bijsturen gebeurt
   dus hier: een vak verhogen of een vak bijzetten, zonder migratie en zonder
   dat er iemand in de database hoeft. */

const MomentSchema = z.object({
    doos_type_id: z.string().uuid(),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een datum'),
    start_tijd: z.string().regex(/^\d{2}:\d{2}$/, 'Kies een starttijd'),
    eind_tijd: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal('')),
    max_dozen: z.coerce.number().int().min(0).max(1000),
});

export async function voegAfhaalmomentToe(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = MomentSchema.safeParse(input);
    if (!parsed.success) {
        return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    }
    if (parsed.data.eind_tijd && parsed.data.eind_tijd <= parsed.data.start_tijd) {
        return { error: 'De eindtijd moet ná de starttijd liggen.' };
    }

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    /* organization_id actief opzoeken, nooit uit de client aannemen — en meteen
       de controle dat dit doostype van deze organisatie is. */
    const { data: type } = await s.supabase
        .from('doos_types')
        .select('id, organization_id')
        .eq('id', parsed.data.doos_type_id)
        .maybeSingle();
    if (!type) return { error: 'Doostype niet gevonden' };

    const { data, error } = await s.supabase
        .from('afhaalmomenten')
        .insert({
            organization_id: type.organization_id,
            doos_type_id: type.id,
            datum: parsed.data.datum,
            start_tijd: parsed.data.start_tijd,
            eind_tijd: parsed.data.eind_tijd || null,
            max_dozen: parsed.data.max_dozen,
            actief: true,
        })
        .select('id')
        .single();
    if (error) return { error: error.message };

    revalidatePath('/verkoop/bestellingen');
    return { data: { id: data.id as string } };
}

/** Het maximum van één vak bijstellen. Verlagen onder wat er al besteld is mag
    niet: dan zou de app een doos beloven die er niet komt. */
export async function zetAfhaalmomentMax(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        id: z.string().uuid(),
        max_dozen: z.coerce.number().int().min(0).max(1000),
    }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { data: bezet } = await s.supabase
        .from('bestellingen')
        .select('dozen')
        .eq('afhaalmoment_id', parsed.data.id)
        .neq('status', 'geannuleerd');
    const gebruikt = (bezet ?? []).reduce((som, r) => som + (r.dozen ?? 0), 0);

    if (parsed.data.max_dozen < gebruikt) {
        return { error: `Er staan al ${gebruikt} ${gebruikt === 1 ? 'doos' : 'dozen'} op dit moment. Lager kan niet.` };
    }

    const { error } = await s.supabase
        .from('afhaalmomenten')
        .update({ max_dozen: parsed.data.max_dozen })
        .eq('id', parsed.data.id);
    if (error) return { error: error.message };

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}

/** Een vak uit de lijst halen zonder het weg te gooien. Bestellingen die eraan
    hangen blijven bestaan; het vak is alleen niet meer te kiezen. */
export async function zetAfhaalmomentActief(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), actief: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };

    const s = await ingelogd();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('afhaalmomenten')
        .update({ actief: parsed.data.actief })
        .eq('id', parsed.data.id);
    if (error) return { error: error.message };

    revalidatePath('/verkoop/bestellingen');
    return { data: { ok: true } };
}
