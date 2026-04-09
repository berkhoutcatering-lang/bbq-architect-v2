import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';

// GET — Single template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const sb = createServiceSupabase();
  const { data: template, error } = await sb
    .from('pdf_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !template) return NextResponse.json({ error: 'Template niet gevonden' }, { status: 404 });

  return NextResponse.json({ template });
}

// PUT — Update template
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json();
  const { name, blocks, pageSettings, isDefault } = body;

  const sb = createServiceSupabase();

  // If setting as default, unset existing defaults
  if (isDefault) {
    const { data: current } = await sb.from('pdf_templates').select('document_type, organization_id').eq('id', id).single();
    if (current) {
      let unsetQuery = sb
        .from('pdf_templates')
        .update({ is_default: false })
        .eq('document_type', current.document_type)
        .eq('is_default', true)
        .neq('id', id);

      if (current.organization_id) {
        unsetQuery = unsetQuery.eq('organization_id', current.organization_id);
      } else {
        unsetQuery = unsetQuery.is('organization_id', null);
      }
      await unsetQuery;
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name;
  if (blocks !== undefined) update.blocks = blocks;
  if (pageSettings !== undefined) update.page_settings = pageSettings;
  if (isDefault !== undefined) update.is_default = isDefault;

  // Increment version
  const { data: prev } = await sb.from('pdf_templates').select('version').eq('id', id).single();
  update.version = (prev?.version || 0) + 1;

  const { error } = await sb.from('pdf_templates').update(update).eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE — Delete template
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const sb = createServiceSupabase();
  const { error } = await sb.from('pdf_templates').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
