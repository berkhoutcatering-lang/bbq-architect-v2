'use client';
import { useState } from 'react';
import { useOrg } from '@/lib/OrgContext';
import { useAuth } from '@/lib/AuthContext';
import MetallicCard from '@/components/MetallicCard';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import { Flame, UserPlus, ArrowLeft, Mail, Shield, ShieldCheck, ChefHat, LogOut } from 'lucide-react';

const ROLLEN = ['Admin', 'Pitmaster', 'Medewerker'] as const;

export default function Gebruikers() {
    const { members, orgId, isAdmin, refetchMembers, organization } = useOrg();
    const { user } = useAuth();
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<string>('Medewerker');
    const [inviting, setInviting] = useState(false);
    const [inviteMsg, setInviteMsg] = useState('');

    async function handleInvite() {
        if (!inviteEmail || !orgId) return;
        setInviting(true);
        setInviteMsg('');

        const res = await fetch('/api/org/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: inviteEmail,
                role: inviteRole,
                organizationId: orgId,
            }),
        });

        if (res.ok) {
            const { invitation } = await res.json();
            setInviteMsg('Uitnodiging verstuurd! Token: ' + invitation.token);
            setInviteEmail('');
            setInviteRole('Medewerker');
            refetchMembers();
        } else {
            const err = await res.json();
            setInviteMsg('Fout: ' + (err.error || 'Onbekende fout'));
        }
        setInviting(false);
    }

    const rolKleur: Record<string, string> = {
        Admin: '#c4a35a',
        Pitmaster: '#f97316',
        Medewerker: '#3b82f6',
    };

    const rolIcon: Record<string, React.ReactNode> = {
        Admin: <ShieldCheck size={14} />,
        Pitmaster: <ChefHat size={14} />,
        Medewerker: <Shield size={14} />,
    };

    const statusKleur: Record<string, string> = {
        active: '#22c55e',
        invited: '#f59e0b',
        inactive: '#71717a',
    };

    const statusLabel: Record<string, string> = {
        active: 'Actief',
        invited: 'Uitgenodigd',
        inactive: 'Inactief',
    };

    if (!members && !orgId) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                <Flame size={24} className="text-[#c4a35a] animate-pulse" />
            </div>
        );
    }

    return (
        <>
            <PageHint
                id="gebruikers"
                title="Teamleden"
                description={organization ? 'Beheer het team van ' + organization.name : 'Beheer wie toegang heeft tot BBQ Architect'}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
                    Teamleden
                    <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                        {members.length} {members.length === 1 ? 'lid' : 'leden'}
                    </span>
                </h2>
                {isAdmin && (
                    <button
                        className="btn btn-brand"
                        onClick={function () { setShowInvite(!showInvite); setInviteMsg(''); }}
                    >
                        {showInvite ? <><ArrowLeft size={14} /> Terug</> : <><UserPlus size={14} /> Uitnodigen</>}
                    </button>
                )}
            </div>

            {showInvite && isAdmin && (
                <MetallicCard hover={false} className="p-6 mb-4">
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                        Teamlid uitnodigen
                    </h3>
                    <div className="form-grid">
                        <div className="field">
                            <label>Email</label>
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={function (e) { setInviteEmail(e.target.value); }}
                                placeholder="collega@bedrijf.nl"
                            />
                        </div>
                        <div className="field">
                            <label>Rol</label>
                            <select value={inviteRole} onChange={function (e) { setInviteRole(e.target.value); }}>
                                {ROLLEN.map(function (r) { return <option key={r} value={r}>{r}</option>; })}
                            </select>
                        </div>
                    </div>
                    {inviteMsg && (
                        <div style={{
                            marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                            background: inviteMsg.startsWith('Fout') ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)',
                            color: inviteMsg.startsWith('Fout') ? '#ef4444' : '#22c55e',
                            border: '1px solid ' + (inviteMsg.startsWith('Fout') ? 'rgba(239,68,68,.2)' : 'rgba(34,197,94,.2)'),
                        }}>
                            {inviteMsg}
                        </div>
                    )}
                    <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="btn btn-brand" onClick={handleInvite} disabled={inviting || !inviteEmail}>
                            <Mail size={14} /> {inviting ? 'Versturen...' : 'Uitnodiging versturen'}
                        </button>
                    </div>
                </MetallicCard>
            )}

            {members.length === 0 && !showInvite && (
                <EmptyState
                    page="/gebruikers"
                    onAction={function () { setShowInvite(true); }}
                    icon="fa-solid fa-users"
                    title="Geen teamleden"
                    description="Nodig je team uit om samen te werken in BBQ Architect."
                    actionLabel="Teamlid uitnodigen"
                />
            )}

            {members.length > 0 && (
                <MetallicCard hover={false} className="p-4">
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {['Naam', 'Email', 'Rol', 'Status', ''].map(function (col) {
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
                                {members.map(function (m) {
                                    const isCurrentUser = m.user_id === user?.id;
                                    return (
                                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: '50%',
                                                        background: (rolKleur[m.role] || '#71717a') + '20',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: rolKleur[m.role] || '#71717a', fontSize: 13, fontWeight: 700,
                                                    }}>
                                                        {(m.naam || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span>
                                                        {m.naam || 'Onbekend'}
                                                        {isCurrentUser && (
                                                            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>(jij)</span>
                                                        )}
                                                    </span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{m.email}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
                                                    background: (rolKleur[m.role] || '#71717a') + '20',
                                                    color: rolKleur[m.role] || '#71717a',
                                                }}>
                                                    {rolIcon[m.role]} {m.role}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 8,
                                                    background: (statusKleur[m.status] || '#71717a') + '20',
                                                    color: statusKleur[m.status] || '#71717a',
                                                }}>{statusLabel[m.status] || m.status}</span>
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                {isCurrentUser && (
                                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                                                        <LogOut size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                    </span>
                                                )}
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
