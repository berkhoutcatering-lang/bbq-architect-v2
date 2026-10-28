import { createServerSupabase } from '@/lib/supabase-server';
import { naarCadeaubonRijen, type CadeaubonRij } from '@/lib/toonbank/cadeaubonnen';
import CadeaubonnenBeheer from './_components/CadeaubonnenBeheer';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Cadeaubonnen · Toonbank · Instellingen',
    description: 'Cadeaubonnen uitgeven, blokkeren en het saldo bekijken, en betalen met een cadeaubon op de Toonbank aanzetten.',
};

/**
 * Instellingen → Toonbank → Cadeaubonnen (contract toonbank/v1 1.2). Server-shell: leest via de
 * gebruikersclient. De lijst komt uit cadeaubonnen_overzicht (alleen een Admin; de code is als
 * geld). Bestaat de migratie 20261029120000 nog niet, dan zegt de pagina dat, zonder fout.
 */
export default async function CadeaubonnenPage() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user
        ? await supabase.from('organization_members').select('organization_id, role').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
        : { data: null };
    const orgId = (lid?.organization_id as string | undefined) ?? null;
    const isAdmin = lid?.role === 'Admin';

    let rijen: CadeaubonRij[] = [];
    let aan = false;
    let gemigreerd = true;
    if (orgId && isAdmin) {
        const [lijst, inst] = await Promise.all([
            supabase.rpc('cadeaubonnen_overzicht', { p_org: orgId }),
            supabase.from('winkel_instellingen').select('toonbank_cadeaubon_aan').eq('organization_id', orgId).maybeSingle(),
        ]);
        if (lijst.error || inst.error) gemigreerd = false;
        rijen = naarCadeaubonRijen(lijst.data);
        aan = (inst.data as { toonbank_cadeaubon_aan?: unknown } | null)?.toonbank_cadeaubon_aan === true;
    }

    return <CadeaubonnenBeheer rijen={rijen} aan={aan} isAdmin={isAdmin} gemigreerd={gemigreerd} />;
}
