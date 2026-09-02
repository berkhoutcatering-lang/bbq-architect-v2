/**
 * POST /api/bonnen/commit
 *
 * Persistente save-laag tussen /api/bonnen/extract (AI-only, geen DB-writes)
 * en /archief (alleen reads).
 *
 * Voorheen ontbrak deze: "Bevestig in archief" was een dead <Link href="/archief">
 * waardoor scan-data alleen in client-state leefde en bij navigatie verloren ging.
 * Nu: ontvangt de ExtractResult uit /bonnen page, INSERT't in `bonnen`, returnt
 * de nieuwe id zodat de UI kan redirect naar /archief?bon=<id>.
 *
 * Veiligheid:
 *   - Re-auth in body (geen middleware-trust)
 *   - organization_id via session, nooit uit client-input
 *   - image_hash dedup zodat dezelfde bon niet 2× ge-committed kan
 *   - Zod-validated input
 *   - Tracks audit-trail via bestaande trg_audit_bonnen trigger
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const ItemSchema = z.object({
    naam: z.string().min(1).max(200),
    aantal: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    prijs: z.number().nullable().optional(),
    btw_pct: z.number().nullable().optional(),
    totaal: z.number().nullable().optional(),
    inventory_id: z.number().nullable().optional(),
    inventory_naam: z.string().nullable().optional(),
    match_confidence: z.enum(['high', 'medium', 'low', 'none']).optional(),
});

const BodySchema = z.object({
    bon_preview: z.object({
        leverancier_naam: z.string().nullable(),
        leverancier_id: z.number().nullable(),
        datum: z.string().nullable(),
        totaal_bedrag: z.number(),
        netto_bedrag: z.number(),
        btw_laag_bedrag: z.number(),
        btw_hoog_bedrag: z.number(),
    }),
    items: z.array(ItemSchema).max(200),
    image_hash: z.string().max(64),
    mime_type: z.string().max(60),
    source_type: z.string().max(20),
    ocr_engine: z.string().max(40).optional(),
    confidence: z.number().min(0).max(1).optional(),
    ai_cost_eur_cents: z.number().nullable().optional(),
    /** Optional: originele file als data-URL. Wordt naar Storage geupload
        zodat Preview-tab in /archief de file kan tonen via signed URL. */
    file_data_url: z.string().max(15_000_000).optional(),
    file_name: z.string().max(255).optional(),
    /** Optional: bon-id om aan te attachen (uit /bonnen?prefill=ID flow).
        Wanneer gezet: UPDATE deze bon ipv INSERT van een nieuwe. Image-hash
        dedup wordt overgeslagen omdat de gebruiker expliciet zegt: "deze
        nieuwe file hoort bij die bestaande bon-row". */
    attach_to_bon_id: z.number().int().positive().optional(),
    /** Optional: naam van een NIEUWE leverancier die Sam expliciet wil
        aanmaken voor deze bon. Wordt server-side INSERT-ed in leveranciers
        en aan deze bon gelinkt. Negeert leverancier_id wanneer gezet.
        Mens-blijft-de-baas regel: AI mag nooit zelf aanmaken — alleen
        via deze expliciete user-action. */
    new_leverancier_naam: z.string().min(2).max(120).optional(),
    /** Her-opslaan van een bon die deze scan-sessie zelf al bewaarde (bv. na
        escalatie naar een zwaarder model). Alleen dan mogen de bedragen van de
        bestaande rij overschreven worden — anders wint wat er al stond. */
    overwrite_totals: z.boolean().optional(),
    /** Bon-scanner v2: pass-historie + reconciliation-status uit extract. */
    reconciliation_status: z.enum(['ok', 'minor_drift', 'mismatch', 'no_total']).optional(),
    ai_passes: z.array(z.object({
        model: z.string(),
        engine: z.string(),
        confidence: z.number(),
        items_count: z.number(),
        reconciliation_status: z.string(),
        mismatch_eur: z.number(),
        cost_eur_cents: z.number(),
        duration_ms: z.number(),
        error: z.string().nullable(),
    })).max(10).optional(),
});

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    // Org resolve via session, never client.
    const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();
    const orgId = member?.organization_id;
    if (!orgId) {
        return NextResponse.json({ error: 'Geen actieve organisatie' }, { status: 403 });
    }

    let body: z.infer<typeof BodySchema>;
    try {
        const raw = await req.json();
        body = BodySchema.parse(raw);
    } catch (e) {
        return NextResponse.json(
            { error: 'Ongeldige body', detail: e instanceof Error ? e.message : 'parse error' },
            { status: 400 },
        );
    }

    // ── Expliciete attach_to_bon_id pad ───────────────────────────────
    // Wanneer de UI ?prefill=ID doorgeeft (uit "Scan opnieuw"-link in
    // BonPreview), willen we de nieuwe scan koppelen aan die specifieke
    // bon-id. Validatie:
    //   1. Bon bestaat + binnen huidige org (RLS-check via .eq)
    //   2. Bon is niet vergrendeld
    //   3. Bon heeft geen file_path (anders zou Sam ongewild een file overschrijven)
    let existingBonId: number | null = null;
    let existingHasFile = false;
    if (body.attach_to_bon_id) {
        const { data: target } = await supabase
            .from('bonnen')
            .select('id, file_path, locked_at, image_hash')
            .eq('organization_id', orgId)
            .eq('id', body.attach_to_bon_id)
            .maybeSingle();

        if (!target) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'attach_target_missing',
                    message: 'De bon waaraan je wilt koppelen bestaat niet (meer).',
                },
                { status: 404 },
            );
        }
        if (target.locked_at) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'locked',
                    message: 'Deze bon is vergrendeld voor de aangifte.',
                    bon_id: target.id,
                },
                { status: 409 },
            );
        }
        /* Al een file? Dan alleen doorgaan als het EXACT dezelfde file is
           (zelfde hash). Dat is de her-opslaan-flow: de scan-pagina bewaarde
           deze bon net zelf en stuurt nu een betere uitlezing van hetzelfde
           bestand. Een ander bestand op een bezette bon blijft geweigerd. */
        if (target.file_path && target.image_hash !== body.image_hash) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'attach_target_has_file',
                    message:
                        'Deze bon heeft al een bestand. Verwijder eerst de PDF voor je opnieuw kunt scannen.',
                    bon_id: target.id,
                },
                { status: 409 },
            );
        }
        existingBonId = target.id;
        existingHasFile = !!target.file_path;
    }

    // Server-side dedup op image_hash. BIJ DUPLICATE: als bestaande bon nog
    // geen file_path heeft, gaan we wel door en upload'en de file alsnog
    // (UPDATE ipv INSERT). Lost een veelvoorkomende UX-fout op: gebruiker
    // scant 'n bon, knop faalt of upload werd geskipped, scant opnieuw —
    // verwacht dat 't gewoon werkt.
    if (!existingBonId && body.image_hash) {
        const { data: dup } = await supabase
            .from('bonnen')
            .select('id, file_path, locked_at')
            .eq('organization_id', orgId)
            .eq('image_hash', body.image_hash)
            .limit(1)
            .maybeSingle();
        if (dup) {
            if (dup.locked_at) {
                // Vergrendeld → niet aanraken
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'locked',
                        message: 'Deze bon is vergrendeld voor aangifte en kan niet meer ge-update worden.',
                        bon_id: dup.id,
                    },
                    { status: 409 },
                );
            }
            if (dup.file_path) {
                // Heeft al een file → echt duplicate, redirect naar bestaande
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'duplicate',
                        message: 'Deze bon staat al in je archief.',
                        bon_id: dup.id,
                    },
                    { status: 409 },
                );
            }
            // Bestaat wel maar mist file → "fix-up" pad
            existingBonId = dup.id;
            existingHasFile = false;
        }
    }

    // Build extracted_text uit items + leverancier + datum.
    // Voedt search_vec (Dutch tsvector) + pg_trgm voor "baktotaal"-search.
    const itemsText = body.items
        .map((i) => [i.naam, i.unit, i.prijs?.toString() ?? ''].filter(Boolean).join(' '))
        .join(' ');
    const datumNl = body.bon_preview.datum
        ? safeNlDate(body.bon_preview.datum)
        : '';
    const extractedText = [
        itemsText,
        body.bon_preview.leverancier_naam ?? '',
        body.bon_preview.datum ?? '',
        datumNl,
    ].filter(Boolean).join(' ').trim();

    // Welke source-flag op basis van source_type.
    const source: 'upload' | 'email' | 'scan' | 'api' = 'upload';

    // Determine PDF/image type voor file_mime
    const fileMime = body.mime_type || null;

    // ── File upload naar Storage (Pillar #3) ──────────────────────────
    // Folder-conventie matched storage-RLS uit migratie 132000:
    //   {organization_uuid}/{yyyy-mm}/{uuid}.{ext}
    // Service-role client want auth-RLS heeft moeite met first-write.
    let filePath: string | null = null;
    if (body.file_data_url && !existingHasFile) {
        try {
            const parsed = parseDataUrl(body.file_data_url);
            if (parsed) {
                const ext = mimeToExt(parsed.mediaType) ?? guessExtFromFilename(body.file_name);
                const yyyyMm = new Date().toISOString().slice(0, 7);
                const objectName = `${orgId}/${yyyyMm}/${randomUUID()}.${ext}`;

                const serviceSb = createServiceSupabase();
                const { error: upErr } = await serviceSb.storage
                    .from('bonnen')
                    .upload(objectName, Buffer.from(parsed.base64, 'base64'), {
                        contentType: parsed.mediaType,
                        upsert: false,
                    });
                if (!upErr) {
                    filePath = objectName;
                } else {
                    console.error('[bonnen/commit] storage upload failed:', upErr);
                    // Niet-fataal — bon wordt nog steeds gesaved zonder file
                }
            }
        } catch (e) {
            console.error('[bonnen/commit] file parse error:', e);
        }
    }

    /* ── Leverancier-resolve ──────────────────────────────────────────
       Sam wil mens-blijft-de-baas: AI mag een nieuwe leverancier alleen
       AANMAKEN als de UI expliciet `new_leverancier_naam` doorgeeft (dwz.
       Sam heeft op "Nieuwe leverancier aanmaken" geklikt). Anders gebruiken
       we de bon_preview.leverancier_id die uit auto-match komt. */
    let resolvedLeverancierId = body.bon_preview.leverancier_id;
    if (body.new_leverancier_naam) {
        const naam = body.new_leverancier_naam.trim();
        // Check eerst of er al een leverancier met deze naam bestaat
        // (dedup binnen org — voorkomt dat Sam per ongeluk dubbele aanmaakt)
        const { data: existing } = await supabase
            .from('leveranciers')
            .select('id')
            .eq('organization_id', orgId)
            .ilike('naam', naam)
            .limit(1)
            .maybeSingle();

        if (existing) {
            resolvedLeverancierId = existing.id;
        } else {
            const { data: newLev, error: levErr } = await supabase
                .from('leveranciers')
                .insert({
                    organization_id: orgId,
                    naam,
                    type: 'inkoop',
                })
                .select('id')
                .single();

            if (levErr || !newLev) {
                console.error('[bonnen/commit] leverancier insert failed:', levErr);
                return NextResponse.json(
                    {
                        ok: false,
                        error: 'leverancier_insert_failed',
                        detail: levErr?.message,
                    },
                    { status: 500 },
                );
            }
            resolvedLeverancierId = newLev.id;
        }
    }

    const payload = {
        organization_id: orgId,
        winkel: body.bon_preview.leverancier_naam,
        datum: body.bon_preview.datum,
        totaal_bedrag: body.bon_preview.totaal_bedrag,
        netto_bedrag: body.bon_preview.netto_bedrag,
        btw_laag_bedrag: body.bon_preview.btw_laag_bedrag,
        btw_hoog_bedrag: body.bon_preview.btw_hoog_bedrag,
        leverancier_id: resolvedLeverancierId,
        bon_items: body.items,
        raw_analysis: body.items,  // backwards-compat (search_vec backfill leest dit pad)
        extracted_text: extractedText,
        image_hash: body.image_hash,
        file_path: filePath,
        file_mime: fileMime,
        source,
        status: 'pending',
        /* Bon-scanner v2: persist reconciliation flag + pass-history. */
        reconciliation_status: body.reconciliation_status ?? null,
        ai_passes: body.ai_passes ?? null,
    };

    // ── Fix-up pad: bestaande bon bijwerken ipv nieuwe rij ────────────
    if (existingBonId) {
        // Bij her-scan: alleen leverancier_id overschrijven als er nu een
        // nieuwe leverancier expliciet aangemaakt is (mens-keuze). Anders
        // behoudt de bestaande bon z'n vorige leverancier-koppeling.
        const levUpdate = body.new_leverancier_naam
            ? { leverancier_id: resolvedLeverancierId }
            : {};
        // Alleen een nieuw geuploade file wegschrijven; had de rij er al een,
        // dan blijft die staan (filePath is dan bewust null).
        const fileUpdate = filePath
            ? { file_path: filePath, file_mime: fileMime }
            : {};
        // Bedragen alleen overschrijven als de client daar expliciet om vraagt
        // (her-opslaan na escalatie). Een gewone her-scan laat bestaande
        // bedragen met rust — die kunnen handmatig gecorrigeerd zijn.
        const totalsUpdate = body.overwrite_totals
            ? {
                  winkel: body.bon_preview.leverancier_naam,
                  datum: body.bon_preview.datum,
                  totaal_bedrag: body.bon_preview.totaal_bedrag,
                  netto_bedrag: body.bon_preview.netto_bedrag,
                  btw_laag_bedrag: body.bon_preview.btw_laag_bedrag,
                  btw_hoog_bedrag: body.bon_preview.btw_hoog_bedrag,
                  reconciliation_status: body.reconciliation_status ?? null,
                  ai_passes: body.ai_passes ?? null,
              }
            : {};
        const { error: updErr } = await supabase
            .from('bonnen')
            .update({
                ...fileUpdate,
                image_hash: body.image_hash,
                // Verrijken alleen velden die mogelijk leeg waren bij eerdere insert
                extracted_text: extractedText,
                bon_items: body.items,
                raw_analysis: body.items,
                // Status bij her-scan terug op 'pending' zodat AI-output opnieuw bevestigd kan
                status: 'pending',
                ...totalsUpdate,
                ...levUpdate,
            })
            .eq('organization_id', orgId)
            .eq('id', existingBonId);

        if (updErr) {
            console.error('[bonnen/commit] update failed:', updErr);
            return NextResponse.json(
                {
                    ok: false,
                    error: 'update_failed',
                    detail: updErr.message,
                    code: updErr.code,
                    bon_id: existingBonId,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({
            ok: true,
            bon_id: existingBonId,
            updated: true,
            file_uploaded: !!filePath || existingHasFile,
            redirect: `/archief?bon=${existingBonId}`,
        });
    }

    // ── Normale INSERT-pad voor nieuwe bonnen ─────────────────────────
    const { data: inserted, error } = await supabase
        .from('bonnen')
        .insert(payload)
        .select('id')
        .single();

    if (error) {
        console.error('[bonnen/commit] insert failed:', error);
        return NextResponse.json(
            {
                ok: false,
                error: 'insert_failed',
                detail: error.message,
                code: error.code,
            },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        bon_id: inserted.id,
        file_uploaded: !!filePath,
        redirect: `/archief?bon=${inserted.id}`,
    });
}

function safeNlDate(d: string): string {
    try {
        return new Date(d).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return '';
    }
}

/** Parse data:<mime>;base64,<data> URL. Returnt mediaType + base64-body. */
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
    const match = dataUrl.match(/^data:([^;,]+)(?:;[^,]+)?(?:;base64)?,(.+)$/);
    if (!match) return null;
    return { mediaType: match[1], base64: match[2] };
}

function mimeToExt(mime: string): string | null {
    const map: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif',
        'image/gif': 'gif',
        'application/xml': 'xml',
        'text/xml': 'xml',
        'application/ubl+xml': 'xml',
    };
    return map[mime.toLowerCase()] ?? null;
}

function guessExtFromFilename(filename?: string): string {
    if (!filename) return 'bin';
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return 'bin';
    return filename.slice(dot + 1).toLowerCase().slice(0, 6);
}
