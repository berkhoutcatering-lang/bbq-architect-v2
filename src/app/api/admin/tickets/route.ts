/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

async function getPlatformAdmin() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return null;
  const adminEmails = (process.env.PLATFORM_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// GET — List all support tickets (admin view)
export async function GET(request: NextRequest) {
  void request;
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const sb = createServiceSupabase();

  const { data: tickets } = await sb
    .from('support_tickets')
    .select('*, organizations(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  // Get user emails
  const userIds = [...new Set((tickets || []).map((t: any) => t.user_id))];
  const { data: profiles } = await sb
    .from('profiles')
    .select('user_id, naam, email')
    .in('user_id', userIds);

  const profileMap: Record<string, any> = {};
  (profiles || []).forEach((p: any) => { profileMap[p.user_id] = p; });

  const enriched = (tickets || []).map((t: any) => ({
    ...t,
    orgName: t.organizations?.name || 'Onbekend',
    userName: profileMap[t.user_id]?.naam || 'Onbekend',
    userEmail: profileMap[t.user_id]?.email || '',
  }));

  const stats = {
    open: enriched.filter((t: any) => t.status === 'open').length,
    in_behandeling: enriched.filter((t: any) => t.status === 'in_behandeling').length,
    opgelost: enriched.filter((t: any) => t.status === 'opgelost').length,
  };

  return NextResponse.json({ tickets: enriched, stats });
}

// POST — Reply to or update a ticket
export async function POST(request: NextRequest) {
  const user = await getPlatformAdmin();
  if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });

  const { ticketId, status, adminReply } = await request.json();
  if (!ticketId) return NextResponse.json({ error: 'ticketId verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  const update: any = { updated_at: new Date().toISOString() };
  if (status) update.status = status;
  if (adminReply) {
    update.admin_reply = adminReply;
    update.replied_at = new Date().toISOString();
    if (!status) update.status = 'in_behandeling';
  }

  await sb.from('support_tickets').update(update).eq('id', ticketId);

  return NextResponse.json({ success: true });
}
