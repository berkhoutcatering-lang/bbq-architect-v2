'use client';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { Mail } from 'lucide-react';

export default function Mailbox() {
    return (
        <>
            <PageHint
                id="mailbox"
                title="Mailbox"
                description="Koppel je e-mail account om berichten direct vanuit BBQ Architect te versturen"
                icon={<Mail size={16} />}
            />

            <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Mailbox</h2>
            </div>

            <EmptyState
                page="/mailbox"
                icon="fa-solid fa-envelope"
                title="E-mail integratie binnenkort beschikbaar"
                description="Binnenkort kun je je e-mailaccount koppelen om berichten direct vanuit BBQ Architect te versturen en ontvangen."
            />

            <MetallicCard hover={false} className="p-6 mt-4">
                <div style={{ textAlign: 'center' }}>
                    <div
                        style={{
                            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(135deg, rgba(196,163,90,.15), rgba(196,163,90,.05))',
                            border: '1px solid rgba(196,163,90,.2)',
                        }}
                    >
                        <Mail size={22} style={{ color: '#c4a35a' }} />
                    </div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                        Geplande functies
                    </h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                            'Gmail en Outlook koppeling',
                            'Automatische offerte-mails',
                            'Bevestigingsmails naar klanten',
                            'E-mail templates',
                        ].map(function (feature) {
                            return (
                                <li key={feature} style={{
                                    fontSize: 13, color: 'var(--muted)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(196,163,90,.4)', flexShrink: 0 }} />
                                    {feature}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </MetallicCard>
        </>
    );
}
