'use client';

import { useState } from 'react';
import MetallicCard from '@/components/MetallicCard';
import {
  Building2, Calendar, ChefHat, ChevronDown, ChevronRight,
  Check, Copy, Download, FileText, LogIn, Receipt,
  ToggleLeft, ToggleRight, Trash2,
} from 'lucide-react';
import ConfirmDrawer from './ConfirmDrawer';
import { FLAG_DEFS, STATUS_CONFIG } from './types';
import type { HealthData, ImpersonateUser, OrgData } from './types';

interface Props {
  orgs: OrgData[];
  healthScores: HealthData[];
  impersonateUsers: ImpersonateUser[];
  flagsOrg: string | null;
  orgFlags: Record<string, boolean>;
  expandedOrg: string | null;
  copiedToken: string | null;
  onToggleExpand: (orgId: string) => void;
  onLoadFlags: (orgId: string) => void;
  onToggleFlag: (orgId: string, flagKey: string) => void;
  onCopyToken: (token: string) => void;
  onExport: (orgId: string, slug: string, format: string) => void;
  onImpersonate: (userId: string) => void;
  onDeactivate: (orgId: string) => void;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OrgGrid({
  orgs, healthScores, impersonateUsers, flagsOrg, orgFlags, expandedOrg, copiedToken,
  onToggleExpand, onLoadFlags, onToggleFlag, onCopyToken, onExport, onImpersonate, onDeactivate,
}: Props) {
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState(false);

  const activeOrgs = orgs.filter(function (o) { return !o.name.startsWith('[INACTIEF]'); });
  const inactiveOrgs = orgs.filter(function (o) { return o.name.startsWith('[INACTIEF]'); });

  function requestDeactivate(orgId: string, displayName: string) {
    setConfirmTarget({ id: orgId, name: displayName });
  }

  function confirmDeactivate() {
    if (!confirmTarget) return;
    setPendingDeactivate(true);
    onDeactivate(confirmTarget.id);
    // Parent will refetch; close drawer immediately
    setTimeout(function () {
      setPendingDeactivate(false);
      setConfirmTarget(null);
    }, 500);
  }

  return (
    <>
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
              <button onClick={function () { onToggleExpand(org.id); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', opacity: isInactive ? 0.5 : 1 }}
                className="hover:bg-white/[0.02]">
                <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isInactive ? 'color-mix(in srgb, var(--zinc) 15%, transparent)' : 'color-mix(in srgb, var(--blue) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isInactive ? 'var(--zinc)' : 'var(--blue)', fontSize: 14, fontWeight: 700 }}>
                  {displayName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
                    {isInactive && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}>INACTIEF</span>}
                    {healthCfg && !isInactive && health && <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 4, background: healthCfg.bg, color: healthCfg.color }}>{health.overall}</span>}
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
                        {[
                          { icon: <Calendar size={13} />, l: 'Events', v: org.data.events || 0 },
                          { icon: <FileText size={13} />, l: 'Offertes', v: org.data.offertes || 0 },
                          { icon: <Receipt size={13} />, l: 'Facturen', v: org.data.facturen || 0 },
                          { icon: <ChefHat size={13} />, l: 'Recepten', v: org.data.recepten || 0 },
                        ].map(function (s) {
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
                    <button onClick={function () { onLoadFlags(org.id); }} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <ToggleLeft size={14} /> Feature Flags {flagsOrg === org.id ? '(verbergen)' : '(tonen)'}
                    </button>
                    {flagsOrg === org.id && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
                        {FLAG_DEFS.map(function (flag) {
                          const enabled = !!orgFlags[flag.key];
                          return (
                            <button key={flag.key} onClick={function () { onToggleFlag(org.id, flag.key); }}
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
                              <button onClick={function (e) { e.stopPropagation(); onCopyToken(inv.token); }}
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
                        if (orgUser) onImpersonate(orgUser.userId);
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--blue) 10%, transparent)', color: 'var(--blue)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <LogIn size={12} /> Inloggen als klant
                    </button>
                    <button onClick={function () { onExport(org.id, org.slug, 'json'); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--green) 8%, transparent)', color: 'var(--green)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Download size={12} /> Export JSON
                    </button>
                    <button onClick={function () { onExport(org.id, org.slug, 'csv'); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, background: 'color-mix(in srgb, var(--green) 8%, transparent)', color: 'var(--green)', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                      <Download size={12} /> Export CSV
                    </button>
                    {!isInactive && (
                      <button onClick={function () { requestDeactivate(org.id, displayName); }}
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

      <ConfirmDrawer
        open={confirmTarget !== null}
        onOpenChange={function (o) { if (!o) setConfirmTarget(null); }}
        title={'Deactiveer "' + (confirmTarget?.name || '') + '"?'}
        description="De organisatie wordt gemarkeerd als inactief en verdwijnt uit de actieve lijst. Data blijft bewaard."
        confirmLabel="Ja, deactiveer"
        confirmVariant="danger"
        pending={pendingDeactivate}
        onConfirm={confirmDeactivate}
      />
    </>
  );
}
