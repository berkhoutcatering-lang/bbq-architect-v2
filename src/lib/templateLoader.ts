/**
 * Template Loader — Fetches PDF templates with caching
 * Bridge between pages and the template system
 */

import { DEFAULT_TEMPLATES } from '@/lib/templateDefaults';
import type { PdfTemplate } from '@/types/template.types';

// In-memory cache with TTL
const cache = new Map<string, { template: PdfTemplate; timestamp: number }>();
const CACHE_TTL = 60_000; // 60 seconds

export async function loadTemplate(
  documentType: string,
  orgId: string | null
): Promise<PdfTemplate | null> {
  const cacheKey = (orgId || 'global') + ':' + documentType;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.template;
  }

  // Try fetch from API
  try {
    const params = new URLSearchParams({ type: documentType });
    if (orgId) params.set('orgId', orgId);

    const res = await fetch('/api/templates?' + params.toString());
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const data = await res.json();
    const templates: PdfTemplate[] = data.templates || [];

    // Prefer org-specific default, then global default
    const orgDefault = templates.find(function (t) {
      return t.organization_id === orgId && t.is_default;
    });
    const globalDefault = templates.find(function (t) {
      return !t.organization_id && t.is_default;
    });
    const template = orgDefault || globalDefault || null;

    if (template) {
      cache.set(cacheKey, { template, timestamp: Date.now() });
      return template;
    }
  } catch (err) {
    console.warn('[templateLoader] Fetch failed, using defaults:', err);
  }

  // Fallback to built-in defaults
  const defaultConfig = DEFAULT_TEMPLATES[documentType];
  if (defaultConfig) {
    const fallback: PdfTemplate = {
      id: '',
      organization_id: orgId,
      document_type: documentType as PdfTemplate['document_type'],
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
    };
    cache.set(cacheKey, { template: fallback, timestamp: Date.now() });
    return fallback;
  }

  return null;
}

export function clearTemplateCache(): void {
  cache.clear();
}
