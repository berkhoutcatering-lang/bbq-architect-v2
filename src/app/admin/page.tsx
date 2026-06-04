'use client';

import { useCallback, useEffect, useState } from 'react';
import MetallicCard from '@/components/MetallicCard';
import {
  Activity, AlertTriangle, BarChart3, Building2, Heart, Loader2,
  LogIn, Plus, RefreshCw, UserCheck, Users,
} from 'lucide-react';
import HealthDashboard, { ProactiveActionPanel } from './_components/HealthDashboard';
import OrgGrid from './_components/OrgGrid';
import FunnelAnalytics from './_components/FunnelAnalytics';
import type {
  AnalyticsData, HealthData, ImpersonateUser, OrgData, RetentionData,
} from './_components/types';

type TabKey = 'overview' | 'orgs' | 'health' | 'analytics' | 'users';

export default function AdminPortal() {
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [healthScores, setHealthScores] = useState<HealthData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNaam, setNewNaam] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#9e781c');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  // Org expand + flags + copy
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [flagsOrg, setFlagsOrg] = useState<string | null>(null);
  const [orgFlags, setOrgFlags] = useState<Record<string, boolean>>({});

  // Alert sending
  const [sendingAlert, setSendingAlert] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<Record<string, string>>({});

  // Impersonation
  const [impersonateUsers, setImpersonateUsers] = useState<ImpersonateUser[]>([]);
  const [impersonating, setImpersonating] = useState<string | null>(null);
  const [impersonateMsg, setImpersonateMsg] = useState<Record<string, string>>({});

  const fetchHealth = useCallback(function () {
    fetch('/api/admin/health')
      .then(function (res) { return res.json(); })
      .then(function (data) { if (data.healthScores) setHealthScores(data.healthScores); })
      .catch(function () { /* silent */ });
  }, []);

  const fetchAnalytics = useCallback(function () {
    fetch('/api/admin/analytics')
      .then(function (res) { return res.json(); })
      .then(function (data) { if (data.chartData) setAnalytics(data); })
      .catch(function () { /* silent */ });
  }, []);

  const fetchUsers = useCallback(function () {
    fetch('/api/admin/impersonate')
      .then(function (res) { return res.json(); })
      .then(function (data) { if (data.users) setImpersonateUsers(data.users); })
      .catch(function () { /* silent */ });
  }, []);

  const fetchRetention = useCallback(function () {
    fetch('/api/admin/retention')
      .then(function (res) { return res.json(); })
      .then(function (data) { if (data.dau !== undefined) setRetention(data); })
      .catch(function () { /* silent */ });
  }, []);

  const fetchOrgs = useCallback(function () {
    setLoading(true);
    fetch('/api/admin/organizations')
      .then(function (res) {
        if (res.status === 403) { setError('Geen toegang — alleen platform admins.'); setLoading(false); return null; }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (data.error) { setError(data.error); }
        else { setOrgs(data.organizations || []); setCurrentUser(data.currentUser || ''); }
        setLoading(false);
      })
      .catch(function () { setError('Kan organisaties niet ophalen'); setLoading(false); });
  }, []);

  useEffect(function () { fetchOrgs(); fetchHealth(); fetchAnalytics(); fetchRetention(); fetchUsers(); }, [fetchOrgs, fetchHealth, fetchAnalytics, fetchRetention, fetchUsers]);

  function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true); setCreateMsg('');
    fetch('/api/admin/organizations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, adminEmail: newEmail || undefined, adminNaam: newNaam || undefined, adminPassword: newPassword || undefined, brandColor: newBrandColor !== '#9e781c' ? newBrandColor : undefined }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) { setCreateMsg('Fout: ' + data.error); }
        else { setCreateMsg(data.message || 'Aangemaakt!'); setNewName(''); setNewEmail(''); setNewNaam(''); setNewPassword(''); setShowCreate(false); fetchOrgs(); fetchHealth(); }
        setCreating(false);
      })
      .catch(function () { setCreateMsg('Fout bij aanmaken'); setCreating(false); });
  }

  function handleDeactivate(orgId: string) {
    fetch('/api/admin/organizations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: orgId }) })
      .then(function () { fetchOrgs(); fetchHealth(); });
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(window.location.origin + '/invite?token=' + token);
    setCopiedToken(token);
    setTimeout(function () { setCopiedToken(null); }, 2000);
  }

  function handleExport(orgId: string, _slug: string, format: string) {
    window.open('/api/admin/export?orgId=' + orgId + '&format=' + format, '_blank');
  }

  function loadFlags(orgId: string) {
    if (flagsOrg === orgId) { setFlagsOrg(null); return; }
    setFlagsOrg(orgId);
    fetch('/api/admin/feature-flags?orgId=' + orgId)
      .then(function (r) { return r.json(); })
      .then(function (d) { setOrgFlags(d.flags || {}); });
  }

  function toggleFlag(orgId: string, flagKey: string) {
    const updated = { ...orgFlags, [flagKey]: !orgFlags[flagKey] };
    setOrgFlags(updated);
    fetch('/api/admin/feature-flags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, flags: updated }),
    });
  }

  function handleImpersonate(userId: string) {
    setImpersonating(userId);
    fetch('/api/admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.loginUrl) {
          setImpersonateMsg(function (prev) { return { ...prev, [userId]: 'Link geopend' }; });
          window.open(d.loginUrl, '_blank');
        } else {
          setImpersonateMsg(function (prev) { return { ...prev, [userId]: d.error || 'Fout' }; });
        }
        setImpersonating(null);
        setTimeout(function () { setImpersonateMsg(function (prev) { const n = { ...prev }; delete n[userId]; return n; }); }, 4000);
      })
      .catch(function () { setImpersonating(null); });
  }

  function sendAlert(orgId: string, orgName: string, daysInactive: number) {
    setSendingAlert(orgId);
    fetch('/api/admin/send-alert', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, orgName, daysInactive }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setAlertMsg(function (prev) { return { ...prev, [orgId]: d.message || d.warning || 'Verzonden' }; });
        setSendingAlert(null);
        setTimeout(function () { setAlertMsg(function (prev) { const n = { ...prev }; delete n[orgId]; return n; }); }, 4000);
      })
      .catch(function () { setSendingAlert(null); });
  }

  if (error && !loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 16, background: 'color-mix(in srgb, var(--red) 10%, transparent)', marginBottom: 16 }}>
          <AlertTriangle size={28} style={{ color: 'var(--red)' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Toegang geweigerd</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Loader2 size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 14 }}>Platform laden...</p>
      </div>
    );
  }

  const activeOrgs = orgs.filter(function (o) { return !o.name.startsWith('[INACTIEF]'); });
  const totalMembers = orgs.reduce(function (sum, o) { return sum + o.members.active; }, 0);
  const healthyCount = healthScores.filter(function (h) { return h.status === 'healthy'; }).length;

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #c4a35a 0%, #8b6914 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={20} style={{ color: 'var(--text)' }} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>Platform Beheer</h1>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Ingelogd als {currentUser}</p>
            </div>
          </div>
          <a
            href="/admin/funnel"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--card)',
              color: 'var(--text)', fontSize: 12, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <BarChart3 size={14} /> Funnel-analytics
          </a>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-val">{activeOrgs.length}</div>
          <div className="stat-label">Organisaties</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{totalMembers}</div>
          <div className="stat-label">Gebruikers</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color: healthyCount === healthScores.length ? 'var(--green)' : 'var(--amber)' }}>
            {healthyCount}/{healthScores.length}
          </div>
          <div className="stat-label">Gezond</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{analytics?.totalActions || 0}</div>
          <div className="stat-label">Acties (30d)</div>
        </div>
      </div>

      <ProactiveActionPanel
        healthScores={healthScores}
        impersonateUsers={impersonateUsers}
        alertMsg={alertMsg}
        sendingAlert={sendingAlert}
        onSendAlert={sendAlert}
        onImpersonate={handleImpersonate}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg)', borderRadius: 10, padding: 3, border: '1px solid var(--border)', width: 'fit-content', flexWrap: 'wrap' }}>
        {([
          { key: 'overview' as TabKey, label: 'Overzicht', icon: <BarChart3 size={12} /> },
          { key: 'orgs' as TabKey, label: 'Organisaties', icon: <Building2 size={12} /> },
          { key: 'health' as TabKey, label: 'Health', icon: <Heart size={12} /> },
          { key: 'analytics' as TabKey, label: 'Analytics', icon: <Activity size={12} /> },
          { key: 'users' as TabKey, label: 'Klanten', icon: <UserCheck size={12} /> },
        ]).map(function (tab) {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key}
              onClick={function () { setActiveTab(tab.key); }}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                background: isActive ? 'var(--card)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--muted)',
                boxShadow: isActive ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
              }}
            >{tab.icon} {tab.label}</button>
          );
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn btn-brand" onClick={function () { setShowCreate(!showCreate); setCreateMsg(''); }}>
          {showCreate ? 'Annuleer' : <><Plus size={14} /> Nieuwe organisatie</>}
        </button>
        <button className="btn" style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)' }} onClick={function () { fetchOrgs(); fetchHealth(); fetchAnalytics(); fetchRetention(); }}>
          <RefreshCw size={14} /> Vernieuwen
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <MetallicCard hover={false} className="p-6 mb-5">
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
            <Plus size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: '-3px' }} />
            Nieuwe organisatie aanmaken
          </h3>
          <div className="form-grid">
            <div className="field"><label>Organisatienaam *</label><input value={newName} onChange={function (e) { setNewName(e.target.value); }} placeholder="Bijv: BBQ Company Rotterdam" /></div>
            <div className="field"><label>Admin naam</label><input value={newNaam} onChange={function (e) { setNewNaam(e.target.value); }} placeholder="Naam van de beheerder" /></div>
            <div className="field"><label>Admin email</label><input type="email" value={newEmail} onChange={function (e) { setNewEmail(e.target.value); }} placeholder="admin@bedrijf.nl" /></div>
            <div className="field"><label>Wachtwoord</label><input type="password" value={newPassword} onChange={function (e) { setNewPassword(e.target.value); }} placeholder="Min. 6 tekens" />
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'block' }}>Account wordt direct aangemaakt en gekoppeld.</span>
            </div>
            <div className="field"><label>Huisstijl kleur</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={newBrandColor} onChange={function (e) { setNewBrandColor(e.target.value); }} style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'transparent' }} />
                <input value={newBrandColor} onChange={function (e) { setNewBrandColor(e.target.value); }} style={{ flex: 1 }} />
              </div>
            </div>
          </div>
          {createMsg && (
            <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: createMsg.startsWith('Fout') ? 'color-mix(in srgb, var(--red) 10%, transparent)' : 'color-mix(in srgb, var(--green) 10%, transparent)', color: createMsg.startsWith('Fout') ? 'var(--red)' : 'var(--green)', border: '1px solid ' + (createMsg.startsWith('Fout') ? 'color-mix(in srgb, var(--red) 20%, transparent)' : 'color-mix(in srgb, var(--green) 20%, transparent)') }}>
              {createMsg}
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-brand" onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Aanmaken...</> : <><Plus size={14} /> Aanmaken</>}
            </button>
          </div>
        </MetallicCard>
      )}

      {(activeTab === 'overview' || activeTab === 'health') && (
        <HealthDashboard
          view={activeTab}
          healthScores={healthScores}
          analytics={analytics}
          retention={retention}
          alertMsg={alertMsg}
          sendingAlert={sendingAlert}
          onSendAlert={sendAlert}
        />
      )}

      {activeTab === 'analytics' && analytics && (
        <FunnelAnalytics analytics={analytics} />
      )}

      {activeTab === 'orgs' && (
        <OrgGrid
          orgs={orgs}
          healthScores={healthScores}
          impersonateUsers={impersonateUsers}
          flagsOrg={flagsOrg}
          orgFlags={orgFlags}
          expandedOrg={expandedOrg}
          copiedToken={copiedToken}
          onToggleExpand={function (id) { setExpandedOrg(expandedOrg === id ? null : id); }}
          onLoadFlags={loadFlags}
          onToggleFlag={toggleFlag}
          onCopyToken={copyToken}
          onExport={handleExport}
          onImpersonate={handleImpersonate}
          onDeactivate={handleDeactivate}
        />
      )}

      {activeTab === 'users' && (
        <MetallicCard hover={false} className="p-0 mb-6">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              <UserCheck size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
              Inloggen als klant
            </h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Open een nieuw tabblad ingelogd als deze gebruiker voor klantenservice.
            </p>
          </div>

          {impersonateUsers.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Users size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Geen gebruikers gevonden</p>
            </div>
          )}

          {impersonateUsers.map(function (u) {
            return (
              <div key={u.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: 'color-mix(in srgb, var(--blue) 10%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--blue)', fontSize: 14, fontWeight: 700,
                }}>
                  {u.naam.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{u.naam}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)' }}>{u.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                    {u.email} &middot; {u.orgName}
                  </div>
                </div>
                {impersonateMsg[u.userId] ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: impersonateMsg[u.userId] === 'Link geopend' ? 'var(--green)' : 'var(--red)' }}>
                    {impersonateMsg[u.userId]}
                  </span>
                ) : (
                  <button
                    onClick={function () { handleImpersonate(u.userId); }}
                    disabled={impersonating === u.userId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                      borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent-gold) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent-gold) 20%, transparent)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--brand)',
                    }}
                  >
                    {impersonating === u.userId
                      ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      : <LogIn size={12} />}
                    Inloggen als
                  </button>
                )}
              </div>
            );
          })}
        </MetallicCard>
      )}
    </>
  );
}
