'use client';

import { useEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { fmtDateTimeShort } from '@/lib/uren-format';
import type { AuditLogEntry } from '@/types';

const PAGE_SIZE = 30;

export default function AuditBlock() {
  const { orgId } = useOrg();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(function () {
    if (!supabase || !orgId) return;
    let cancelled = false;

    function load() {
      setLoading(true);
      supabase
        .from('audit_log')
        .select('*')
        .eq('organization_id', orgId)
        .eq('record_table', 'time_logs')
        .order('changed_at', { ascending: false })
        .limit(PAGE_SIZE)
        .then(function (res) {
          if (cancelled) return;
          if (res.data) setEntries(res.data as AuditLogEntry[]);
          setLoading(false);
        });
    }
    load();

    const channel = supabase
      .channel('rt_audit_time_logs_' + orgId.substring(0, 8))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_log',
          filter: 'organization_id=eq.' + orgId,
        },
        function () {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(load, 300);
        },
      )
      .subscribe();

    return function () {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  return (
    <div className="panel inv-glass" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <ScrollText size={14} style={{ color: 'var(--muted)' }} />
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '.05em' }}>Activiteit</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>· laatste {entries.length}</span>
      </div>

      {loading && entries.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Laden…</div>
      ) : entries.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>
          Nog geen klok-acties.
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {entries.map(function (e) {
            return (
              <div key={e.id} style={{ padding: '4px 0', color: 'var(--text)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>[{fmtDateTimeShort(e.changed_at)}]</span>
                <span>{describe(e)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function describe(e: AuditLogEntry): string {
  const m = e.metadata || {};
  const actor = m.actor_naam || 'Iemand';
  const subject = m.personeel_naam || 'crew-lid';
  const event = m.event_naam ? ' op ' + m.event_naam : '';
  const isSelf = actor === subject;

  switch (m.event_kind) {
    case 'punch_in':
      return isSelf
        ? actor + ' klokte zichzelf in' + event
        : actor + ' klokte ' + subject + ' in' + event;
    case 'punch_out': {
      const dur = m.duration_ms ? fmtDur(m.duration_ms) : null;
      const tail = dur ? ' · ' + dur : '';
      return isSelf
        ? actor + ' klokte zichzelf uit' + tail
        : actor + ' klokte ' + subject + ' uit' + tail;
    }
    case 'manual_edit':
      return actor + ' wijzigde een registratie van ' + subject;
    case 'delete':
      return actor + ' verwijderde een registratie van ' + subject;
    default:
      return e.action + ' op ' + subject;
  }
}

function fmtDur(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h + 'u ' + (m < 10 ? '0' : '') + m + 'm';
}
