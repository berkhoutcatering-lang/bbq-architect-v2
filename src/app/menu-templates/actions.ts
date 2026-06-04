/**
 * Server Actions voor menu-templates (Stel-menu-samen v2).
 *
 * Pattern: identiek aan /offertes/actions.ts en /gerechten/actions.ts —
 * Zod-safeParse → supabase user-client → re-authorize via auth.getUser() →
 * RLS doet org-isolatie. Geen client mag organization_id "trusten".
 *
 * Writes lopen via de RPC `rpc_upsert_menu_template` (in
 * 20260601120000_menu_template_items.sql) zodat header + items atomair in
 * één transactie geüpdatet worden — voorkomt race-condities en orphan items.
 *
 * Hard rules:
 *   - Hard rule #1: BTW NOOIT AI-derived. applyMenuTemplateToOfferte zet
 *     btw_category statisch op 'food_catering' default; rate wordt op
 *     factuur-tijd opgezocht via BTW_RULES_2026.
 *   - Hard rule #3: production qty server-side berekend uit aantal_gasten;
 *     UI geeft geen vrijheid om dit te overschrijven per gerecht.
 *   - Hard rule #5: alle inputs gevalideerd; re-auth binnen elke action.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import {
    MenuTemplateUpsertSchema,
    ApplyMenuTemplateSchema,
} from '@/lib/schemas/menu-template';
import { listMenuTemplatesShallow, type MenuTemplateShallow } from '@/lib/dal/menuTemplates';

/* Een 'use server' module mag ALLEEN async functions exporteren (Next.js/
   Turbopack server-actions-loader). De vroegere `export type { ... }` re-export
   crashte runtime met "MenuTemplateUpsertInput is not defined" zodra deze
   actions geladen werden. Types importeer je direct uit @/lib/schemas/menu-template. */

interface UpsertOk {
    data: { id: number };
}
interface UpsertErr {
    error: string;
    fields?: Record<string, string[]>;
}

/**
 * Upsert (create or update) van een menu-template via atomic RPC.
 * Bij create laat je `id` weg. Bij update geef je het bestaande id mee.
 */
