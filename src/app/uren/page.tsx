'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/AuthContext';
import { usePersoneel } from '@/lib/usePersoneel';
import PageHeader from '@/components/PageHeader';
import PageGuideNote from '@/components/PageGuideNote';
import { RequireTier } from '@/components/PaywallPrompt';
import PunchPanel from '@/components/uren/PunchPanel';
import LiveRow from '@/components/uren/LiveRow';
import CrewBlock from '@/components/uren/CrewBlock';
import MonthBlock from '@/components/uren/MonthBlock';
import AuditBlock from '@/components/uren/AuditBlock';
import type { DbEvent, TimeLog } from '@/types';
import { shiftDurationMs } from '@/lib/uren-format';

export default function UrenPage() {
  const { user } = useAuth();
  const { data: timeLogs, insert, update } = useSupabase<TimeLog>('time_logs', []);
  const { data: events } = useSupabase<DbEvent>('events', []);
  const { data: personeel } = usePersoneel();
  const showToast = useToast();

  const [month, setMonth] = useState(function () {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });

  const me = useMemo(function () {
    if (!user) return null;
    return personeel.find(function (p) { return p.user_id === user.id; }) || null;
  }, [personeel, user]);

  const liveLogs = useMemo(function () {
    return timeLogs.filter(function (l) { return !l.end_time; });
  }, [timeLogs]);

  const myActiveLog = useMemo(function () {
    if (!me) return undefined;
    return liveLogs.find(function (l) { return l.personeel_id === me.id; });
  }, [liveLogs, me]);

  const activeLogsByPersoneelId = useMemo(function () {
    const map: Record<string, TimeLog | undefined> = {};
    liveLogs.forEach(function (l) {
      if (l.personeel_id) map[l.personeel_id] = l;
    });
    return map;
  }, [liveLogs]);

  const myYearTotalHours = useMemo(function () {
    if (!me) return 0;
    const year = new Date().getFullYear();
    let total = 0;
    timeLogs.forEach(function (l) {
      if (l.personeel_id !== me.id) return;
      if (!l.end_time) return;
      if (new Date(l.start_time).getFullYear() !== year) return;
      total += shiftDurationMs(l.start_time, l.end_time) / 3_600_000;
    });
    return total;
  }, [timeLogs, me]);

  function punchInForPerson(personeelId: string, eventId: number | null) {
    const p = personeel.find(function (x) { return x.id === personeelId; });
    if (!p) {
      showToast('Crew-lid niet gevonden', 'error');
      return Promise.resolve();
    }
    if (activeLogsByPersoneelId[personeelId]) {
      showToast(p.naam + ' is al ingeklokt', 'warning');
      return Promise.resolve();
    }
    return insert({
      start_time: new Date().toISOString(),
      end_time: null,
      status: 'active',
      locatie: '',
      notitie: '',
      personeel_id: personeelId,
      event_id: eventId,
      uurtarief_snapshot: p.uurtarief,
      clocked_in_by: user?.id || null,
    } as Partial<TimeLog>).then(function () {
      showToast(p.naam + ' ingeklokt', 'success');
    }).catch(function (e: unknown) {
      const msg = (e as { message?: string })?.message || '';
      if (msg.includes('ux_time_logs_active_per_person')) {
        showToast(p.naam + ' is al ingeklokt', 'warning');
      } else {
        console.error('[uren] inklokken mislukt:', msg);
        showToast('Inklokken is niet gelukt. Probeer het opnieuw of ververs de pagina.', 'error');
      }
    });
  }

  function punchOutById(logId: number) {
    const log = timeLogs.find(function (l) { return l.id === logId; });
    if (!log) return Promise.resolve();
    const p = personeel.find(function (x) { return x.id === log.personeel_id; });
    return update(logId, {
      end_time: new Date().toISOString(),
      status: 'completed',
    } as Partial<TimeLog>).then(function () {
      const dur = shiftDurationMs(log.start_time, new Date().toISOString());
      const hrs = (dur / 3_600_000).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      showToast((p?.naam || 'Crew') + ' uitgeklokt — ' + hrs + 'u', 'success');
    }).catch(function (e: unknown) {
      console.error('[uren] uitklokken mislukt:', (e as Error)?.message);
      showToast('Uitklokken is niet gelukt. Probeer het opnieuw of ververs de pagina.', 'error');
    });
  }

  function handleMyPunchIn(eventId: number | null) {
    if (!me) return Promise.resolve();
    return punchInForPerson(me.id, eventId);
  }

  function handleMyPunchOut() {
    if (!myActiveLog) return Promise.resolve();
    return punchOutById(myActiveLog.id);
  }

  // Print-modus: voeg print-CSS toe
  useEffect(function () {
    const styleId = 'uren-print-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media print {
        body * { visibility: hidden; }
        .uren-print-area, .uren-print-area * { visibility: visible; }
        .uren-print-area { position: absolute; inset: 0; padding: 24px; background: white; color: black; }
        .uren-print-area .panel { background: white !important; border: 1px solid #ddd !important; }
        .no-print { display: none !important; }
        .print-only { display: block !important; }
      }
      .print-only { display: none; }
    `;
    document.head.appendChild(style);
    return function () {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  return (
    <RequireTier feature="crew_uren">
      <div className="mobile-safe-bottom" style={{ animation: 'fadeIn .4s ease-out' }}>
        <PageHeader title="Team & Uren" />

        <PageGuideNote
          id="uren"
          accent="#c4a35a"
          icon={<Clock size={14} />}
          intro="Klok jezelf en je team in — handmatig of met de stop-klok — en zie direct wie waar wat doet."
          actions={[
            { lead: 'Druk de groene knop om te starten', text: '— de timer loopt door tot je stopt, ook als je uitlogt.' },
            { lead: 'Klok crew vanuit het Crew-blok', text: 'als manager kun je iedereen in/uitklokken vanaf één scherm.' },
            { lead: 'Maand-overzicht onderaan', text: 'toont loonkost per crew-lid en is printbaar als PDF voor je loonadministratie.' },
          ]}
        />

        {/* Punch panel: jouw eigen klok */}
        <div style={{ marginBottom: 16 }}>
          <PunchPanel
            me={me}
            myActiveLog={myActiveLog}
            events={events}
            myYearTotalHours={myYearTotalHours}
            onPunchIn={handleMyPunchIn}
            onPunchOut={handleMyPunchOut}
          />
        </div>

        {/* 2-cols: live + crew */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}>
          <LiveRow
            liveLogs={liveLogs}
            personeel={personeel}
            events={events}
            onStop={punchOutById}
          />
          <CrewBlock
            personeel={personeel}
            activeLogsByPersoneelId={activeLogsByPersoneelId}
            events={events}
            onPunchIn={punchInForPerson}
            onPunchOut={punchOutById}
          />
        </div>

        {/* Maand-overzicht (printbaar) */}
        <div style={{ marginBottom: 16 }}>
          <MonthBlock
            month={month}
            setMonth={setMonth}
            logs={timeLogs}
            personeel={personeel}
          />
        </div>

        {/* Activiteit-feed */}
        <AuditBlock />
      </div>
    </RequireTier>
  );
}
