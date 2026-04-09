/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// GET — List support tickets for current org
export async function GET(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const orgId = request.nextUrl.searchParams.get('orgId');
  if (!orgId) return NextResponse.json({ error: 'orgId verplicht' }, { status: 400 });

  const sb = createServiceSupabase();
  const { data: tickets } = await sb
    .from('support_tickets')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ tickets: tickets || [] });
}

// POST — Create a new support ticket
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { subject, message, category, organizationId } = await request.json();

  if (!subject || !message || !organizationId) {
    return NextResponse.json({ error: 'subject, message en organizationId zijn verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  const { data: ticket, error } = await sb
    .from('support_tickets')
    .insert({
      organization_id: organizationId,
      user_id: user.id,
      subject,
      message,
      category: category || 'vraag',
      status: 'open',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ticket, message: 'Ticket aangemaakt' });
}
