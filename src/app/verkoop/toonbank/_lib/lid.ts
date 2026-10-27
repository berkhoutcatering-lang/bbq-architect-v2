import { createServerSupabase } from '@/lib/supabase-server';

/**
 * De ingelogde gebruiker en zijn organisatie (organization_members), voor de
 * Toonbank-schermen. Lezen gaat met de gebruikersclient en RLS; de
 * organisatie komt nooit uit de browser.
 */
export async function toonbankLid() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: lid } = user
        ? await supabase.from('organization_members').select('organization_id, role').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle()
        : { data: null };
    return {
        supabase,
        user,
        orgId: (lid?.organization_id as string | undefined) ?? null,
        isAdmin: lid?.role === 'Admin',
    };
}
