'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
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

    function handleSend() {
        if (!form.afzender || !form.onderwerp || !form.bericht) return;
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
                <Flame size={24} style={{ color: '#c4a35a', animation: 'pulse 1.5s infinite' }} />
            </div>
        );
    }

    return (
        <>
            <PageHint
                id="berichten"
                title="Berichten"
                description="Bekijk en verstuur berichten naar klanten en teamleden"
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Berichten</h2>
                <button
                    className="btn btn-brand"
                    onClick={function () { setShowForm(!showForm); }}
                >
                    {showForm ? <><ArrowLeft size={14} /> Terug</> : <><Send size={14} /> Nieuw bericht</>}
                </button>
            </div>

            {showForm && (
                <MetallicCard hover={false} className="p-6 mb-4">
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Nieuw bericht</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Aan</label>
                            <input
                                value={form.afzender}
                                onChange={function (e) { setForm({ ...form, afzender: e.target.value }); }}
                                placeholder="Naam of e-mail"
                            />
                        </div>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Onderwerp</label>
                            <input
                                value={form.onderwerp}
                                onChange={function (e) { setForm({ ...form, onderwerp: e.target.value }); }}
                                placeholder="Onderwerp van het bericht"
                            />
                        </div>
                        <div className="field">
                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Bericht</label>
                            <textarea
                                rows={4}
                                value={form.bericht}
                                onChange={function (e) { setForm({ ...form, bericht: e.target.value }); }}
                                placeholder="Typ je bericht..."
                            />
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
                                    background: 'rgba(196,163,90,.15)', color: '#c4a35a',
                                }}>Ongelezen</span>
                            )}
                        </MetallicCard>
                    );
                })}
            </div>
        </>
    );
}
