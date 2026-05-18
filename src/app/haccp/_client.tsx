'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Smartphone } from 'lucide-react';
import Link from 'next/link';

import styles from './haccp.module.css';
import {
    HACCP_AI_CHECKS,
    HACCP_EVENT,
    HACCP_LOG_ENTRIES,
    type CitationMode,
    type HaccpCheck,
    type HaccpCheckType,
    type HaccpEvent,
    type HaccpLogEntry,
} from './_data';
import { HStepBar } from './_components/atoms';
import InstapView from './_components/InstapView';
import AiGenerateView from './_components/AiGenerateView';
import CustomizeView from './_components/CustomizeView';
import LogView from './_components/LogView';
import CorrectiveActionView from './_components/CorrectiveActionView';
import DossierView from './_components/DossierView';
import TrendView from './_components/TrendView';
import HACCPChat from './_components/HACCPChat';

/**
 * /haccp — main shell met live backend-wiring.
 *
 * Vijf-stap flow: Kies → AI Plan → Aanpassen → Loggen → Dossier.
 *
 * Hybride werking:
 *   - Probeert altijd eerst de live API (Anthropic streaming, RLS-protected
 *     log/template/plan POSTs).
 *   - Faalt de API (geen migration toegepast, geen API-key, etc.)? → fall
 *     back op demo-data uit _data.ts met "demo modus" badge.
 *
 * Pillar #1: event → AI-checklist <8s via streaming SSE.
 * Pillar #2: Citations API levert per check een src+ref.
 * Pillar #3: log-POST gaat naar /api/haccp/log-check met confirmed_by_user_id.
 * Pillar #4: /haccp/field ongewijzigd.
 * Pillar #5: één step bar, geen tabs.
 */
