import { createServerSupabase } from '@/lib/supabase-server';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import type { VrijProduct } from '@/lib/winkel/vrij';
import WinkelVoorraadClient, { type WinkelData } from './_components/WinkelVoorraadClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel · Voorraad',
    description: 'Wat er in de winkel staat, wat besteld is en hoeveel pakketten er nog te maken zijn.',
};

/**
 * Winkelvoorraad (W2) — server-shell. Plan: docs/voorraad-bouwplan.md §3.
 *
 * Laadt producten, slots en artikelen via RLS, en in één aanroep de
 * bezetting (besteld, nog niet ingepakt) van alle producten:
 * winkel_vrij_producten, met dezelfde regel als de webshop
 * (winkel_bezetting_product) — zodat "beschikbaar" hier precies is wat de
 * webshop nog verkoopt.
 */
export default async function WinkelVoorraadPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
    const { product } = await searchParams;
    const supabase = await createServerSupabase();

    /* De organisatie van de ingelogde gebruiker (zoals in de actions); de
       proxy laat hier niemand zonder sessie door. */
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user
        ? await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
        : { data: null };
    const orgId = (lid?.organization_id as string | undefined) ?? null;

    const [{ data: producten }, { data: slots }, { data: artikelen }, { data: keuken }, { data: plek }, vrij] = await Promise.all([
        supabase.from('winkel_producten')
            .select('id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, inkoop_excl_cents, btw_pct, alcohol, voorraad, actief, drempel, bestel_hoeveelheid, ean, tht, laatste_beweging_at, inventory_id, foto_url')
            .order('type').order('naam'),
        supabase.from('winkel_artikel_slots')
            .select('id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id, wisselbaar, alternatieven')
            .order('volgorde'),
        supabase.from('winkel_artikelen').select('id, naam, slug, actief, telt').order('naam'),
        supabase.from('inventory').select('id, naam, unit, current_stock').order('naam').limit(2000),
        supabase.from('voorraad_plekken').select('id, naam').eq('soort', 'winkel').maybeSingle(),
        orgId ? maakSupabaseStore(supabase).laadVrij(orgId) : Promise.resolve([] as VrijProduct[]),
    ]);

    const bezet = new Map<string, number>(vrij.map((v) => [v.product_id, v.gereserveerd]));

    const data: WinkelData = {
        plekNaam: (plek?.naam as string | undefined) ?? 'Winkel',
        producten: (producten ?? []).map((p) => ({
            id: p.id as string,
            naam: p.naam as string,
            type: p.type as string,
            eenheid: p.eenheid as 'stuk' | 'gram',
            prijs_per: Number(p.prijs_per),
            winkelprijs_incl_cents: p.winkelprijs_incl_cents as number | null,
            inkoop_excl_cents: p.inkoop_excl_cents as number | null,
            btw_pct: p.btw_pct as number,
            alcohol: !!p.alcohol,
            actief: !!p.actief,
            voorraad: p.voorraad == null ? null : Number(p.voorraad),
            voorraad_bezet: p.voorraad == null ? undefined : bezet.get(p.id as string) ?? 0,
            drempel: p.drempel == null ? null : Number(p.drempel),
            bestel_hoeveelheid: p.bestel_hoeveelheid == null ? null : Number(p.bestel_hoeveelheid),
            ean: (p.ean as string | null) ?? null,
            tht: (p.tht as string | null) ?? null,
            laatste_beweging_at: (p.laatste_beweging_at as string | null) ?? null,
            inventory_id: (p.inventory_id as number | null) ?? null,
            foto_url: (p.foto_url as string | null) ?? null,
        })),
        slots: (slots ?? []).map((s) => ({ ...s, hoeveelheid: Number(s.hoeveelheid), alternatieven: s.alternatieven ?? [] })) as WinkelData['slots'],
        artikelen: (artikelen ?? []) as WinkelData['artikelen'],
        keuken: (keuken ?? []).map((k) => ({ id: Number(k.id), naam: k.naam as string, unit: (k.unit as string | null) ?? null, current_stock: k.current_stock == null ? null : Number(k.current_stock) })),
    };

    return <WinkelVoorraadClient data={data} openProductId={product ?? null} />;
}
