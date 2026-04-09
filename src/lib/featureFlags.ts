'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

// Default flags — all features enabled by default for simplicity
const DEFAULT_FLAGS: Record<string, boolean> = {
  ai_assistant: true,
  price_intelligence: true,
  csv_import: true,
  website_builder: true,
  advanced_analytics: true,
  api_access: false,
  multi_location: false,
  white_label: false,
};

export function useFeatureFlags() {
  const { orgId } = useOrg();
  const [flags, setFlags] = useState<Record<string, boolean>>(DEFAULT_FLAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(function () {
    if (!supabase || !orgId) return;

    supabase
      .from('organizations')
      .select('feature_flags')
      .eq('id', orgId)
      .single()
      .then(function ({ data }) {
        if (data?.feature_flags && typeof data.feature_flags === 'object') {
          setFlags({ ...DEFAULT_FLAGS, ...(data.feature_flags as Record<string, boolean>) });
        }
        setLoaded(true);
      });
  }, [orgId]);

  function isEnabled(flag: string): boolean {
    return flags[flag] ?? DEFAULT_FLAGS[flag] ?? true;
  }

  return { flags, isEnabled, loaded };
}
