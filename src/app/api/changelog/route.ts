import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// GET — Fetch changelog entries + user's last read timestamp
export async function GET() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const sb = createServiceSupabase();

  // Fetch all changelog entries
  const { data: entries } = await sb
    .from('changelog_entries')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(50);

  // Fetch user's last read timestamp
  const { data: readRecord } = await sb
    .from('changelog_reads')
    .select('last_read_at')
    .eq('user_id', user.id)
    .single();

  const lastReadAt = readRecord?.last_read_at || null;
  const unreadCount = (entries || []).filter(e => {
    if (!lastReadAt) return true;
    return new Date(e.published_at) > new Date(lastReadAt);
  }).length;

  return NextResponse.json({
    entries: entries || [],
    lastReadAt,
    unreadCount,
  });
}

// POST — Mark changelog as read
export async function POST() {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });
  }

  const sb = createServiceSupabase();

  // Upsert last read timestamp
  await sb
    .from('changelog_reads')
    .upsert({
      user_id: user.id,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  return NextResponse.json({ success: true });
}
