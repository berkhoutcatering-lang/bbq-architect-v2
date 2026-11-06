/**
 * POST /api/email/klant-inbound
 *
 * Resend meldt hier elke mail op `mail-{slug}@…`. Een doorstuurregel op de
 * gewone mailbox stuurt daar een kopie heen. Wij halen de inhoud op, koppelen
 * de afzender aan klant, aanvraag en bestelling, en zetten een concept klaar.
 * Versturen gebeurt alleen vanuit de Mailbox, door een mens.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { htmlNaarTekst, isAutomatisch, klopWebhookHandtekening, leesAfzender, slugUitAdressen } from '@/lib/klantMail/webhook';
import { schrijfConcept, zoekKlantContext } from '@/lib/klantMail/concept';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_TEKST = 20_000;

interface OntvangenMail {
    from?: string;
    to?: string[];
    subject?: string;
    html?: string | null;
    text?: string | null;
    message_id?: string;
    headers?: Record<string, unknown>;
    attachments?: unknown[];
}

export async function POST(req: NextRequest) {
    const body = await req.text();
    const echt = klopWebhookHandtekening(body, {
        id: req.headers.get('svix-id'),
        tijdstip: req.headers.get('svix-timestamp'),
        handtekening: req.headers.get('svix-signature'),
    }, process.env.RESEND_WEBHOOK_SECRET);
    if (!echt) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const melding = JSON.parse(body) as {
        type?: string;
        data?: { email_id?: string; to?: string[]; received_for?: string[] };
    };
    if (melding.type !== 'email.received' || !melding.data?.email_id) {
        return NextResponse.json({ ok: true, genegeerd: true });
    }

    const slug = slugUitAdressen([...(melding.data.to ?? []), ...(melding.data.received_for ?? [])]);
    if (!slug) return NextResponse.json({ ok: true, genegeerd: 'onbekend adres' });

    const sb = createServiceSupabase();
    const { data: org } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!org) return NextResponse.json({ ok: true, genegeerd: 'onbekend bedrijf' });
    const orgId = org.id as string;

    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(melding.data.email_id)}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    /* Een 5xx laat Resend het later opnieuw proberen; de mail staat daar veilig. */
    if (!res.ok) return NextResponse.json({ error: 'inhoud niet opgehaald' }, { status: 502 });
    const mail = (await res.json()) as OntvangenMail;

    const koppen = mail.headers ?? {};
    const lees = (naam: string) => {
        const sleutel = Object.keys(koppen).find((k) => k.toLowerCase() === naam);
        return sleutel ? String(koppen[sleutel] ?? '') : null;
    };
    const afzender = leesAfzender(lees('reply-to')).email ? leesAfzender(lees('reply-to')) : leesAfzender(lees('from') ?? mail.from);
    const vanEmail = afzender.email ?? mail.from?.toLowerCase() ?? '';
    const tekst = (mail.text?.trim() || htmlNaarTekst(mail.html ?? '')).slice(0, MAX_TEKST);
    const messageId = mail.message_id ?? melding.data.email_id;

    const { data: dubbel } = await sb.from('org_email_inbox').select('id')
        .eq('organization_id', orgId).eq('raw_message_id', messageId).maybeSingle();
    if (dubbel) return NextResponse.json({ ok: true, dubbel: true });

    const context = await zoekKlantContext(sb, orgId, vanEmail);
    const automatisch = isAutomatisch(vanEmail, koppen);

    const { data: rij, error } = await sb.from('org_email_inbox').insert({
        organization_id: orgId,
        bron: 'klantmail',
        inbound_address: (melding.data.to ?? [])[0] ?? '',
        from_email: vanEmail,
        from_name: afzender.naam,
        antwoord_aan: vanEmail,
        subject: mail.subject ?? null,
        raw_message_id: messageId,
        body_excerpt: tekst.slice(0, 500),
        body_text: tekst,
        attachment_count: mail.attachments?.length ?? 0,
        status: 'parsed',
        category: automatisch ? 'overig' : null,
        klant_id: context.klantId,
        lead_id: context.leadId,
        winkel_order_id: context.orderId,
        concept_status: automatisch ? 'geen' : 'bezig',
    } as never).select('id').single();

    if (error || !rij) {
        console.error('[klant-inbound] opslaan mislukt', error?.message);
        return NextResponse.json({ error: 'opslaan mislukt' }, { status: 500 });
    }
    if (automatisch) return NextResponse.json({ ok: true, automatisch: true });

    const inboxId = (rij as { id: string }).id;
    after(async () => {
        const { data: s } = await sb.from('settings').select('bedrijfsnaam,mail_schrijfstijl,mail_handtekening')
            .eq('organization_id', orgId).maybeSingle();
        const instellingen = (s ?? {}) as { bedrijfsnaam?: string; mail_schrijfstijl?: string | null; mail_handtekening?: string | null };
        try {
            const r = await schrijfConcept({
                orgId,
                bedrijfsnaam: instellingen.bedrijfsnaam ?? 'het bedrijf',
                schrijfstijl: instellingen.mail_schrijfstijl ?? null,
                vanNaam: afzender.naam,
                vanEmail,
                onderwerp: mail.subject ?? '',
                tekst,
                gegevens: context.gegevens,
            });
            if ('fout' in r) {
                await sb.from('org_email_inbox').update({ concept_status: 'mislukt', concept_fout: r.fout } as never).eq('id', inboxId);
                return;
            }
            const c = r.concept;
            const handtekening = instellingen.mail_handtekening?.trim();
            await sb.from('org_email_inbox').update({
                category: c.soort === 'klant' ? 'klant_aanvraag' : 'overig',
                category_set_at: new Date().toISOString(),
                concept_status: c.antwoord_nodig ? 'klaar' : 'geen',
                concept_onderwerp: c.antwoord_nodig ? c.onderwerp : null,
                concept_tekst: c.antwoord_nodig ? (handtekening ? `${c.tekst}\n\n${handtekening}` : c.tekst) : null,
                concept_vragen: c.vragen || null,
            } as never).eq('id', inboxId);
        } catch (e) {
            console.error('[klant-inbound] concept mislukt', e);
            await sb.from('org_email_inbox').update({
                concept_status: 'mislukt',
                concept_fout: e instanceof Error ? e.message : 'Onbekende fout',
            } as never).eq('id', inboxId);
        }
    });

    return NextResponse.json({ ok: true });
}
