/**
 * SystemHealthStrip — quick-glance system status bovenaan /systeem hub.
 *
 * 4 chips: AI-spend deze maand, AI-calls deze maand, actieve gebruikers,
 * actieve gerechten. Elke chip linkt naar de relevante sub-pagina.
 *
 * Server Component — data wordt opgehaald in /systeem/page.tsx en hier
 * doorgegeven. Geen client-side state; pure render.
 */

import Link from 'next/link';
import { Sparkles, Users, ChefHat, Activity } from 'lucide-react';

export interface SystemHealthData {
    aiSpendCentsThisMonth: number;
    aiCallsThisMonth: number;
    activeUsers: number;
    activeDishes: number;
}

interface Chip {
    label: string;
    value: string;
    icon: typeof Sparkles;
    href: string;
    tone: 'brand' | 'neutral' | 'success';
}

function fmtEur(cents: number): string {
    return '€ ' + (cents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SystemHealthStrip({ data }: { data: SystemHealthData }) {
    const chips: Chip[] = [
        {
            label: 'AI-kosten deze maand',
            value: fmtEur(data.aiSpendCentsThisMonth),
            icon: Sparkles,
            href: '/instellingen/ai-usage',
            tone: 'brand',
        },
        {
            label: 'AI-calls deze maand',
            value: data.aiCallsThisMonth.toLocaleString('nl-NL'),
            icon: Activity,
            href: '/instellingen/ai-usage',
            tone: 'neutral',
        },
        {
            label: 'Actieve gebruikers',
            value: String(data.activeUsers),
            icon: Users,
            href: '/gebruikers',
            tone: data.activeUsers > 0 ? 'success' : 'neutral',
        },
        {
            label: 'Gerechten in wizard',
            value: String(data.activeDishes),
            icon: ChefHat,
            href: '/gerechten',
            tone: data.activeDishes > 0 ? 'success' : 'neutral',
        },
    ];

    const toneColors: Record<Chip['tone'], { dot: string; text: string; bg: string; border: string }> = {
        brand: { dot: '#c4a35a', text: '#c4a35a', bg: 'rgba(196,163,90,.08)', border: 'rgba(196,163,90,.3)' },
        success: { dot: '#22c55e', text: '#22c55e', bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.25)' },
        neutral: { dot: 'var(--muted)', text: 'var(--text)', bg: 'rgba(255,255,255,.03)', border: 'var(--border)' },
    };

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginTop: 16,
                marginBottom: 16,
            }}
        >
            {chips.map((chip) => {
                const Icon = chip.icon;
                const tone = toneColors[chip.tone];
                return (
                    <Link
                        key={chip.label}
                        href={chip.href}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 16px',
                            borderRadius: 'var(--radius-lg, 12px)',
                            border: '1px solid ' + tone.border,
                            background: tone.bg,
                            textDecoration: 'none',
                            color: 'var(--text)',
                            transition: 'transform .15s ease, border-color .15s ease',
                            minHeight: 64,
                        }}
                        className="health-chip"
                    >
                        <span
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: 'var(--radius-md, 10px)',
                                background: 'rgba(0,0,0,.2)',
                                color: tone.text,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <Icon size={18} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    letterSpacing: '.12em',
                                    textTransform: 'uppercase',
                                    color: 'var(--muted)',
                                    lineHeight: 1,
                                }}
                            >
                                {chip.label}
                            </div>
                            <div
                                style={{
                                    fontSize: 20,
                                    fontWeight: 600,
                                    color: tone.text,
                                    marginTop: 6,
                                    fontVariantNumeric: 'tabular-nums',
                                    lineHeight: 1,
                                }}
                            >
                                {chip.value}
                            </div>
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}
