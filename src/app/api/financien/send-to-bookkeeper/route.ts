/* /api/financien/send-to-bookkeeper — Bucket J P0.13
   POST: Stuur 1+ Finance Copilot ideeën door naar de boekhouder-flow.
   Bouwt markdown-summary + JSON-blob, insert in boekhouder_pakketten met
   source='finance_copilot', returnt redirect-URL.

   Hergebruikt bestaande boekhouder-pakket-infrastructuur — geen nieuwe
   PDF-generator nodig.
*/

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';

interface SendBody {
    thread_id: string;
    idea_ids: string[];
}

function validate(body: unknown): { ok: true; data: SendBody } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (typeof b.thread_id !== 'string' || b.thread_id.length === 0) {
        return { ok: false, error: 'thread_id verplicht' };
    }
    if (!Array.isArray(b.idea_ids) || b.idea_ids.length === 0) {
        return { ok: false, error: 'idea_ids verplicht en niet-leeg' };
    }
    const ids = b.idea_ids.filter(i => typeof i === 'string') as string[];
    if (ids.length === 0) return { ok: false, error: 'idea_ids moeten strings zijn' };
    return { ok: true, data: { thread_id: b.thread_id, idea_ids: ids } };
}

interface SourceRefRow { kind: string; id: string; label?: string }
interface BlocksJson { gap?: string; opportunity?: string; kind?: string; severity?: string }
interface IdeaRow { source_refs?: SourceRefRow[] | null; blocks_json?: BlocksJson | null }

function ideaToMarkdown(idea: IdeaRow): string {
    const refs = Array.isArray(idea.source_refs)
        ? idea.source_refs.map(r => `- [${r.kind}] ${r.id}${r.label ? ` — ${r.label}` : ''}`).join('\n')
        : '';
    const blocks = idea.blocks_json;
    if (!blocks) return '';
    return [
        `### ${blocks.kind?.toUpperCase() || 'IDEE'} · severity=${blocks.severity || 'medium'}`,
        '',
        `**Wat ik zag:** ${blocks.gap || '—'}`,
        '',
        `**Vraag aan boekhouder:** ${blocks.opportunity || '—'}`,
        '',
        refs ? `**Bron-verwijzingen:**\n${refs}` : '',
    ].join('\n');
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    /* Fetch ideas met source_refs. RLS zorgt voor org-isolation — geen extra
       filter op organization_id nodig (al gefilterd door auth-context). */
    const { data: ideas } = await supabase
        .from('finance_copilot_messages')
        .select('id,blocks_json,source_refs,content_md,status,created_at')
        .in('id', v.data.idea_ids)
        .eq('thread_id', v.data.thread_id);

    if (!ideas || ideas.length === 0) {
        return NextResponse.json({ error: 'Geen ideeën gevonden' }, { status: 404 });
    }

    /* Bouw markdown summary */
    const datum = new Date();
    const mdLines: string[] = [
        '# Finance Copilot — Pakket voor boekhouder',
        '',
        `Aangemaakt: ${datum.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        '',
        '> Onderstaande ideeën komen uit de Finance Copilot. De cateraar vraagt jouw oordeel —',
        '> bedragen zijn server-geverifieerd waar mogelijk; KIA-aftrekken via KIA-tabel 2026.',
        '',
        '---',
        '',
    ];
    for (const idea of ideas) {
        const md = ideaToMarkdown(idea);
        if (md) mdLines.push(md, '', '---', '');
    }
    const markdown = mdLines.join('\n');

    const nu = new Date();
    const jaar = nu.getFullYear();
    const maand = nu.getMonth() + 1;

    /* Insert in boekhouder_pakketten met source='finance_copilot'. notes-veld
       bevat de markdown zodat boekhouder-page het direct kan tonen. */
    const { data: pakket, error: pakketErr } = await supabase
        .from('boekhouder_pakketten')
        .insert({
            organization_id: orgId,
            period_type: 'maand',
            period_year: jaar,
            period_month: maand,
            bonnen_count: 0,
            facturen_count: 0,
            total_purchases_eur: 0,
            total_sales_eur: 0,
            btw_voorbelasting_eur: 0,
            btw_verschuldigd_eur: 0,
            btw_af_te_dragen_eur: 0,
            delivery_method: 'download',
            status: 'concept',
            source: 'finance_copilot',
            notes: markdown,
        })
        .select('id')
        .single();

    /* Conflict op unique-index (1 maand-pakket per maand)? Fall-back naar
       update van bestaand maandpakket — append finance_copilot ideeën. */
    if (pakketErr || !pakket) {
        const { data: existing } = await supabase
            .from('boekhouder_pakketten')
            .select('id,notes')
            .eq('organization_id', orgId)
            .eq('period_type', 'maand')
            .eq('period_year', jaar)
            .eq('period_month', maand)
            .maybeSingle();
        if (!existing) {
            return NextResponse.json({ error: 'Pakket-creatie faalde', detail: pakketErr?.message }, { status: 500 });
        }
        const merged = `${existing.notes || ''}\n\n--- Toegevoegd ${datum.toISOString()} ---\n\n${markdown}`;
        await supabase
            .from('boekhouder_pakketten')
            .update({ notes: merged, source: 'finance_copilot' })
            .eq('id', existing.id);

        /* Markeer ideeën als opgeslagen */
        await supabase
            .from('finance_copilot_messages')
            .update({ status: 'opgeslagen' })
            .in('id', v.data.idea_ids);

        return NextResponse.json({
            packet_id: existing.id,
            redirect: `/geld/boekhouder?from=finance_copilot&packet_id=${existing.id}`,
        });
    }

    /* Markeer ideeën als opgeslagen */
    await supabase
        .from('finance_copilot_messages')
        .update({ status: 'opgeslagen' })
        .in('id', v.data.idea_ids);

    return NextResponse.json({
        packet_id: pakket.id,
        redirect: `/geld/boekhouder?from=finance_copilot&packet_id=${pakket.id}`,
    });
}