export default function HACCPClient() {
    const [step, setStep] = useState(0);
    const [completed, setCompleted] = useState<number[]>([]);
    const [event, setEvent] = useState<HaccpEvent | null>(null);
    const [checks, setChecks] = useState<HaccpCheck[]>([]);
    const [revealed, setRevealed] = useState(0);
    const [generating, setGenerating] = useState(false);
    const [logEntries, setLogEntries] = useState<Record<string, HaccpLogEntry>>({});
    const [chatOpen, setChatOpen] = useState(false);
    const [archiveMode, setArchiveMode] = useState(false);
    const [archiveTab, setArchiveTab] = useState<'archive' | 'trends'>('archive');     // v3
    const [correctiveOpen, setCorrectiveOpen] = useState(false);                       // v3: stap 4.5
    const [mode, setMode] = useState<'live' | 'demo'>('live');
    const [errorBanner, setErrorBanner] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const citeMode: CitationMode = 'tooltip';

    /* Demo-only fallback: simulate streaming reveal at 450ms per check */
    useEffect(() => {
        if (mode !== 'demo') return;
        if (step === 1 && generating && revealed < checks.length) {
            const t = window.setTimeout(() => setRevealed((r) => r + 1), 450);
            return () => window.clearTimeout(t);
        }
        if (step === 1 && generating && revealed >= checks.length && checks.length > 0) {
            const t = window.setTimeout(() => setGenerating(false), 600);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [step, generating, revealed, checks.length, mode]);

    /* ───── Live AI streaming via /api/haccp/generate ───── */
    async function attemptLiveGenerate(targetEvent: HaccpEvent) {
        // event.id moet een numerieke string zijn voor live mode. Demo events
        // hebben string-IDs als 'evt-2026-0047' — die zijn altijd demo.
        const numericEventId = /^\d+$/.test(String(targetEvent.id))
            ? parseInt(String(targetEvent.id), 10)
            : null;

        // Bouw dishes-payload uit event of fallback op demo gerechten.
        const dishes = [
            // V1: gebruik demo-gerechten als context. V2: load via supabase.from('gerechten').
            { id: 'd1', name: 'Pulled Pork', sub: 'Low & slow', risk: 'hoog' as const },
            { id: 'd2', name: 'Smoked Brisket', sub: '12u rook', risk: 'hoog' as const },
            { id: 'd3', name: 'Coleslaw', risk: 'laag' as const },
            { id: 'd4', name: 'Cornbread', risk: 'middel' as const },
            { id: 'd5', name: 'BBQ Saus Trio', risk: 'laag' as const },
        ];

        const payload = {
            eventTitle: targetEvent.title,
            servingTime: targetEvent.servingTime || targetEvent.time || '17:00',
            dishes,
        };

        // Probeer eerst bestaand plan op te halen (Pillar #1: 0 AI-call hergebruik)
        if (numericEventId !== null) {
            try {
                const planRes = await fetch(`/api/haccp/event-plan?eventId=${numericEventId}`);
                if (planRes.ok) {
                    const { plan } = await planRes.json();
                    if (plan?.plan_items?.length) {
                        const restored: HaccpCheck[] = plan.plan_items.map(
                            (p: HaccpCheck, idx: number) => ({
                                ...p,
                                id: p.id || `c${idx + 1}`,
                                enabled: true,
                            }),
                        );
                        setChecks(restored);
                        setRevealed(restored.length);
                        setGenerating(false);
                        setMode('live');
                        setErrorBanner(null);
                        return; // gebruik cached plan
                    }
                }
            } catch {
                /* fall through to streaming */
            }
        }

        // Stream nieuwe checklist via SSE
        const controller = new AbortController();
        abortRef.current = controller;
        const collected: HaccpCheck[] = [];
        let res: Response;
        try {
            res = await fetch('/api/haccp/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
        } catch (e) {
            throw new Error((e as Error).message || 'network error');
        }
        if (!res.ok || !res.body) {
            const status = res.status;
            let errText = '';
            try {
                errText = (await res.json())?.error ?? '';
            } catch {
                /* ignore */
            }
            throw new Error(`API ${status}${errText ? `: ${errText}` : ''}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const messages = buffer.split('\n\n');
            buffer = messages.pop() || '';
            for (const m of messages) {
                if (!m.startsWith('data: ')) continue;
                let parsed: { type: string; check?: Record<string, unknown>; message?: string };
                try {
                    parsed = JSON.parse(m.slice(6));
                } catch {
                    continue;
                }
                if (parsed.type === 'check' && parsed.check) {
                    const c = parsed.check;
                    const servingH = targetEvent.servingHour ?? 17;
                    const hOffset = typeof c.hour_offset_from_serving === 'number' ? c.hour_offset_from_serving : 0;
                    const targetHour = Math.max(0, Math.min(23.99, servingH + hOffset));
                    const hh = Math.floor(targetHour);
                    const mm = Math.round((targetHour - hh) * 60);
                    const newCheck: HaccpCheck = {
                        id: `c${collected.length + 1}`,
                        dishIds: Array.isArray(c.dish_ids) ? (c.dish_ids as string[]) : [],
                        type: (c.type as HaccpCheckType) ?? 'kern',
                        label: String(c.label ?? ''),
                        target: String(c.target ?? ''),
                        time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
                        hour: targetHour,
                        risk: (c.risk as 'hoog' | 'middel' | 'laag') ?? 'middel',
                        enabled: true,
                        cite: c.cite as HaccpCheck['cite'],
                    };
                    collected.push(newCheck);
                    setChecks([...collected]);
                    setRevealed(collected.length);
                } else if (parsed.type === 'done') {
                    setGenerating(false);
                    setMode('live');
                    setErrorBanner(null);
                    // Optioneel: save event plan voor volgende keer (0 AI-call)
                    if (numericEventId !== null && collected.length > 0) {
                        fetch('/api/haccp/event-plan', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                eventId: numericEventId,
                                planItems: collected,
                                servingHour: targetEvent.servingHour ?? 17,
                            }),
                        }).catch(() => {
                            /* non-blocking */
                        });
                    }
                } else if (parsed.type === 'error') {
                    throw new Error(parsed.message ?? 'AI error');
                }
            }
        }
    }

    const handleEventSelect = (
        evt: HaccpEvent | { id: string; title: string; isDish: true },
    ) => {
        const fullEvent: HaccpEvent =
            'date' in evt
                ? evt
                : {
                      id: evt.id,
                      title: evt.title,
                      date: '',
                      servingTime: HACCP_EVENT.servingTime,
                      servingHour: HACCP_EVENT.servingHour,
                      guests: HACCP_EVENT.guests,
                      type: 'Los gerecht',
                      status: 'bevestigd',
                      isDish: true,
                  };
        setEvent(fullEvent);
        setChecks([]);
        setRevealed(0);
        setGenerating(true);
        setCompleted([0]);
        setStep(1);
        setErrorBanner(null);

        // Probeer live API; fall back op demo data bij fout.
        attemptLiveGenerate(fullEvent).catch((err: Error) => {
            console.warn('[haccp] live generate failed, fallback naar demo:', err.message);
            setMode('demo');
            setErrorBanner(
                err.message.includes('401') || err.message.includes('unauthorized')
                    ? 'Niet ingelogd — demo-modus actief'
                    : err.message.includes('migration') || err.message.includes('does not exist') || err.message.includes('relation')
                      ? 'Database-migratie nog niet toegepast — demo-modus'
                      : `Demo-modus (API: ${err.message})`,
            );
            setChecks(HACCP_AI_CHECKS.map((c) => ({ ...c, enabled: true })));
        });
    };

    const handleToggle = (id: string) => {
        setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
    };

    const handleTime = (id: string, time: string) => {
        setChecks((cs) =>
            cs.map((c) =>
                c.id === id
                    ? {
                          ...c,
                          time,
                          hour:
                              parseInt(time.split(':')[0] || '0', 10) +
                              parseInt(time.split(':')[1] || '0', 10) / 60,
                      }
                    : c,
            ),
        );
    };

    const handleLog = (checkId: string, value: string, photoUrl?: string) => {
        // Pillar #3: optimistic UI, real POST onder de motorkap.
        const now = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        const optimisticEntry: HaccpLogEntry = { at: now, val: value, status: 'ok', by: 'Mathijs B.' };
        setLogEntries((prev) => ({ ...prev, [checkId]: optimisticEntry }));

        if (mode === 'demo' || !event) return;
        const check = checks.find((c) => c.id === checkId);
        if (!check) return;

        const numericEventId = /^\d+$/.test(String(event.id))
            ? parseInt(String(event.id), 10)
            : null;
        const tempNumeric = parseFloat(value.replace(',', '.').replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(tempNumeric)) return;

        fetch('/api/haccp/log-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                planItemId: check.id,
                eventId: numericEventId,
                gerechtId: null,
                photoUrl: photoUrl ?? null,                                            // v3 SOTA: foto-evidence
                dishLabel: check.label,
                checkType: check.type,
                temp: tempNumeric,
                chef: 'Mathijs B.',
            }),
        })
            .then(async (r) => {
                if (!r.ok) throw new Error(`API ${r.status}`);
                return r.json();
            })
            .then((data: { recordId: number; anomaly: { isAnomaly: boolean; zScore: number } | null }) => {
                if (data.anomaly?.isAnomaly) {
                    setLogEntries((prev) => ({
                        ...prev,
                        [checkId]: {
                            ...optimisticEntry,
                            status: 'afwijking',
                            anomaly: `Z-score ${data.anomaly?.zScore.toFixed(1)}σ — sensor check?`,
                        },
                    }));
                }
            })
            .catch((err: Error) => {
                console.warn('[haccp] log-check API failed, demo-mode log:', err.message);
            });
    };

    const handleDemoLog = () => setLogEntries(HACCP_LOG_ENTRIES);

    const proceedTo = (next: number) => {
        setCompleted((c) => (c.includes(next - 1) ? c : [...c, next - 1]));
        setStep(next);
    };

    const goStep = (s: number) => setStep(s);

    let page: React.ReactNode = null;
    switch (step) {
        case 0:
            page = (
                <InstapView
                    onSelectEvent={handleEventSelect}
                    onOpenDossier={() => {
                        setArchiveMode(true);
                        setStep(4);
                    }}
                />
            );
            break;
        case 1:
            page = event ? (
                <AiGenerateView
                    event={event}
                    checks={checks}
                    revealed={revealed}
                    generating={generating}
                    citeMode={citeMode}
                    onProceed={() => proceedTo(2)}
                />
            ) : null;
            break;
        case 2:
            page = event ? (
                <CustomizeView
                    event={event}
                    checks={checks}
                    onToggle={handleToggle}
                    onTime={handleTime}
                    citeMode={citeMode}
                    onProceed={() => proceedTo(3)}
                />
            ) : null;
            break;
        case 3:
            // v3: na log-complete → check deviations. Heeft afwijkingen? → Stap 4.5
            // (CorrectiveActionView). Geen? → direct naar Dossier.
            if (correctiveOpen && event) {
                page = (
                    <CorrectiveActionView
                        event={event}
                        checks={checks}
                        logEntries={logEntries}
                        onProceed={() => {
                            setCorrectiveOpen(false);
                            proceedTo(4);
                            setArchiveMode(false);
                        }}
                    />
                );
            } else {
                page = event ? (
                    <LogView
                        event={event}
                        checks={checks}
                        logEntries={logEntries}
                        onLog={handleLog}
                        onComplete={() => {
                            handleDemoLog();
                            // Met demo-data heeft check c9 een 'afwijking' → open corrective
                            // In live mode kijkt naar werkelijke logEntries
                            const futureEntries = mode === 'demo' ? HACCP_LOG_ENTRIES : logEntries;
                            const hasDeviation = checks
                                .filter((c) => c.enabled)
                                .some((c) => futureEntries[c.id]?.status === 'afwijking');
                            if (hasDeviation) {
                                setCorrectiveOpen(true);
                            } else {
                                proceedTo(4);
                                setArchiveMode(false);
                            }
                        }}
                    />
                ) : null;
            }
            break;
        case 4:
            page = (
                <DossierView
                    event={event ?? HACCP_EVENT}
                    checks={
                        checks.length
                            ? checks
                            : HACCP_AI_CHECKS.map((c) => ({ ...c, enabled: true }))
                    }
                    logEntries={
                        Object.keys(logEntries).length ? logEntries : HACCP_LOG_ENTRIES
                    }
                    archiveMode={archiveMode}
                    archiveTab={archiveTab}
                    onArchiveTabChange={setArchiveTab}
                    onBack={() => {
                        setArchiveMode(false);
                        setArchiveTab('archive');
                        setStep(0);
                    }}
                />
            );
            break;
        default:
            page = null;
    }

    return (
        <div style={{ padding: '0 32px 80px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 16,
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                {errorBanner ? (
                    <div
                        style={{
                            fontSize: 11,
                            color: 'var(--amber)',
                            background: 'rgba(245,158,11,0.08)',
                            border: '1px solid rgba(245,158,11,0.2)',
                            padding: '6px 12px',
                            borderRadius: 8,
                        }}
                    >
                        {errorBanner}
                    </div>
                ) : mode === 'live' ? (
                    <span
                        style={{
                            fontSize: 11,
                            color: 'var(--green)',
                            background: 'rgba(34,197,94,0.08)',
                            border: '1px solid rgba(34,197,94,0.2)',
                            padding: '6px 12px',
                            borderRadius: 8,
                        }}
                    >
                        Live · Pitmaster AI + NVWA-trail
                    </span>
                ) : (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }} />
                )}

                <Link
                    href="/haccp/field"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--brand-gold)',
                        background: 'rgba(196,163,90,0.08)',
                        border: '1px solid rgba(196,163,90,0.2)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        textDecoration: 'none',
                    }}
                >
                    <Smartphone size={13} />
                    Open Veldmodus
                </Link>
            </div>

            {step > 0 && !archiveMode && (
                <HStepBar current={step} completed={completed} onStep={goStep} />
            )}

            <main style={{ paddingTop: step === 0 || archiveMode ? 16 : 0 }}>{page}</main>

            <button
                type="button"
                className={styles.aiFab}
                onClick={() => setChatOpen(true)}
                aria-label="Open Pitmaster AI"
            >
                <Sparkles size={22} />
            </button>

            <HACCPChat
                open={chatOpen}
                onClose={() => setChatOpen(false)}
                step={step}
                eventTitle={event?.title}
            />
        </div>
    );
}
