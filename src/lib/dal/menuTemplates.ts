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
import { effectieveKostprijsPP } from '@/lib/gerecht-kosten';
import { computeMenuMargin, costSharePct, isCostOutlier } from '@/lib/menuMargin';

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
    total_cost_cents: number | null;   // componenten-rollup (hardste kostprijs-bron)
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
                    id, naam, gang_slug, kostprijs_pp, verkoopprijs, total_cost_cents, foto_url, allergenen
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
                total_cost_cents: row.gerecht.total_cost_cents != null ? Number(row.gerecht.total_cost_cents) : null,
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

/* ── Marge per menukaart (seizoensmenu doorrekenen) ─────────────────────────
   KANON (2026-07): marge op MENU-NIVEAU. Bij een vast menu (basis_prijs_pp, bv.
   €38,50 p.p.) verkoop je geen losse gerechten — je verdeelt één prijs. De echte
   marge = (menu-prijs − som van de gerecht-kostprijzen) / menu-prijs. Per gerecht
   tonen we de KOSTPRIJS als signaal (uitschieter), niet als los oordeel. De
   per-gerecht-eigen-prijs velden (verkoop/margePct/blendedPct) blijven als
   terugval bestaan maar zijn niet meer het hoofdoordeel. Zie src/lib/menuMargin.ts. */

export interface MenuMarginDish {
    gerecht_id: string;
    naam: string;
    gang_slug: string | null;
    kostPP: number;
    costSharePct: number | null;   // aandeel van dit gerecht in de menu-prijs
    costOutlier: boolean;          // weegt onevenredig zwaar (signaal, geen oordeel)
    // Legacy (per-gerecht eigen verkoopprijs) — behouden voor terugval:
    verkoop: number;
    margePct: number | null;       // null = geen eigen verkoopprijs ingevuld
    belowTarget: boolean;
}

export interface MenuMargins {
    dishes: MenuMarginDish[];
    // Menu-niveau (kanon): vaste menu-prijs vs som van de gerecht-kostprijzen.
    menuPricePP: number;
    hasMenuPrice: boolean;
    foodcostPP: number;
    menuMargePct: number | null;
    foodcostPct: number | null;
    menuOnTarget: boolean;
    target: number;                // doel-marge %
    // Legacy: geld-gewogen per-gerecht marge (terugval).
    blendedPct: number | null;
    missingPrice: string[];        // gerecht-namen zonder eigen verkoopprijs
}

export async function getMenuTemplateMargins(
    sb: SupabaseClient,
    templateId: number,
    target: number,
): Promise<MenuMargins> {
    // Vaste menu-prijs p.p. (basis_prijs_pp) — hierop rekenen we de menu-marge.
    const { data: tpl } = await sb
        .from('menu_templates')
        .select('basis_prijs_pp')
        .eq('id', templateId)
        .maybeSingle();
    const menuPricePP = Number((tpl as any)?.basis_prijs_pp) || 0;

    const { data, error } = await sb
        .from('menu_template_items')
        .select(`
            gerecht_id, gang_slug, volgorde,
            gerecht:gerechten ( id, naam, gang_slug, verkoopprijs, kostprijs_pp, total_cost_cents )
        `)
        .eq('menu_template_id', templateId)
        .order('gang_slug', { ascending: true })
        .order('volgorde', { ascending: true });
    if (error) throw new Error(`getMenuTemplateMargins: ${error.message}`);

    const dishes: MenuMarginDish[] = [];
    const missingPrice: string[] = [];
    let sumVerkoop = 0;
    let sumWinst = 0;

    for (const row of (data ?? []) as any[]) {
        const g = row.gerecht;
        if (!g) continue;
        const kostPP = effectieveKostprijsPP({ total_cost_cents: g.total_cost_cents, kostprijs_pp: g.kostprijs_pp });
        const verkoop = Number(g.verkoopprijs) || 0;
        const margePct = verkoop > 0 ? ((verkoop - kostPP) / verkoop) * 100 : null;
        if (verkoop <= 0) {
            missingPrice.push(g.naam);
        } else {
            sumVerkoop += verkoop;
            sumWinst += verkoop - kostPP;
        }
        dishes.push({
            gerecht_id: g.id,
            naam: g.naam,
            gang_slug: g.gang_slug ?? row.gang_slug ?? null,
            kostPP,
            costSharePct: costSharePct(kostPP, menuPricePP),
            costOutlier: isCostOutlier(kostPP, menuPricePP),
            verkoop,
            margePct,
            belowTarget: margePct != null && margePct < target,
        });
    }

    const menu = computeMenuMargin(dishes.map((d) => d.kostPP), menuPricePP, target);

    return {
        dishes,
        menuPricePP,
        hasMenuPrice: menuPricePP > 0,
        foodcostPP: menu.foodcostPP,
        menuMargePct: menu.margePct,
        foodcostPct: menu.foodcostPct,
        menuOnTarget: menu.onTarget,
        target,
        blendedPct: sumVerkoop > 0 ? (sumWinst / sumVerkoop) * 100 : null,
        missingPrice,
    };
}
