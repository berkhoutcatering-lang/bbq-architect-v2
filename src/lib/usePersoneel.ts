'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import type { Personeel } from '@/types';

/**
 * Personeel-hook met UUID id (los van useSupabase die number-id verwacht).
 * Realtime via shared postgres_changes channel; geen offline-support nodig
 * — personeel-CRUD gebeurt op kantoor, niet op het event.
 */
export function usePersoneel(): {
  data: Personeel[];
  loading: boolean;
  refetch: () => void;
  insert: (row: Partial<Personeel>) => Promise<Personeel | null>;
  update: (id: string, row: Partial<Personeel>) => Promise<Personeel | null>;
  remove: (id: string) => Promise<void>;
} {
  const { orgId } = useOrg();
  const [data, setData] = useState<Personeel[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(function () {
    if (!supabase || !orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('personeel')
      .select('*')
      .eq('organization_id', orgId)
      .order('actief', { ascending: false })
      .order('naam', { ascending: true })
      .then(function (res) {
        if (res.error) {
          console.warn('[DB] Personeel fetch warning:', res.error.message);
        }
        if (res.data) setData(res.data as Personeel[]);
        setLoading(false);
      });
  }, [orgId]);

  useEffect(function () {
    fetchData();
  }, [fetchData]);

  useEffect(function () {
    if (!supabase || !orgId) return;
    const channel = supabase
      .channel('rt_personeel_' + orgId.substring(0, 8))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'personeel',
          filter: 'organization_id=eq.' + orgId,
        },
        function () {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(fetchData, 300);
        },
      )
      .subscribe();

    return function () {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, fetchData]);

  const insert = useCallback(function (row: Partial<Personeel>): Promise<Personeel | null> {
    if (!supabase || !orgId) return Promise.resolve(null);
    return Promise.resolve(
      supabase
        .from('personeel')
        .insert({ ...row, organization_id: orgId } as Record<string, unknown>)
        .select()
        .single(),
    ).then(function (res) {
      if (res.error) {
        console.error('[DB] Personeel insert error:', res.error.message);
        throw res.error;
      }
      const created = res.data as Personeel;
      setData(function (prev) {
        return prev.concat([created]).sort(function (a, b) {
          if (a.actief !== b.actief) return a.actief ? -1 : 1;
          return a.naam.localeCompare(b.naam);
        });
      });
      return created;
    });
  }, [orgId]);

  const update = useCallback(function (id: string, row: Partial<Personeel>): Promise<Personeel | null> {
    if (!supabase || !orgId) return Promise.resolve(null);
    let prev: Personeel | undefined;
    setData(function (rows) {
      return rows.map(function (r) {
        if (r.id === id) {
          prev = r;
          return { ...r, ...row } as Personeel;
        }
        return r;
      });
    });
    return Promise.resolve(
      supabase
        .from('personeel')
        .update(row as Record<string, unknown>)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single(),
    ).then(function (res) {
      if (res.error) {
        if (prev) setData(function (rows) { return rows.map(function (r) { return r.id === id ? prev! : r; }); });
        console.error('[DB] Personeel update error:', res.error.message);
        throw res.error;
      }
      if (res.data) {
        setData(function (rows) {
          return rows.map(function (r) { return r.id === id ? (res.data as Personeel) : r; });
        });
      }
      return res.data as Personeel;
    });
  }, [orgId]);

  const remove = useCallback(function (id: string): Promise<void> {
    if (!supabase || !orgId) return Promise.resolve();
    let removed: Personeel | undefined;
    setData(function (rows) {
      removed = rows.find(function (r) { return r.id === id; });
      return rows.filter(function (r) { return r.id !== id; });
    });
    return Promise.resolve(
      supabase.from('personeel').delete().eq('id', id).eq('organization_id', orgId),
    ).then(function (res) {
      if (res.error) {
        if (removed) setData(function (rows) { return rows.concat([removed!]); });
        console.error('[DB] Personeel delete error:', res.error.message);
        throw res.error;
      }
    });
  }, [orgId]);

  return { data, loading, refetch: fetchData, insert, update, remove };
}
