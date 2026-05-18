'use client';

import { useState } from 'react';
import { GanttChart, Plus, ClipboardCheck } from 'lucide-react';

import Button from '@/components/Button';
import styles from '../haccp.module.css';
import {
    HACCP_DISHES,
    HACCP_EVENT,
    type CitationMode,
    type HaccpCheck,
    type HaccpEvent,
} from '../_data';
import { CheckCard, Pill } from './atoms';
import ResourceTimeline from './ResourceTimeline';

interface Props {
    event: HaccpEvent;
    checks: HaccpCheck[];
    onToggle: (id: string) => void;
    onTime: (id: string, time: string) => void;
    onProceed: () => void;
    citeMode: CitationMode;
}

export default function CustomizeView({
    event,
    checks,
    onToggle,
    onTime,
    onProceed,
    citeMode,
}: Props) {
    const [saveTemplate, setSaveTemplate] = useState(false);
    const enabled = checks.filter((c) => c.enabled);
    const dishLookup = (id: string) => HACCP_DISHES.find((d) => d.id === id)?.name;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 20,
                }}
            >
                <div>
                    <div className="eyebrow" style={{ marginBottom: 4 }}>
                        {event.title} · {event.guests} gasten
                    </div>
                    <h2
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 300,
                            fontSize: 22,
                            margin: 0,
                        }}
                    >
                        Pas je checklist aan
                    </h2>
                    <div
                        style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}
                    >
                        {enabled.length} van {checks.length} checks actief
                    </div>
                </div>
                <Button variant="ghost" size="sm" icon={<Plus size={13} />}>
                    Eigen check
                </Button>
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginBottom: 24,
                }}
            >
                {checks.map((c, i) => (
                    <CheckCard
                        key={c.id}
                        check={c}
                        idx={i}
                        citeMode={citeMode}
                        editable
                        onToggle={onToggle}
                        onTime={onTime}
                        dishLookup={dishLookup}
                    />
                ))}
            </div>

            <div className="metal" style={{ marginBottom: 24 }}>
                <div
                    className="metal-head"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <span
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <GanttChart size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            Aangepaste tijdslijn
                        </span>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {enabled.length} checks actief
                    </span>
                </div>
                <div style={{ padding: '12px 18px', overflowX: 'auto' }}>
                    <ResourceTimeline
                        checks={enabled}
                        dishes={HACCP_DISHES}
                        servingH={HACCP_EVENT.servingHour}
                    />
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <label
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={saveTemplate}
                        onChange={() => setSaveTemplate(!saveTemplate)}
                        style={{ accentColor: 'var(--brand)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Opslaan als template voor deze gerechten
                    </span>
                    {saveTemplate && (
                        <Pill variant="ok" style={{ fontSize: 9 }}>
                            0 AI-calls volgende keer
                        </Pill>
                    )}
                </label>
                <Button
                    variant="brand"
                    icon={<ClipboardCheck size={14} />}
                    onClick={onProceed}
                >
                    Start loggen ({enabled.length} checks)
                </Button>
            </div>
        </div>
    );
}
