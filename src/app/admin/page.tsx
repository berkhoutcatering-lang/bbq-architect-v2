/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import MetallicCard from '@/components/MetallicCard';
import {
  Building2, Users, Plus, ChevronDown, ChevronRight,
  Calendar, FileText, Receipt, ChefHat, Copy,
  Check, AlertTriangle, Loader2, ExternalLink, Trash2, RefreshCw,
  Heart, Activity, TrendingDown, ShieldAlert, BarChart3,
  Download, Mail, ToggleLeft, ToggleRight, Send,
  ArrowUpRight, ArrowDownRight, Minus, LogIn, UserCheck
} from 'lucide-react';

// Lazy load Recharts to reduce initial bundle
const AreaChart = dynamic(function () { return import('recharts').then(function (m) { return m.AreaChart; }); }, { ssr: false });
const Area = dynamic(function () { return import('recharts').then(function (m) { return m.Area; }); }, { ssr: false });
const XAxis = dynamic(function () { return import('recharts').then(function (m) { return m.XAxis; }); }, { ssr: false });
const YAxis = dynamic(function () { return import('recharts').then(function (m) { return m.YAxis; }); }, { ssr: false });
const Tooltip = dynamic(function () { return import('recharts').then(function (m) { return m.Tooltip; }); }, { ssr: false });
const ResponsiveContainer = dynamic(function () { return import('recharts').then(function (m) { return m.ResponsiveContainer; }); }, { ssr: false });
const BarChart = dynamic(function () { return import('recharts').then(function (m) { return m.BarChart; }); }, { ssr: false });
const Bar = dynamic(function () { return import('recharts').then(function (m) { return m.Bar; }); }, { ssr: false });

interface OrgData {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  members: { active: number; invited: number };
  invitations: { email: string; role: string; token: string; expires_at: string; created_at: string }[];
  data: Record<string, number>;
}

interface HealthData {
  orgId: string;
  orgName: string;
  overall: number;
  activity: number;
  dataRichness: number;
  adoption: number;
  teamSize: number;
  lastActivity: string | null;
  daysInactive: number;
  status: 'healthy' | 'at-risk' | 'critical' | 'churned';
  memberCount: number;
  dataCount: number;
}

interface AnalyticsData {
  chartData: { date: string; label: string; total: number }[];
  orgTotals: { orgId: string; orgName: string; totalActions: number }[];
  topPages: { page: string; count: number }[];
  totalActions: number;
  activeOrgs: number;
}

interface RetentionData {
  dau: number;
  wau: number;
  mau: number;
  total: number;
  stickiness: number;
  dauPct: number;
  wauPct: number;
  mauPct: number;
  errorCount: number;
  openTickets: number;
  totalTickets: number;
  helpfulPct: number;
  totalFeedback: number;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  healthy: { color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 10%, transparent)', label: 'Gezond' },
  'at-risk': { color: 'var(--amber)', bg: 'color-mix(in srgb, var(--amber) 10%, transparent)', label: 'Risico' },
  critical: { color: 'var(--red)', bg: 'color-mix(in srgb, var(--red) 10%, transparent)', label: 'Kritiek' },
  churned: { color: 'var(--zinc)', bg: 'color-mix(in srgb, var(--zinc) 10%, transparent)', label: 'Inactief' },
};

const FLAG_DEFS = [
  { key: 'ai_assistant', label: 'AI Assistent', desc: 'Pitmaster Studio' },
  { key: 'price_intelligence', label: 'Prijsintelligentie', desc: 'Marktinzichten' },
  { key: 'csv_import', label: 'CSV Import', desc: 'Data import' },
  { key: 'website_builder', label: 'Website Builder', desc: 'Publieke site' },
  { key: 'advanced_analytics', label: 'Analytics Pro', desc: 'Financiele rapportages' },
  { key: 'api_access', label: 'API Toegang', desc: 'REST API' },
  { key: 'multi_location', label: 'Multi-locatie', desc: 'Vestigingen' },
  { key: 'white_label', label: 'White Label', desc: 'Eigen branding' },
];

