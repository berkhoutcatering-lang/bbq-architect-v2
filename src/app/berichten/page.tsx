'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useFormValidation } from '@/hooks/useFormValidation';
import FieldError from '@/components/FieldError';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import PageHeader from '@/components/PageHeader';
import { Flame, Send, ArrowLeft } from 'lucide-react';

interface Bericht {
    id: number;
    afzender: string;
    onderwerp: string;
    bericht: string;
    datum: string;
    gelezen: boolean;
}

export default function Berichten() {
    const { data: berichten, loading, insert } = useSupabase<Bericht>('berichten', []);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ afzender: '', onderwerp: '', bericht: '' });
    const { errors, validateAll, clearError, fieldProps } = useFormValidation({
        afzender: [{ required: 'Vul een afzender in' }],
        onderwerp: [{ required: 'Vul een onderwerp in' }],
        bericht: [{ required: 'Vul een bericht in' }],
    });

    function handleSend() {
        if (!validateAll({ afzender: form.afzender, onderwerp: form.onderwerp, bericht: form.bericht })) return;
        insert({
            ...form,
            datum: new Date().toISOString(),
            gelezen: false,
        }).then(function () {
            setForm({ afzender: '', onderwerp: '', bericht: '' });
            setShowForm(false);
        });
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Flame size={24} style={{ color: 'var(--color-accent-gold)', animation: 'pulse 1.5s infinite' }} />
            </div>
        );
    }

    return (
        <>
            <PageHeader
                title="Berichten"
                description="Bekijk en verstuur berichten naar klanten en teamleden"
                actions={
                    <button
                        className="btn btn-brand"
                        onClick={function () { setShowForm(!showForm); }}
                    >
                        {showForm ? <><ArrowLeft size={14} /> Terug</> : <><Send size={14} /> Nieuw bericht</>}
                    </button>
                }
            />

            <PageHint
                id="berichten"
                title="Berichten"
                description="Bekijk en verstuur berichten naar klanten en teamleden"
            />

            {showForm && (
                <MetallicCard hover={false} className="p-6 mb-4">
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Nieuw bericht</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Aan</label>
                            <input
                                name="afzender"
                                value={form.afzender}
                                onChange={function (e) { clearError('afzender'); setForm({ ...form, afzender: e.target.value }); }}
                                placeholder="Naam of e-mail"
                                {...fieldProps('afzender', form.afzender)}
                                style={errors.afzender ? { borderColor: 'var(--red)' } : undefined}
                            />
                            <FieldError message={errors.afzender} fieldName="afzender" />
                        </div>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Onderwerp</label>
                            <input
                                name="onderwerp"
                                value={form.onderwerp}
                                onChange={function (e) { clearError('onderwerp'); setForm({ ...form, onderwerp: e.target.value }); }}
                                placeholder="Onderwerp van het bericht"
                                {...fieldProps('onderwerp', form.onderwerp)}
                                style={errors.onderwerp ? { borderColor: 'var(--red)' } : undefined}
                            />
                            <FieldError message={errors.onderwerp} fieldName="onderwerp" />
                        </div>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Bericht</label>
                            <textarea
                                name="bericht"
                                rows={4}
                                value={form.bericht}
                                onChange={function (e) { clearError('bericht'); setForm({ ...form, bericht: e.target.value }); }}
                                placeholder="Typ je bericht..."
                                {...fieldProps('bericht', form.bericht)}
                                style={errors.bericht ? { borderColor: 'var(--red)' } : undefined}
                            />
                            <FieldError message={errors.bericht} fieldName="bericht" />
                        </div>
                        <button className="btn btn-brand" onClick={handleSend} style={{ alignSelf: 'flex-end' }}>
                            <Send size={14} /> Versturen
                        </button>
                    </div>
                </MetallicCard>
            )}

            {berichten.length === 0 && !showForm && (
                <EmptyState
                    page="/berichten"
                    onAction={function () { setShowForm(true); }}
                    icon="Mail"
                    title="Geen berichten"
                    description="Je hebt nog geen berichten. Verstuur je eerste bericht."
                    actionLabel="Nieuw bericht"
                />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {berichten.map(function (b) {
                    return (
                        <MetallicCard key={b.id} className="p-4">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{b.onderwerp}</div>
                                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{b.afzender}</div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                                    {b.datum ? new Date(b.datum).toLocaleDateString('nl-NL') : ''}
                                </div>
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                                {b.bericht}
                            </p>
                            {!b.gelezen && (
                                <span style={{
                                    display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700,
                                    padding: '4px 8px', borderRadius: 8,
                                    background: 'rgba(196,163,90,.15)', color: 'var(--color-accent-gold)',
                                }}>Ongelezen</span>
                            )}
                        </MetallicCard>
                    );
                })}
            </div>
        </>
    );
}
