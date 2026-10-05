import { createServerSupabase } from '@/lib/supabase-server';
import WinkelTellenClient, { type TelProduct } from './WinkelTellenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Winkel tellen · Voorraad',
    description: 'Loop met je telefoon langs de schappen en tel de winkel.',
};

/**
 * Winkel tellen (W2) — zoals /voorraad/nulmeting, maar voor de winkel. Elke
 * telling is een logboekregel via winkel_muteer_voorraad; het verschil met het
 * logboek (manko of meer geteld) rekent de database uit.
 */
export default async function WinkelTellenPage() {
    const supabase = await createServerSupabase();
    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);

    const [{ data: producten }, { data: tellingen }] = await Promise.all([
        supabase.from('winkel_producten').select('id, naam, type, eenheid, voorraad, actief').order('naam'),
        supabase.from('winkel_voorraad_mutaties').select('winkel_product_id, created_at').eq('type', 'telling').gte('created_at', vandaag.toISOString()),
    ]);

    const vandaagGeteld = new Set((tellingen ?? []).map((t) => t.winkel_product_id as string));
    const lijst: TelProduct[] = (producten ?? []).filter((p) => p.actief).map((p) => ({
        id: p.id as string,
        naam: p.naam as string,
        type: p.type as string,
        eenheid: p.eenheid as 'stuk' | 'gram',
        voorraad: p.voorraad == null ? null : Number(p.voorraad),
        vandaagGeteld: vandaagGeteld.has(p.id as string),
    }));

    return <WinkelTellenClient producten={lijst} />;
}
