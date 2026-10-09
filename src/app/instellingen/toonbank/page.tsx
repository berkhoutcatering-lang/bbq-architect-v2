import { createServerSupabase } from '@/lib/supabase-server';
import type { TabletRij } from '@/lib/toonbank/beheer';
import ToonbankBeheer, { type MedewerkerRij } from './_components/ToonbankBeheer';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Toonbank · Instellingen',
    description: 'Tablets koppelen en intrekken, en wie op de Toonbank mag inloggen.',
};

/**
 * Instellingen → Toonbank (BA-7a). Server-shell: leest tablets en personeel
 * via RLS met de gebruikersclient. De hashes van sleutel, koppelcode en
 * inlogcode zijn voor ingelogde gebruikers niet leesbaar (kolomrechten); van
 * de inlogcode komt alleen "ingesteld ja/nee" (toonbank_inlogcodes_ingesteld,
 * review M2 K4).
 */
export default async function ToonbankInstellingenPage() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user
        ? await supabase.from('organization_members').select('organization_id, role').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
        : { data: null };
    const orgId = (lid?.organization_id as string | undefined) ?? null;
    const isAdmin = lid?.role === 'Admin';

    const [{ data: tablets }, { data: personeel }, { data: inst }, { data: codes }] = orgId
        ? await Promise.all([
            supabase.from('toonbank_apparaten')
                .select('id, naam, code, locatie, sleutel_prefix, gekoppeld_at, koppelcode_geldig_tot, koppelpogingen, laatst_gezien_at, app_versie, contract_versie, hoogste_volgnummer_gemeld, bevestigd_tot_volgnummer, ingetrokken_at, ingetrokken_reden')
                .eq('organization_id', orgId)
                .order('code'),
            supabase.from('personeel')
                .select('id, naam, functie, actief, toonbank_rol, kds_pin_lockout_until')
                .eq('organization_id', orgId)
                .order('naam'),
            supabase.from('winkel_instellingen')
                .select('toonbank_alcohol_toegestaan, toonbank_contant_aan, toonbank_contant_limiet_cents')
                .eq('organization_id', orgId)
                .maybeSingle(),
            supabase.rpc('toonbank_inlogcodes_ingesteld', { p_org: orgId }),
        ])
        : [{ data: [] }, { data: [] }, { data: null }, { data: [] }];

    const metCode = new Set(((codes ?? []) as { personeel_id: string; ingesteld: boolean }[]).filter((c) => c.ingesteld).map((c) => c.personeel_id));
    const medewerkers: MedewerkerRij[] = (personeel ?? []).map((p) => ({
        id: p.id as string,
        naam: p.naam as string,
        functie: (p.functie as string | null) ?? null,
        actief: !!p.actief,
        toonbank_rol: p.toonbank_rol === 'eigenaar' || p.toonbank_rol === 'medewerker' ? p.toonbank_rol : null,
        heeft_inlogcode: metCode.has(p.id as string),
        geblokkeerd_tot: (p.kds_pin_lockout_until as string | null) ?? null,
    }));

    return (
        <ToonbankBeheer
            tablets={((tablets ?? []) as TabletRij[]).map((t) => ({ ...t, hoogste_volgnummer_gemeld: Number(t.hoogste_volgnummer_gemeld), bevestigd_tot_volgnummer: Number(t.bevestigd_tot_volgnummer) }))}
            medewerkers={medewerkers}
            isAdmin={isAdmin}
            instellingen={inst ? {
                alcohol_toegestaan: !!inst.toonbank_alcohol_toegestaan,
                contant_aan: inst.toonbank_contant_aan !== false,
                contant_limiet_cents: Number(inst.toonbank_contant_limiet_cents ?? 300000),
            } : null}
        />
    );
}
