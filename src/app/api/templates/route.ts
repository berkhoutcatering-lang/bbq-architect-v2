/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { DEFAULT_TEMPLATES } from '@/lib/templateDefaults';

// GET — List templates (by type + org, includes global defaults)
export async function GET(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const documentType = request.nextUrl.searchParams.get('type');
  const orgId = request.nextUrl.searchParams.get('orgId');

  const sb = createServiceSupabase();

  let query = sb.from('pdf_templates').select('*').eq('is_active', true);

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  // Get both org-specific and global templates
  if (orgId) {
    query = query.or('organization_id.eq.' + orgId + ',organization_id.is.null');
  }

  const { data: templates, error } = await query.order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: templates || [] });
}

// POST — Create a new template (or seed defaults)
export async function POST(request: NextRequest) {
  const authSb = await createServerSupabase();
  const { data: { user } } = await authSb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

  const body = await request.json();

  // Seed defaults action
  if (body.action === 'seed_defaults') {
    const sb = createServiceSupabase();
    const orgId = body.organizationId || null;
    const results: string[] = [];

    for (const [docType, config] of Object.entries(DEFAULT_TEMPLATES)) {
      // Check if default already exists
      let existsQuery = sb
        .from('pdf_templates')
        .select('id')
        .eq('document_type', docType)
        .eq('is_default', true);

      if (orgId) {
        existsQuery = existsQuery.eq('organization_id', orgId);
      } else {
        existsQuery = existsQuery.is('organization_id', null);
      }

      const { data: existing } = await existsQuery.limit(1);

      if (existing && existing.length > 0) {
        results.push(docType + ': al aanwezig');
        continue;
      }

      await sb.from('pdf_templates').insert({
        organization_id: orgId,
        document_type: docType,
        name: config.name,
        blocks: config.blocks,
        page_settings: config.pageSettings,
        is_default: true,
        created_by: user.id,
      });

      results.push(docType + ': aangemaakt');
    }

    return NextResponse.json({ success: true, results });
  }

  // Regular create
  const { documentType, name, blocks, pageSettings, organizationId, isDefault } = body;

  if (!documentType) return NextResponse.json({ error: 'documentType is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // If setting as default, unset any existing default for this type+org
  if (isDefault) {
    let unsetQuery = sb
      .from('pdf_templates')
      .update({ is_default: false })
      .eq('document_type', documentType)
      .eq('is_default', true);

    if (organizationId) {
      unsetQuery = unsetQuery.eq('organization_id', organizationId);
    } else {
      unsetQuery = unsetQuery.is('organization_id', null);
    }

    await unsetQuery;
  }

  const defaultConfig = DEFAULT_TEMPLATES[documentType];

  const { data: template, error } = await sb
    .from('pdf_templates')
    .insert({
      organization_id: organizationId || null,
      document_type: documentType,
      name: name || defaultConfig?.name || 'Template',
      blocks: blocks || defaultConfig?.blocks || [],
      page_settings: pageSettings || defaultConfig?.pageSettings || {},
      is_default: isDefault ?? false,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template });
}
