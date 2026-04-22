'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Users, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

/**
 * Activation-funnel admin dashboard (SF-6).
 *
 * Toont:
 *  - Sign-ups per week (afgelopen 12 weken)
 *  - Conversie per milestone
 *  - Activation-rate <60min (target ≥50%)
 *  - Median time-to-first-quote
 *
 * Beperkt tot platform-admins (NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS).
 */

type WeekRow = {
  week: string;
  signups: number;
  finished_bedrijf: number;
  sent_quote: number;
  activated_60min: number;
  activation_rate_pct: number;
};

type FunnelRow = {
  organization_id: string;
  signup_at: string;
  min_to_bedrijf: number | null;
  min_to_data: number | null;
  min_to_draft: number | null;
  min_to_sent: number | null;
  min_to_done: number | null;
  activated_60min: boolean;
};

export default function FunnelDashboardPage() {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<WeekRow[]>([]);
  const [recent, setRecent] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const adminEmails = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  useEffect(function () {
    if (!user || !supabase) return;
    if (adminEmails.length > 0 && !adminEmails.includes((user.email || '').toLowerCase())) {
      setDenied(true);
      setLoading(false);
      return;
    }

    (async function () {
      const { data: funnel, error } = await supabase
        .from('activation_funnel')
        .select('*')
        .order('signup_at', { ascending: false })
        .limit(200);

      if (error) {
        console.error('[funnel] query failed:', error);
        setLoading(false);
        return;
      }

      const rows = (funnel || []) as FunnelRow[];
      setRecent(rows.slice(0, 20));

      // Aggregate per ISO-week
      const byWeek = new Map<string, WeekRow>();
      for (const r of rows) {
        const date = new Date(r.signup_at);
        const yr = date.getUTCFullYear();
        const tmp = new Date(Date.UTC(yr, 0, 1));
        const dayOfYear = Math.floor((date.getTime() - tmp.getTime()) / 86400000) + 1;
        const week = Math.ceil(dayOfYear / 7);
        const key = `${yr}-W${String(week).padStart(2, '0')}`;
        const existing = byWeek.get(key) || {
          week: key, signups: 0, finished_bedrijf: 0, sent_quote: 0, activated_60min: 0, activation_rate_pct: 0,
        };
        existing.signups += 1;
        if (r.min_to_bedrijf !== null) existing.finished_bedrijf += 1;
        if (r.min_to_sent !== null) existing.sent_quote += 1;
        if (r.activated_60min) existing.activated_60min += 1;
        byWeek.set(key, existing);
      }
      const weekArr = Array.from(byWeek.values())
        .sort((a, b) => b.week.localeCompare(a.week))
        .slice(0, 12)
        .map(w => ({ ...w, activation_rate_pct: w.signups > 0 ? Math.round(100 * w.activated_60min / w.signups) : 0 }));
      setWeeks(weekArr);
      setLoading(false);
    })();
  }, [user, adminEmails]);

  if (denied) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
        <h1 className="text-xl font-bold text-[var(--text)] mb-2">Geen toegang</h1>
        <p className="text-[var(--muted)]">Deze pagina is alleen voor platform-admins.</p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-8 text-[var(--muted)]">Funnel-data laden...</div>;
  }

  const totalSignups = recent.length;
  const totalActivated = recent.filter(r => r.activated_60min).length;
  const overallRate = totalSignups > 0 ? Math.round(100 * totalActivated / totalSignups) : 0;
  const sentTimes = recent.map(r => r.min_to_sent).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
  const medianMinToSent = sentTimes.length > 0 ? sentTimes[Math.floor(sentTimes.length / 2)] : null;

  return (
    <div className="max-w-[1100px] mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-extralight text-[var(--text)]">Activation-funnel</h1>
        <p className="text-[13px] text-[var(--muted)] mt-1">SF-6 — sign-up tot eerste verstuurde offerte. Doel: ≥50% binnen 60 min.</p>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Kpi
          icon={<Users className="w-4 h-4" />}
          label="Totaal sign-ups (laatste 200)"
          value={totalSignups.toString()}
        />
        <Kpi
          icon={<TrendingUp className="w-4 h-4" />}
          label="Activation-rate (<60 min)"
          value={`${overallRate}%`}
          highlight={overallRate >= 50 ? 'good' : 'bad'}
          target="Doel ≥50%"
        />
        <Kpi
          icon={<Clock className="w-4 h-4" />}
          label="Mediaan tijd → 1e offerte"
          value={medianMinToSent !== null ? `${Math.round(medianMinToSent)} min` : '—'}
          target="Doel <30 min"
        />
      </section>

      {/* Per-week tabel */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] overflow-hidden mb-8">
        <div className="px-5 py-3 border-b border-[var(--card-solid)] text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
          Per week (laatste 12)
        </div>
        {weeks.length === 0 ? (
          <div className="p-6 text-[13px] text-[var(--muted)]">Nog geen activation-events. Eerste sign-up via /signup vult de funnel.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] bg-[var(--color-bg-deep)]/40">
              <tr>
                <th className="text-left px-5 py-2.5">Week</th>
                <th className="text-right px-5 py-2.5">Sign-ups</th>
                <th className="text-right px-5 py-2.5">Bedrijf-stap</th>
                <th className="text-right px-5 py-2.5">1e offerte</th>
                <th className="text-right px-5 py-2.5">Activatie {'<'}60min</th>
                <th className="text-right px-5 py-2.5">%</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map(w => (
                <tr key={w.week} className="border-t border-[var(--card-solid)]/40">
                  <td className="px-5 py-2.5 font-mono text-[12px]">{w.week}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{w.signups}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-white/70">{w.finished_bedrijf}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-white/70">{w.sent_quote}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{w.activated_60min}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums font-bold ${w.activation_rate_pct >= 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {w.activation_rate_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent rijen */}
      <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--card-solid)] text-[12px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
          Laatste 20 sign-ups
        </div>
        {recent.length === 0 ? (
          <div className="p-6 text-[13px] text-[var(--muted)]">Geen sign-ups.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="text-[10px] uppercase tracking-[0.1em] text-[var(--muted)] bg-[var(--color-bg-deep)]/40">
                <tr>
                  <th className="text-left px-5 py-2.5">Org</th>
                  <th className="text-left px-5 py-2.5">Signup</th>
                  <th className="text-right px-5 py-2.5">→ Bedrijf</th>
                  <th className="text-right px-5 py-2.5">→ Data</th>
                  <th className="text-right px-5 py-2.5">→ Draft</th>
                  <th className="text-right px-5 py-2.5">→ Verzonden</th>
                  <th className="text-center px-5 py-2.5">{'<'}60min</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.organization_id} className="border-t border-[var(--card-solid)]/40">
                    <td className="px-5 py-2 font-mono text-[10px] text-white/60">{r.organization_id.slice(0, 8)}</td>
                    <td className="px-5 py-2 text-white/85">{new Date(r.signup_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-white/70">{r.min_to_bedrijf !== null ? `${Math.round(r.min_to_bedrijf)}m` : '—'}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-white/70">{r.min_to_data !== null ? `${Math.round(r.min_to_data)}m` : '—'}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-white/70">{r.min_to_draft !== null ? `${Math.round(r.min_to_draft)}m` : '—'}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-white/70">{r.min_to_sent !== null ? `${Math.round(r.min_to_sent)}m` : '—'}</td>
                    <td className="px-5 py-2 text-center">
                      {r.activated_60min ? <span className="text-emerald-400">✓</span> : <span className="text-[var(--muted)]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, highlight, target }: { icon: React.ReactNode; label: string; value: string; highlight?: 'good' | 'bad'; target?: string }) {
  const color = highlight === 'good' ? 'text-emerald-400' : highlight === 'bad' ? 'text-amber-400' : 'text-[var(--text)]';
  return (
    <div className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] mb-2">
        {icon}
        {label}
      </div>
      <div className={`text-[32px] font-extralight tabular-nums ${color}`}>{value}</div>
      {target && <div className="text-[11px] text-[var(--muted)] mt-1">{target}</div>}
    </div>
  );
}
