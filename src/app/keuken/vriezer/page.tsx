import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import { laadVriezer } from '@/lib/keuken/vriezer';
import VriezerClient from './VriezerClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Keuken · Vriezer',
    description: 'Wat aan de kassa is ingevroren en nog niet gebruikt, oudste bovenaan.',
};

/**
 * De vriezerlijst: pakjes van de slager en stukken kaas die aan de kassa zijn ingevroren
 * (Toonbank, Weggooien of invriezen). Oudste bovenaan; afvinken als je het gebruikt.
 */
export default async function VriezerPage() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');
    const { data: lid } = await supabase.from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!lid?.organization_id) redirect('/login');
    const vriezer = await laadVriezer(supabase, lid.organization_id as string);
    const vandaag = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(new Date());
    return <VriezerClient vriezer={vriezer} vandaag={vandaag} />;
}
