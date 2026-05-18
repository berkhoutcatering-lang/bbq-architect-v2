'use client';

import { Calendar, Sparkles, CheckCircle2, GanttChart, Plus, SlidersHorizontal } from 'lucide-react';

import Button from '@/components/Button';
import styles from '../haccp.module.css';
import {
    HACCP_DISHES,
    HACCP_EVENT,
    type CitationMode,
    type HaccpCheck,
    type HaccpEvent,
} from '../_data';
import { CheckCard, Pill, TypingDots } from './atoms';
import ResourceTimeline from './ResourceTimeline';

interface Props {
    event: HaccpEvent;
    checks: HaccpCheck[];
    revealed: number;
    generating: boolean;
    onProceed: () => void;
    citeMode: CitationMode;
}

export default function AiGenerateView({
    event,
    checks,
    revealed,
    generating,
    onProceed,
    citeMode,
}: Props) {
    const total = checks.length;
    const highRisk = checks.filter((c) => c.risk === 'hoog').length;
    const dishCount = HACCP_DISHES.length;
    const allRevealed = revealed >= total;
    const dishLookup = (id: string) => HACCP_DISHES.find((d) => d.id === id)?.name;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div
                className="metal"
                style={{ marginBottom: 20, borderLeft: '3px solid var(--brand-gold)' }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '14px 20px',
                    }}
                >
                    <div
                        style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: 'rgba(255,191,0,.08)',
                            border: '1px solid rgba(255,191,0,.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Calendar size={20} color="var(--brand)" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div
                            style={{
                                fontSize: 16,
                                fontWeight: 600,
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            {event.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {event.guests} gasten · {event.servingTime} · {event.type}
                        </div>
                    </div>
                    <Pill variant="ok" icon={<CheckCircle2 size={11} />}>
                        Bevestigd
                    </Pill>
                </div>
            </div>

            <div className={styles.aiStatusBar} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                        className={`${styles.aiStatusIcon} ${generating ? styles.aiStatusIconGenerating : styles.aiStatusIconDone}`}
                    >
                        {generating ? (
                            <Sparkles size={18} color="var(--brand)" />
                        ) : (
                            <CheckCircle2 size={18} color="var(--green)" />
                        )}
                    </div>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                            {generating ? (
                                <>
                                    Pitmaster AI analyseert {dishCount} gerechten
                                    <TypingDots />
                                </>
                            ) : (
                                'HACCP-plan gereed'
                            )}
                        </div>
                        <div
                            style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}
                        >
                            {generating
                                ? `${revealed} van ${total} checks gegenereerd`
                                : `${total} checks · ${dishCount} gerechten · ${highRisk} hoog-risico`}
                        </div>
                    </div>
                </div>
                {generating && (
                    <div className={styles.aiProgress}>
                        <div
                            className={styles.aiProgressFill}
                            style={{ width: `${total === 0 ? 0 : (revealed / total) * 100}%` }}
                        />
                    </div>
                )}
            </div>

            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    marginBottom: 24,
                }}
            >
                {checks.slice(0, revealed).map((c, i) => (
                    <CheckCard
                        key={c.id}
                        check={c}
                        idx={i}
                        citeMode={citeMode}
                        dishLookup={dishLookup}
                    />
                ))}
            </div>

            {allRevealed && !generating && (
                <div
                    className={`metal ${styles.fadeUp}`}
                    style={{ marginBottom: 24 }}
                >
                    <div
                        className="metal-head"
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                        <GanttChart size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                            Event-tijdslijn
                        </span>
                    </div>
                    <div style={{ padding: '12px 18px', overflowX: 'auto' }}>
                        <ResourceTimeline
                            checks={checks}
                            dishes={HACCP_DISHES}
                            servingH={HACCP_EVENT.servingHour}
                        />
                    </div>
                </div>
            )}

            {allRevealed && !generating && (
                <div
                    className={styles.fadeUp}
                    style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}
                >
                    <Button variant="ghost" icon={<Plus size={14} />}>
                        Eigen check toevoegen
                    </Button>
                    <Button
                        variant="brand"
                        icon={<SlidersHorizontal size={14} />}
                        onClick={onProceed}
                    >
                        Checklist overnemen &amp; aanpassen
                    </Button>
                </div>
            )}
        </div>
    );
}
