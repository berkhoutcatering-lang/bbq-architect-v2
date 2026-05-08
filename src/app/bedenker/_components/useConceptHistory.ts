'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import type { Concept } from './types';

export type BedenkMode = 'vrij' | 'voorraad' | 'klant';

export interface ModeContext {
  /** voorraad-mode: vrije tekst over restjes/ingrediënten */
  voorraad?: string;
  /** klant-mode: dieet-restricties */
  dieet?: string[];
  /** klant-mode: aantal gasten */
  gasten?: number;
  /** klant-mode: budget per persoon (€) */
  budget_pp?: number;
  /** klant-mode: vrije context (bv. "bruiloft, buiten, juli") */
  context?: string;
}

export interface ConceptHistoryRow {
  id: string;
  organization_id: string;
  user_id: string | null;
  prompt: string;
  mode: BedenkMode;
  mode_context: ModeContext;
  naam: string;
  tagline: string | null;
  glyph: string | null;
  categorie: string | null;
  cuisine: string | null;
  kostprijs_pp: number | null;
  marge_pct: number | null;
  confidence: number | null;
  body: Record<string, unknown>;
  inspiraties: { name: string; category?: string; glyph?: string }[];
  status: 'nieuw' | 'bewaard' | 'afgewezen' | 'verlopen';
  saved_gerecht_id: string | null;
  saved_at: string | null;
  created_at: string;
}

export interface ConceptHistoryStats {
  totaalBedacht: number;
  totaalBewaard: number;
  inspiratiesUniek: number;
  gemConfidence: number;
}

interface UseConceptHistoryReturn {
  rows: ConceptHistoryRow[];
  loading: boolean;
  stats: ConceptHistoryStats;
  insertConcept: (args: InsertArgs) => Promise<ConceptHistoryRow | null>;
  markBewaard: (id: string, gerechtId: string) => Promise<void>;
  markAfgewezen: (ids: string[]) => Promise<void>;
  refetch: () => void;
}

interface InsertArgs {
  concept: Concept;
  prompt: string;
  mode: BedenkMode;
  modeContext: ModeContext;
  body: Record<string, unknown>;
}

const HISTORY_LIMIT = 60;

export function useConceptHistory(): UseConceptHistoryReturn {
  const { orgId } = useOrg();
  const [rows, setRows] = useState<ConceptHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await supabase
      .from('concept_history')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (res.data) setRows(res.data as ConceptHistoryRow[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Realtime — andere team-leden zien direct nieuwe concepten verschijnen
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`rt_concept_history_${orgId.slice(0, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'concept_history',
          filter: `organization_id=eq.${orgId}`,
        },
        () => fetchRows(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchRows]);

  const insertConcept = useCallback(
    async ({ concept, prompt, mode, modeContext, body }: InsertArgs) => {
      if (!orgId) return null;
      const payload = {
        organization_id: orgId,
        prompt,
        mode,
        mode_context: modeContext,
        naam: concept.name,
        tagline: concept.tagline,
        glyph: concept.glyph,
        categorie: concept.category,
        cuisine: concept.cuisine,
        kostprijs_pp: concept.estCost > 0 ? concept.estCost : null,
        marge_pct: concept.margin > 0 ? concept.margin * 100 : null,
        confidence: concept.confidence,
        body,
        inspiraties: concept.inspiredBy,
        status: 'nieuw' as const,
      };
      const res = await supabase
        .from('concept_history')
        .insert(payload)
        .select()
        .single();
      if (res.error) {
        console.warn('[concept_history] insert failed:', res.error.message);
        return null;
      }
      const row = res.data as ConceptHistoryRow;
      setRows((prev) => [row, ...prev].slice(0, HISTORY_LIMIT));
      return row;
    },
    [orgId],
  );

  const markBewaard = useCallback(async (id: string, gerechtId: string) => {
    const res = await supabase
      .from('concept_history')
      .update({
        status: 'bewaard',
        saved_gerecht_id: gerechtId,
        saved_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (res.error) {
      console.warn('[concept_history] markBewaard failed:', res.error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: 'bewaard', saved_gerecht_id: gerechtId, saved_at: new Date().toISOString() }
          : r,
      ),
    );
  }, []);

  const markAfgewezen = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const res = await supabase
      .from('concept_history')
      .update({ status: 'afgewezen' })
      .in('id', ids);
    if (res.error) {
      console.warn('[concept_history] markAfgewezen failed:', res.error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, status: 'afgewezen' } : r)));
  }, []);

  // Stats — zelfde shape als oude localStorage-derived stats, maar nu op echte data
  const stats: ConceptHistoryStats = {
    totaalBedacht: rows.length,
    totaalBewaard: rows.filter((r) => r.status === 'bewaard').length,
    inspiratiesUniek: (() => {
      const set = new Set<string>();
      rows.forEach((r) => r.inspiraties.forEach((i) => set.add(i.name)));
      return set.size;
    })(),
    gemConfidence: (() => {
      const withConf = rows.filter((r) => r.confidence !== null);
      if (withConf.length === 0) return 0;
      return withConf.reduce((s, r) => s + (r.confidence || 0), 0) / withConf.length;
    })(),
  };

  return {
    rows,
    loading,
    stats,
    insertConcept,
    markBewaard,
    markAfgewezen,
    refetch: fetchRows,
  };
}
