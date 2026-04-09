'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { Flame, UserPlus, ArrowLeft } from 'lucide-react';

interface Profile {
    id: number;
    naam: string;
    email: string;
    rol: string;
    status: string;
}

const ROLLEN = ['Admin', 'Pitmaster', 'Medewerker'];
const STATUS_OPTIES = ['Actief', 'Inactief'];

export default function Gebruikers() {
    const { data: gebruikers, loading, insert } = useSupabase<Profile>('profiles', []);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ naam: '', email: '', rol: 'Medewerker', status: 'Actief' });

    function handleAdd() {
        if (!form.naam || !form.email) return;
        insert(form as Partial<Profile>).then(function () {
            setForm({ naam: '', email: '', rol: 'Medewerker', status: 'Actief' });
            setShowForm(false);
        });
    }

    const rolKleur: Record<string, string> = {
        Admin: '#c4a35a',
        Pitmaster: '#f97316',
        Medewerker: '#3b82f6',
    };

    const statusKleur: Record<string, string> = {
        Actief: '#22c55e',
        Inactief: '#71717a',
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Flame size={24} style={{ color: 'var(--brand)', animation: 'pulse 1.5s infinite' }} />
            </div>
        );
    }

    return (
        <>
            <PageHint
                id="gebruikers"
                title="Gebruikers"
                description="Beheer wie toegang heeft tot BBQ Architect en welke rechten zij hebben"
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Gebruikers</h2>
                <button
                    className="btn btn-brand"
                    onClick={function () { setShowForm(!showForm); }}
                >
                    {showForm ? <><ArrowLeft size={14} /> Terug</> : <><UserPlus size={14} /> Gebruiker toevoegen</>}
                </button>
            </div>

            {showForm && (
                <MetallicCard hover={false} className="p-6 mb-4">
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Nieuwe gebruiker</h3>
                    <div className="form-grid">
                        <div className="field">
                            <label>Naam</label>
                            <input value={form.naam} onChange={function (e) { setForm({ ...form, naam: e.target.value }); }} placeholder="Volledige naam" />
                        </div>
                        <div className="field">
                            <label>Email</label>
                            <input type="email" value={form.email} onChange={function (e) { setForm({ ...form, email: e.target.value }); }} placeholder="naam@bedrijf.nl" />
                        </div>
                        <div className="field">
                            <label>Rol</label>
                            <select value={form.rol} onChange={function (e) { setForm({ ...form, rol: e.target.value }); }}>
                                {ROLLEN.map(function (r) { return <option key={r} value={r}>{r}</option>; })}
                            </select>
                        </div>
                        <div className="field">
                            <label>Status</label>
                            <select value={form.status} onChange={function (e) { setForm({ ...form, status: e.target.value }); }}>
                                {STATUS_OPTIES.map(function (s) { return <option key={s} value={s}>{s}</option>; })}
                            </select>
                        </div>
                    </div>
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-brand" onClick={handleAdd}>
                            <UserPlus size={14} /> Toevoegen
                        </button>
                    </div>
                </MetallicCard>
            )}

            {gebruikers.length === 0 && !showForm && (
                <EmptyState
                    page="/gebruikers"
                    onAction={function () { setShowForm(true); }}
                    icon="fa-solid fa-users"
                    title="Geen gebruikers"
                    description="Voeg teamleden toe om toegang te geven tot BBQ Architect."
                    actionLabel="Gebruiker toevoegen"
                />
            )}

            {gebruikers.length > 0 && (
                <MetallicCard hover={false} className="p-4">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Naam', 'Email', 'Rol', 'Status'].map(function (col) {
                                        return (
                                            <th key={col} style={{
                                                textAlign: 'left', padding: '8px 12px',
                                                fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                            }}>{col}</th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {gebruikers.map(function (g) {
                                    return (
                                        <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>{g.naam}</td>
                                            <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{g.email}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
                                                    background: (rolKleur[g.rol] || '#71717a') + '20',
                                                    color: rolKleur[g.rol] || '#71717a',
                                                }}>{g.rol}</span>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
                                                    background: (statusKleur[g.status] || '#71717a') + '20',
                                                    color: statusKleur[g.status] || '#71717a',
                                                }}>{g.status}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </MetallicCard>
            )}
        </>
    );
}
