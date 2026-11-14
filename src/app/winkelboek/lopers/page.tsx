import { datumNL } from '@/lib/winkel/afdelingen';
import { laadLoperInvoer } from '@/lib/winkelboek/laden';
import { deelLopersIn } from '@/lib/winkelboek/lopers';
import LopersScherm from '../_components/LopersScherm';
import { winkelboekLid } from '../_lib/lid';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Boekhouding winkel · Hardlopers',
    description: 'Wat hard loopt, traag loopt of stilligt.',
};

export default async function LopersPagina({ searchParams }: { searchParams: Promise<{ groep?: string }> }) {
    const { supabase, orgId } = await winkelboekLid();
    if (!orgId) return <p style={{ fontSize: 13, color: 'var(--muted)' }}>Je bent geen lid van een organisatie.</p>;

    const { groep } = await searchParams;
    const nu = new Date();
    const invoer = await laadLoperInvoer(supabase, orgId, nu);

    return <LopersScherm lopers={deelLopersIn(invoer.producten, invoer.dagen)} groep={groep} vandaag={datumNL(nu)} fout={invoer.fout} />;
}
