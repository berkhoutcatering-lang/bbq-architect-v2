'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import TemplateEditor from '@/components/template-editor/TemplateEditor';
import { useOrg } from '@/lib/OrgContext';
import { DEFAULT_TEMPLATES } from '@/lib/templateDefaults';
import type { PdfTemplate, TemplateBlock, PageSettings } from '@/types/template.types';

export default function TemplateEditorPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
        <Loader2 size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
      </div>
    }>
      <TemplateEditorInner />
    </Suspense>
  );
}

function TemplateEditorInner() {
  const searchParams = useSearchParams();
  const { orgId, loading: orgLoading } = useOrg();
  const documentType = (searchParams.get('type') || 'factuur') as PdfTemplate['document_type'];
  const templateId = searchParams.get('id');
  const scope = searchParams.get('scope'); // 'global' for platform admin

  const [template, setTemplate] = useState<PdfTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(function () {
    // Wait for org context to finish loading before fetching
    if (orgLoading) return;

    if (templateId) {
      // Load existing template
      fetch('/api/templates/' + templateId)
        .then(function (r) { return r.json(); })
        .then(function (d) { setTemplate(d.template || null); })
        .catch(function () { /* fall through to built-in defaults */ })
        .finally(function () { setLoading(false); });
    } else {
      // Load default for this type + org, or use built-in defaults
      const targetOrgId = scope === 'global' ? null : orgId;
      const params = new URLSearchParams({ type: documentType });
      if (targetOrgId) params.set('orgId', targetOrgId);

      fetch('/api/templates?' + params.toString())
        .then(function (r) { return r.json(); })
        .then(function (d) {
          const templates = d.templates || [];
          // Prefer org-specific default, then global default
          const orgDefault = templates.find(function (t: PdfTemplate) { return t.organization_id === targetOrgId && t.is_default; });
          const globalDefault = templates.find(function (t: PdfTemplate) { return !t.organization_id && t.is_default; });
          setTemplate(orgDefault || globalDefault || null);
        })
        .catch(function () { /* fall through to built-in defaults */ })
        .finally(function () { setLoading(false); });
    }
  }, [templateId, documentType, orgId, orgLoading, scope]);

  async function handleSave(blocks: TemplateBlock[], pageSettings: PageSettings, name: string) {
    const targetOrgId = scope === 'global' ? null : orgId;

    if (template?.id) {
      // Update existing
      await fetch('/api/templates/' + template.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, pageSettings, name }),
      });
    } else {
      // Create new
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType, name, blocks, pageSettings,
          organizationId: targetOrgId,
          isDefault: true,
        }),
      });
      const data = await res.json();
      if (data.template) setTemplate(data.template);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
        <Loader2 size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // If no template exists, start with built-in defaults
  const defaultConfig = DEFAULT_TEMPLATES[documentType];
  const effectiveTemplate = template || (defaultConfig ? {
    id: '',
    organization_id: scope === 'global' ? null : orgId,
    document_type: documentType,
    name: defaultConfig.name,
    description: '',
    blocks: defaultConfig.blocks,
    page_settings: defaultConfig.pageSettings,
    is_default: true,
    is_active: true,
    version: 1,
    created_by: null,
    created_at: '',
    updated_at: '',
  } as PdfTemplate : null);

  return (
    <TemplateEditor
      template={effectiveTemplate}
      documentType={documentType}
      organizationId={scope === 'global' ? null : orgId}
      onSave={handleSave}
    />
  );
}
