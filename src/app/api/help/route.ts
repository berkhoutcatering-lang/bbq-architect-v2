import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

// GET — Search help articles
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const category = request.nextUrl.searchParams.get('category') || '';

  const sb = createServiceSupabase();

  let query = sb
    .from('help_articles')
    .select('id, slug, title, content, category, search_tags, sort_order')
    .eq('published', true)
    .order('sort_order');

  if (category) {
    query = query.eq('category', category);
  }

  if (q) {
    query = query.or('title.ilike.%' + q + '%,content.ilike.%' + q + '%');
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get unique categories
  const { data: allArticles } = await sb
    .from('help_articles')
    .select('category')
    .eq('published', true);

  const categories = [...new Set((allArticles || []).map(a => a.category))];

  return NextResponse.json({ articles: data || [], categories });
}
