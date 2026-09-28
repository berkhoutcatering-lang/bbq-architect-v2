import { createServerSupabase } from '@/lib/supabase-server';
import OntvangstStart, { type ConceptRij, type OrderRij } from './OntvangstStart';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Ontvangst · Voorraad',
    description: 'Voorraad toevoegen op elke manier: foto, pdf, barcode, inkooporder of met de hand. Altijd eerst controleren.',
};

/**
 * Voorraad toevoegen (W2b) — het beginscherm. Kies hoe; alles eindigt in het
 * controlescherm /voorraad/ontvangst/[id]. Plan: docs/voorraad-bouwplan.md W2b.
 */
export default async function OntvangstPage({ searchParams }: { searchParams: Promise<{ factuur?: string }> }) {
    const { factuur } = await searchParams;
    const supabase = await createServerSupabase();
    const [{ data: concepten }, { data: orders }, { data: recent }] = await Promise.all([
        supabase.from('voorraad_invoer').select('id, bron, leverancier_naam, factuurnummer, datum, created_at, voorraad_invoer_regels(count)')
            .eq('status', 'concept').order('created_at', { ascending: false }).limit(30),
        supabase.from('concept_inkoop_orders').select('id, sent_at, window_start, leveranciers(naam), inkoop_order_lines(count)')
            .eq('status', 'sent').order('sent_at', { ascending: false }).limit(20),
        supabase.from('voorraad_invoer').select('id, bron, leverancier_naam, factuurnummer, datum, created_at, geboekt_at, voorraad_invoer_regels(count)')
            .eq('status', 'geboekt').order('geboekt_at', { ascending: false }).limit(10),
    ]);
    const telling = (x: unknown) => Number((x as { count: number }[] | null)?.[0]?.count ?? 0);
    const rij = (c: Record<string, unknown>): ConceptRij => ({
        id: c.id as string, bron: c.bron as string, leverancier: (c.leverancier_naam as string | null) ?? null,
        factuurnummer: (c.factuurnummer as string | null) ?? null, datum: (c.datum as string | null) ?? null,
        wanneer: ((c.geboekt_at ?? c.created_at) as string), regels: telling(c.voorraad_invoer_regels),
    });
    return (
        <OntvangstStart
            factuurOpen={factuur === '1'}
            concepten={(concepten ?? []).map(rij)}
            recent={(recent ?? []).map(rij)}
            orders={(orders ?? []).map((o): OrderRij => ({
                id: o.id as string,
                leverancier: (o.leveranciers as unknown as { naam: string } | null)?.naam ?? 'Leverancier onbekend',
                verstuurd: (o.sent_at as string | null) ?? null,
                regels: telling(o.inkoop_order_lines),
            }))}
        />
    );
}
