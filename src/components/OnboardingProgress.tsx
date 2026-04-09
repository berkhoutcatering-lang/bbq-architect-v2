'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Trophy, Target, X } from 'lucide-react';
import MetallicCard from './MetallicCard';

interface ProgressStep {
    id: string;
    label: string;
    description: string;
    href: string;
    check: () => boolean;
}

interface OnboardingProgressProps {
    klanten: any[];
    offertes: any[];
    events: any[];
    facturen: any[];
    haccpRecords: any[];
    inventory: any[];
    gerechten: any[];
}

export default function OnboardingProgress({
    klanten, offertes, events, facturen, haccpRecords, inventory, gerechten
}: OnboardingProgressProps) {
    const [dismissed, setDismissed] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(function () {
        const stored = localStorage.getItem('bbq_onboarding_dismissed');
        if (stored === 'true') setDismissed(true);
    }, []);

    const steps: ProgressStep[] = useMemo(function () {
        return [
            {
                id: 'klant',
                label: 'Eerste klant aangemaakt',
                description: 'Voeg je eerste klant toe',
                href: '/klanten',
                check: function () { return klanten.length > 0; },
            },
            {
                id: 'gerecht',
                label: 'Gerechten toegevoegd',
                description: 'Maak je menukaart aan',
                href: '/gerechten',
                check: function () { return gerechten.length >= 3; },
            },
            {
                id: 'voorraad',
                label: 'Voorraad bijgehouden',
                description: 'Voeg je ingredienten toe',
                href: '/voorraad',
                check: function () { return inventory.length >= 3; },
            },
            {
                id: 'offerte',
                label: 'Eerste offerte verstuurd',
                description: 'Stuur een professionele offerte',
                href: '/offertes',
                check: function () { return offertes.some(function (o: any) { return o.status !== 'concept'; }); },
            },
            {
                id: 'event',
                label: 'Eerste event gepland',
                description: 'Plan je eerste BBQ event',
                href: '/events',
                check: function () { return events.length > 0; },
            },
            {
                id: 'haccp',
                label: 'HACCP meting gelogd',
                description: 'Log je eerste temperatuurmeting',
                href: '/haccp',
                check: function () { return haccpRecords.length > 0; },
            },
            {
                id: 'factuur',
                label: 'Eerste factuur betaald',
                description: 'Factureer je eerste event',
                href: '/facturen',
                check: function () { return facturen.some(function (f: any) { return f.status === 'betaald'; }); },
            },
        ];
    }, [klanten, offertes, events, facturen, haccpRecords, inventory, gerechten]);

    const completedCount = steps.filter(function (s) { return s.check(); }).length;
    const totalSteps = steps.length;
    const progressPct = Math.round((completedCount / totalSteps) * 100);
    const isComplete = completedCount === totalSteps;

    // Don't render if dismissed or all complete
    if (dismissed && isComplete) return null;
    if (dismissed) return null;

    function handleDismiss() {
        setDismissed(true);
        localStorage.setItem('bbq_onboarding_dismissed', 'true');
    }

    // Compact mode — just the progress bar
    if (!isExpanded) {
        return (
            <div style={{ marginBottom: 16 }}>
                <MetallicCard className="p-4" accent={isComplete ? '#10b981' : '#c4a35a'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(196,163,90,0.12)',
                            border: isComplete ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(196,163,90,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {isComplete ? <Trophy size={18} style={{ color: '#10b981' }} /> : <Target size={18} style={{ color: '#c4a35a' }} />}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
                                    {isComplete ? 'Setup compleet!' : 'Aan de slag'}
                                </span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: isComplete ? '#10b981' : '#c4a35a' }}>
                                    {completedCount}/{totalSteps}
                                </span>
                            </div>
                            {/* Progress bar */}
                            <div style={{
                                width: '100%', height: 4, borderRadius: 2,
                                background: 'rgba(255,255,255,0.06)',
                            }}>
                                <div style={{
                                    width: progressPct + '%', height: '100%', borderRadius: 2,
                                    background: isComplete
                                        ? 'linear-gradient(90deg, #10b981, #059669)'
                                        : 'linear-gradient(90deg, #c4a35a, #a8893e)',
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                        </div>
                        <button
                            onClick={function () { setIsExpanded(true); }}
                            style={{
                                background: 'none', border: 'none', color: 'var(--muted)',
                                cursor: 'pointer', padding: 4,
                            }}
                        >
                            <ChevronRight size={16} />
                        </button>
                        <button
                            onClick={handleDismiss}
                            style={{
                                background: 'none', border: 'none', color: 'var(--muted)',
                                cursor: 'pointer', padding: 4, opacity: 0.5,
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </MetallicCard>
            </div>
        );
    }

    // Expanded mode — full step list
    return (
        <div style={{ marginBottom: 16 }}>
            <MetallicCard className="p-5" hover={false} accent={isComplete ? '#10b981' : '#c4a35a'}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: isComplete ? 'rgba(16,185,129,0.12)' : 'rgba(196,163,90,0.12)',
                            border: isComplete ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(196,163,90,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {isComplete ? <Trophy size={18} style={{ color: '#10b981' }} /> : <Target size={18} style={{ color: '#c4a35a' }} />}
                        </div>
                        <div>
                            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>
                                {isComplete ? 'Setup Compleet!' : 'Maak je BBQ Architect klaar'}
                            </h3>
                            <p style={{ fontSize: 11, color: 'var(--muted)' }}>{completedCount} van {totalSteps} stappen voltooid</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button
                            onClick={function () { setIsExpanded(false); }}
                            style={{
                                background: 'none', border: 'none', color: 'var(--muted)',
                                cursor: 'pointer', padding: 4, fontSize: 11,
                            }}
                        >
                            Inklappen
                        </button>
                        <button
                            onClick={handleDismiss}
                            style={{
                                background: 'none', border: 'none', color: 'var(--muted)',
                                cursor: 'pointer', padding: 4,
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Progress bar */}
                <div style={{
                    width: '100%', height: 6, borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)', marginBottom: 16,
                }}>
                    <div style={{
                        width: progressPct + '%', height: '100%', borderRadius: 3,
                        background: isComplete
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #c4a35a, #a8893e)',
                        transition: 'width 0.5s ease',
                    }} />
                </div>

                {/* Step list */}
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                    {steps.map(function (step) {
                        const done = step.check();
                        return (
                            <Link key={step.id} href={step.href} style={{ textDecoration: 'none' }}>
                                <div
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 10,
                                        background: done ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.02)',
                                        border: done ? '1px solid rgba(16,185,129,0.1)' : '1px solid transparent',
                                        cursor: done ? 'default' : 'pointer',
                                        transition: 'all 0.15s',
                                    }}
                                >
                                    <div style={{
                                        width: 24, height: 24, borderRadius: 6,
                                        background: done ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                                        border: done ? '1px solid rgba(16,185,129,0.3)' : '1px solid var(--border)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {done ? (
                                            <Check size={12} style={{ color: '#10b981' }} />
                                        ) : (
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)' }} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <span style={{
                                            fontSize: 13, fontWeight: 500,
                                            color: done ? '#10b981' : 'white',
                                            textDecoration: done ? 'line-through' : 'none',
                                            opacity: done ? 0.7 : 1,
                                        }}>
                                            {step.label}
                                        </span>
                                        {!done && (
                                            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                                                {step.description}
                                            </span>
                                        )}
                                    </div>
                                    {!done && <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </MetallicCard>
        </div>
    );
}
