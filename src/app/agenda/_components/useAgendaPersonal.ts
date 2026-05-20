'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { useAuth } from '@/lib/AuthContext';
import type { AgendaPersonal } from '@/types/database.types';

interface UseAgendaPersonalReturn {
  rows: AgendaPersonal[];
  loading: boolean;
  insert: (args: InsertArgs) => Promise<AgendaPersonal | null>;
  update: (id: string, args: Partial<InsertArgs>) => Promise<AgendaPersonal | null>;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

export interface InsertArgs {
  title: string;
  date: string;        /* YYYY-MM-DD */
  start_time: string;  /* HH:MM */
  end_time?: string | null;
  notes?: string | null;
  color?: string | null;
  /* Koppeling met agenda_categories (NULL = system "Persoonlijk" cal). */
  category_id?: string | null;
}

/* Persoonlijke agenda-items — privé per gebruiker. RLS in DB filtert op user_id;
   client kan dus altijd `select *` doen. Realtime-sub luistert op user_id-filter. */
export function useAgendaPersonal(): UseAgendaPersonalReturn {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const [rows, setRows] = useState<AgendaPersonal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await supabase
      .from('agenda_personal')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true });
    if (res.data) setRows(res.data as AgendaPersonal[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`rt_agenda_personal_${user.id.slice(0, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agenda_personal',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchRows(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchRows]);

  const insert = useCallback(async (args: InsertArgs): Promise<AgendaPersonal | null> => {
    if (!user?.id || !orgId) return null;
    const res = await supabase
      .from('agenda_personal')
      .insert({
        organization_id: orgId,
        user_id: user.id,
        title: args.title,
        date: args.date,
        start_time: args.start_time,
        end_time: args.end_time ?? null,
        notes: args.notes ?? null,
        color: args.color ?? '#888888',
        category_id: args.category_id ?? null,
      })
      .select('*')
      .single();
    if (res.error) {
      console.error('agenda_personal insert error', res.error);
      return null;
    }
    /* Realtime-sub doet refetch — geen handmatige state-update nodig. */
    return res.data as AgendaPersonal;
  }, [user?.id, orgId]);

  const update = useCallback(async (id: string, args: Partial<InsertArgs>): Promise<AgendaPersonal | null> => {
    if (!user?.id) return null;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.date !== undefined) patch.date = args.date;
    if (args.start_time !== undefined) patch.start_time = args.start_time;
    if (args.end_time !== undefined) patch.end_time = args.end_time;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.color !== undefined) patch.color = args.color;
    if (args.category_id !== undefined) patch.category_id = args.category_id;
    const res = await supabase
      .from('agenda_personal')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();
    if (res.error) {
      console.error('agenda_personal update error', res.error);
      return null;
    }
    return res.data as AgendaPersonal;
  }, [user?.id]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (!user?.id) return;
    const res = await supabase
      .from('agenda_personal')
      .delete()
      .eq('id', id);
    if (res.error) console.error('agenda_personal delete error', res.error);
  }, [user?.id]);

  return { rows, loading, insert, update, remove, refetch: fetchRows };
}
