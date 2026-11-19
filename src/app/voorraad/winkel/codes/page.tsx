import { createServerSupabase } from '@/lib/supabase-server';
import { krijgtStreepjescode, productenOpKassa, type CodeProductRij, type KassaArtikel, type KassaSlot } from '@/lib/winkel/streepjescodes';
import CodesClient, { type CodeProduct } from './CodesClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Streepjescodes koppelen · Winkel',
    description: 'Tik een product aan en scan de streepjescode, zodat de kassa hem herkent.',
};

/**
 * Streepjescodes koppelen (kernding Product). Op de kassacomputer met de
 * USB-scanner: tik een product, scan, en de keuze springt naar het volgende.
 * Opslaan via koppelStreepjescode (../actions.ts) → lib/winkel/eanKoppelen.ts.
 * Alleen losse producten: op gewicht en pakjes met een prijssticker hebben
 * geen EAN (lib/winkel/streepjescodes.ts).
 */
export default async function StreepjescodesPage() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user
        ? await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
        : { data: null };
    const orgId = (lid?.organization_id as string | undefined) ?? null;
    if (!orgId) return <CodesClient producten={[]} />;

    const [{ data: producten }, { data: artikelen }, { data: slots }] = await Promise.all([
        supabase.from('winkel_producten').select('id, naam, type, ean, actief, eenheid, binnen_per_sticker, prijscode_nr')
            .eq('organization_id', orgId).order('type').order('naam'),
        supabase.from('winkel_artikelen').select('id, kanalen, prijs_cents').eq('organization_id', orgId),
        supabase.from('winkel_artikel_slots').select('artikel_id, standaard_product_id, hoeveelheid'),
    ]);

    const opKassa = productenOpKassa((artikelen ?? []) as KassaArtikel[], (slots ?? []) as KassaSlot[]);
    const lijst: CodeProduct[] = ((producten ?? []) as CodeProductRij[])
        .filter(krijgtStreepjescode)
        .map((p) => ({ id: p.id, naam: p.naam, type: p.type, ean: p.ean, opKassa: opKassa.has(p.id) }));

    return <CodesClient producten={lijst} />;
}
