/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/accounting/moneybird/bon-attach — Bucket E P0-7
 * ──────────────────────────────────────────────────────────
 * Hangt het originele bon-bestand (foto/PDF/XML) als attachment aan een
 * Moneybird purchase_invoice. Wordt aangeroepen NA bon-commit, op het
 * moment dat de cateraar de regel naar de boekhouder schiet.
 *
 * Moneybird API endpoint:
 *   POST /api/v2/:admin_id/documents/purchase_invoices/:purchase_invoice_id/attachments
 *
 * Multipart/form-data met:
 *   - file: <binary>
 *
 * Hard rules:
 *   1. Idempotency — zelfde bon_id 2× = één PDF in Moneybird. We loggen
 *      moneybird_attachment_id in bonnen.feature_flags JSONB; bij retry
 *      returnt 200 met "already_attached" zonder API-call.
 *   2. Rate-limit 150 req/5 min — exponential backoff bij 429.
 *   3. Service-role supabase voor read van bon-storage (bypassed RLS).
 *
 * Body: { bon_id: string, purchase_invoice_id: string }
 *
 * Response (ok): { ok: true, attachment_id: string }
 * Response (already): { ok: true, attachment_id: string, already_attached: true }
 * Response (config): 503 + { error: 'moneybird_not_connected' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase-server';
import { getValidMoneybirdToken } from '@/lib/moneybird';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MONEYBIRD_BASE = 'https://moneybird.com/api/v2';

interface BonAttachBody {
    bon_id: string;
    purchase_invoice_id: string;
}

/* In-memory rate-limit teller per admin_id (best-effort; per Vercel-instance).
   Moneybird limiteert 150/5min — we stoppen pre-emptief bij 140 om buffer te
   houden voor parallelle Vercel-instances. */
const RATE_WINDOW_MS = 5 * 60_000;
const RATE_MAX = 140;
const rateLog = new Map<string, number[]>();

function recordCall(adminId: string): boolean {
    const now = Date.now();
    const arr = rateLog.get(adminId) ?? [];
    const recent = arr.filter(t => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_MAX) {
        rateLog.set(adminId, recent);
        return false;
    }
    recent.push(now);
    rateLog.set(adminId, recent);
    return true;
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Upload met exponential backoff bij 429/5xx. Stopt na 3 retries.
 * Eerste backoff = 1s, daarna 2s, 4s.
 */
async function postWithBackoff(
    url: string,
    accessToken: string,
    form: FormData,
): Promise<Response> {
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
        });
        if (res.status !== 429 && res.status < 500) return res;
        lastRes = res;
        const wait = 1000 * Math.pow(2, attempt);
        await sleep(wait);
    }
    return lastRes!; // best-effort, niet null als de loop ten minste 1x liep
}

