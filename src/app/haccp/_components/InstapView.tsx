'use client';

import { useEffect, useState } from 'react';
import {
    ShieldCheck,
    Calendar,
    ChefHat,
    Search,
    ChevronRight,
    FolderOpen,
    ArrowRight,
} from 'lucide-react';

import { useSupabase } from '@/lib/useSupabase';
import type { DbEvent } from '@/types';
import styles from '../haccp.module.css';
import {
    HACCP_ALL_DISHES,
    HACCP_UPCOMING,
    type HaccpEvent,
    type UpcomingEvent,
} from '../_data';
import { Pill } from './atoms';

interface Props {
    onSelectEvent: (evt: HaccpEvent | { id: string; title: string; isDish: true }) => void;
    onOpenDossier: () => void;
}

const MONTH_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function dbEventToUpcoming(e: DbEvent): UpcomingEvent {
    const dateStr = (e.date as string | undefined) || '';
    const parsed = dateStr ? new Date(dateStr) : null;
    return {
        id: String(e.id),
        title: e.name || 'Naamloos event',
        date: parsed ? String(parsed.getDate()).padStart(2, '0') : '?',
        month: parsed ? MONTH_NL[parsed.getMonth()] : '?',
        guests: e.guests ?? 0,
        time: (e.start_time as string | null) || '17:00',
        status: e.status === 'confirmed' ? 'bevestigd' : 'verzonden',
        type: e.type || 'BBQ',
    };
}

