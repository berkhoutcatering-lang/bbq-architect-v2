import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// POST — Submit article feedback
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const { articleId, helpful } = await request.json();
  if (!articleId || helpful === undefined) {
    return NextResponse.json({ error: 'articleId en helpful zijn verplicht' }, { status: 400 });
  }

  const sb = createServiceSupabase();

  // Upsert feedback
  await sb
    .from('help_article_feedback')
    .upsert({
      article_id: articleId,
      user_id: user.id,
      helpful,
    }, { onConflict: 'article_id,user_id' });

  return NextResponse.json({ success: true });
}
