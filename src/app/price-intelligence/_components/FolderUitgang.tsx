'use client';

/**
 * FolderUitgang — Impact-view voor de price-intelligence pipeline.
 *
 * Toont wat er gebeurt NA approve: welke mutations zijn doorgekomen,
 * welke gerechten zijn beïnvloed (cost-cascade), welke offertes hebben
 * een margin-alert getriggerd, en de queue-status van de recompute-cron.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Activity,
    AlertTriangle,
    Check,
    Clock,
    Cpu,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface MutationRow {
    id: string;
    parsed_naam: string;
    parsed_prijs: number;
    delta_pct: number | null;
    leverancier: string | null;
    reviewed_at: string;
    master_product_id: number | null;
}
interface SnapshotRow {
    id: number;
    gerecht_id: string;
    kostprijs_cents: number;
    computed_at: string;
    gerechten?: { naam?: string | null } | null;
}
interface AlertRow {
    id: number;
    offerte_id: number;
    delta_cents: number;
    delta_pct: number;
    status: string;
    created_at: string;
    offertes?: { nummer?: string | null; client_naam?: string | null } | null;
}
interface QueueStatus {
    pending: number;
    errors: number;
    processed_today: number;
}

export default function FolderUitgang() {
    const [mutations, setMutations] = useState<MutationRow[]>([]);
    const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
    const [alerts, setAlerts] = useState<AlertRow[]>([]);
    const [queue, setQueue] = useState<QueueStatus>({ pending: 0, errors: 0, processed_today: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [mRes, sRes, aRes, qPendingRes, qErrRes, qDoneRes] = await Promise.all([
                supabase
                    .from('org_price_mutations')
                    .select('id, parsed_naam, parsed_prijs, delta_pct, leverancier, reviewed_at, master_product_id')
                    .eq('status', 'approved')
                    .gte('reviewed_at', since)
                    .order('reviewed_at', { ascending: false })
                    .limit(15),
                supabase
                    .from('recipe_cost_snapshots')
                    .select('id, gerecht_id, kostprijs_cents, computed_at, gerechten(naam)')
                    .gte('computed_at', since)
                    .order('computed_at', { ascending: false })
                    .limit(15),
                supabase
                    .from('offerte_margin_alerts')
                    .select('id, offerte_id, delta_cents, delta_pct, status, created_at, offertes(nummer, client_naam)')
                    .gte('created_at', since)
                    .order('created_at', { ascending: false })
                    .limit(15),
                supabase
                    .from('recipe_recompute_queue')
                    .select('id', { count: 'exact', head: true })
                    .is('processed_at', null),
                supabase
                    .from('recipe_recompute_queue')
                    .select('id', { count: 'exact', head: true })
                    .is('processed_at', null)
                    .gte('attempts', 3),
                supabase
                    .from('recipe_recompute_queue')
                    .select('id', { count: 'exact', head: true })
                    .gte('processed_at', todayStart.toISOString()),
            ]);

            if (cancelled) return;
            setMutations((mRes.data ?? []) as MutationRow[]);
            setSnapshots((sRes.data ?? []) as SnapshotRow[]);
            setAlerts((aRes.data ?? []) as AlertRow[]);
            setQueue({
                pending: qPendingRes.count ?? 0,
                errors: qErrRes.count ?? 0,
                processed_today: qDoneRes.count ?? 0,
            });
            setLoading(false);
        }
        load();
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <QueueStatusBar status={queue} loading={loading} />

            <ImpactSection
                title="Doorgekomen mutations"
                icon={<Check size={14} />}
                count={mutations.length}
                emptyHint="Nog geen approved mutations in de afgelopen 14 dagen."
            >
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {mutations.map((m) => (
                        <RowCard key={m.id}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.parsed_naam}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {m.leverancier ?? '—'} · {formatRelativeDate(m.reviewed_at)}
                                </div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>€ {Number(m.parsed_prijs).toFixed(2)}</div>
                            <DeltaBadge pct={m.delta_pct} />
                        </RowCard>
                    ))}
                </ul>
            </ImpactSection>

            <ImpactSection
                title="Gerechten met nieuwe kostprijs"
                icon={<Activity size={14} />}
                count={snapshots.length}
                emptyHint="Nog geen cost-cascades getriggerd. Approve een mutation om de cascade te zien werken."
            >
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {snapshots.map((s) => (
                        <RowCard key={s.id}>
                            <Link
                                href={`/gerechten/${s.gerecht_id}`}
                                style={{ flex: 1, minWidth: 0, color: 'var(--text)', textDecoration: 'none' }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.gerechten?.naam ?? `Gerecht ${s.gerecht_id.slice(0, 8)}`}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {formatRelativeDate(s.computed_at)}
                                </div>
                            </Link>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>€ {(s.kostprijs_cents / 100).toFixed(2)}</div>
                            <ArrowRight size={12} style={{ color: 'var(--muted)' }} />
                        </RowCard>
                    ))}
                </ul>
            </ImpactSection>

            <ImpactSection
                title="Offertes met margin-drift alert"
                icon={<AlertTriangle size={14} />}
                count={alerts.length}
                emptyHint="Geen open offertes geraakt — nog niemand verstuurd vóór de prijswijziging."
            >
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {alerts.map((a) => (
                        <RowCard key={a.id}>
                            <Link
                                href={`/offertes?open=${a.offerte_id}`}
                                style={{ flex: 1, minWidth: 0, color: 'var(--text)', textDecoration: 'none' }}
                            >
                                <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.offertes?.nummer ?? `Offerte ${a.offerte_id}`}
                                    {a.offertes?.client_naam && (
                                        <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {a.offertes.client_naam}</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    {a.status} · {formatRelativeDate(a.created_at)}
                                </div>
                            </Link>
                            <div style={{ fontSize: 13, fontWeight: 700, color: a.delta_cents > 0 ? '#dc2626' : '#16a34a' }}>
                                € {(a.delta_cents / 100).toFixed(2)}
                            </div>
                            <DeltaBadge pct={a.delta_pct} />
                        </RowCard>
                    ))}
                </ul>
            </ImpactSection>
        </div>
    );
}

function QueueStatusBar({ status, loading }: { status: QueueStatus; loading: boolean }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                padding: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border)',
                borderRadius: 10,
            }}
        >
            <StatTile
                icon={<Clock size={14} />}
                label="In queue"
                value={loading ? '…' : String(status.pending)}
                color="var(--muted)"
            />
            <StatTile
                icon={<Cpu size={14} />}
                label="Verwerkt vandaag"
                value={loading ? '…' : String(status.processed_today)}
                color="#16a34a"
            />
            <StatTile
                icon={<AlertTriangle size={14} />}
                label="Fouten (3× failed)"
                value={loading ? '…' : String(status.errors)}
                color={status.errors > 0 ? '#dc2626' : 'var(--muted)'}
            />
        </div>
    );
}

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {icon}
                {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color }}>{value}</div>
        </div>
    );
}

function ImpactSection({
    title,
    icon,
    count,
    emptyHint,
    children,
}: {
    title: string;
    icon: React.ReactNode;
    count: number;
    emptyHint: string;
    children: React.ReactNode;
}) {
    return (
        <section>
            <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {icon}
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{title}</h3>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>({count})</span>
            </header>
            {count === 0 ? (
                <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12, fontStyle: 'italic' }}>
                    {emptyHint}
                </div>
            ) : (
                children
            )}
        </section>
    );
}

function RowCard({ children }: { children: React.ReactNode }) {
    return (
        <li
            style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 70px',
                gap: 10,
                alignItems: 'center',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.10)',
                borderRadius: 6,
            }}
        >
            {children}
        </li>
    );
}

function DeltaBadge({ pct }: { pct: number | null }) {
    if (pct === null || isNaN(Number(pct))) return <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>;
    const v = Number(pct);
    const isPositive = v > 0;
    return (
        <span
            style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 4,
                background: isPositive ? '#dc262614' : '#16a34a14',
                color: isPositive ? '#dc2626' : '#16a34a',
                textAlign: 'center',
            }}
        >
            {isPositive ? '+' : ''}
            {v.toFixed(1)}%
        </span>
    );
}

function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 60) return `${mins}m geleden`;
    if (mins < 1440) return `${Math.floor(mins / 60)}u geleden`;
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' });
}