export default function InstapView({ onSelectEvent, onOpenDossier }: Props) {
    const [mode, setMode] = useState<'event' | 'dish' | null>(null);
    const [q, setQ] = useState('');
    const { data: dbEvents, loading: eventsLoading } = useSupabase<DbEvent>('events', []);

    // Real DB events first, fall back op demo data als geen events of nog laden.
    const today = new Date().toISOString().slice(0, 10);
    const realUpcoming = (dbEvents || [])
        .filter((e) => (e.date as string | undefined) && (e.date as string) >= today)
        .sort((a, b) => ((a.date as string) || '').localeCompare((b.date as string) || ''))
        .slice(0, 8)
        .map(dbEventToUpcoming);
    const upcoming = realUpcoming.length > 0 ? realUpcoming : HACCP_UPCOMING;

    const filtered = HACCP_ALL_DISHES.filter(
        (d) =>
            d.name.toLowerCase().includes(q.toLowerCase()) ||
            d.cat.toLowerCase().includes(q.toLowerCase()),
    );

    const handleEvent = (evt: UpcomingEvent) => {
        onSelectEvent({
            id: evt.id,
            title: evt.title,
            date: '',
            servingTime: evt.time,
            servingHour: parseInt(evt.time.split(':')[0], 10) || 17,
            guests: evt.guests,
            type: evt.type,
            status: evt.status,
            time: evt.time,
        });
    };

    return (
        <div style={{ maxWidth: 780, margin: '0 auto', paddingTop: 36 }}>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
                <div className={styles.heroIcon}>
                    <ShieldCheck size={30} color="var(--brand)" />
                </div>
                <h1
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 300,
                        fontSize: 32,
                        margin: 0,
                        marginBottom: 6,
                    }}
                >
                    Wat ga je vandaag{' '}
                    <em
                        style={{
                            fontWeight: 400,
                            fontStyle: 'normal',
                            color: 'var(--brand-gold)',
                        }}
                    >
                        loggen
                    </em>
                    ?
                </h1>
                <p
                    style={{
                        color: 'var(--muted)',
                        fontSize: 14,
                        margin: 0,
                    }}
                >
                    Kies een event of gerecht — Pitmaster AI bouwt je HACCP-checklist
                </p>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                    marginBottom: 28,
                }}
            >
                <div
                    className={`metal ${styles.instapCard} ${mode === 'event' ? styles.instapCardActive : ''}`}
                    onClick={() => setMode(mode === 'event' ? null : 'event')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setMode(mode === 'event' ? null : 'event');
                        }
                    }}
                >
                    <div style={{ padding: '28px 24px', textAlign: 'center' }}>
                        <div className={styles.instapCardIcon}>
                            <Calendar size={24} color="var(--brand-gold)" />
                        </div>
                        <div
                            style={{
                                fontSize: 17,
                                fontWeight: 600,
                                fontFamily: 'var(--font-display)',
                                marginBottom: 5,
                            }}
                        >
                            Heel event
                        </div>
                        <div
                            style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}
                        >
                            Selecteer een event — AI genereert checks voor alle gerechten tegelijk
                        </div>
                    </div>
                </div>

                <div
                    className={`metal ${styles.instapCard} ${mode === 'dish' ? styles.instapCardActive : ''}`}
                    onClick={() => setMode(mode === 'dish' ? null : 'dish')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setMode(mode === 'dish' ? null : 'dish');
                        }
                    }}
                >
                    <div style={{ padding: '28px 24px', textAlign: 'center' }}>
                        <div className={styles.instapCardIcon}>
                            <ChefHat size={24} color="var(--brand-gold)" />
                        </div>
                        <div
                            style={{
                                fontSize: 17,
                                fontWeight: 600,
                                fontFamily: 'var(--font-display)',
                                marginBottom: 5,
                            }}
                        >
                            Los gerecht
                        </div>
                        <div
                            style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}
                        >
                            Zoek een gerecht — log zonder event-context
                        </div>
                    </div>
                </div>
            </div>

            {mode === 'event' && (
                <div className={`metal ${styles.fadeUp}`} style={{ marginBottom: 20 }}>
                    <div
                        className="metal-head"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <Calendar size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            Aankomende events
                        </span>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            padding: 8,
                        }}
                    >
                        {upcoming.map((evt) => (
                            <div
                                key={evt.id}
                                className="metal"
                                role="button"
                                tabIndex={0}
                                onClick={() => handleEvent(evt)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleEvent(evt);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 14,
                                        alignItems: 'center',
                                        padding: 12,
                                    }}
                                >
                                    <div className={styles.dateChip}>
                                        <div className={styles.dateChipMon}>{evt.month}</div>
                                        <div className={styles.dateChipDay}>{evt.date}</div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginBottom: 2,
                                            }}
                                        >
                                            <span style={{ fontSize: 14, fontWeight: 600 }}>
                                                {evt.title}
                                            </span>
                                            <Pill
                                                variant={evt.status === 'bevestigd' ? 'ok' : 'send'}
                                            >
                                                {evt.status}
                                            </Pill>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            {evt.guests} gasten · {evt.time} · {evt.type}
                                        </div>
                                    </div>
                                    <ChevronRight size={16} color="var(--muted)" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mode === 'dish' && (
                <div className={`metal ${styles.fadeUp}`} style={{ marginBottom: 20 }}>
                    <div style={{ padding: 16 }}>
                        <div style={{ position: 'relative', marginBottom: q ? 12 : 0 }}>
                            <Search
                                size={15}
                                color="var(--muted)"
                                style={{ position: 'absolute', left: 12, top: 11 }}
                            />
                            <input
                                className="input"
                                placeholder="Zoek gerecht…"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                autoFocus
                                style={{ paddingLeft: 36 }}
                            />
                        </div>
                        {q && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {filtered.length === 0 && (
                                    <div
                                        style={{
                                            padding: 12,
                                            fontSize: 13,
                                            color: 'var(--muted)',
                                        }}
                                    >
                                        Geen resultaten voor &quot;{q}&quot;
                                    </div>
                                )}
                                {filtered.map((d) => (
                                    <div
                                        key={d.id}
                                        className={styles.dishSearchRow}
                                        onClick={() =>
                                            onSelectEvent({
                                                id: d.id,
                                                title: d.name,
                                                isDish: true,
                                            })
                                        }
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onSelectEvent({
                                                    id: d.id,
                                                    title: d.name,
                                                    isDish: true,
                                                });
                                            }
                                        }}
                                    >
                                        <ChefHat size={14} color="var(--muted)" />
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    color: 'var(--muted)',
                                                    marginLeft: 8,
                                                }}
                                            >
                                                {d.cat}
                                            </span>
                                        </div>
                                        {d.tmpl && (
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    padding: '2px 6px',
                                                    borderRadius: 4,
                                                    background: 'rgba(34,197,94,.1)',
                                                    color: 'var(--green)',
                                                    fontWeight: 700,
                                                }}
                                            >
                                                TEMPLATE
                                            </span>
                                        )}
                                        <ChevronRight size={14} color="var(--muted)" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button
                    type="button"
                    onClick={onOpenDossier}
                    className={styles.dossierLink}
                >
                    <FolderOpen size={14} />
                    Open NVWA-dossier archief
                    <ArrowRight size={12} />
                </button>
            </div>
        </div>
    );
}
