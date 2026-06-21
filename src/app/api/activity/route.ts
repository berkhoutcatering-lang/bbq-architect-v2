import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { withTenantAuth } from '@/lib/withTenantAuth';

// POST — Log a page visit or action
export const POST = withTenantAuth(async function POST(request: NextRequest, ctx) {
  const body = await request.json();
  const { action, page, metadata } = body;

  if (!action) {
    return NextResponse.json({ error: 'action is verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  await sb.from('activity_log').insert({
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    action,
    page: page || null,
    metadata: metadata || {},
  });

  return NextResponse.json({ success: true });
});
