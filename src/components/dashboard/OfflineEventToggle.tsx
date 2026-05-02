'use client';

import React, { useState } from 'react';
import { Cloud, CloudOff, Loader2, Check } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useActiveOfflineEvent } from '@/lib/useActiveOfflineEvent';
import {
  setActiveOfflineEvent,
  clearActiveOfflineEvent,
  snapshotEvent,
  type SnapshotProgress,
} from '@/lib/offlineStorage';
import { syncEventQueue } from '@/lib/syncQueue';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

interface Props {
  eventId: number;
  /** Optional klant_id om de klant-row mee te snapshotten voor offline branding/contact. */
  klantId?: number | null;
  /** UI-style: 'compact' (alleen icoontje + label) of 'wide' (volledige knop met progress). */
  variant?: 'compact' | 'wide';
}

/**
 * "Start event op locatie" / "Eindig event" knop.
 *
 * Bij Start:
 *  1. Pull alle event-data via Supabase (snapshotEvent helper)
 *  2. Set localStorage active-offline-event flag
 *  3. Toast bevestiging
 *
 * Bij Eindig:
 *  1. Sync queue → Supabase via syncQueue.ts
 *  2. Clear active-offline-event flag
 *  3. Toast met conflict-info indien relevant
 */
export default function OfflineEventToggle({ eventId, klantId, variant = 'wide' }: Props): React.ReactElement | null {
  const { event, isSyncing, queuedCount } = useActiveOfflineEvent();
  const { orgId } = useOrg();
  const toast = useToast();
  const [snapshotting, setSnapshotting] = useState(false);
  const [progress, setProgress] = useState<SnapshotProgress | null>(null);

  const isActiveForThisEvent = event !== null && event.eventId === eventId;
  const isActiveForOther = event !== null && event.eventId !== eventId;

  async function handleStart() {
    if (!supabase || !orgId) {
      toast({ message: 'Database niet beschikbaar — kan geen snapshot maken.', type: 'error' });
      return;
    }
    if (!navigator.onLine) {
      toast({ message: 'Geen internet — verbinding nodig om snapshot te pakken.', type: 'warning' });
      return;
    }

    setSnapshotting(true);
    setProgress(null);
    try {
      await snapshotEvent(
        eventId,
        orgId,
        klantId ?? null,
        // Cast naar SnapshotClient interface; @supabase/supabase-js voldoet aan structurele shape.
        supabase as unknown as Parameters<typeof snapshotEvent>[3],
        (p) => setProgress(p),
      );
      setActiveOfflineEvent(eventId);
      toast({
        message: 'Event-snapshot klaar. Werk lokaal door — sync bij eindig event.',
        type: 'success',
        title: 'Offline-mode actief',
      });
    } catch (e) {
      toast({ message: 'Snapshot mislukt: ' + (e as Error).message, type: 'error' });
    } finally {
      setSnapshotting(false);
      setProgress(null);
    }
  }

  async function handleEnd() {
    if (!event) return;

    if (!navigator.onLine) {
      toast({ message: 'Geen internet — wacht tot verbinding terug is om te synchroniseren.', type: 'warning' });
      return;
    }

    try {
      const result = await syncEventQueue(event.eventId, { cleanupOnSuccess: true });
      clearActiveOfflineEvent();

      if (result.failed > 0) {
        toast({
          message: `${result.succeeded} writes gesynced, ${result.failed} mislukt — probeer opnieuw.`,
          type: 'warning',
          title: 'Sync deels gelukt',
        });
      } else if (result.conflicts.length > 0) {
        toast({
          message: `${result.succeeded} writes gesynced. ${result.conflicts.length} conflicten — jouw versies geüpload, collega's eerdere wijzigingen overschreven.`,
          type: 'warning',
          title: 'Sync klaar met conflicten',
        });
      } else if (result.total === 0) {
        toast({ message: 'Geen pending wijzigingen — offline-mode beëindigd.', type: 'info' });
      } else {
        toast({
          message: `${result.succeeded} wijziging${result.succeeded === 1 ? '' : 'en'} gesynced.`,
          type: 'success',
          title: 'Event afgerond',
        });
      }
    } catch (e) {
      toast({ message: 'Sync mislukt: ' + (e as Error).message, type: 'error' });
    }
  }

  // Andere event al actief — toon waarschuwing
  if (isActiveForOther) {
    return (
      <div
        title={`Eindig eerst event #${event!.eventId} voordat je een ander offline kunt starten`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: 11,
          color: 'var(--muted)',
          background: 'rgba(255,255,255,.03)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          letterSpacing: '.04em',
        }}
      >
        <CloudOff size={12} />
        Ander event offline actief
      </div>
    );
  }

  // Active voor dit event — toon "Eindig event"
  if (isActiveForThisEvent) {
    return (
      <button
        onClick={handleEnd}
        disabled={isSyncing}
        title="Synchroniseer alle wijzigingen naar Supabase en stop offline-mode"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: variant === 'wide' ? '8px 14px' : '6px 10px',
          fontSize: variant === 'wide' ? 13 : 11,
          fontWeight: 600,
          color: '#0a0a0c',
          background: isSyncing
            ? 'linear-gradient(135deg, #f59e0b, #d97706)'
            : 'linear-gradient(135deg, #86efac, #22c55e)',
          border: '1px solid rgba(34,197,94,.5)',
          borderRadius: 8,
          cursor: isSyncing ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          letterSpacing: '.02em',
        }}
      >
        {isSyncing ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Synchroniseer...
          </>
        ) : (
          <>
            <Check size={14} />
            Eindig event
            {queuedCount > 0 ? (
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'rgba(0,0,0,.3)',
                  color: '#fff',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {queuedCount}
              </span>
            ) : null}
          </>
        )}
      </button>
    );
  }

  // Idle — toon "Start event op locatie"
  return (
    <button
      onClick={handleStart}
      disabled={snapshotting}
      title="Snapshot alle event-data naar je tablet zodat de app blijft werken zonder internet"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: variant === 'wide' ? '8px 14px' : '6px 10px',
        fontSize: variant === 'wide' ? 13 : 11,
        fontWeight: 600,
        color: snapshotting ? 'var(--muted)' : 'var(--text)',
        background: snapshotting ? 'rgba(255,255,255,.04)' : 'transparent',
        border: '1px solid ' + (snapshotting ? 'var(--border)' : 'var(--brand-tint-border, rgba(196,163,90,.4))'),
        borderRadius: 8,
        cursor: snapshotting ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        letterSpacing: '.02em',
      }}
    >
      {snapshotting ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          {progress
            ? `${progress.table} (${progress.currentStep}/${progress.totalSteps})`
            : 'Snapshot...'}
        </>
      ) : (
        <>
          <Cloud size={14} color="var(--brand)" />
          Start event op locatie
        </>
      )}
    </button>
  );
}
