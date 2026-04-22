'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import TemplateEditor from '@/components/template-editor/TemplateEditor';
import { useOrg } from '@/lib/OrgContext';
import { DEFAULT_TEMPLATES, STARTER_TEMPLATES } from '@/lib/templateDefaults';
import type { PdfTemplate, TemplateBlock, PageSettings } from '@/types/template.types';
import { RequireTier } from '@/components/PaywallPrompt';

export default function TemplateEditorPage() {
  return (
    <RequireTier feature="template_editor">
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
          <Loader2 size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
        </div>
      }>
        <TemplateEditorInner />
      </Suspense>
    </RequireTier>
  );
}

function TemplateEditorInner() {
  const searchParams = useSearchParams();
  const { orgId, loading: orgLoading } = useOrg();
  const documentType = (searchParams.get('type') || 'factuur') as PdfTemplate['document_type'];
  const templateId = searchParams.get('id');
  const scope = searchParams.get('scope'); // 'global' for platform admin
  const starterId = searchParams.get('start'); // voorgesteld starter-template voor nieuwe template

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
    } else if (starterId) {
      // Starter expliciet gekozen → begin vers (geen bestaande default loaden),
      // zodat Opslaan een NIEUWE template aanmaakt i.p.v. een bestaande te overschrijven.
      setTemplate(null);
      setLoading(false);
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
  }, [templateId, starterId, documentType, orgId, orgLoading, scope]);

  async function handleSave(blocks: TemplateBlock[], pageSettings: PageSettings, name: string) {
    const targetOrgId = scope === 'global' ? null : orgId;

    if (template?.id) {
      // Update existing
      const res = await fetch('/api/templates/' + template.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, pageSettings, name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        throw new Error(err.error || 'Opslaan mislukt (status ' + res.status + ')');
      }
      const data = await res.json();
      if (data.template) setTemplate(data.template);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Onbekende fout' }));
        throw new Error(err.error || 'Opslaan mislukt (status ' + res.status + ')');
      }
      const data = await res.json();
      if (data.template) {
        setTemplate(data.template);
        // URL bijwerken naar ?id=<nieuwe-id> zodat herladen/F5 de juiste template pakt
        // en een tweede Opslaan klik de NIEUWE template update i.p.v. nog een kopie maakt.
        if (typeof window !== 'undefined' && data.template.id) {
          const newUrl = '/template-editor?type=' + documentType + '&id=' + data.template.id;
          window.history.replaceState(null, '', newUrl);
        }
      }
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg)' }}>
        <Loader2 size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  // If no template exists, start with built-in defaults (or a requested starter via ?start=)
  const defaultConfig = DEFAULT_TEMPLATES[documentType];
  const starterConfig = starterId
    ? (STARTER_TEMPLATES[documentType] || []).find(s => s.id === starterId)
    : undefined;
  const startBlocks = starterConfig?.blocks || defaultConfig?.blocks;
  const startPageSettings = starterConfig?.pageSettings || defaultConfig?.pageSettings;
  // Menukaart-starters krijgen een vaste naam zodat de event-hub ze kan terugvinden per stijl
  const MENUKAART_STYLE_NAMES: Record<string, string> = {
    'menukaart-ambacht': 'Menukaart — Ambacht',
    'menukaart-modern': 'Menukaart — Modern',
    'menukaart-slate': 'Menukaart — Slate',
    // Legacy starters blijven werken voor oude bookmarks
    'menukaart-vintage': 'Menukaart — Ambacht',
    'menukaart-licht': 'Menukaart — Modern',
    'menukaart-donker': 'Menukaart — Slate',
  };
  const startName = (starterId && MENUKAART_STYLE_NAMES[starterId]) || starterConfig?.name || defaultConfig?.name;
  const effectiveTemplate = template || (startBlocks && startPageSettings ? {
    id: '',
    organization_id: scope === 'global' ? null : orgId,
    document_type: documentType,
    name: startName || 'Nieuwe template',
    description: '',
    blocks: startBlocks,
    page_settings: startPageSettings,
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
