import Link from 'next/link';
import {
    ClipboardCheck, Check, ChevronRight,
    Tag, Calculator, AlertTriangle, Link as LinkIcon, CircleDot, ShieldCheck,
    type LucideIcon,
} from 'lucide-react';
import type { LaunchChecklistItem } from '../_lib/types';

interface Props {
    items: LaunchChecklistItem[];
}

const ICONS: Record<string, LucideIcon> = {
    tag: Tag,
    calculator: Calculator,
    'alert-triangle': AlertTriangle,
    link: LinkIcon,
    'circle-dot': CircleDot,
    'shield-check': ShieldCheck,
};

function severityColor(s: LaunchChecklistItem['severity']): string {
    if (s === 'danger') return 'var(--red)';
    if (s === 'warn') return 'var(--amber)';
    if (s === 'ok') return 'var(--green)';
    return '#60a5fa'; // info
}

/* Pre-launch-readiness checklist. Items met count > 0 zijn open;
   resolved items komen onderaan met line-through + check-icon. */
export default function LaunchChecklist({ items }: Props) {
    const openIssues = items.filter(it => it.count > 0);

    return (
        <div className="metal">
            <div className="metal-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ClipboardCheck size={15} color="var(--brand-gold)" />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>Pre-launch checklist</span>
                    </div>
                    <span className={`pill pill-${openIssues.length === 0 ? 'ok' : 'danger'}`}>
                        {openIssues.length === 0 ? 'Alles gereed' : `${openIssues.length} openstaand`}
                    </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((it, i) => {
                        const done = it.count === 0;
                        const col = done ? 'var(--green)' : severityColor(it.severity);
                        const Icon = done ? Check : (ICONS[it.icon] ?? CircleDot);
                        return (
                            <Link key={i} href={it.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 8,
                                    background: done ? 'rgba(34,197,94,.04)' : 'rgba(130,130,130,.04)',
                                    border: `1px solid ${done ? 'rgba(34,197,94,.12)' : 'var(--border)'}`,
                                    transition: 'background .15s, transform .15s',
                                    cursor: 'pointer',
                                }}>
                                    <div style={{
                                        width: 22, height: 22, borderRadius: 6,
                                        background: done ? 'rgba(34,197,94,.15)' : `${col}11`,
                                        border: `1px solid ${done ? 'rgba(34,197,94,.35)' : `${col}33`}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}>
                                        <Icon size={12} color={col} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 500, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>
                                            {it.label}
                                        </div>
                                        {!done && it.items.length > 0 && (
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {it.items.slice(0, 3).join(', ')}{it.items.length > 3 ? ` +${it.items.length - 3}` : ''}
                                            </div>
                                        )}
                                    </div>
                                    {!done && (
                                        <span style={{
                                            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                                            padding: '2px 8px', borderRadius: 999,
                                            background: `${col}14`, color: col,
                                            border: `1px solid ${col}33`,
                                            flexShrink: 0,
                                        }}>{it.count}</span>
                                    )}
                                    <ChevronRight size={14} color="var(--muted-light)" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
