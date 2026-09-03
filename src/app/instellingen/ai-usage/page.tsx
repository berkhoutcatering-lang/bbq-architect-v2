'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, ShieldCheck, Activity, Cpu, Database } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { TIER_LIMITS, type Tier } from '@/lib/featureFlags';

import { formatEur, formatPercent } from '@/lib/format';

/**
 * /instellingen/ai-usage
 *
 * Pillar #5 (Systeem) — transparante AI-cost-meter per tenant.
 * Toont kosten per maand × action_type, cache-hit-ratio, tier-cap-progress,
 * en de laatste 50 calls met metadata-preview.
 */

interface UsageRow {
    id: number;
    action_type: string;
    model: string | null;
    tokens_input: number;
    tokens_output: number;
    tokens_cache_read: number;
    tokens_cache_creation: number;
    cost_eur_cents: number;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

interface MonthlyBucket {
    month: string;
    [actionType: string]: number | string;
}

const GOLD = '#c4a35a';
const ACTION_COLORS: Record<string, string> = {
    offerte_wizard: GOLD,
    chat: '#3b82f6',
    prep_suggestion: '#22c55e',
    menu_suggestion: '#a855f7',
    other: '#6b7280',
};

function monthKey(iso: string): string {
    return iso.slice(0, 7); // YYYY-MM
}

function formatEurCents(cents: number): string {
    return '€ ' + (cents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function actionLabel(action: string): string {
    switch (action) {
        case 'offerte_wizard': return 'Offerte-wizard';
        case 'chat': return 'Chat';
        case 'prep_suggestion': return 'Prep-suggestie';
        case 'menu_suggestion': return 'Menu-suggestie';
        case 'other': return 'Overig';
        default: return action;
    }
}

export default function AiUsagePage() {
    const { orgId, organization } = useOrg();
    const [rows, setRows] = useState<UsageRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [tier, setTier] = useState<Tier>('starter');

    useEffect(function () {
        if (!orgId || !supabase) return;
        Promise.all([
            supabase
                .from('ai_usage')
                // Expliciete kolommen = matcht UsageRow exact, scheelt payload (org_id e.d. niet nodig client-side)
                .select('id, action_type, model, tokens_input, tokens_output, tokens_cache_read, tokens_cache_creation, cost_eur_cents, metadata, created_at')
                .eq('organization_id', orgId)
                .order('created_at', { ascending: false })
                .limit(500),
            supabase
                .from('organizations')
                .select('plan')
                .eq('id', orgId)
                .maybeSingle(),
        ]).then(function ([usageRes, orgRes]) {
            setRows((usageRes.data as UsageRow[]) || []);
            if (orgRes.data?.plan) setTier(orgRes.data.plan as Tier);
            setLoading(false);
        });
    }, [orgId]);

    const stats = useMemo(function () {
        const monthlyMap = new Map<string, MonthlyBucket>();
        let totalCostCents = 0;
        let totalCacheRead = 0;
        let totalCacheCreation = 0;
        let totalCalls = 0;
        const actionTypes = new Set<string>();

        for (const r of rows) {
            const mk = monthKey(r.created_at);
            const bucket = monthlyMap.get(mk) || { month: mk };
            const at = r.action_type || 'other';
            actionTypes.add(at);
            const cur = typeof bucket[at] === 'number' ? (bucket[at] as number) : 0;
            bucket[at] = cur + r.cost_eur_cents;
            monthlyMap.set(mk, bucket);
            totalCostCents += r.cost_eur_cents;
            totalCacheRead += r.tokens_cache_read;
            totalCacheCreation += r.tokens_cache_creation;
            totalCalls += 1;
        }

        const monthly = Array.from(monthlyMap.values()).sort(function (a, b) {
            return (a.month as string).localeCompare(b.month as string);
        });

        const cacheTotal = totalCacheRead + totalCacheCreation;
        const cacheHitRatio = cacheTotal > 0 ? totalCacheRead / cacheTotal : 0;

        // Tier-cap progress
        const cap = TIER_LIMITS[tier].aiActionsPerMonth;
        const startOfMonthIso = (function () {
            const d = new Date();
            d.setDate(1); d.setHours(0, 0, 0, 0);
            return d.toISOString();
        })();
        const callsThisMonth = rows.filter(function (r) { return r.created_at >= startOfMonthIso; }).length;
        const capProgress = cap > 0 ? callsThisMonth / cap : 0;

        return {
            monthly,
            actionTypes: Array.from(actionTypes),
            totalCostCents,
            totalCalls,
            cacheHitRatio,
            cap,
            callsThisMonth,
            capProgress,
        };
    }, [rows, tier]);

    return (
        <div className="max-w-[1100px] mx-auto px-6 py-10">
            <Link
                href="/instellingen"
                className="inline-flex items-center gap-2 text-[12px] text-[var(--muted)] hover:text-[var(--text)] no-underline mb-6"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                Terug naar Instellingen
            </Link>

            <div className="flex items-start gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent-gold)]/10 border border-[var(--color-accent-gold)]/20 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-[var(--color-accent-gold)]" />
                </div>
                <div>
                    <h1 className="text-2xl font-extralight text-[var(--text)]">AI-gebruik en kosten</h1>
                    <p className="text-[13px] text-[var(--muted)] mt-1">
                        Transparant: zie precies wat AI je deze maand kost en welke calls cache-hit hadden.
                        Voor <strong className="text-[var(--text)]">{organization?.name || '...'}</strong>.
                    </p>
                </div>
            </div>

            <div className="mb-6 p-3 rounded-lg border border-[var(--card-solid)] bg-[var(--card)]/40 flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    Pillar 5 — geen concurrent toont cache-hit-ratio per tenant. Cache-reads zijn 10x goedkoper dan
                    fresh tokens; hoe hoger de hit-ratio, hoe efficiënter onze prompts.
                </p>
            </div>

            {loading ? (
                <p className="text-[13px] text-[var(--muted)]">Laden…</p>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* KPI cards */}
                    <div className="grid sm:grid-cols-4 gap-3">
                        <KpiCard icon={<Activity className="w-4 h-4" />} label="Calls deze maand" value={String(stats.callsThisMonth)} accent={GOLD} />
                        <KpiCard icon={<Database className="w-4 h-4" />} label="Totale spend" value={formatEurCents(stats.totalCostCents)} accent="#22c55e" />
                        <KpiCard
                            icon={<Cpu className="w-4 h-4" />}
                            label="Cache-hit ratio"
                            value={(stats.cacheHitRatio * 100).toFixed(0) + '%'}
                            accent={stats.cacheHitRatio >= 0.7 ? '#22c55e' : stats.cacheHitRatio >= 0.4 ? '#f59e0b' : 'var(--red)'}
                            hint="Doel >70%"
                        />
                        <KpiCard
                            icon={<Sparkles className="w-4 h-4" />}
                            label={'Tier-cap (' + tier + ')'}
                            value={stats.cap > 0 ? `${stats.callsThisMonth} / ${stats.cap}` : 'Unlimited'}
                            accent={stats.capProgress >= 1 ? 'var(--red)' : stats.capProgress >= 0.8 ? '#f59e0b' : '#22c55e'}
                            hint={stats.cap > 0 ? `${Math.round(stats.capProgress * 100)}% gebruikt` : undefined}
                        />
                    </div>

                    {/* Kosten per maand × action_type */}
                    <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Kosten per maand</h2>
                        <p className="text-[12px] text-[var(--muted)] mb-4">
                            Gestapelde balk per actie-type. Hover voor de exacte bedragen.
                        </p>
                        {stats.monthly.length === 0 ? (
                            <p className="text-[13px] text-[var(--muted)]">Nog geen AI-data — gebruik de offerte-wizard of chat om de eerste call te loggen.</p>
                        ) : (
                            <div style={{ width: '100%', height: 280 }}>
                                <ResponsiveContainer>
                                    <BarChart data={stats.monthly.map(function (m) {
                                        const o: Record<string, any> = { month: m.month };
                                        for (const at of stats.actionTypes) {
                                            const v = m[at];
                                            o[at] = typeof v === 'number' ? v / 100 : 0;
                                        }
                                        return o;
                                    })}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                        <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} />
                                        <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={function (v: number) { return formatEur(v); }} />
                                        <Tooltip
                                            contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-solid)', borderRadius: 8, fontSize: 12 }}
                                            formatter={function (v: number) { return formatEur(Number(v)); }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 11 }} formatter={function (v: string) { return actionLabel(v); }} />
                                        {stats.actionTypes.map(function (at) {
                                            return (
                                                <Bar key={at} dataKey={at} stackId="cost" fill={ACTION_COLORS[at] || '#6b7280'} />
                                            );
                                        })}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </section>

                    {/* Cache-hit gauge */}
                    {stats.totalCalls > 0 && (
                        <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                            <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Cache-efficiëntie</h2>
                            <p className="text-[12px] text-[var(--muted)] mb-4">
                                Cache-reads kosten 10× minder dan fresh tokens. Onze prompts cachen system-prompts ephemerally; herhaalde calls zijn dus goedkoper.
                            </p>
                            <div style={{ width: '100%', height: 200 }}>
                                <ResponsiveContainer>
                                    <RadialBarChart
                                        cx="50%"
                                        cy="50%"
                                        innerRadius="65%"
                                        outerRadius="100%"
                                        data={[{ name: 'cache', value: stats.cacheHitRatio * 100, fill: stats.cacheHitRatio >= 0.7 ? '#22c55e' : '#f59e0b' }]}
                                        startAngle={180}
                                        endAngle={0}
                                    >
                                        <RadialBar background dataKey="value" cornerRadius={10} />
                                    </RadialBarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="text-center -mt-12 mb-4 text-[28px] font-extralight text-[var(--text)] font-mono">
                                {formatPercent((stats.cacheHitRatio * 100), 0)}
                            </div>
                        </section>
                    )}

                    {/* Laatste 50 calls */}
                    <section className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6">
                        <h2 className="text-[15px] font-bold text-[var(--text)] mb-1">Recente AI-calls</h2>
                        <p className="text-[12px] text-[var(--muted)] mb-4">Laatste 50 acties met token-breakdown en kost.</p>
                        {rows.length === 0 ? (
                            <p className="text-[13px] text-[var(--muted)]">Nog geen calls geregistreerd.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="text-left text-[var(--muted)] border-b border-[var(--card-solid)]">
                                            <th className="py-2 pr-3 font-bold">Tijd</th>
                                            <th className="py-2 pr-3 font-bold">Actie</th>
                                            <th className="py-2 pr-3 font-bold">Model</th>
                                            <th className="py-2 pr-3 font-bold text-right">In</th>
                                            <th className="py-2 pr-3 font-bold text-right">Out</th>
                                            <th className="py-2 pr-3 font-bold text-right">Cache</th>
                                            <th className="py-2 pr-3 font-bold text-right">Kost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.slice(0, 50).map(function (r) {
                                            const cacheTotal = r.tokens_cache_read + r.tokens_cache_creation;
                                            const cacheRatio = cacheTotal > 0 ? r.tokens_cache_read / cacheTotal : 0;
                                            return (
                                                <tr key={r.id} className="border-b border-[var(--card-solid)]/40 hover:bg-[var(--card-solid)]/20">
                                                    <td className="py-2 pr-3 text-[var(--muted)] whitespace-nowrap">
                                                        {new Date(r.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="py-2 pr-3 text-[var(--text)]">{actionLabel(r.action_type)}</td>
                                                    <td className="py-2 pr-3 text-[var(--muted)] font-mono text-[10px]">{r.model?.replace('claude-', '').replace('-20251001', '') || '—'}</td>
                                                    <td className="py-2 pr-3 text-right text-[var(--text)] tabular-nums">{r.tokens_input.toLocaleString('nl-NL')}</td>
                                                    <td className="py-2 pr-3 text-right text-[var(--text)] tabular-nums">{r.tokens_output.toLocaleString('nl-NL')}</td>
                                                    <td className="py-2 pr-3 text-right text-[var(--muted)] tabular-nums">
                                                        {cacheTotal > 0 ? (cacheRatio * 100).toFixed(0) + '%' : '—'}
                                                    </td>
                                                    <td className="py-2 pr-3 text-right text-[var(--text)] tabular-nums font-bold">{formatEurCents(r.cost_eur_cents)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

function KpiCard({
    icon, label, value, accent, hint,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    accent: string;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border border-[var(--card-solid)] bg-[var(--card)] p-4">
            <div className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold">
                <span style={{ color: accent }}>{icon}</span>
                {label}
            </div>
            <div className="text-[20px] font-mono font-extralight" style={{ color: accent }}>{value}</div>
            {hint && <div className="text-[10px] text-[var(--muted)] mt-1">{hint}</div>}
        </div>
    );
}
