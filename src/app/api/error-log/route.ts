import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// POST — Log a client-side error
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  const body = await request.json();
  const { errorMessage, errorStack, page, organizationId, userAgent } = body;

  if (!errorMessage) {
    return NextResponse.json({ error: 'errorMessage is verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  await sb.from('error_logs').insert({
    organization_id: organizationId || null,
    user_id: user?.id || null,
    error_message: errorMessage,
    error_stack: errorStack || null,
    page: page || null,
    user_agent: userAgent || null,
  });

  return NextResponse.json({ success: true });
}
