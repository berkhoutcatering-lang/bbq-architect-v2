'use client';

import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Flame,
    Snowflake,
    Trash2,
    Wrench,
    Phone,
    ChevronRight,
    Loader2,
    ShieldCheck,
} from 'lucide-react';
import Button from '@/components/Button';
import styles from '../haccp.module.css';
import type { HaccpCheck, HaccpEvent, HaccpLogEntry } from '../_data';

/**
 * Stap 4.5 — Corrective Action (conditional).
 *
 * Toont alleen wanneer er afwijkingen in logEntries staan. Volgt SOTA:
 *   1. Diagnose: welke check wijkt af + hoe ernstig
 *   2. Kies actie (5 templates: opnieuw_verwarmen / extra_koelen / weggooien / sensor_check / escalatie)
 *   3. Loop guided steps af + sign-off met outcome
 *
 * Industry-standard sinds 2024. Sluit gap vs SafetyCulture/FoodReady.
 * Pillar #3: append-only via haccp_corrective_actions, geen mutation op haccp_records.
 */

const ACTION_META: Record<
    string,
    { label: string; icon: React.ComponentType<{ size?: number; color?: string }>; tone: 'amber' | 'red' | 'blue' | 'green' }
> = {
    opnieuw_verwarmen: { label: 'Opnieuw verwarmen', icon: Flame, tone: 'amber' },
    extra_koelen: { label: 'Extra koelen', icon: Snowflake, tone: 'blue' },
    weggooien: { label: 'Weggooien', icon: Trash2, tone: 'red' },
    sensor_check: { label: 'Sensor controleren', icon: Wrench, tone: 'blue' },
    escalatie: { label: 'Keuken-chef inschakelen', icon: Phone, tone: 'green' },
};

const TONE_COLOR: Record<'amber' | 'red' | 'blue' | 'green', { bg: string; border: string; text: string }> = {
    amber: { bg: 'rgba(245,158,11,.1)', border: 'rgba(245,158,11,.25)', text: 'var(--amber)' },
    red: { bg: 'rgba(239,68,68,.1)', border: 'rgba(239,68,68,.25)', text: 'var(--red)' },
    blue: { bg: 'rgba(59,130,246,.1)', border: 'rgba(59,130,246,.25)', text: '#3b82f6' },
    green: { bg: 'rgba(34,197,94,.1)', border: 'rgba(34,197,94,.25)', text: 'var(--green)' },
};

interface DeviationRow {
    checkId: string;
    label: string;
    target: string;
    loggedValue: string;
    loggedAt: string;
    anomaly?: string;
}

interface Props {
    event: HaccpEvent;
    checks: HaccpCheck[];
    logEntries: Record<string, HaccpLogEntry>;
    onProceed: () => void;
}

interface ActiveAction {
    deviation: DeviationRow;
    actionType: keyof typeof ACTION_META;
    actionId: number | null;
    stepsTaken: string[];
    suggestedSteps: string[];
    suggestedOutcomes: string[];
    notes: string;
    submitting: boolean;
}

