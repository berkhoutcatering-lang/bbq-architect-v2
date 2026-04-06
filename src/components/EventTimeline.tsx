'use client';

import { CheckCircle2, Circle, Clock, FileText, ChefHat, Flame, Receipt, Star } from 'lucide-react';

interface TimelineStep {
    key: string;
    label: string;
    icon: typeof Circle;
    status: 'done' | 'active' | 'upcoming';
    detail?: string;
}

interface Props {
    eventStatus: string;
    hasOfferte: boolean;
    hasFactuur: boolean;
    hasReflectie: boolean;
    hasPrep: boolean;
}

export default function EventTimeline({ eventStatus, hasOfferte, hasFactuur, hasReflectie, hasPrep }: Props) {
    const steps: TimelineStep[] = [];

    // Step 1: Offerte
    const offerteStatus = hasOfferte ? 'done' : (eventStatus === 'optie' || eventStatus === 'pending') ? 'active' : 'upcoming';
    steps.push({ key: 'offerte', label: 'Offerte', icon: FileText, status: offerteStatus, detail: hasOfferte ? 'Gekoppeld' : 'Optioneel' });

    // Step 2: Bevestigd
    const confirmedStatuses = ['confirmed', 'completed'];
    const isConfirmed = confirmedStatuses.includes(eventStatus);
    const confirmStatus = isConfirmed ? 'done' : eventStatus === 'optie' || eventStatus === 'pending' ? 'upcoming' : 'upcoming';
    steps.push({ key: 'bevestigd', label: 'Bevestigd', icon: CheckCircle2, status: isConfirmed || eventStatus === 'completed' ? 'done' : hasOfferte ? 'active' : 'upcoming' });

    // Step 3: Prep
    const prepStatus = isConfirmed && hasPrep ? 'done' : isConfirmed ? 'active' : 'upcoming';
    steps.push({ key: 'prep', label: 'Prep', icon: ChefHat, status: prepStatus, detail: hasPrep ? 'Taken aangemaakt' : isConfirmed ? 'In voorbereiding' : '' });

    // Step 4: Uitvoering
    const execStatus = eventStatus === 'completed' ? 'done' : isConfirmed && hasPrep ? 'active' : 'upcoming';
    steps.push({ key: 'uitvoering', label: 'Uitvoering', icon: Flame, status: execStatus });

    // Step 5: Factuur
    const factuurStatus = hasFactuur ? 'done' : eventStatus === 'completed' ? 'active' : 'upcoming';
    steps.push({ key: 'factuur', label: 'Factuur', icon: Receipt, status: factuurStatus, detail: hasFactuur ? 'Aangemaakt' : '' });

    // Step 6: Reflectie
    const reflectieStatus = hasReflectie ? 'done' : hasFactuur || eventStatus === 'completed' ? 'active' : 'upcoming';
    steps.push({ key: 'reflectie', label: 'Reflectie', icon: Star, status: reflectieStatus, detail: hasReflectie ? 'Ingevuld' : '' });

    const statusColors = {
        done: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#22c55e', line: '#22c55e' },
        active: { bg: 'rgba(196,163,90,0.15)', border: '#c4a35a', text: '#c4a35a', line: 'rgba(130,130,130,0.2)' },
        upcoming: { bg: 'rgba(130,130,130,0.06)', border: 'rgba(130,130,130,0.15)', text: '#555558', line: 'rgba(130,130,130,0.1)' },
    };

    return (
        <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
                <i className="fa-solid fa-route" style={{ marginRight: 6 }}></i>Event Lifecycle
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                {steps.map(function (step, i) {
                    const colors = statusColors[step.status];
                    const Icon = step.status === 'done' ? CheckCircle2 : step.icon;
                    return (
                        <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', minWidth: 50 }}>
                                <div style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: colors.bg,
                                    border: '2px solid ' + colors.border,
                                    transition: 'all 0.3s',
                                }}>
                                    <Icon size={14} style={{ color: colors.text }} />
                                </div>
                                <div style={{ marginTop: 6, textAlign: 'center' }}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: colors.text, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        {step.label}
                                    </div>
                                    {step.detail && (
                                        <div style={{ fontSize: 9, color: 'var(--muted-light)', marginTop: 2 }}>
                                            {step.detail}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {i < steps.length - 1 && (
                                <div style={{
                                    flex: 1,
                                    height: 2,
                                    marginTop: 14,
                                    background: step.status === 'done' ? colors.line : 'rgba(130,130,130,0.1)',
                                    borderRadius: 1,
                                    transition: 'background 0.3s',
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