export async function upsertMenuTemplate(input: unknown): Promise<UpsertOk | UpsertErr> {
    const parsed = MenuTemplateUpsertSchema.safeParse(input);
    if (!parsed.success) {
        return {
            error: 'Validatie-fout',
            fields: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const v = parsed.data;
    const { data, error } = await supabase.rpc('rpc_upsert_menu_template', {
        p_id: v.id ?? null,
        p_naam: v.naam,
        p_beschrijving: v.beschrijving ?? '',
        p_basis_prijs_pp: v.basis_prijs_pp,
        p_aantal_gasten: v.aantal_gasten,
        p_is_default: v.is_default,
        p_items: v.items,
    });

    if (error) return { error: error.message };
    if (typeof data !== 'number') return { error: 'RPC gaf geen geldig template-id terug' };

    revalidatePath('/gerechten');
    revalidatePath('/gerechten/menukaarten');
    revalidatePath(`/gerechten/menukaarten/${data}`);
    revalidatePath('/offertes'); // wizard-picker moet nieuwe template zien
    return { data: { id: data } };
}

const DeleteSchema = z.coerce.number().int().positive();

export async function deleteMenuTemplate(id: number): Promise<{ ok: true } | { error: string }> {
    const parsed = DeleteSchema.safeParse(id);
    if (!parsed.success) return { error: 'Ongeldig template-id' };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    /* CASCADE op menu_template_items doet de cleanup; RLS gate doet de auth-check. */
    const { error } = await supabase.from('menu_templates').delete().eq('id', parsed.data);
    if (error) return { error: error.message };

    revalidatePath('/gerechten');
    revalidatePath('/gerechten/menukaarten');
    revalidatePath('/offertes');
    return { ok: true };
}

interface ApplyOk {
    ok: true;
    itemsAdded: number;
    menuSelectie: Record<string, string[]>;
    basisPrijsPp: number;
    aantalGasten: number;
}
interface ApplyErr { error: string }

/**
 * Laad een menu-template in een bestaande offerte.
 *
 * Genereert offerte.items uit de template's gerechten via dezelfde logica als
 * MenuWizard.handleComplete (basis-regel per gast + extra-gang-regels), maar
 * voegt nu `gerecht_id` + `gang_slug` toe per item zodat downstream PDF /
 * portaal / marge-analyse terug kunnen tracen naar het bron-gerecht.
 *
 * Mode 'replace' (default) wist bestaande items eerst; 'append' voegt toe.
 *
 * Hard rule #1: btw_category vast op 'food_catering' — rate via BTW_RULES_2026
 * lookup pas op factuur-tijd. NOOIT door deze action ge-AI-derived.
 */
export async function applyMenuTemplateToOfferte(input: unknown): Promise<ApplyOk | ApplyErr> {
    const parsed = ApplyMenuTemplateSchema.safeParse(input);
    if (!parsed.success) return { error: 'Validatie-fout: ' + JSON.stringify(parsed.error.flatten().fieldErrors) };

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    const { templateId, offerteId, aantalGasten, basisPrijsPp, mode } = parsed.data;

    /* 1. Lees template + items + gerecht-info in één query — RLS-gated, dus als
       de user niet bij de template kan komen returnt PostgREST null. */
    const { data: tpl, error: tplErr } = await supabase
        .from('menu_templates')
        .select(`
            id, naam, basis_prijs_pp, aantal_gasten,
            menu_template_items (
                gerecht_id, gang_slug, volgorde,
                gerecht:gerechten ( id, naam, verkoopprijs )
            )
        `)
        .eq('id', templateId)
        .maybeSingle();

    if (tplErr) return { error: `Template ophalen mislukt: ${tplErr.message}` };
    if (!tpl) return { error: 'Menukaart niet gevonden (of geen toegang)' };

    /* 2. Lees bestaande offerte — RLS gate. */
    const { data: offerte, error: offErr } = await supabase
        .from('offertes')
        .select('id, items, menu_selectie, basis_prijs_pp, aantal_gasten')
        .eq('id', offerteId)
        .maybeSingle();

    if (offErr) return { error: `Offerte ophalen mislukt: ${offErr.message}` };
    if (!offerte) return { error: 'Offerte niet gevonden (of geen toegang)' };

    /* 3. Bouw item-regels. Defaults: gebruik de template-aantal-gasten en
       basis-prijs als de caller geen override stuurde. */
    const effectiveGasten = aantalGasten ?? Number(tpl.aantal_gasten ?? 40);
    const effectiveBasis  = basisPrijsPp  ?? Number(tpl.basis_prijs_pp ?? 0);

    type ApiItem = {
        gerecht_id?: string;
        gang_slug?: string;
        beschrijving: string;
        qty: number;
        prijs: number;
        btw_category: 'food_catering' | 'service_personnel';
    };

    const newItems: ApiItem[] = [];

    /* Basis-regel — één regel voor het hele menu, NIET per gerecht. Per-gerecht
       prijzen leven in de bibliotheek; deze regel reflecteert de menu-prijs pp
       die op de offerte staat. Identiek aan MenuWizard.handleComplete:223-229. */
    if (effectiveBasis > 0 && effectiveGasten > 0) {
        newItems.push({
            beschrijving: `${tpl.naam} — ${effectiveGasten} personen`,
            qty: effectiveGasten,
            prijs: effectiveBasis,
            btw_category: 'food_catering',
        });
    }

    /* Per-gerecht "tracing" regels met qty 0 en prijs 0 — onzichtbaar op de
       factuur maar bewaard voor marge-rapportage en PDF-output. Sam wil een
       100% af feature: PDF en portaal moeten weten welke gerechten erin
       zaten. We laten qty=0 en prijs=0 want de basis-regel bovenstaand
       dekt de financiën al. */
    for (const item of (tpl.menu_template_items as any[] ?? [])) {
        if (!item.gerecht_id || !item.gang_slug || !item.gerecht?.naam) continue;
        newItems.push({
            gerecht_id: item.gerecht_id,
            gang_slug: item.gang_slug,
            beschrijving: `· ${item.gerecht.naam}`,
            qty: 0,
            prijs: 0,
            btw_category: 'food_catering',
        });
    }

    /* 4. Regenereer menu_selectie JSONB voor backwards-compat (zelfde shape
       als de oude wizard). */
    const menuSelectie: Record<string, string[]> = {};
    for (const item of (tpl.menu_template_items as any[] ?? [])) {
        const gang = item.gang_slug;
        const naam = item.gerecht?.naam;
        if (!gang || !naam) continue;
        if (!menuSelectie[gang]) menuSelectie[gang] = [];
        menuSelectie[gang].push(naam);
    }

    /* 5. Merge met bestaande offerte-items. */
    const existingItems = Array.isArray(offerte.items) ? (offerte.items as any[]) : [];
    const mergedItems = mode === 'replace' ? newItems : [...existingItems, ...newItems];

    const { error: updErr } = await supabase
        .from('offertes')
        .update({
            items: mergedItems,
            menu_selectie: menuSelectie,
            basis_prijs_pp: effectiveBasis,
            aantal_gasten: effectiveGasten,
        })
        .eq('id', offerteId);

    if (updErr) return { error: `Offerte updaten mislukt: ${updErr.message}` };

    revalidatePath('/offertes');
    revalidatePath(`/offertes/${offerteId}`);
    revalidatePath(`/offertes/${offerteId}/view`);

    return {
        ok: true,
        itemsAdded: newItems.length,
        menuSelectie,
        basisPrijsPp: effectiveBasis,
        aantalGasten: effectiveGasten,
    };
}

/**
 * Wrapper rond DAL — gebruikt door de "Laad menukaart" Sheet in MenuWizard
 * en door de lijstpagina /gerechten/menukaarten.
 */
export async function listMenuTemplates(): Promise<{ data: MenuTemplateShallow[] } | { error: string }> {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    try {
        const data = await listMenuTemplatesShallow(supabase);
        return { data };
    } catch (e) {
        return { error: (e as Error).message };
    }
}
