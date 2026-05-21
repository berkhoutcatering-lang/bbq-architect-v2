'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Palette, ArrowRight } from 'lucide-react';
import Link from 'next/link';
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
        <TemplateEditorRouter />
      </Suspense>
    </RequireTier>
  );
}

/* S4: menukaart-styling is verhuisd naar de per-offerte editor
   (/offertes/[id]/menukaart-editor). Routing-check hier zodat de Inner-component
   z'n hooks niet conditioneel hoeft te callen. */
function TemplateEditorRouter() {
  const searchParams = useSearchParams();
  const documentType = (searchParams.get('type') || 'factuur') as PdfTemplate['document_type'];
  if (documentType === 'menukaart') return <MenukaartRedirectNotice />;
  return <TemplateEditorInner />;
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

/* Notice + CTA voor users die op de oude /template-editor?type=menukaart link
   landen vanuit een bookmark of oude UI. Wijst naar de nieuwe per-offerte
   editor of (als ze geen offerte voor ogen hebben) naar /offertes. */
function MenukaartRedirectNotice() {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
      <div style={{
        maxWidth: 480,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '32px 28px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12,
          background: 'rgba(158,120,28,.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 18px',
          color: '#c4a35a',
        }}>
          <Palette size={26} />
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
          Menukaart-styling werkt nu per offerte
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
          Vroeger maakte je hier één losse menukaart-template. Nu pas je per offerte de kleuren, lettertypes en logo aan op een vaste template-structuur — met cascade vanaf je brand-instellingen.
        </p>
        <Link
          href="/offertes"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 6,
            background: '#9e781c', color: '#fff',
            fontSize: 13, fontWeight: 600,
            border: '1px solid rgba(158,120,28,.5)',
            boxShadow: '0 2px 8px rgba(158,120,28,.25)',
            textDecoration: 'none',
          }}
        >
          Naar offertes <ArrowRight size={14} />
        </Link>
        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--muted-light)' }}>
          Kies een offerte en klik op &ldquo;Menukaart&rdquo; om de styling te bewerken.
        </div>
      </div>
    </div>
  );
}
