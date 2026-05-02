'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getAuditLogFor, formatChange, actieLabel, type AuditEntry } from '@/lib/auditLog';
import { Clock, User, Plus, Pencil, Trash2 } from 'lucide-react';

/* AuditTrailTimeline — generieke "Geschiedenis"-sectie voor dish/offerte/
   factuur modals. Vraagt om recordTable + recordId, rendert een tijdlijn
   van wijzigingen met diff per veld in mensentaal.

   Pillar #5 uit de Phase 2 audit: dit is wat een Pro-tier-cateraar overtuigt
   dat de app compliance-waardig is. Append-only RLS op audit_log dwingt af
   dat de log niet aangepast kan worden. */

interface Props {
    recordTable: 'gerechten' | 'offertes' | 'facturen' | 'menu_templates';
    recordId: number | string;
    /* limit-default 20: bij dispuut kan user "Toon alles" klikken voor meer. */
    limit?: number;
}

interface UserInfo {
    naam?: string;
    email?: string;
}

export default function AuditTrailTimeline({ recordTable, recordId, limit = 20 }: Props) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [users, setUsers] = useState<Record<string, UserInfo>>({});
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const list = await getAuditLogFor(recordTable, recordId, showAll ? 200 : limit);
            if (cancelled) return;

            /* Resolve user-namen via profiles (één query, niet N+1). RLS op
               profiles laat alleen leden van dezelfde org zien — andere users
               vallen terug op email of "Onbekend". */
            const userIds = Array.from(new Set(list.map(e => e.user_id).filter(Boolean) as string[]));
            const userMap: Record<string, UserInfo> = {};
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('user_id, naam, email')
                    .in('user_id', userIds);
                (profiles || []).forEach((p: { user_id: string; naam?: string; email?: string }) => {
                    if (p.user_id) userMap[p.user_id] = { naam: p.naam, email: p.email };
                });
            }
            setUsers(userMap);
            setEntries(list);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [recordTable, recordId, showAll, limit]);

    if (loading) {
        return (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)' }}>
                Geschiedenis laden...
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div style={{ padding: 14, fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                Nog geen wijzigingen geregistreerd. Vanaf nu wordt elke aanpassing automatisch bijgehouden.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map(entry => {
                const u = entry.user_id ? users[entry.user_id] : null;
                const userLabel = u?.naam || u?.email || (entry.user_id ? 'Onbekende gebruiker' : 'Systeem (AI of automatisch)');
                const dt = new Date(entry.changed_at);
                const datum = dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
                const tijd = dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

                /* Toon max 4 changes inline; rest klikbaar uit-te-klappen via "+N meer". */
                const changes = Object.entries(entry.changes || {});
                const visible = changes.slice(0, 4);
                const overflow = changes.length - visible.length;

                const ActionIcon = entry.action === 'insert' ? Plus : entry.action === 'delete' ? Trash2 : Pencil;
                const actionColor = entry.action === 'insert' ? '#22c55e' : entry.action === 'delete' ? 'var(--red)' : '#FFBF00';

                return (
                    <div key={entry.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--border)' }}>
                        <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: actionColor + '1f', color: actionColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ActionIcon size={14} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{actieLabel(entry.action)}</strong>
                                <span style={{ color: 'var(--muted)' }}>door</span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text)' }}>
                                    <User size={11} /> {userLabel}
                                </span>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--muted)', marginLeft: 'auto' }}>
                                    <Clock size={11} /> {datum} · {tijd}
                                </span>
                            </div>
                            {entry.action !== 'delete' && visible.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--muted)' }}>
                                    {visible.map(([veld, change]) => (
                                        <div key={veld} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            • {formatChange(veld, change)}
                                        </div>
                                    ))}
                                    {overflow > 0 && (
                                        <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.7 }}>
                                            +{overflow} {overflow === 1 ? 'andere wijziging' : 'andere wijzigingen'}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
            {!showAll && entries.length >= limit && (
                <button
                    onClick={() => setShowAll(true)}
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: 'flex-start', fontSize: 11 }}
                >
                    Toon volledige geschiedenis
                </button>
            )}
        </div>
    );
}
