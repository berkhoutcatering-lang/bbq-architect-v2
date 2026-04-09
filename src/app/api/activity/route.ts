import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// POST — Log a page visit or action
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const body = await request.json();
  const { action, page, organizationId, metadata } = body;

  if (!action || !organizationId) {
    return NextResponse.json({ error: 'action en organizationId zijn verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  await sb.from('activity_log').insert({
    organization_id: organizationId,
    user_id: user.id,
    action,
    page: page || null,
    metadata: metadata || {},
  });

  return NextResponse.json({ success: true });
}
