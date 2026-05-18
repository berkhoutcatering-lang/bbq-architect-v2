/**
 * POST /api/haccp/photo — upload bewijsfoto naar haccp-evidence bucket.
 * GET  /api/haccp/photo?path=...  — fetch signed URL voor bestaande foto.
 *
 * Pillar #3 (mens-bevestigd): foto = bewijs-naast-meting, geen vervanger.
 * v3 SOTA-feature.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getEvidencePhotoSignedUrl } from '@/lib/dal/haccp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const MAX_BYTES = 5 * 1024 * 1024;

async function authAndOrg(sb: Awaited<ReturnType<typeof createServerSupabase>>): Promise<
    { user: { id: string }; orgId: string } | { error: Response }
> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { error: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) };
    const { data: membership } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
    const orgId = membership?.[0]?.organization_id;
    if (!orgId) return { error: new Response(JSON.stringify({ error: 'no active organization' }), { status: 403 }) };
    return { user, orgId };
}

export async function POST(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: 'file required' }), { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
        return new Response(JSON.stringify({ error: 'mime not allowed' }), { status: 400 });
    }
    if (file.size > MAX_BYTES) {
        return new Response(JSON.stringify({ error: 'file too large (max 5MB)' }), { status: 400 });
    }

    // Path-structuur: {org_id}/{yyyy-mm}/{uuid}.ext
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const yearMonth = new Date().toISOString().slice(0, 7);
    const rand = crypto.randomUUID();
    const path = `${auth.orgId}/${yearMonth}/${rand}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error } = await sb.storage
        .from('haccp-evidence')
        .upload(path, arrayBuffer, {
            contentType: file.type,
            upsert: false,
        });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ path }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

export async function GET(req: NextRequest) {
    const sb = await createServerSupabase();
    const auth = await authAndOrg(sb);
    if ('error' in auth) return auth.error;

    const path = new URL(req.url).searchParams.get('path');
    if (!path) return new Response(JSON.stringify({ error: 'path required' }), { status: 400 });

    // Defense-in-depth: enforce path begins with current org_id (RLS doet dit ook)
    if (!path.startsWith(`${auth.orgId}/`)) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
    }

    const url = await getEvidencePhotoSignedUrl(sb, path, 60 * 30);
    if (!url) return new Response(JSON.stringify({ error: 'signed url failed' }), { status: 500 });
    return new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
