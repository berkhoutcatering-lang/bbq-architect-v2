/**
 * GET /api/archief/signed-url?bonId=123
 *
 * Geeft een 1h-TTL signed URL terug voor een bon-file in Supabase Storage.
 * Pillar #3 (storage privacy) — vervangt de publieke bucket-URL pattern.
 *
 * Auth: vereist ingelogde user. RLS op bonnen-tabel zorgt dat user alleen
 * eigen org bonnen kan opvragen. Storage-RLS doet de tweede defense-layer.
 */
import { NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getBonSignedUrl } from '@/lib/dal/bonnen';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const bonIdParam = req.nextUrl.searchParams.get('bonId');
    const bonId = bonIdParam ? parseInt(bonIdParam, 10) : NaN;

    if (!Number.isInteger(bonId) || bonId <= 0) {
        return Response.json({ error: 'invalid bonId' }, { status: 400 });
    }

    const sb = await createServerSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    // DAL doet de SELECT op bonnen (RLS-gefilterd) en genereert signed URL.
    const result = await getBonSignedUrl(sb, bonId, 3600);
    if (!result) {
        return Response.json({ error: 'bon not found or no file' }, { status: 404 });
    }

    return Response.json({
        url: result.url,
        mime: result.mime,
        ttl_seconds: 3600,
    });
}
