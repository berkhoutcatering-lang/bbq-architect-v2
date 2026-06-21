import { NextResponse, type NextRequest } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { DEFAULT_TEMPLATES } from '@/lib/templateDefaults';
import { withTenantAuth } from '@/lib/withTenantAuth';

// GET — List templates (by type + org, includes global defaults)
export const GET = withTenantAuth(async function GET(request: NextRequest, ctx) {
  const documentType = request.nextUrl.searchParams.get('type');

  const sb = createServiceSupabase();

  let query = sb.from('pdf_templates').select('*').eq('is_active', true);

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  // Get both org-specific and global templates
  query = query.or('organization_id.eq.' + ctx.orgId + ',organization_id.is.null');

  const { data: templates, error } = await query.order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: templates || [] });
});

// POST — Create a new template (or seed defaults)
export const POST = withTenantAuth(async function POST(request: NextRequest, ctx) {
  const body = await request.json();

  // Bulk update brand colours on selected templates' page_settings.brandColors override.
  // Body: { action: 'update_brand_colors', organizationId, templateIds?: string[], brandColors: { primary?, accent? } | null }
  // - templateIds omitted → all org templates
  // - brandColors null → clear the override on the selected templates (revert to org default)
  if (body.action === 'update_brand_colors') {
    const sb = createServiceSupabase();
    const ids: string[] | undefined = Array.isArray(body.templateIds) ? body.templateIds : undefined;
    const brandColors: { primary?: string; accent?: string } | null = body.brandColors ?? null;

    let q = sb.from('pdf_templates').select('id, page_settings').eq('is_active', true);
    q = q.eq('organization_id', ctx.orgId);
    if (ids && ids.length > 0) q = q.in('id', ids);
    const { data: rows, error: fetchErr } = await q;
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const updated: string[] = [];
    for (const row of rows || []) {
      const ps = (row.page_settings as any) || {};
      const nextPs = { ...ps };
      if (brandColors === null) {
        // Clear the override entirely
        delete nextPs.brandColors;
      } else {
        const bc = { ...(ps.brandColors || {}) };
        if (brandColors.primary !== undefined) bc.primary = brandColors.primary;
        if (brandColors.accent !== undefined) bc.accent = brandColors.accent;
        nextPs.brandColors = bc;
      }
      const { error: upErr } = await sb.from('pdf_templates').update({ page_settings: nextPs }).eq('id', row.id);
      if (!upErr) updated.push(row.id);
    }
    return NextResponse.json({ success: true, updated, count: updated.length });
  }

  // Seed defaults action
  if (body.action === 'seed_defaults') {
    const sb = createServiceSupabase();
    const results: string[] = [];

    for (const [docType, config] of Object.entries(DEFAULT_TEMPLATES)) {
      const { data: existing } = await sb
        .from('pdf_templates')
        .select('id')
        .eq('document_type', docType)
        .eq('is_default', true)
        .eq('organization_id', ctx.orgId)
        .limit(1);

      if (existing && existing.length > 0) {
        results.push(docType + ': al aanwezig');
        continue;
      }

      await sb.from('pdf_templates').insert({
        organization_id: ctx.orgId,
        document_type: docType,
        name: config.name,
        blocks: config.blocks,
        page_settings: config.pageSettings,
        is_default: true,
        created_by: ctx.userId,
      });

      results.push(docType + ': aangemaakt');
    }

    return NextResponse.json({ success: true, results });
  }

  // Regular create
  const { documentType, name, blocks, pageSettings, isDefault } = body;

  if (!documentType) return NextResponse.json({ error: 'documentType is verplicht' }, { status: 400 });

  const sb = createServiceSupabase();

  // If setting as default, unset any existing default for this type+org
  if (isDefault) {
    await sb
      .from('pdf_templates')
      .update({ is_default: false })
      .eq('document_type', documentType)
      .eq('is_default', true)
      .eq('organization_id', ctx.orgId);
  }

  const defaultConfig = DEFAULT_TEMPLATES[documentType];

  const { data: template, error } = await sb
    .from('pdf_templates')
    .insert({
      organization_id: ctx.orgId,
      document_type: documentType,
      name: name || defaultConfig?.name || 'Template',
      blocks: blocks || defaultConfig?.blocks || [],
      page_settings: pageSettings || defaultConfig?.pageSettings || {},
      is_default: isDefault ?? false,
      created_by: ctx.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template });
});
