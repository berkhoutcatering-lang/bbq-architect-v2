/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useFullscreen } from '@/hooks/useFullscreen';
import {
  startService, endService, updateCourseStatus, recallCourse, setCurrentCourseIdx,
  type CourseStatus, type ServiceStateRow,
} from '@/lib/serviceState';
import KdsTopStrip from '@/components/kds/KdsTopStrip';
import KdsAlertStrip from '@/components/kds/KdsAlertStrip';
import KdsCourseCard from '@/components/kds/KdsCourseCard';
import KdsBottomBar from '@/components/kds/KdsBottomBar';

interface Course {
  id: number;
  event_id: number;
  num: number;
  title: string;
  description?: string;
  status: CourseStatus;
  prep_time_minutes?: number;
  serve_offset_minutes?: number;
}

interface Allergy {
  id: number;
  event_id: number;
  table_id: string;
  seat?: string;
  allergens: string[];
  severity?: string;
}

interface EventRow {
  id: number;
  name: string;
  guests: number;
  date: string;
  start_time?: string;
}

export default function KdsServicePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = parseInt(String(params.id), 10);
  const isFullscreenMode = searchParams.get('fullscreen') === '1';

  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen();
  useWakeLock(isFullscreenMode);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [serviceState, setServiceState] = useState<ServiceStateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAction, setLastAction] = useState<{ courseId: number; previousStatus: CourseStatus; at: number } | null>(null);

  // Auto-enter fullscreen bij ?fullscreen=1
  useEffect(() => {
    if (isFullscreenMode && !isFullscreen) {
      // Browser vereist user-gesture. Trigger via fallback knop.
      enterFullscreen().catch(() => { /* user denied */ });
    }
  }, [isFullscreenMode, isFullscreen, enterFullscreen]);

  // ESC = exit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isFullscreenMode) {
        exitFullscreen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreenMode, exitFullscreen]);

  // Initial load
  useEffect(() => {
    if (!eventId || isNaN(eventId) || !supabase) { setLoading(false); return; }
    (async () => {
      const [evRes, cRes, aRes, ssRes] = await Promise.all([
        supabase.from('events').select('id,name,guests,date,start_time').eq('id', eventId).single(),
        supabase.from('courses').select('*').eq('event_id', eventId).order('num'),
        supabase.from('event_allergies').select('*').eq('event_id', eventId),
        supabase.from('service_state').select('*').eq('event_id', eventId).maybeSingle(),
      ]);
      if (evRes.data) setEvent(evRes.data as EventRow);
      if (cRes.data) setCourses(cRes.data as Course[]);
      if (aRes.data) setAllergies(aRes.data as Allergy[]);
      if (ssRes.data) {
        setServiceState(ssRes.data as ServiceStateRow);
      } else {
        // Auto-start service als nog niet gestart
        const fresh = await startService(eventId);
        if (fresh) setServiceState(fresh);
      }
      setLoading(false);
    })();
  }, [eventId]);

  // Realtime: courses-changes uit andere tablets
  useEffect(() => {
    if (!supabase || !eventId) return;
    const channel = supabase
      .channel('kds-' + eventId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courses', filter: `event_id=eq.${eventId}` },
        (payload) => {
          setCourses(prev => prev.map(c => c.id === (payload.new as any).id ? { ...c, ...(payload.new as any) } : c));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // Now-zone = eerste gang die niet 'served' of 'queued' is, of huidige idx
  const { nowCourse, nextCourses } = useMemo(() => {
    if (courses.length === 0) return { nowCourse: null, nextCourses: [] };
    const sorted = [...courses].sort((a, b) => a.num - b.num);
    const activeIdx = sorted.findIndex(c => c.status === 'active' || c.status === 'ready');
    const nowIdx = activeIdx >= 0 ? activeIdx : sorted.findIndex(c => c.status !== 'served');
    if (nowIdx < 0) return { nowCourse: null, nextCourses: [] };
    return {
      nowCourse: sorted[nowIdx],
      nextCourses: sorted.slice(nowIdx + 1),
    };
  }, [courses]);

  // Allergie-tafels per gang (alle tafels met allergens — koers-niveau granulariteit doen we v2)
  const allergyTablesForCourse = useCallback(() => {
    return allergies
      .filter(a => a.allergens && a.allergens.length > 0)
      .map(a => ({ table_id: a.table_id, allergen_flags: a.allergens }));
  }, [allergies]);

  // Schedule-status: simpel — "op schema" voor nu, kan later uitgebreid met course_states.klaar_at vs serve_offset
  const schedule: 'on_track' | 'delayed' | 'ahead' = 'on_track';

  async function handleAdvance(courseId: number, newStatus: CourseStatus, allergenConfirmed?: boolean) {
    // Optimistic UI
    const prev = courses.find(c => c.id === courseId);
    if (!prev) return;
    setCourses(cs => cs.map(c => c.id === courseId ? { ...c, status: newStatus } : c));
    setLastAction({ courseId, previousStatus: prev.status, at: Date.now() });
    try {
      await updateCourseStatus(eventId, courseId, newStatus, { allergenConfirmed });
    } catch (e) {
      // Rollback bij fout
      setCourses(cs => cs.map(c => c.id === courseId ? { ...c, status: prev.status } : c));
    }
  }

  async function handleRecall() {
    if (!lastAction) return;
    const ageSeconds = (Date.now() - lastAction.at) / 1000;
    if (ageSeconds > 60) {
      alert('Recall window verstreken (>60s). Pas state handmatig aan via Event Hub.');
      return;
    }
    setCourses(cs => cs.map(c => c.id === lastAction.courseId ? { ...c, status: lastAction.previousStatus } : c));
    await recallCourse(eventId, lastAction.courseId, lastAction.previousStatus);
    setLastAction(null);
  }

  function handleExit() {
    if (confirm('Service afsluiten? Service-state blijft bewaard.')) {
      exitFullscreen();
      router.push(`/events/${eventId}/hub`);
    }
  }

  if (loading) {
    return (
      <div className="kds-layout" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)' }}>Laden...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="kds-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Event niet gevonden</div>
        <button onClick={() => router.push('/events')} className="kds-bottom-bar__btn">Terug naar Events</button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="kds-layout">
        <KdsTopStrip eventName={event.name} guests={event.guests} startedAt={serviceState?.started_at} schedule={schedule} onExit={handleExit} />
        <div style={{ gridArea: 'unset', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16, flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Geen gangen voor dit event</div>
          <p style={{ color: 'var(--muted)', textAlign: 'center', maxWidth: 400 }}>
            Voeg gangen toe via de Event Hub voordat je Service Mode start.
          </p>
          <button onClick={() => router.push(`/events/${eventId}/hub`)} className="kds-bottom-bar__btn">
            Open Event Hub
          </button>
        </div>
      </div>
    );
  }

  const nowAllergyTables = nowCourse ? allergyTablesForCourse() : [];
  const criticalAllergyAlert = nowCourse && nowAllergyTables.length > 0
    ? `⚠ Tafels ${nowAllergyTables.map(t => t.table_id).join(', ')} hebben aanpassingen — controleer voor uitgifte`
    : null;

  return (
    <div className="kds-layout">
      <KdsTopStrip
        eventName={event.name}
        guests={event.guests}
        serviceTime={event.start_time?.slice(0, 5)}
        startedAt={serviceState?.started_at}
        schedule={schedule}
        onExit={handleExit}
      />

      {criticalAllergyAlert && (
        <KdsAlertStrip
          message={criticalAllergyAlert}
          severity="critical"
        />
      )}
      {!criticalAllergyAlert && <div />}

      <div className="kds-main">
        <div className="kds-now">
          <div className="kds-zone-label">Nu</div>
          {nowCourse ? (
            <KdsCourseCard
              number={nowCourse.num}
              title={nowCourse.title}
              status={nowCourse.status}
              guests={event.guests}
              countdownLabel={nowCourse.prep_time_minutes ? `Prep: ${nowCourse.prep_time_minutes} min` : undefined}
              tableExceptions={nowAllergyTables}
              size="now"
              onAdvance={(next, allergyOk) => handleAdvance(nowCourse.id, next, allergyOk)}
              onRecall={lastAction?.courseId === nowCourse.id ? handleRecall : undefined}
            />
          ) : (
            <div className="kds-course-card kds-course-card--now" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--green)' }}>✓ Alle gangen geserveerd</div>
              <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
                Service kan worden afgerond.
              </p>
              <button onClick={async () => { await endService(eventId); handleExit(); }} className="kds-course-card__cta" style={{ background: 'var(--green)' }}>
                Service afronden
              </button>
            </div>
          )}
        </div>

        <div className="kds-next">
          <div className="kds-zone-label">Volgende</div>
          {nextCourses.length === 0 && (
            <div className="kds-course-card kds-course-card--next" style={{ color: 'var(--muted)', fontSize: 13 }}>
              Geen volgende gangen
            </div>
          )}
          {nextCourses.slice(0, 4).map((c) => (
            <KdsCourseCard
              key={c.id}
              number={c.num}
              title={c.title}
              status={c.status}
              guests={event.guests}
              countdownLabel={c.serve_offset_minutes ? `T+${c.serve_offset_minutes} min` : undefined}
              size="next"
              onAdvance={(next) => handleAdvance(c.id, next)}
            />
          ))}
        </div>
      </div>

      {/* Rook ambient strip — placeholder, AI integratie later */}
      <div className="kds-rook">
        <span className="kds-rook__icon">💡</span>
        <span>Rook houdt de service in de gaten — meldingen verschijnen hier.</span>
      </div>

      <KdsBottomBar
        onRecall={lastAction ? handleRecall : undefined}
        onNote={() => alert('Notitie-flow komt v2')}
      />
    </div>
  );
}
