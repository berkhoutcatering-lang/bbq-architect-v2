import { createServerSupabase } from '@/lib/supabase-server';
import AfwijkingClient, { type AfwijkItem, type MaandRegel } from './AfwijkingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Afwijking · Voorraad',
    description: 'Iets gaat weg zonder verkoop: eigen gebruik, proeven, kapot, over datum, keuken. Twee tikken.',
};

/**
 * Afwijkingen (W5). Winkel én makerij in één lijst: bovenaan wat je het
 * laatst hebt vastgelegd, daaronder alles. Plek en inkoopwaarde vult de
 * database in. Onderaan de maandtotalen per reden, uit voorraad_afwijkingen_maand.
 */
export default async function AfwijkingPage() {
    const supabase = await createServerSupabase();
    const maandBegin = new Date();
    maandBegin.setDate(1);
    const maand = `${maandBegin.getFullYear()}-${String(maandBegin.getMonth() + 1).padStart(2, '0')}-01`;

    const [{ data: winkel }, { data: keuken }, { data: recent }, { data: totalen }] = await Promise.all([
        supabase.from('winkel_producten').select('id, naam, type, eenheid, voorraad').not('voorraad', 'is', null).eq('actief', true).order('naam'),
        supabase.from('inventory').select('id, naam, categorie, unit, current_stock').order('naam').limit(2000),
        supabase.from('voorraad_logboek').select('plek, item_id, created_at').eq('type', 'afwijking').order('created_at', { ascending: false }).limit(40),
        supabase.from('voorraad_afwijkingen_maand').select('plek, reden, regels, waarde_cents, zonder_prijs').eq('maand', maand),
    ]);

    const items: AfwijkItem[] = [
        ...(winkel ?? []).map((p) => ({
            bron: 'winkel' as const, id: p.id as string, naam: p.naam as string, groep: p.type as string,
            eenheid: p.eenheid === 'gram' ? 'g' : 'st.', stap: p.eenheid === 'gram' ? 50 : 1, voorraad: Number(p.voorraad),
        })),
        ...(keuken ?? []).map((k) => ({
            bron: 'keuken' as const, id: Number(k.id), naam: k.naam as string, groep: (k.categorie as string | null) ?? 'keuken',
            eenheid: (k.unit as string | null) ?? '', stap: 1, voorraad: k.current_stock == null ? null : Number(k.current_stock),
        })),
    ];

    const gezien = new Set<string>();
    const recentSleutels: string[] = [];
    for (const r of recent ?? []) {
        const s = `${r.plek === 'winkel' ? 'winkel' : 'keuken'}:${r.item_id}`;
        if (gezien.has(s)) continue;
        gezien.add(s);
        recentSleutels.push(s);
        if (recentSleutels.length >= 6) break;
    }

    return <AfwijkingClient items={items} recent={recentSleutels} maand={(totalen ?? []) as MaandRegel[]} />;
}