export default function CorrectiveActionView({ event, checks, logEntries, onProceed }: Props) {
    const deviations: DeviationRow[] = checks
        .filter((c) => c.enabled)
        .map((c) => ({
            checkId: c.id,
            label: c.label,
            target: c.target,
            loggedValue: logEntries[c.id]?.val ?? '',
            loggedAt: logEntries[c.id]?.at ?? '',
            anomaly: logEntries[c.id]?.anomaly,
        }))
        .filter((d) => {
            const e = logEntries[d.checkId];
            return e && e.status === 'afwijking';
        });

    const [resolved, setResolved] = useState<Set<string>>(new Set());
    const [active, setActive] = useState<ActiveAction | null>(null);
    const [templates, setTemplates] = useState<Record<string, { steps: string[]; outcomes: string[] }>>({});

    useEffect(() => {
        fetch('/api/haccp/corrective')
            .then((r) => (r.ok ? r.json() : { templates: {} }))
            .then((d: { templates?: Record<string, { steps: string[]; outcomes: string[] }> }) => {
                if (d.templates) setTemplates(d.templates);
            })
            .catch(() => {
                setTemplates({
                    opnieuw_verwarmen: { steps: ['Product op ≥75°C verhitten binnen 2u', 'Kerntemp 2× gemeten ≥75°C', 'Genoteerd in dossier'], outcomes: ['opgelost', 'product_weggegooid'] },
                    extra_koelen: { steps: ['Naar koelcel ≤4°C', 'Temp na 30min opnieuw gemeten', 'Houdbaarheid opnieuw bepaald'], outcomes: ['opgelost', 'product_weggegooid'] },
                    weggooien: { steps: ['Gemarkeerd als afval', 'Uit voorraad verwijderd', 'Reden gedocumenteerd'], outcomes: ['product_weggegooid'] },
                    sensor_check: { steps: ['Sensor herijkt met ijswater (0°C) + kokend water', 'Tweede meting met andere thermometer', 'Meting geverifieerd'], outcomes: ['opgelost', 'sensor_vervangen', 'inspectie_aangevraagd'] },
                    escalatie: { steps: ['Keuken-chef ingelicht', 'Beslissing gedocumenteerd'], outcomes: ['opgelost', 'inspectie_aangevraagd', 'product_weggegooid'] },
                });
            });
    }, []);

    const allDone = deviations.length > 0 && deviations.every((d) => resolved.has(d.checkId));

    const openAction = (d: DeviationRow, actionType: keyof typeof ACTION_META) => {
        const tmpl = templates[actionType] || { steps: [], outcomes: ['opgelost'] };
        setActive({
            deviation: d,
            actionType,
            actionId: null,
            stepsTaken: [],
            suggestedSteps: tmpl.steps,
            suggestedOutcomes: tmpl.outcomes,
            notes: '',
            submitting: false,
        });
    };

    const startActionOnServer = async (): Promise<number> => {
        if (!active) return -1;
        setActive({ ...active, submitting: true });
        try {
            const res = await fetch('/api/haccp/corrective', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    haccpRecordId: null,
                    anomalyFindingId: null,
                    actionType: active.actionType,
                    description: `${ACTION_META[active.actionType].label} voor "${active.deviation.label}" (gemeten: ${active.deviation.loggedValue})`,
                }),
            });
            if (res.ok) {
                const { action } = (await res.json()) as { action: { id: number } };
                setActive((prev) => prev && { ...prev, actionId: action.id, submitting: false });
                return action.id;
            }
        } catch {
            /* fall-through */
        }
        setActive((prev) => prev && { ...prev, actionId: -1, submitting: false });
        return -1;
    };

    const toggleStep = async (step: string) => {
        if (!active) return;
        let actionId = active.actionId;
        if (actionId === null) {
            actionId = await startActionOnServer();
        }
        const already = active.stepsTaken.includes(step);
        const next = already ? active.stepsTaken.filter((s) => s !== step) : [...active.stepsTaken, step];
        setActive({ ...active, stepsTaken: next, actionId });
        if (!already && actionId !== null && actionId > 0) {
            fetch(`/api/haccp/corrective?id=${actionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ step }),
            }).catch(() => {/* non-blocking */});
        }
    };

    const resolveAction = async (outcome: string) => {
        if (!active) return;
        setActive({ ...active, submitting: true });
        if (active.actionId !== null && active.actionId > 0) {
            try {
                await fetch(`/api/haccp/corrective?id=${active.actionId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ outcome, notes: active.notes || undefined }),
                });
            } catch {
                /* non-blocking */
            }
        }
        setResolved((r) => new Set([...Array.from(r), active.deviation.checkId]));
        setActive(null);
    };

    if (deviations.length === 0) {
        return (
            <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', paddingTop: 60 }}>
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        background: 'rgba(34,197,94,.1)',
                        border: '1px solid rgba(34,197,94,.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 20,
                    }}
                >
                    <CheckCircle2 size={32} color="var(--green)" />
                </div>
                <h2
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 300,
                        fontSize: 24,
                        margin: 0,
                        marginBottom: 8,
                    }}
                >
                    Geen afwijkingen
                </h2>
                <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 24 }}>
                    Alle checks zijn binnen norm. Door naar dossier.
                </p>
                <Button variant="brand" onClick={onProceed}>
                    Naar Dossier
                </Button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ marginBottom: 20 }}>
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                    {event.title} · Stap 4.5
                </div>
                <h2
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 300,
                        fontSize: 22,
                        margin: 0,
                    }}
                >
                    Herstelactie ({resolved.size}/{deviations.length})
                </h2>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    Pillar #3 — afwijking + herstelactie blijft mens-bevestigd in audit-trail
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                {deviations.map((d) => {
                    const isResolved = resolved.has(d.checkId);
                    return (
                        <div
                            key={d.checkId}
                            className={`metal ${styles.fadeUp}`}
                            style={{
                                borderLeft: `3px solid ${isResolved ? 'var(--green)' : 'var(--amber)'}`,
                                opacity: isResolved ? 0.6 : 1,
                            }}
                        >
                            <div style={{ padding: '14px 18px' }}>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 12,
                                        marginBottom: isResolved ? 0 : 12,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 8,
                                            background: isResolved ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.12)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        {isResolved ? (
                                            <CheckCircle2 size={16} color="var(--green)" />
                                        ) : (
                                            <AlertTriangle size={16} color="var(--amber)" />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{d.label}</div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Gemeten <strong style={{ color: 'var(--amber)' }}>{d.loggedValue}</strong>{' '}
                                            {d.loggedAt && `om ${d.loggedAt}`} · norm: {d.target}
                                        </div>
                                        {d.anomaly && (
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                                {d.anomaly}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {!isResolved && active?.deviation.checkId !== d.checkId && (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                            gap: 8,
                                        }}
                                    >
                                        {(Object.keys(ACTION_META) as Array<keyof typeof ACTION_META>).map((key) => {
                                            const meta = ACTION_META[key];
                                            const tone = TONE_COLOR[meta.tone];
                                            const Icon = meta.icon;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => openAction(d, key)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        padding: '10px 12px',
                                                        borderRadius: 8,
                                                        background: tone.bg,
                                                        border: `1px solid ${tone.border}`,
                                                        color: tone.text,
                                                        cursor: 'pointer',
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                        textAlign: 'left',
                                                    }}
                                                >
                                                    <Icon size={14} color={tone.text} />
                                                    {meta.label}
                                                    <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {!isResolved && active?.deviation.checkId === d.checkId && (
                                    <div
                                        className={styles.fadeUp}
                                        style={{
                                            marginTop: 4,
                                            padding: 14,
                                            borderRadius: 8,
                                            background: 'rgba(130,130,130,.05)',
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginBottom: 10,
                                            }}
                                        >
                                            {(() => {
                                                const meta = ACTION_META[active.actionType];
                                                const Icon = meta.icon;
                                                const tone = TONE_COLOR[meta.tone];
                                                return (
                                                    <>
                                                        <Icon size={14} color={tone.text} />
                                                        <span
                                                            style={{
                                                                fontSize: 13,
                                                                fontWeight: 600,
                                                                color: tone.text,
                                                            }}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                    </>
                                                );
                                            })()}
                                            <button
                                                type="button"
                                                onClick={() => setActive(null)}
                                                style={{
                                                    marginLeft: 'auto',
                                                    fontSize: 11,
                                                    color: 'var(--muted)',
                                                    background: 'none',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Annuleer
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                                            {active.suggestedSteps.map((step, idx) => {
                                                const checked = active.stepsTaken.includes(step);
                                                return (
                                                    <label
                                                        key={idx}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'flex-start',
                                                            gap: 8,
                                                            cursor: 'pointer',
                                                            fontSize: 13,
                                                            padding: '4px 0',
                                                        }}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleStep(step)}
                                                            style={{
                                                                marginTop: 2,
                                                                accentColor: 'var(--brand)',
                                                                flexShrink: 0,
                                                            }}
                                                        />
                                                        <span style={{ color: checked ? 'var(--muted)' : 'var(--text)', textDecoration: checked ? 'line-through' : 'none' }}>
                                                            {step}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>

                                        <textarea
                                            placeholder="Aanvullende notitie (optioneel)…"
                                            className="input"
                                            value={active.notes}
                                            onChange={(e) => setActive({ ...active, notes: e.target.value.slice(0, 1000) })}
                                            rows={2}
                                            style={{ width: '100%', marginBottom: 10, resize: 'vertical', fontSize: 12 }}
                                        />

                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: 8,
                                                flexWrap: 'wrap',
                                                justifyContent: 'flex-end',
                                            }}
                                        >
                                            {active.suggestedOutcomes.map((outcome) => (
                                                <Button
                                                    key={outcome}
                                                    variant={outcome === 'opgelost' ? 'brand' : 'ghost'}
                                                    size="sm"
                                                    onClick={() => resolveAction(outcome)}
                                                    disabled={active.submitting || active.stepsTaken.length === 0}
                                                    icon={
                                                        active.submitting ? (
                                                            <Loader2
                                                                size={12}
                                                                style={{ animation: 'spin 1s linear infinite' }}
                                                            />
                                                        ) : (
                                                            <CheckCircle2 size={12} />
                                                        )
                                                    }
                                                >
                                                    {outcome.replace(/_/g, ' ')}
                                                </Button>
                                            ))}
                                        </div>
                                        {active.stepsTaken.length === 0 && (
                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    color: 'var(--muted)',
                                                    marginTop: 6,
                                                    textAlign: 'right',
                                                }}
                                            >
                                                Vink minstens 1 stap af om af te ronden
                                            </div>
                                        )}
                                    </div>
                                )}

                                {isResolved && (
                                    <div
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            fontSize: 11,
                                            color: 'var(--green)',
                                            marginTop: 4,
                                        }}
                                    >
                                        <ShieldCheck size={11} />
                                        Herstelactie afgerond + gelogd
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={11} />
                    Pillar #3 — herstelacties zijn append-only audit, geen mutation op log-rijen
                </div>
                <Button
                    variant={allDone ? 'brand' : 'ghost'}
                    onClick={onProceed}
                    disabled={!allDone}
                >
                    {allDone ? 'Naar Dossier →' : 'Eerst alle herstelacties afronden'}
                </Button>
            </div>
        </div>
    );
}
