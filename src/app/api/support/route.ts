import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { withTenantAuth } from '@/lib/withTenantAuth';

// GET — List support tickets for current org
export const GET = withTenantAuth(async function GET(_request: NextRequest, ctx) {
  const sb = createServiceSupabase();
  const { data: tickets } = await sb
    .from('support_tickets')
    .select('*')
    .eq('organization_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ tickets: tickets || [] });
});

// POST — Create a new support ticket
export const POST = withTenantAuth(async function POST(request: NextRequest, ctx) {
  const { subject, message, category } = await request.json();

  if (!subject || !message) {
    return NextResponse.json({ error: 'subject en message zijn verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  const { data: ticket, error } = await sb
    .from('support_tickets')
    .insert({
      organization_id: ctx.orgId,
      user_id: ctx.userId,
      subject,
      message,
      category: category || 'vraag',
      status: 'open',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ticket, message: 'Ticket aangemaakt' });
});
