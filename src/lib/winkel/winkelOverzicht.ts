/**
 * Laden voor de werkruimte Winkel (/winkel): afdelingen, plaatsingen,
 * producten met hun toonbankartikel, de verkoop van de laatste 8 weken en de
 * stuks en partijen. Via RLS met de sessie van de gebruiker.
 *
 * Elke bron mag ontbreken (migratie nog niet gedraaid): dan een lege lijst en
 * een vlag in `ontbreekt`, nooit een 500. Rekenen doet ./afdelingen.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fotoUrl } from '@/lib/toonbank/vragen';
import { WINKEL_RUIMTE } from './plekken';
import type { Afdeling, BonRegelRij, PlaatsingRij, StukRij, WinkelProductRij } from './afdelingen';

export const VERKOOP_DAGEN = 56;

export interface WinkelArtikelKort {
    id: string;
    naam: string;
    product_id: string | null;
    prijs_cents: number | null;
    kanalen: string[];
    actief: boolean;
    verkoop_per: 'stuk' | 'kg';
    kiloprijs_cents: number | null;
    sticker_plu: number | null;
}

export interface PartijRij {
    id: string;
    product_id: string;
    leverancier_id: number | null;
    leverancier: string | null;
    geleverd_op: string;
    productiedatum: string | null;
    tht: string;
    bron: string;
    afgesloten_at: string | null;
}

export interface WinkelOverzicht {
    ruimteId: string | null;
    afdelingen: Afdeling[];
    plaatsingen: (PlaatsingRij & { id: string })[];
    producten: (WinkelProductRij & { binnen_per_sticker: boolean; leverancier_id: number | null; winkelprijs_incl_cents: number | null })[];
    artikelen: WinkelArtikelKort[];
    regels: BonRegelRij[];
    stuks: StukRij[];
    partijen: PartijRij[];
    leveranciers: { id: number; naam: string }[];
    ontbreekt: { plekken: boolean; stuks: boolean; verkoop: boolean };
}

const NOG_NIET = new Set(['42703', '42P01', 'PGRST200', 'PGRST204', 'PGRST205']);

export async function laadWinkelOverzicht(supabase: SupabaseClient, nu: Date = new Date()): Promise<WinkelOverzicht> {
    const vanaf = new Date(nu.getTime() - VERKOOP_DAGEN * 86_400_000).toISOString();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const [plekken, plaatsingen, producten, artikelen, slots, regels, stuks, partijen, leveranciers] = await Promise.all([
        supabase.from('opslag_locaties').select('id, code, naam, soort, parent_id, volgorde').order('volgorde'),
        supabase.from('winkel_plaatsingen').select('id, product_id, locatie_id, rol').eq('rol', 'verkoop'),
        supabase.from('winkel_producten').select('id, naam, type, actief, eenheid, voorraad, tht, foto, foto_url, binnen_per_sticker, leverancier_id, winkelprijs_incl_cents').order('naam'),
        supabase.from('winkel_artikelen').select('id, naam, prijs_cents, kanalen, actief, verkoop_per, kiloprijs_cents, sticker_plu').order('naam'),
        supabase.from('winkel_artikel_slots').select('artikel_id, standaard_product_id'),
        supabase.from('toonbank_bon_regels')
            .select('aantal, bedrag_cents, onderdelen, toonbank_bonnen!inner(gebeurd_at, status)')
            .eq('soort', 'verkoop')
            .eq('toonbank_bonnen.status', 'afgerond')
            .gte('toonbank_bonnen.gebeurd_at', vanaf)
            .limit(20000),
        supabase.from('winkel_stuks').select('id, winkel_product_id, code, tht, status, gewicht_g, prijs_cents, partij_id').eq('status', 'op_voorraad').order('tht').limit(5000),
        supabase.from('winkel_partijen').select('id, winkel_product_id, leverancier_id, geleverd_op, productiedatum, tht, bron, afgesloten_at, leveranciers(naam)')
            .is('afgesloten_at', null).order('tht').limit(500),
        supabase.from('leveranciers').select('id, naam').is('archived_at', null).order('naam'),
    ]);

    const ontbreekt = {
        plekken: !!plekken.error && NOG_NIET.has(String(plekken.error.code)) || !!plaatsingen.error,
        stuks: !!stuks.error || !!partijen.error,
        verkoop: !!regels.error,
    };
    for (const [naam, r] of Object.entries({ plekken, plaatsingen, producten, artikelen, slots, regels, stuks, partijen, leveranciers })) {
        if (r.error && !NOG_NIET.has(String(r.error.code))) console.error(`[winkel] ${naam} laden mislukt:`, r.error.message);
    }

    const allePlekken = (plekken.error ? [] : plekken.data ?? []) as { id: string; code: string; naam: string; soort: string; parent_id: string | null; volgorde: number }[];
    const ruimte = allePlekken.find((p) => p.code === WINKEL_RUIMTE.code) ?? null;
    const afdelingen: Afdeling[] = ruimte
        ? allePlekken.filter((p) => p.parent_id === ruimte.id).map((p) => ({ id: p.id, code: p.code, naam: p.naam, volgorde: p.volgorde }))
        : [];

    /* Eén-slot-artikelen: het product waar ze bij horen. */
    const slotsPer = new Map<string, (string | null)[]>();
    for (const s of (slots.data ?? []) as { artikel_id: string; standaard_product_id: string | null }[]) {
        const l = slotsPer.get(s.artikel_id);
        if (l) l.push(s.standaard_product_id); else slotsPer.set(s.artikel_id, [s.standaard_product_id]);
    }

    return {
        ruimteId: ruimte?.id ?? null,
        afdelingen,
        plaatsingen: ((plaatsingen.error ? [] : plaatsingen.data) ?? []).map((p) => ({ id: p.id as string, product_id: p.product_id as string, locatie_id: p.locatie_id as string })),
        producten: ((producten.data ?? []) as Record<string, unknown>[]).map((p) => ({
            id: String(p.id),
            naam: String(p.naam),
            type: String(p.type),
            actief: !!p.actief,
            eenheid: p.eenheid === 'gram' ? 'gram' : 'stuk',
            voorraad: p.voorraad == null ? null : Number(p.voorraad),
            tht: (p.tht as string | null) ?? null,
            foto: fotoUrl(supabaseUrl, p.foto, (p.foto_url as string | null) ?? null),
            binnen_per_sticker: p.binnen_per_sticker === true,
            leverancier_id: p.leverancier_id == null ? null : Number(p.leverancier_id),
            winkelprijs_incl_cents: p.winkelprijs_incl_cents == null ? null : Number(p.winkelprijs_incl_cents),
        })),
        artikelen: ((artikelen.data ?? []) as Record<string, unknown>[]).map((a) => {
            const s = slotsPer.get(String(a.id)) ?? [];
            return {
                id: String(a.id),
                naam: String(a.naam),
                product_id: s.length === 1 ? s[0] ?? null : null,
                prijs_cents: a.prijs_cents == null ? null : Number(a.prijs_cents),
                kanalen: (a.kanalen as string[] | null) ?? [],
                actief: !!a.actief,
                verkoop_per: a.verkoop_per === 'kg' ? 'kg' : 'stuk',
                kiloprijs_cents: a.kiloprijs_cents == null ? null : Number(a.kiloprijs_cents),
                sticker_plu: a.sticker_plu == null ? null : Number(a.sticker_plu),
            };
        }),
        regels: ((regels.error ? [] : regels.data) ?? []).map((r) => {
            const bon = (Array.isArray(r.toonbank_bonnen) ? r.toonbank_bonnen[0] : r.toonbank_bonnen) as { gebeurd_at: string } | null;
            return {
                aantal: Number(r.aantal ?? 0),
                bedrag_cents: Number(r.bedrag_cents ?? 0),
                op: bon?.gebeurd_at ?? vanaf,
                onderdelen: (r.onderdelen as { product_id: string }[] | null) ?? null,
            };
        }),
        stuks: ((stuks.error ? [] : stuks.data) ?? []).map((s) => ({
            id: String(s.id), product_id: String(s.winkel_product_id), code: String(s.code), tht: String(s.tht), status: String(s.status),
            gewicht_g: Number(s.gewicht_g), prijs_cents: Number(s.prijs_cents), partij_id: (s.partij_id as string | null) ?? null,
        })),
        partijen: ((partijen.error ? [] : partijen.data) ?? []).map((p) => {
            const lev = (Array.isArray(p.leveranciers) ? p.leveranciers[0] : p.leveranciers) as { naam?: string } | null;
            return {
                id: String(p.id), product_id: String(p.winkel_product_id), leverancier_id: p.leverancier_id == null ? null : Number(p.leverancier_id),
                leverancier: lev?.naam ?? null, geleverd_op: String(p.geleverd_op), productiedatum: (p.productiedatum as string | null) ?? null,
                tht: String(p.tht), bron: String(p.bron), afgesloten_at: (p.afgesloten_at as string | null) ?? null,
            };
        }),
        leveranciers: ((leveranciers.data ?? []) as { id: number; naam: string }[]).map((l) => ({ id: Number(l.id), naam: String(l.naam) })),
        ontbreekt,
    };
}
