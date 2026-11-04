import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { afdelingVan } from '@/lib/winkel/afdelingen';
import { laadWinkelOverzicht } from '@/lib/winkel/winkelOverzicht';
import WinkelProductenClient from './WinkelProductenClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Leverancier · Winkelproducten',
    description: 'Welke winkelproducten deze leverancier levert.',
};

/** Wat deze leverancier aan de winkel levert. De bestellijst zet die producten onder deze leverancier. */
export default async function LeverancierWinkelPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createServerSupabase();
    const [o, { data: lev }] = await Promise.all([
        laadWinkelOverzicht(supabase),
        supabase.from('leveranciers').select('id, naam').eq('id', Number(id)).maybeSingle(),
    ]);
    if (!lev) notFound();
    const plek = afdelingVan(o.plaatsingen, new Set(o.afdelingen.map((a) => a.id)));
    const naamVan = new Map(o.leveranciers.map((l) => [l.id, l.naam]));
    return (
        <WinkelProductenClient
            leverancier={{ id: Number(lev.id), naam: lev.naam as string }}
            afdelingen={o.afdelingen}
            producten={o.producten.filter((p) => p.actief).map((p) => ({
                id: p.id, naam: p.naam, foto: p.foto, actief: true, verkocht28: 0, afdeling_id: plek.get(p.id) ?? null,
                leverancier_id: p.leverancier_id, leverancier: p.leverancier_id == null ? null : naamVan.get(p.leverancier_id) ?? null,
            }))}
        />
    );
}