export default function AdminPortal() {
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [healthScores, setHealthScores] = useState<HealthData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'orgs' | 'health' | 'analytics' | 'users'>('overview');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newNaam, setNewNaam] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#9e781c');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  // Expanded org detail
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Feature flags
  const [flagsOrg, setFlagsOrg] = useState<string | null>(null);
  const [orgFlags, setOrgFlags] = useState<Record<string, boolean>>({});

  // Alert sending
  const [sendingAlert, setSendingAlert] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<Record<string, string>>({});

  // Impersonation
  const [impersonateUsers, setImpersonateUsers] = useState<{ userId: string; naam: string; email: string; role: string; orgId: string; orgName: string }[]>([]);
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

  function handleDeactivate(orgId: string, orgName: string) {
    if (!confirm('Weet je zeker dat je "' + orgName + '" wilt deactiveren?')) return;
    fetch('/api/admin/organizations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organizationId: orgId }) })
      .then(function () { fetchOrgs(); fetchHealth(); });
  }

  function copyToken(token: string) {
    navigator.clipboard.writeText(window.location.origin + '/invite?token=' + token);
    setCopiedToken(token);
    setTimeout(function () { setCopiedToken(null); }, 2000);
  }

  function handleExport(orgId: string, slug: string, format: string) {
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

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
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
  const inactiveOrgs = orgs.filter(function (o) { return o.name.startsWith('[INACTIEF]'); });
  const totalMembers = orgs.reduce(function (sum, o) { return sum + o.members.active; }, 0);
  const healthyCount = healthScores.filter(function (h) { return h.status === 'healthy'; }).length;
  const criticalOrgs = healthScores.filter(function (h) { return h.status === 'critical' || h.status === 'churned'; });
  const atRiskOrgs = healthScores.filter(function (h) { return h.status === 'at-risk'; });

  return (
    <>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #c4a35a 0%, #8b6914 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={20} style={{ color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>Platform Beheer</h1>
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>Ingelogd als {currentUser}</p>
          </div>
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

      {/* Proactive Action Panel — always visible if there are issues */}
      {(criticalOrgs.length > 0 || atRiskOrgs.length > 0) && (
        <MetallicCard hover={false} className="p-4 mb-5">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ShieldAlert size={16} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              Actie nodig ({criticalOrgs.length + atRiskOrgs.length})
            </span>
          </div>

          {criticalOrgs.concat(atRiskOrgs).map(function (h) {
            const cfg = STATUS_CONFIG[h.status];
            return (
              <div key={h.orgId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 8, background: cfg.bg, border: '1px solid ' + cfg.color + '22',
                marginBottom: 6,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: cfg.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: cfg.color,
                }}>{h.overall}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.orgName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {h.daysInactive}d inactief &middot; {h.memberCount} leden &middot; {h.dataCount} records
                  </div>
                </div>
                {alertMsg[h.orgId] ? (
                  <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{alertMsg[h.orgId]}</span>
                ) : (
                  <button
                    onClick={function () { sendAlert(h.orgId, h.orgName, h.daysInactive); }}
                    disabled={sendingAlert === h.orgId}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                      borderRadius: 6, background: 'var(--card)', border: '1px solid var(--border)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text)',
                    }}
                  >
                    {sendingAlert === h.orgId
                      ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Send size={11} />}
                    Email alert
                  </button>
                )}
                <button
                  onClick={function () {
                    const orgUser = impersonateUsers.find(function (u) { return u.orgId === h.orgId; });
                    if (orgUser) handleImpersonate(orgUser.userId);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3, padding: '6px 12px',
                    borderRadius: 6, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)',
                    fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  }}
                >
                  <LogIn size={11} /> Bekijk als klant
                </button>
              </div>
            );
          })}
        </MetallicCard>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg)', borderRadius: 10, padding: 3, border: '1px solid var(--border)', width: 'fit-content', flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: 'Overzicht', icon: <BarChart3 size={12} /> },
          { key: 'orgs', label: 'Organisaties', icon: <Building2 size={12} /> },
          { key: 'health', label: 'Health', icon: <Heart size={12} /> },
          { key: 'analytics', label: 'Analytics', icon: <Activity size={12} /> },
          { key: 'users', label: 'Klanten', icon: <UserCheck size={12} /> },
        ].map(function (tab) {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key}
              onClick={function () { setActiveTab(tab.key as any); }}
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

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Activity chart */}
          {analytics && analytics.chartData.length > 0 && (
            <MetallicCard hover={false} className="p-5 mb-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
                <Activity size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                Platform activiteit (30 dagen)
              </h3>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.chartData}>
                    <defs>
                      <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-accent-gold)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-accent-gold)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval={4} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} width={30} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="total" stroke="var(--color-accent-gold)" fillOpacity={1} fill="url(#colorActivity)" strokeWidth={2} name="Acties" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </MetallicCard>
          )}

          {/* Retention metrics */}
          {retention && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'DAU', val: retention.dau, sub: retention.dauPct + '% van totaal', color: 'var(--green)' },
                { label: 'WAU', val: retention.wau, sub: retention.wauPct + '% van totaal', color: 'var(--blue)' },
                { label: 'MAU', val: retention.mau, sub: retention.mauPct + '% van totaal', color: 'var(--purple)' },
                { label: 'Stickiness', val: retention.stickiness + '%', sub: 'DAU/MAU ratio', color: 'var(--amber)' },
                { label: 'Errors', val: retention.errorCount, sub: 'Afgelopen 7d', color: retention.errorCount > 0 ? 'var(--red)' : 'var(--green)' },
                { label: 'Tickets', val: retention.openTickets + '/' + retention.totalTickets, sub: 'Open/totaal', color: retention.openTickets > 0 ? 'var(--amber)' : 'var(--green)' },
              ].map(function (m) {
                return (
                  <div key={m.label} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.val}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{m.sub}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Health distribution + Top orgs side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            {/* Health distribution */}
            <MetallicCard hover={false} className="p-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                <Heart size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6, color: 'var(--red)' }} />
                Health verdeling
              </h3>
              {['healthy', 'at-risk', 'critical', 'churned'].map(function (status) {
                const count = healthScores.filter(function (h) { return h.status === status; }).length;
                const pct = healthScores.length > 0 ? Math.round((count / healthScores.length) * 100) : 0;
                const cfg = STATUS_CONFIG[status];
                return (
                  <div key={status} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                      <span style={{ color: 'var(--muted)' }}>{count} ({pct}%)</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: pct + '%', background: cfg.color, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </MetallicCard>

            {/* Top active orgs */}
            <MetallicCard hover={false} className="p-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                <ArrowUpRight size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6, color: 'var(--green)' }} />
                Meest actieve organisaties
              </h3>
              {(analytics?.orgTotals || []).slice(0, 5).map(function (org, i) {
                const maxActions = (analytics?.orgTotals[0]?.totalActions || 1);
                return (
                  <div key={org.orgId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', width: 16 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{org.orgName}</div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: Math.round((org.totalActions / maxActions) * 100) + '%', background: 'var(--green)' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 28, textAlign: 'right' }}>{org.totalActions}</span>
                  </div>
                );
              })}
              {(!analytics || analytics.orgTotals.length === 0) && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nog geen activiteitsdata</div>
              )}
            </MetallicCard>
          </div>

          {/* Top pages */}
          {analytics && analytics.topPages.length > 0 && (
            <MetallicCard hover={false} className="p-5 mb-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
                <BarChart3 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />
                Populairste pagina&apos;s
              </h3>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topPages.slice(0, 8)} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                    <YAxis dataKey="page" type="category" tick={{ fontSize: 10, fill: 'var(--muted)' }} width={100} />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill="var(--color-accent-gold)" radius={[0, 4, 4, 0]} name="Bezoeken" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </MetallicCard>
          )}
        </>
      )}

      {/* ═══════════════ HEALTH TAB ═══════════════ */}
      {activeTab === 'health' && (
        <MetallicCard hover={false} className="p-0 mb-6">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              <Heart size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6, color: 'var(--red)' }} />
              Customer Health Scores
            </h3>
          </div>

          {healthScores.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Activity size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nog geen health data</p>
            </div>
          )}

          {healthScores.sort(function (a, b) { return a.overall - b.overall; }).map(function (h) {
            const statusCfg = STATUS_CONFIG[h.status] || STATUS_CONFIG.healthy;
            return (
              <div key={h.orgId} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: 'conic-gradient(' + statusCfg.color + ' ' + (h.overall * 3.6) + 'deg, var(--border) 0deg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: statusCfg.color }}>{h.overall}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{h.orgName}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: statusCfg.bg, color: statusCfg.color }}>{statusCfg.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      {h.memberCount} leden &middot; {h.dataCount} records &middot; {h.daysInactive === 0 ? 'Vandaag actief' : h.daysInactive + 'd inactief'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {[{ label: 'Act', val: h.activity }, { label: 'Data', val: h.dataRichness }, { label: 'Adopt', val: h.adoption }, { label: 'Team', val: h.teamSize }].map(function (m) {
                      return (
                        <div key={m.label} style={{ textAlign: 'center', width: 36 }}>
                          <div style={{ height: 28, borderRadius: 4, background: 'var(--bg)', position: 'relative', overflow: 'hidden', marginBottom: 2 }}>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: (m.val * 28 / 100) + 'px', background: m.val > 60 ? 'var(--green)' : m.val > 30 ? 'var(--amber)' : 'var(--red)', borderRadius: 4, transition: 'height 0.3s' }} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{m.label}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {h.daysInactive > 7 && (
                      <button onClick={function () { sendAlert(h.orgId, h.orgName, h.daysInactive); }} disabled={sendingAlert === h.orgId}
                        style={{ padding: '6px 12px', borderRadius: 6, background: 'color-mix(in srgb, var(--red) 8%, transparent)', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                        {sendingAlert === h.orgId ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Mail size={10} />} Alert
                      </button>
                    )}
                  </div>
                </div>
                {alertMsg[h.orgId] && (
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>{alertMsg[h.orgId]}</div>
                )}
              </div>
            );
          })}
        </MetallicCard>
      )}

      {/* ═══════════════ ANALYTICS TAB ═══════════════ */}
      {activeTab === 'analytics' && analytics && (
        <>
          <MetallicCard hover={false} className="p-5 mb-5">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
              Activiteit per dag (30 dagen)
            </h3>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.chartData}>
                  <defs>
                    <linearGradient id="colorAct2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent-gold)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-accent-gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} width={30} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="total" stroke="var(--color-accent-gold)" fillOpacity={1} fill="url(#colorAct2)" strokeWidth={2} name="Acties" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </MetallicCard>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            <MetallicCard hover={false} className="p-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Activiteit per organisatie</h3>
              {analytics.orgTotals.map(function (org) {
                const maxA = analytics.orgTotals[0]?.totalActions || 1;
                const trend = org.totalActions > 5 ? 'up' : org.totalActions > 0 ? 'flat' : 'down';
                return (
                  <div key={org.orgId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {trend === 'up' ? <ArrowUpRight size={12} style={{ color: 'var(--green)' }} /> : trend === 'down' ? <ArrowDownRight size={12} style={{ color: 'var(--red)' }} /> : <Minus size={12} style={{ color: 'var(--muted)' }} />}
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{org.orgName}</span>
                    <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: Math.round((org.totalActions / maxA) * 100) + '%', background: 'var(--color-accent-gold)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 28, textAlign: 'right' }}>{org.totalActions}</span>
                  </div>
                );
              })}
            </MetallicCard>

            <MetallicCard hover={false} className="p-5">
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Feature adoptie</h3>
              {analytics.topPages.map(function (p) {
                const maxP = analytics.topPages[0]?.count || 1;
                return (
                  <div key={p.page} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, fontFamily: 'monospace' }}>{p.page}</span>
                    <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: Math.round((p.count / maxP) * 100) + '%', background: 'var(--blue)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 28, textAlign: 'right' }}>{p.count}</span>
                  </div>
                );
              })}
            </MetallicCard>
          </div>
        </>
      )}

      {/* ═══════════════ USERS/IMPERSONATE TAB ═══════════════ */}
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

      {/* ═══════════════ ORGS TAB ═══════════════ */}
      {activeTab === 'orgs' && (
        <MetallicCard hover={false} className="p-0">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Organisaties <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>{activeOrgs.length} actief, {inactiveOrgs.length} inactief</span>
            </h3>
          </div>

          {orgs.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <Building2 size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nog geen organisaties</p>
            </div>
          )}

          {orgs.map(function (org) {
            const isExpanded = expandedOrg === org.id;
            const isInactive = org.name.startsWith('[INACTIEF]');
            const displayName = isInactive ? org.name.replace('[INACTIEF] ', '') : org.name;
            const health = healthScores.find(function (h) { return h.orgId === org.id; });
            const healthCfg = health ? STATUS_CONFIG[health.status] : null;

            return (
              <div key={org.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <button onClick={function () { setExpandedOrg(isExpanded ? null : org.id); }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', opacity: isInactive ? 0.5 : 1 }}
                  className="hover:bg-white/[0.02]">
                  <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isInactive ? 'color-mix(in srgb, var(--zinc) 15%, transparent)' : 'color-mix(in srgb, var(--blue) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isInactive ? 'var(--zinc)' : 'var(--blue)', fontSize: 14, fontWeight: 700 }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
                      {isInactive && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}>INACTIEF</span>}
                      {healthCfg && !isInactive && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: healthCfg.bg, color: healthCfg.color }}>{health!.overall}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{org.slug} &middot; {formatDate(org.created_at)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{org.members.active}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>leden</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{org.data.events || 0}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>events</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{org.data.offertes || 0}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>offertes</div></div>
                    {isExpanded ? <ChevronDown size={16} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={16} style={{ color: 'var(--muted)' }} />}
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', marginTop: -1 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
                      <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Data</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[{ icon: <Calendar size={13} />, l: 'Events', v: org.data.events || 0 }, { icon: <FileText size={13} />, l: 'Offertes', v: org.data.offertes || 0 }, { icon: <Receipt size={13} />, l: 'Facturen', v: org.data.facturen || 0 }, { icon: <ChefHat size={13} />, l: 'Recepten', v: org.data.recepten || 0 }].map(function (s) {
                            return <div key={s.l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}><span style={{ color: 'var(--muted)' }}>{s.icon}</span><span style={{ color: 'var(--muted)' }}>{s.l}:</span><span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.v}</span></div>;
                          })}
                        </div>
                      </div>
                      <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Leden</div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green)' }}>{org.members.active}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>actief</div></div>
                          <div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--amber)' }}>{org.members.invited}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>uitgenodigd</div></div>
                        </div>
                      </div>
                      <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Info</div>
                        <div style={{ fontSize: 12 }}>
                          <div style={{ color: 'var(--muted)', marginBottom: 4 }}>ID: <span style={{ color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}>{org.id.slice(0, 8)}...</span></div>
                          <div style={{ color: 'var(--muted)' }}>Aangemaakt: <span style={{ color: 'var(--text)' }}>{formatDate(org.created_at)}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Feature Flags */}
                    <div style={{ marginTop: 16 }}>
                      <button onClick={function () { loadFlags(org.id); }} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <ToggleLeft size={14} /> Feature Flags {flagsOrg === org.id ? '(verbergen)' : '(tonen)'}
                      </button>
                      {flagsOrg === org.id && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                          {FLAG_DEFS.map(function (flag) {
                            const enabled = !!orgFlags[flag.key];
                            return (
                              <button key={flag.key} onClick={function () { toggleFlag(org.id, flag.key); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: enabled ? 'color-mix(in srgb, var(--green) 6%, transparent)' : 'var(--bg)', border: '1px solid ' + (enabled ? 'color-mix(in srgb, var(--green) 20%, transparent)' : 'var(--border)'), cursor: 'pointer', textAlign: 'left' }}>
                                {enabled ? <ToggleRight size={16} style={{ color: 'var(--green)', flexShrink: 0 }} /> : <ToggleLeft size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{flag.label}</div>
                                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{flag.desc}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Invitations */}
                    {org.invitations.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Uitnodigingen ({org.invitations.length})</div>
                        {org.invitations.map(function (inv) {
                          const expired = new Date(inv.expires_at) < new Date();
                          return (
                            <div key={inv.token} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)', marginBottom: 6, fontSize: 12 }}>
                              <span style={{ color: 'var(--text)', flex: 1 }}>{inv.email}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: expired ? 'color-mix(in srgb, var(--red) 10%, transparent)' : 'color-mix(in srgb, var(--blue) 10%, transparent)', color: expired ? 'var(--red)' : 'var(--blue)' }}>{expired ? 'Verlopen' : inv.role}</span>
                              {!expired && (
                                <button onClick={function (e) { e.stopPropagation(); copyToken(inv.token); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                                  {copiedToken === inv.token ? <><Check size={11} /> Gekopieerd</> : <><Copy size={11} /> Link</>}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={function () {
                          const orgUser = impersonateUsers.find(function (u) { return u.orgId === org.id; });
                          if (orgUser) handleImpersonate(orgUser.userId);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <LogIn size={12} /> Inloggen als klant
                      </button>
                      <button onClick={function () { handleExport(org.id, org.slug, 'json'); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--green) 8%, transparent)', color: 'var(--green)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <Download size={12} /> Export JSON
                      </button>
                      <button onClick={function () { handleExport(org.id, org.slug, 'csv'); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--green) 8%, transparent)', color: 'var(--green)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                        <Download size={12} /> Export CSV
                      </button>
                      {!isInactive && (
                        <button onClick={function () { handleDeactivate(org.id, displayName); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--red) 8%, transparent)', color: 'var(--red)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                          <Trash2 size={12} /> Deactiveren
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </MetallicCard>
      )}
    </>
  );
}
