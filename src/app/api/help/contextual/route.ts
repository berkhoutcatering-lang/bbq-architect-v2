import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';

// GET — Get help articles relevant to a specific page
export async function GET(request: NextRequest) {
  const page = request.nextUrl.searchParams.get('page') || '/';

  const sb = createServiceSupabase();

  // Find articles where related_pages contains the current page
  const { data: articles } = await sb
    .from('help_articles')
    .select('id, slug, title, content, category')
    .eq('published', true)
    .contains('related_pages', [page])
    .order('sort_order')
    .limit(5);

  // If no exact match, try matching the base path
  if (!articles || articles.length === 0) {
    const basePath = '/' + page.split('/')[1];
    if (basePath !== page) {
      const { data: baseArticles } = await sb
        .from('help_articles')
        .select('id, slug, title, content, category')
        .eq('published', true)
        .contains('related_pages', [basePath])
        .order('sort_order')
        .limit(5);

      return NextResponse.json({ articles: baseArticles || [] });
    }
  }

  return NextResponse.json({ articles: articles || [] });
}
