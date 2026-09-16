import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { validatePrintJob } from '@/lib/labelprinter/validators';
import { renderVerzoek, type LabelVerzoek } from '@/lib/labelprinter/render';
import { formaatVan, type PrinterConfig } from '@/lib/labelprinter/types';
import { JOB_KOLOMMEN, PRINTER_KOLOMMEN } from '@/lib/labelprinter/db';
import { stroom } from '@/lib/labelprinter/zpl';
import { laadPartijLabels, scanBasisUrl } from '@/lib/productie/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/labels/jobs — maakt een printjob aan en rendert de ZPL op de server.
 *
 * De ZPL komt op de rij te staan (audit + herprint-bewijs) én gaat terug naar
 * de client, die hem naar de printer pompt. Voorraad wordt hier nooit
 * aangeraakt: een job is alleen "dit is naar de printer gestuurd".
 *
 * Fase 0: testlabel en los label. partij_labels/herprint volgen in fase 1/2.
 */
export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    const limiet = checkRateLimit(`labels:${userId}`, 30);
    if (!limiet.allowed) {
        return NextResponse.json({ error: `Te veel printopdrachten; probeer over ${limiet.resetInSeconds}s opnieuw` }, { status: 429 });
    }

    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }
    const v = validatePrintJob(body);
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });
    const verzoek = v.data;

    const { data: printer, error: pErr } = await supabase
        .from('label_printers')
        .select(PRINTER_KOLOMMEN)
        .eq('id', verzoek.printerId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!printer) return NextResponse.json({ error: 'Printer niet gevonden' }, { status: 404 });
    const config = printer as unknown as PrinterConfig;
    if (!config.actief) return NextResponse.json({ error: 'Deze printer staat op inactief' }, { status: 409 });

    let labelVerzoek: LabelVerzoek = { soort: 'testlabel', data: { printerNaam: config.naam, moment: momentNu() } };
    let partijId: string | null = null;
    switch (verzoek.soort) {
        case 'doos_sticker':
        case 'haccp_sticker':
            /* Op de client getekend; hieronder direct als labels gebruikt. */
            break;
        case 'testlabel':
            labelVerzoek = { soort: 'testlabel', data: { printerNaam: config.naam, moment: momentNu() } };
            break;
        case 'los_label':
            labelVerzoek = {
                soort: 'los_label', aantal: verzoek.aantal,
                data: { naam: verzoek.naam, datum: verzoek.datum, tht: verzoek.tht, notitie: verzoek.notitie, wie: null },
            };
            break;
        case 'partij_labels':
        case 'herprint': {
            /* Alles uit de partij; het aantal labels = het aantal eenheden (of de
               selectie bij herprint / "print ontbrekende"). Nooit een vrij getal. */
            const l = await laadPartijLabels(
                supabase, orgId,
                verzoek.soort === 'herprint'
                    ? { soort: 'herprint', eenheidIds: verzoek.eenheidIds }
                    : { soort: 'partij_labels', partijId: verzoek.partijId, eenheidIds: verzoek.eenheidIds ?? null },
                scanBasisUrl(req.url),
            );
            if (l.ok === false) return NextResponse.json({ error: l.error }, { status: l.status });
            labelVerzoek = l.verzoek;
            partijId = l.partijId;
            break;
        }
    }

    const gerenderd = verzoek.soort === 'doos_sticker' || verzoek.soort === 'haccp_sticker'
        ? {
            templateCode: verzoek.soort === 'doos_sticker' ? 'doos_canvas' : 'haccp_canvas', templateVersie: 1,
            labels: Array.from({ length: verzoek.aantal }, () => ({ eenheidId: null, zpl: verzoek.zpl })),
            waarschuwingen: [] as string[], labelData: { ...(verzoek.referentie ?? {}), aantal: verzoek.aantal },
        }
        : renderVerzoek(labelVerzoek, formaatVan(config));

    const { data: job, error: jErr } = await supabase
        .from('print_jobs')
        .insert({
            organization_id: orgId,
            soort: verzoek.soort,
            partij_id: partijId,
            eenheid_ids: gerenderd.labels.map((l) => l.eenheidId).filter((x): x is string => !!x),
            template_code: gerenderd.templateCode,
            template_versie: gerenderd.templateVersie,
            printer_id: config.id,
            transport: config.transport,
            aantal_labels: gerenderd.labels.length,
            status: 'pending',
            label_data: gerenderd.labelData,
            zpl: stroom(gerenderd.labels.map((l) => l.zpl)),
            by_user_id: userId,
        })
        .select(JOB_KOLOMMEN)
        .single();
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });

    return NextResponse.json({
        job,
        labels: gerenderd.labels,
        waarschuwingen: gerenderd.waarschuwingen,
        printer: config,
    }, { status: 201 });
});

/** Laatste jobs, zonder ZPL. */
export const GET = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    const url = new URL(req.url);
    const limiet = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25) || 25));
    const { data, error } = await supabase
        .from('print_jobs')
        .select(JOB_KOLOMMEN)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limiet);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ jobs: data ?? [] });
});

function momentNu(): string {
    const f = new Intl.DateTimeFormat('nl-NL', {
        timeZone: 'Europe/Amsterdam', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return f.format(new Date()).replace(',', '');
}
