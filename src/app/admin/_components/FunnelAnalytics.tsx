'use client';

import dynamic from 'next/dynamic';
import MetallicCard from '@/components/MetallicCard';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { AnalyticsData } from './types';

const AreaChart = dynamic(function () { return import('recharts').then(function (m) { return m.AreaChart; }); }, { ssr: false });
const Area = dynamic(function () { return import('recharts').then(function (m) { return m.Area; }); }, { ssr: false });
const XAxis = dynamic(function () { return import('recharts').then(function (m) { return m.XAxis; }); }, { ssr: false });
const YAxis = dynamic(function () { return import('recharts').then(function (m) { return m.YAxis; }); }, { ssr: false });
const Tooltip = dynamic(function () { return import('recharts').then(function (m) { return m.Tooltip; }); }, { ssr: false });
const ResponsiveContainer = dynamic(function () { return import('recharts').then(function (m) { return m.ResponsiveContainer; }); }, { ssr: false });

interface Props {
  analytics: AnalyticsData;
}

export default function FunnelAnalytics({ analytics }: Props) {
  return (
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
  );
}
