/**
 * POST /api/archief/bulk-export
 *
 * Pillar #4 — Bulk-export voor boekhouder.
 * Body: { bonIds: number[] }  OR  { filters: SearchInput } (toekomst)
 *
 * Returns: ZIP-stream met:
 *   - {datum}_{leverancier}_{bonId}.{ext}   (alle PDF/image files)
 *   - bonnen-overzicht.csv                  (datum/leverancier/bedrag/BTW-split/categorie)
 *   - README.txt                            (uitleg voor accountant)
 *
 * BTW splits komen uit `btw_laag_bedrag` (9%) + `btw_hoog_bedrag` (21%)
 * server-side aggregaten — NOOIT AI-derived (Pillar #4 / LLM09).
 */
import { NextRequest } from 'next/server';
import archiver from 'archiver';
import { Readable } from 'stream';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { logBonAction, getBonSignedUrl } from '@/lib/dal/bonnen';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;  // ZIP-streaming kan even duren voor 500+ bonnen

interface BodyShape {
    bonIds: number[];
}

export async function POST(req: NextRequest) {
    // 1. Auth + body parse.
    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    let body: BodyShape;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'invalid JSON' }, { status: 400 });
    }

    if (!Array.isArray(body.bonIds) || body.bonIds.length === 0) {
        return Response.json({ error: 'bonIds required' }, { status: 400 });
    }
    if (body.bonIds.length > 500) {
        return Response.json({ error: 'max 500 bonnen per export' }, { status: 400 });
    }

    // 2. Haal alle bonnen op (RLS filtert op org).
    const { data: bonnen, error } = await sb
        .from('bonnen')
        .select('id, organization_id, winkel, datum, totaal_bedrag, btw_laag_bedrag, btw_hoog_bedrag, netto_bedrag, categorie, rgs_categorie, status, tags, file_path, file_mime, image_url, leveranciers(naam)')
        .in('id', body.bonIds)
        .order('datum', { ascending: false });

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
    if (!bonnen || bonnen.length === 0) {
        return Response.json({ error: 'no bonnen found' }, { status: 404 });
    }

    // 3. Bouw ZIP-stream.
    const archive = archiver('zip', { zlib: { level: 6 } });
    const stream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

    // 4. README + CSV header.
    const csvLines: string[] = [
        ['datum', 'leverancier', 'omschrijving', 'totaal_incl_btw', 'btw_9', 'btw_21', 'excl_btw', 'rgs_categorie', 'status', 'bon_id'].join(';'),
    ];

    const readme = [
        'BBQ Architect — Bonnenkistje export',
        '─────────────────────────────────────',
        `Aangemaakt: ${new Date().toLocaleString('nl-NL')}`,
        `Aantal bonnen: ${bonnen.length}`,
        '',
        'Bestanden in deze ZIP:',
        '  - bonnen-overzicht.csv   (BTW-split per regel, ; gescheiden)',
        '  - {datum}_{leverancier}_{id}.{ext}  (originele bon-files)',
        '',
        'BTW-bedragen zijn server-side berekend, niet AI-geschat.',
        '7-jaar bewaarplicht conform Art. 52 AWR.',
    ].join('\n');

    archive.append(readme, { name: 'README.txt' });

    // 5. Voor elke bon: fetch het bestand via signed URL en append aan ZIP.
    //    Plus CSV row toevoegen met BTW-split.
    const errors: Array<{ bonId: number; reason: string }> = [];

    for (const bon of bonnen) {
        const lev = (bon as unknown as { leveranciers?: { naam?: string } }).leveranciers;
        const leverancierNaam = lev?.naam ?? bon.winkel ?? 'onbekend';
        const datum = bon.datum ?? 'geen-datum';
        const safeNaam = (leverancierNaam as string).replace(/[^a-zA-Z0-9-]/g, '_');

        // CSV row
        const totaal = Number(bon.totaal_bedrag ?? 0);
        const btw9 = Number(bon.btw_laag_bedrag ?? 0);
        const btw21 = Number(bon.btw_hoog_bedrag ?? 0);
        const excl = totaal - btw9 - btw21;

        csvLines.push([
            datum,
            csvEscape(leverancierNaam as string),
            csvEscape(bon.categorie ?? ''),
            totaal.toFixed(2),
            btw9.toFixed(2),
            btw21.toFixed(2),
            excl.toFixed(2),
            bon.rgs_categorie ?? '',
            bon.status ?? '',
            String(bon.id),
        ].join(';'));

        // Append file
        try {
            const signed = await getBonSignedUrl(sb, bon.id as number, 300);
            if (!signed) {
                errors.push({ bonId: bon.id as number, reason: 'no file' });
                continue;
            }

            const res = await fetch(signed.url);
            if (!res.ok) {
                errors.push({ bonId: bon.id as number, reason: `fetch ${res.status}` });
                continue;
            }
            const buf = Buffer.from(await res.arrayBuffer());
            const ext = signed.mime?.split('/')[1] ?? 'bin';
            archive.append(buf, { name: `${datum}_${safeNaam}_${bon.id}.${ext}` });
        } catch (e) {
            errors.push({
                bonId: bon.id as number,
                reason: e instanceof Error ? e.message : 'unknown',
            });
        }
    }

    archive.append(csvLines.join('\n'), { name: 'bonnen-overzicht.csv' });

    if (errors.length > 0) {
        archive.append(
            JSON.stringify(errors, null, 2),
            { name: 'export-errors.json' },
        );
    }

    archive.finalize();

    // 6. Log bulk-export actie per bon (audit-trail, async via service-role).
    //    Niet blokkeren op fail; doe het in fire-and-forget.
    const serviceSb = createServiceSupabase();
    void Promise.all(
        bonnen.map((bon) =>
            logBonAction(
                serviceSb,
                bon.id as number,
                'bulk_export',
                `Geëxporteerd door ${user.email}`,
                { export_size: bonnen.length, user_id: user.id },
            ).catch(() => { /* skip individual failures */ }),
        ),
    );

    // 7. Stream response.
    const now = new Date().toISOString().slice(0, 10);
    return new Response(stream, {
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="bonnenkistje-${now}.zip"`,
            'Cache-Control': 'no-store',
        },
    });
}

function csvEscape(v: string): string {
    // Vermijd ; in waarden — replace door komma.
    return v.replace(/;/g, ',').replace(/[\r\n]+/g, ' ');
}