export async function POST(req: NextRequest) {
    /* ── Auth + org ────────────────────────────────────────────── */
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
    }

    const { data: mem } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    const orgId = mem?.organization_id;
    if (!orgId) {
        return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    }

    /* ── Body ─────────────────────────────────────────────────── */
    let body: BonAttachBody;
    try {
        body = (await req.json()) as BonAttachBody;
    } catch {
        return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 });
    }
    if (!body.bon_id || !body.purchase_invoice_id) {
        return NextResponse.json(
            { error: 'bon_id + purchase_invoice_id zijn verplicht' },
            { status: 400 },
        );
    }

    /* ── Service-role client voor storage + feature_flags update ─ */
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!serviceUrl || !serviceKey) {
        return NextResponse.json(
            { error: 'Service-role credentials ontbreken' },
            { status: 500 },
        );
    }
    const admin = createClient(serviceUrl, serviceKey, {
        auth: { persistSession: false },
    });

    /* ── Bon ophalen + idempotency-check ─────────────────────── */
    const { data: bon, error: bonErr } = await admin
        .from('bonnen')
        .select(
            'id, organization_id, file_path, original_storage_path, file_mime, mime_type, image_url, raw_analysis, moneybird_attachment_ids',
        )
        .eq('id', body.bon_id)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (bonErr || !bon) {
        return NextResponse.json({ error: 'Bon niet gevonden' }, { status: 404 });
    }

    /* moneybird_attachment_ids = { [purchase_invoice_id]: attachment_id }
       Als deze bon al gekoppeld is aan deze invoice: idempotent return. */
    const existingMap = (bon.moneybird_attachment_ids ?? {}) as Record<string, string>;
    const existing = existingMap[body.purchase_invoice_id];
    if (existing) {
        return NextResponse.json({
            ok: true,
            attachment_id: existing,
            already_attached: true,
            message: 'Deze bon was al gekoppeld aan deze inkoopfactuur.',
        });
    }

    /* ── Moneybird token + administration_id ─────────────────── */
    const tok = await getValidMoneybirdToken(admin, orgId);
    if ('error' in tok) {
        return NextResponse.json({ error: tok.error }, { status: 503 });
    }
    if (!tok.administration_id) {
        return NextResponse.json(
            { error: 'moneybird_administration_not_selected' },
            { status: 503 },
        );
    }

    /* ── Rate-limit pre-flight ────────────────────────────────── */
    if (!recordCall(tok.administration_id)) {
        return NextResponse.json(
            {
                error: 'moneybird_rate_limited',
                message:
                    'Moneybird-quota tijdelijk bereikt (150/5min). Probeer over een paar minuten opnieuw.',
            },
            { status: 429, headers: { 'Retry-After': '120' } },
        );
    }

    /* ── File ophalen uit storage ────────────────────────────── */
    /* Voorkeur: original_storage_path (pre-resize); anders file_path (resized). */
    const storagePath = bon.original_storage_path || bon.file_path;
    let fileBuffer: ArrayBuffer | null = null;
    let fileMime = bon.mime_type || bon.file_mime || 'application/octet-stream';
    let fileName = `bon-${body.bon_id}.${guessExt(fileMime)}`;

    if (storagePath) {
        const dl = await admin.storage.from('bonnen').download(storagePath);
        if (dl.error || !dl.data) {
            return NextResponse.json(
                { error: 'Bon-bestand kon niet opgehaald worden uit storage', detail: dl.error?.message },
                { status: 500 },
            );
        }
        fileBuffer = await dl.data.arrayBuffer();
        /* Filename uit pad — laatste segment, of fallback. */
        const seg = storagePath.split('/').pop();
        if (seg) fileName = seg;
    } else if (bon.image_url && bon.image_url.startsWith('data:')) {
        /* Legacy fallback voor oude bonnen die nog data-url in image_url hadden. */
        const m = /^data:([^;]+);base64,(.+)$/i.exec(bon.image_url);
        if (m) {
            fileMime = m[1];
            fileBuffer = Buffer.from(m[2], 'base64').buffer;
            fileName = `bon-${body.bon_id}.${guessExt(fileMime)}`;
        }
    }

    if (!fileBuffer) {
        return NextResponse.json(
            { error: 'Bon heeft geen geüpload bestand om te koppelen.' },
            { status: 400 },
        );
    }

    /* ── Multipart POST naar Moneybird ────────────────────────── */
    const form = new FormData();
    form.append('file', new Blob([fileBuffer], { type: fileMime }), fileName);

    const url = `${MONEYBIRD_BASE}/${tok.administration_id}/documents/purchase_invoices/${body.purchase_invoice_id}/attachments.json`;
    const res = await postWithBackoff(url, tok.access_token, form);

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        return NextResponse.json(
            {
                error: 'moneybird_upload_failed',
                status: res.status,
                detail: text.slice(0, 500),
            },
            { status: res.status === 429 ? 429 : 502 },
        );
    }

    /* Moneybird returnt 201 Created (zonder body bij attachments, maar wel een
       location-header). We genereren een eigen ID als de response geen JSON
       teruggeeft, en bewaren dat in feature_flags voor idempotency. */
    let attachmentId: string;
    try {
        const json = await res.clone().json();
        attachmentId = String(json?.id ?? json?.attachment_id ?? Date.now());
    } catch {
        const loc = res.headers.get('Location') || res.headers.get('location') || '';
        attachmentId =
            loc.split('/').pop()?.replace(/\.json$/, '') || `mb-${Date.now()}`;
    }

    /* ── Idempotency-state opslaan ────────────────────────────── */
    const updatedMap = { ...existingMap, [body.purchase_invoice_id]: attachmentId };
    await admin
        .from('bonnen')
        .update({ moneybird_attachment_ids: updatedMap })
        .eq('id', body.bon_id);

    return NextResponse.json({
        ok: true,
        attachment_id: attachmentId,
        already_attached: false,
    });
}

function guessExt(mime: string): string {
    const m = mime.toLowerCase();
    if (m === 'application/pdf') return 'pdf';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/heic') return 'heic';
    if (m.includes('xml')) return 'xml';
    return 'bin';
}
