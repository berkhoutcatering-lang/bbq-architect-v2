'use client';
import { Flame } from 'lucide-react';

interface EventContext {
    id: string | number;
    name: string | null;
    date?: string | null;
    guests?: number | null;
    location?: string | null;
}

interface Props {
    event?: EventContext;
    /* Prefilled prompt — overschrijft de event-default. */
    prompt?: string;
    /* btn-* class — default 'btn btn-ghost'. */
    className?: string;
    /* Korte label op de knop. */
    label?: string;
}

/* "Vraag Pitmaster" knop — opent de bestaande Vraag-Rook drawer met event-
   context geïnjecteerd. Gebruikt hetzelfde sessionStorage + dispatchEvent-
   pattern als /gerechten/ai-pitmaster. Plaats waar event-context relevant is:
   /events/[id]/hub, /service, /prep-counter. */
export default function AskPitmasterButton({ event, prompt, className = 'btn btn-ghost', label = 'Vraag Pitmaster' }: Props) {
    function handleClick() {
        /* || ipv ?? — lege strings ook als "geen naam" behandelen. */
        const eventLabel = (event?.name || '').trim() || 'het event';
        const finalPrompt = prompt || (event
            ? `Geef een korte briefing voor ${eventLabel}${event.guests ? ` (${event.guests} gasten` : ''}${event.date ? ` op ${event.date})` : event.guests ? ')' : ''}. Wat moet ik wanneer doen en waar moet ik op letten?`
            : 'Stel me een vraag over BBQ-techniek, prep-volgorde of menu-controle.');
        try {
            sessionStorage.setItem('ai_pitmaster_prefill', finalPrompt);
            if (event) {
                sessionStorage.setItem('ai_pitmaster_context_event_id', String(event.id));
            }
        } catch { /* private mode kan dit blokkeren */ }
        window.dispatchEvent(new CustomEvent('open-chat'));
    }
    return (
        <button
            type="button"
            className={className}
            onClick={handleClick}
            aria-label={event ? `${label} over ${event.name ?? 'dit event'}` : label}
        >
            <Flame size={14} /> {label}
        </button>
    );
}
