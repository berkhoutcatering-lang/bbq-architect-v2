'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sparkles, Flame, ShieldAlert, Thermometer, ClipboardList, ChefHat, PartyPopper } from 'lucide-react';
import AiBadge from '@/components/ai/AiBadge';

interface EventRow {
    id: string;
    name: string | null;
    date: string | null;
    aantal_gasten: number | null;
    type: string | null;
    location: string | null;
    status: string | null;
}

interface Props {
    upcomingEvents: EventRow[];
}

/* AI Pitmaster client. Toont event-context + prefilled-prompts. Klik op een
   prompt → open de Vraag-Rook drawer (via window event 'open-chat'). De
   drawer pikt automatisch de page-context op via `usePathname`. */
export default function AiPitmasterClient({ upcomingEvents }: Props) {
    const [selectedEventId, setSelectedEventId] = useState<string | null>(
        upcomingEvents[0]?.id ?? null,
    );
    const selectedEvent = upcomingEvents.find((e) => e.id === selectedEventId) ?? null;

    function openChatWithPrompt(prompt: string) {
        /* Drawer luistert al naar 'open-chat'. Bewaar de prompt in sessionStorage
           zodat de drawer 'm kan oppakken als hij dat ondersteunt; geen-effect
           is acceptabel als de v2-ChatPanel de prefill (nog) niet leest. */
        try {
            sessionStorage.setItem('ai_pitmaster_prefill', prompt);
            if (selectedEvent) {
                sessionStorage.setItem('ai_pitmaster_context_event_id', selectedEvent.id);
            }
        } catch { /* sessionStorage kan in privé-modus blokken */ }
        window.dispatchEvent(new CustomEvent('open-chat'));
    }

    /* Default-set prompts; aangevuld als er een event-context is. Hop & Bites
       identiteit is server-side ingebakken in /api/chat (memory regel). */
    const baseQuestions = [
        { icon: Flame,         label: 'Welke kerntemperatuur voor brisket?', prompt: 'Welke interne kerntemperatuur moet brisket halen voordat ik hem uit de smoker haal? En hoe lang laten rusten?' },
        { icon: ShieldAlert,   label: 'Allergie-check: pinda zonder kruisbesmetting', prompt: 'Hoe vermijd ik kruisbesmetting met pinda als één gast pinda-allergisch is? Welke werkbladen / messen / borden moeten apart?' },
        { icon: Thermometer,   label: 'Smoker temp-curve voor pulled pork', prompt: 'Wat is de ideale smoker temp-curve voor pulled pork (8kg)? Wanneer wrap ik in folie?' },
        { icon: ClipboardList, label: 'Prep-volgorde dag voor het event', prompt: 'Stel de prep-volgorde op voor de dag voor het event: wat eerst, wat laatste, en welke kritieke timings?' },
    ];

    const eventQuestions: typeof baseQuestions = selectedEvent
        ? [
            {
                icon: PartyPopper,
                label: `Briefing voor ${selectedEvent.name ?? 'event'}`,
                prompt: `Geef een korte briefing voor ${selectedEvent.name ?? 'het event'} (${selectedEvent.aantal_gasten ?? '?'} gasten op ${selectedEvent.date}). Wat moet ik wanneer doen en waar moet ik op letten?`,
            },
            {
                icon: ChefHat,
                label: `Menu-controle ${selectedEvent.name ?? 'event'}`,
                prompt: `Loop het menu langs voor ${selectedEvent.name ?? 'het event'}: zijn er allergie-conflicten, ontbreekt er iets, en past de mix bij ${selectedEvent.aantal_gasten ?? '?'} gasten?`,
            },
        ]
        : [];

    const prompts = [...eventQuestions, ...baseQuestions];

    return (
        <div style={{ marginTop: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'minmax(260px, 320px) 1fr', gap: 24 }}>
            {/* LINKERKOLOM — komende events */}
            <aside>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Komende events
                </div>
                {upcomingEvents.length === 0 ? (
                    <div className="card" style={{ padding: 16 }}>
                        <p style={{ fontSize: 13, color: 'var(--muted-light)', margin: 0 }}>
                            Geen events in komende 7 dagen. Vragen aan de pitmaster gaan over de algemene BBQ-kennis.
                        </p>
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {upcomingEvents.map((e) => {
                            const isActive = e.id === selectedEventId;
                            return (
                                <li key={e.id}>
                                    <button
                                        onClick={() => setSelectedEventId(e.id)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            minHeight: 64,
                                            padding: 12,
                                            background: isActive ? 'rgba(196,163,90,0.1)' : 'var(--card)',
                                            border: '1px solid ' + (isActive ? 'rgba(196,163,90,0.45)' : 'var(--card-solid)'),
                                            borderRadius: 'var(--radius-md, 12px)',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            color: 'var(--text)',
                                            transition: 'background 150ms, border-color 150ms',
                                        }}
                                    >
                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                                            {e.name ?? 'Naamloos event'}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--muted-light)' }}>
                                            {e.date ?? '—'} · {e.aantal_gasten ?? '?'} gasten · {e.type ?? '—'}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                <div style={{ marginTop: 16, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md, 12px)' }}>
                    <Link
                        href="/agenda"
                        style={{ fontSize: 12, color: 'var(--color-accent-gold)', textDecoration: 'none' }}
                    >
                        Volledige agenda openen →
                    </Link>
                </div>
            </aside>

            {/* RECHTERKOLOM — prompts + uitleg */}
            <main>
                <div
                    style={{
                        background: 'linear-gradient(135deg, rgba(196,163,90,0.06), transparent)',
                        border: '1px solid rgba(196,163,90,0.25)',
                        borderRadius: 'var(--radius-md, 14px)',
                        padding: 20,
                        marginBottom: 20,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Sparkles size={18} color="var(--color-accent-gold)" />
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                            Vraag Rook Maart — pitmaster met 20 jaar BBQ-ervaring
                        </h2>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--muted-light)', margin: 0, lineHeight: 1.5 }}>
                        Klik op een vraag hieronder, of typ je eigen vraag in de Vraag-Rook drawer rechtsonder.
                        Rook kent je events, gangen, allergieën en smoker-status — antwoord komt binnen ~2 seconden.
                    </p>
                    <div style={{ marginTop: 8 }}>
                        <AiBadge model="claude-haiku-4-5" inline />
                    </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted-light)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                    Veelgestelde vragen
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                    {prompts.map((q, i) => {
                        const Icon = q.icon;
                        return (
                            <li key={i}>
                                <button
                                    onClick={() => openChatWithPrompt(q.prompt)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        width: '100%',
                                        minHeight: 56,
                                        padding: '12px 16px',
                                        background: 'var(--card)',
                                        border: '1px solid var(--card-solid)',
                                        borderRadius: 'var(--radius-md, 12px)',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                        fontFamily: 'inherit',
                                        textAlign: 'left',
                                        transition: 'background 150ms, border-color 150ms, transform 150ms',
                                    }}
                                    onMouseEnter={(ev) => {
                                        ev.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                        ev.currentTarget.style.borderColor = 'rgba(196,163,90,0.35)';
                                        ev.currentTarget.style.transform = 'translateX(2px)';
                                    }}
                                    onMouseLeave={(ev) => {
                                        ev.currentTarget.style.background = 'var(--card)';
                                        ev.currentTarget.style.borderColor = 'var(--card-solid)';
                                        ev.currentTarget.style.transform = '';
                                    }}
                                >
                                    <Icon size={16} color="var(--color-accent-gold)" />
                                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{q.label}</span>
                                    <span style={{ fontSize: 11, color: 'var(--muted-light)' }}>Open chat →</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </main>
        </div>
    );
}
