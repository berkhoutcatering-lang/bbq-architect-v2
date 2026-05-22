'use client';
import { useMemo, useRef, useEffect } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import nlLocale from '@fullcalendar/core/locales/nl';
import type { EventInput, EventClickArg } from '@fullcalendar/core';

import type { AgendaEvent } from '../_lib/types';

interface CalendarViewProps {
    mode: 'week' | 'list';
    year: number;
    month: number;
    events: AgendaEvent[];
    calendarColors: Record<string, string>;
    onSelectEvent: (e: AgendaEvent) => void;
    focusedEventId?: string | null;
}

/* FullCalendar verwacht ISO datetimes. We bouwen die uit (year, month, day, start, duration)
   die de bestaande AgendaEvent al bevat. Zelfde data, ander shape. */
function toFcEvent(ev: AgendaEvent, year: number, month: number, colors: Record<string, string>): EventInput {
    const day = ev.day;
    const startHour = Math.floor(ev.start);
    const startMin = Math.round((ev.start - startHour) * 60);
    const start = new Date(year, month, day, startHour, startMin, 0);
    const end = new Date(start.getTime() + ev.duration * 60 * 60 * 1000);
    const color = ev.color || colors[ev.calId] || '#FFBF00';
    return {
        id: ev.id,
        title: ev.title,
        start,
        end,
        backgroundColor: color + '22',
        borderColor: color + '66',
        textColor: 'var(--text)',
        extendedProps: { agendaEvent: ev },
    };
}

/* Kies de datum waar FullCalendar in week/list moet starten. Als de
   zichtbare maand de huidige maand is → spring naar vandaag. Anders
   spring naar dag-1 van die maand. Dat lost de "Week-knop op een dag
   in andere maand springt naar week-1 van huidige maand"-bug op. */
function pickTargetIso(year: number, month: number): string {
    const now = new Date();
    if (now.getFullYear() === year && now.getMonth() === month) {
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${now.getFullYear()}-${m}-${d}`;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

export default function CalendarView({ mode, year, month, events, calendarColors, onSelectEvent, focusedEventId }: CalendarViewProps) {
    const ref = useRef<FullCalendar | null>(null);

    const fcEvents = useMemo(
        () => events.map(e => toFcEvent(e, year, month, calendarColors)),
        [events, year, month, calendarColors]
    );

    /* Initial date is alleen voor de eerste mount; daarna stuurt het
       useEffect hieronder de FC instance aan. */
    const initialDate = useMemo(() => pickTargetIso(year, month), []); // eslint-disable-line react-hooks/exhaustive-deps

    /* Houd FullCalendar in sync met (year, month, mode):
       - maand-shift → gotoDate naar passende datum
       - mode-wissel (week ↔ list) → changeView + gotoDate */
    useEffect(function () {
        const api = ref.current?.getApi();
        if (!api) return;
        const targetView = mode === 'week' ? 'timeGridWeek' : 'listMonth';
        if (api.view.type !== targetView) {
            api.changeView(targetView);
        }
        api.gotoDate(pickTargetIso(year, month));
    }, [year, month, mode]);

    /* Highlight focused event uit ?conflict=<id> deep-link. */
    useEffect(function () {
        if (!focusedEventId) return;
        const el = document.querySelector(`[data-event-id-fc="${focusedEventId}"]`);
        if (el && el instanceof HTMLElement) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('fc-event--focused');
            const t = setTimeout(function () { el.classList.remove('fc-event--focused'); }, 5000);
            return function () { clearTimeout(t); };
        }
    }, [focusedEventId]);

    function handleClick(arg: EventClickArg) {
        const agendaEvent = arg.event.extendedProps.agendaEvent as AgendaEvent;
        if (agendaEvent) onSelectEvent(agendaEvent);
    }

    const view = mode === 'week' ? 'timeGridWeek' : 'listMonth';

    return (
        <div className="agenda-fc-wrap">
            <FullCalendar
                ref={ref}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                initialView={view}
                initialDate={initialDate}
                locale={nlLocale}
                firstDay={1}
                headerToolbar={false}
                height="auto"
                contentHeight="auto"
                slotMinTime="06:00:00"
                slotMaxTime="23:00:00"
                nowIndicator
                events={fcEvents}
                eventClick={handleClick}
                eventDidMount={function (info) {
                    const id = info.event.id;
                    info.el.setAttribute('data-event-id-fc', id);
                }}
                noEventsText="Geen events in deze periode"
                allDayText="Hele dag"
                listDayFormat={{ weekday: 'long', day: 'numeric', month: 'long' }}
                listDaySideFormat={false}
                buttonText={{ today: 'Vandaag', month: 'Maand', week: 'Week', day: 'Dag', list: 'Lijst' }}
                dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
                eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
            />
        </div>
    );
}
