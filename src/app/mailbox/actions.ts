/**
 * Server Actions voor de Mailbox: concepten versturen, negeren en de
 * schrijfstijl bewaren. Versturen gebeurt alleen hier, na een klik.
 */

'use server';

import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase-server';
import { sendServerMail } from '@/lib/serverMail';

interface Resultaat {
    error?: string;
}

const VerstuurSchema = z.object({
    id: z.string().uuid(),
    aan: z.string().email('Ongeldig e-mailadres'),
    onderwerp: z.string().trim().min(1, 'Onderwerp ontbreekt').max(300),
    tekst: z.string().trim().min(1, 'Tekst ontbreekt').max(20000),
});

function tekstNaarHtml(tekst: string): string {
    const veilig = tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;white-space:pre-wrap;">${veilig}</div>`;
}

export async function verstuurConcept(input: unknown): Promise<Resultaat> {
    const parsed = VerstuurSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer het concept' };
    const { id, aan, onderwerp, tekst } = parsed.data;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };

    /* Eerst claimen: twee keer klikken mag niet twee mails geven. */
    const { data: geclaimd, error: claimFout } = await supabase.from('org_email_inbox')
        .update({ concept_status: 'verstuurd', behandeld_at: new Date().toISOString() } as never)
        .eq('id', id).in('concept_status', ['klaar', 'mislukt'])
        .select('organization_id,klant_id,from_name,raw_message_id,subject').maybeSingle();
    if (claimFout) return { error: claimFout.message };
    if (!geclaimd) return { error: 'Deze mail is al afgehandeld' };
    const rij = geclaimd as unknown as {
        organization_id: string; klant_id: number | null; from_name: string | null; raw_message_id: string;
    };

    const { data: s } = await supabase.from('settings').select('email').eq('organization_id', rij.organization_id).maybeSingle();
    const eigenAdres = (s as { email?: string | null } | null)?.email ?? undefined;

    const verzonden = await sendServerMail({
        to: aan,
        subject: onderwerp,
        html: tekstNaarHtml(tekst),
        text: tekst,
        replyTo: eigenAdres,
        bcc: eigenAdres,
        headers: { 'In-Reply-To': rij.raw_message_id, References: rij.raw_message_id },
    });

    if (!verzonden.success) {
        await supabase.from('org_email_inbox')
            .update({ concept_status: 'klaar', behandeld_at: null, concept_fout: verzonden.error ?? 'Versturen mislukt' } as never)
            .eq('id', id);
        return { error: verzonden.error ?? 'Versturen mislukt' };
    }

    await supabase.from('org_email_inbox')
        .update({ concept_onderwerp: onderwerp, concept_tekst: tekst, concept_fout: null } as never).eq('id', id);
    await supabase.from('emails').insert({
        organization_id: rij.organization_id,
        klant_id: rij.klant_id,
        aan_email: aan,
        aan_naam: rij.from_name ?? aan,
        onderwerp,
        inhoud: tekst,
        type: 'vrij',
        status: 'verzonden',
    } as never);
    return {};
}

export async function negeerMail(id: string): Promise<Resultaat> {
    if (!z.string().uuid().safeParse(id).success) return { error: 'Onbekende mail' };
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const { error } = await supabase.from('org_email_inbox')
        .update({ concept_status: 'genegeerd', behandeld_at: new Date().toISOString() } as never).eq('id', id);
    return error ? { error: error.message } : {};
}

const StijlSchema = z.object({
    settingsId: z.union([z.string(), z.number()]),
    schrijfstijl: z.string().max(8000),
    handtekening: z.string().max(1000),
});

export async function bewaarSchrijfstijl(input: unknown): Promise<Resultaat> {
    const parsed = StijlSchema.safeParse(input);
    if (!parsed.success) return { error: 'Tekst is te lang' };
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd' };
    const { error } = await supabase.from('settings').update({
        mail_schrijfstijl: parsed.data.schrijfstijl.trim() || null,
        mail_handtekening: parsed.data.handtekening.trim() || null,
    } as never).eq('id', parsed.data.settingsId);
    return error ? { error: error.message } : {};
}
