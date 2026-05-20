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

export default function CalendarView({ mode, year, month, events, calendarColors, onSelectEvent, focusedEventId }: CalendarViewProps) {
    const ref = useRef<FullCalendar | null>(null);

    const fcEvents = useMemo(
        () => events.map(e => toFcEvent(e, year, month, calendarColors)),
        [events, year, month, calendarColors]
    );

    /* Wanneer Maand-NavBar van maand wisselt, springt FullCalendar mee.
       FC heeft eigen state per instance, dus expliciet aansturen. */
    useEffect(function () {
        const api = ref.current?.getApi();
        if (!api) return;
        const targetIso = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        api.gotoDate(targetIso);
    }, [year, month]);

    /* `initialView` wordt alleen bij mount gelezen — als deze component gemount
       blijft en de mode prop wijzigt (bv. Lijst → Week), zou FullCalendar in
       z'n oude view blijven hangen. Expliciet `changeView()` aanroepen lost
       dat op zonder remount. */
    const view = mode === 'week' ? 'timeGridWeek' : 'listMonth';
    useEffect(function () {
        const api = ref.current?.getApi();
        if (!api) return;
        if (api.view.type !== view) api.changeView(view);
    }, [view]);

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

    return (
        <div className="agenda-fc-wrap">
            <FullCalendar
                ref={ref}
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                initialView={view}
                initialDate={new Date(year, month, 1)}
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
