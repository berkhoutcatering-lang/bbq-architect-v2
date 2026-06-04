/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu-templates DAL — Stel-menu-samen v2.
 *
 * Eén plek om reads van menu_templates + menu_template_items te bundelen,
 * met embedded PostgREST-join naar gerechten zodat de UI geen N+1 doet.
 *
 * Reads (RLS-gated, supabase user-client):
 *   - listMenuTemplatesShallow: voor de lijstpagina + wizard-picker
 *   - getMenuTemplate: voor de composer (header + items + bijbehorende dish-info)
 *
 * Writes leven niet hier — die gaan via de RPC `rpc_upsert_menu_template`
 * aangeroepen vanuit de Server Action (atomair, voorkomt half-geschreven state).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface MenuTemplateShallow {
    id: number;
    naam: string;
    beschrijving: string | null;
    basis_prijs_pp: number;
    aantal_gasten: number;
    is_default: boolean;
    actief: boolean;
    item_count: number;
    updated_at: string;
}

export interface MenuTemplateGerechtRef {
    id: string;            // gerechten.id (UUID)
    naam: string;
    gang_slug: string | null;
    kostprijs_pp: number | null;
    verkoopprijs: number | null;
    foto_url: string | null;
    allergenen: string[] | null;
}

export interface MenuTemplateItem {
    id: string;            // menu_template_items.id (UUID)
    gerecht_id: string;
    gang_slug: string;
    volgorde: number;
    gerecht: MenuTemplateGerechtRef | null;
}

export interface MenuTemplateWithItems extends MenuTemplateShallow {
    items: MenuTemplateItem[];
    /* Legacy JSONB shape — alleen om "ongekoppeld" badges te kunnen tonen voor
       dish-namen die de backfill niet kon matchen. */
    menu_selectie_legacy: Record<string, string[]> | null;
}

/**
 * Lijst-pagina + wizard-picker. Returnt alleen header-info plus item_count.
 * Gebruikt PostgREST `head:true` count voor de teller — geen N+1.
 */
export async function listMenuTemplatesShallow(
    sb: SupabaseClient,
): Promise<MenuTemplateShallow[]> {
    const { data, error } = await sb
        .from('menu_templates')
        .select(`
            id, naam, beschrijving, basis_prijs_pp, aantal_gasten,
            is_default, actief, updated_at,
            menu_template_items(count)
        `)
        .eq('actief', true)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false });

    if (error) throw new Error(`listMenuTemplatesShallow: ${error.message}`);

    return (data ?? []).map((row: any) => ({
        id: row.id,
        naam: row.naam,
        beschrijving: row.beschrijving,
        basis_prijs_pp: Number(row.basis_prijs_pp ?? 0),
        aantal_gasten: Number(row.aantal_gasten ?? 40),
        is_default: !!row.is_default,
        actief: !!row.actief,
        item_count: row.menu_template_items?.[0]?.count ?? 0,
        updated_at: row.updated_at,
    }));
}

/**
 * Volledige template-data voor de composer. Eén query met embedded join naar
 * gerechten — voorkomt N+1 bij rendering van 20+ pills.
 */
export async function getMenuTemplate(
    sb: SupabaseClient,
    id: number,
): Promise<MenuTemplateWithItems | null> {
    const { data, error } = await sb
        .from('menu_templates')
        .select(`
            id, naam, beschrijving, basis_prijs_pp, aantal_gasten,
            is_default, actief, updated_at, menu_selectie,
            menu_template_items (
                id, gerecht_id, gang_slug, volgorde,
                gerecht:gerechten (
                    id, naam, gang_slug, kostprijs_pp, verkoopprijs, foto_url, allergenen
                )
            )
        `)
        .eq('id', id)
        .order('gang_slug', { foreignTable: 'menu_template_items', ascending: true })
        .order('volgorde', { foreignTable: 'menu_template_items', ascending: true })
        .maybeSingle();

    if (error) throw new Error(`getMenuTemplate: ${error.message}`);
    if (!data) return null;

    const items: MenuTemplateItem[] = (data.menu_template_items ?? []).map((row: any) => ({
        id: row.id,
        gerecht_id: row.gerecht_id,
        gang_slug: row.gang_slug,
        volgorde: Number(row.volgorde ?? 0),
        gerecht: row.gerecht
            ? {
                id: row.gerecht.id,
                naam: row.gerecht.naam,
                gang_slug: row.gerecht.gang_slug ?? null,
                kostprijs_pp: row.gerecht.kostprijs_pp != null ? Number(row.gerecht.kostprijs_pp) : null,
                verkoopprijs: row.gerecht.verkoopprijs != null ? Number(row.gerecht.verkoopprijs) : null,
                foto_url: row.gerecht.foto_url ?? null,
                allergenen: row.gerecht.allergenen ?? null,
            }
            : null,
    }));

    /* Parseer legacy JSONB shape voor "ongekoppeld" detection */
    let menu_selectie_legacy: Record<string, string[]> | null = null;
    if (data.menu_selectie && typeof data.menu_selectie === 'object' && !Array.isArray(data.menu_selectie)) {
        menu_selectie_legacy = {};
        for (const [gangSlug, value] of Object.entries(data.menu_selectie as Record<string, unknown>)) {
            if (Array.isArray(value)) {
                menu_selectie_legacy[gangSlug] = value.filter((v): v is string => typeof v === 'string');
            }
        }
    }

    return {
        id: data.id,
        naam: data.naam,
        beschrijving: data.beschrijving ?? null,
        basis_prijs_pp: Number(data.basis_prijs_pp ?? 0),
        aantal_gasten: Number(data.aantal_gasten ?? 40),
        is_default: !!data.is_default,
        actief: !!data.actief,
        item_count: items.length,
        updated_at: data.updated_at,
        items,
        menu_selectie_legacy,
    };
}

/**
 * Detect dish-namen uit legacy menu_selectie JSONB die de backfill niet kon
 * matchen — UI kan deze als "ongekoppeld" badge tonen zodat Sam ze handmatig
 * kan vervangen door een gerecht uit de bibliotheek.
 */
export function findUnlinkedDishNames(template: MenuTemplateWithItems): Array<{ gang_slug: string; naam: string }> {
    if (!template.menu_selectie_legacy) return [];

    const linked = new Set(template.items.map(it => `${it.gang_slug}::${(it.gerecht?.naam ?? '').toLowerCase().trim()}`));
    const unlinked: Array<{ gang_slug: string; naam: string }> = [];

    for (const [gangSlug, names] of Object.entries(template.menu_selectie_legacy)) {
        for (const naam of names) {
            const key = `${gangSlug}::${naam.toLowerCase().trim()}`;
            if (!linked.has(key)) unlinked.push({ gang_slug: gangSlug, naam });
        }
    }
    return unlinked;
}
