'use client';

import dynamic from 'next/dynamic';
import MetallicCard from '@/components/MetallicCard';
import {
  Activity, ArrowUpRight, BarChart3, Heart, Loader2, LogIn,
  Mail, Send, ShieldAlert,
} from 'lucide-react';
import { STATUS_CONFIG } from './types';
import type { AnalyticsData, HealthData, ImpersonateUser, RetentionData } from './types';

const AreaChart = dynamic(function () { return import('recharts').then(function (m) { return m.AreaChart; }); }, { ssr: false });
const Area = dynamic(function () { return import('recharts').then(function (m) { return m.Area; }); }, { ssr: false });
const XAxis = dynamic(function () { return import('recharts').then(function (m) { return m.XAxis; }); }, { ssr: false });
const YAxis = dynamic(function () { return import('recharts').then(function (m) { return m.YAxis; }); }, { ssr: false });
const Tooltip = dynamic(function () { return import('recharts').then(function (m) { return m.Tooltip; }); }, { ssr: false });
const ResponsiveContainer = dynamic(function () { return import('recharts').then(function (m) { return m.ResponsiveContainer; }); }, { ssr: false });
const BarChart = dynamic(function () { return import('recharts').then(function (m) { return m.BarChart; }); }, { ssr: false });
const Bar = dynamic(function () { return import('recharts').then(function (m) { return m.Bar; }); }, { ssr: false });

interface ProactivePanelProps {
  healthScores: HealthData[];
  impersonateUsers: ImpersonateUser[];
  alertMsg: Record<string, string>;
  sendingAlert: string | null;
  onSendAlert: (orgId: string, orgName: string, daysInactive: number) => void;
  onImpersonate: (userId: string) => void;
}

export function ProactiveActionPanel({
  healthScores, impersonateUsers, alertMsg, sendingAlert, onSendAlert, onImpersonate,
}: ProactivePanelProps) {
  const criticalOrgs = healthScores.filter(function (h) { return h.status === 'critical' || h.status === 'churned'; });
  const atRiskOrgs = healthScores.filter(function (h) { return h.status === 'at-risk'; });

  if (criticalOrgs.length === 0 && atRiskOrgs.length === 0) return null;

  return (
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
                onClick={function () { onSendAlert(h.orgId, h.orgName, h.daysInactive); }}
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
                if (orgUser) onImpersonate(orgUser.userId);
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
  );
}

interface HealthDashboardProps {
  view: 'overview' | 'health';
  healthScores: HealthData[];
  analytics: AnalyticsData | null;
  retention: RetentionData | null;
  alertMsg: Record<string, string>;
  sendingAlert: string | null;
  onSendAlert: (orgId: string, orgName: string, daysInactive: number) => void;
}

export default function HealthDashboard({
  view, healthScores, analytics, retention, alertMsg, sendingAlert, onSendAlert,
}: HealthDashboardProps) {
  if (view === 'overview') {
    return (
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
    );
  }

  // view === 'health'
  return (
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

      {healthScores.slice().sort(function (a, b) { return a.overall - b.overall; }).map(function (h) {
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
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {h.daysInactive > 7 && (
                  <button onClick={function () { onSendAlert(h.orgId, h.orgName, h.daysInactive); }} disabled={sendingAlert === h.orgId}
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
  );
}
