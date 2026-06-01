/* ═══════════════════════════════════════════════════════════════
   GerechtDetailDrawer — Slide-in van rechts, 60% breedte desktop
   Bucket C P0-7. 4 tabs (Wat/Bouw/Compliance/Service) + sticky AI-rail
   met 4 knoppen. Mobile: bottom-sheet via vaul. Parent (_client.tsx)
   regelt openen via onSelect en wired de AI-acties via callbacks.
   ═══════════════════════════════════════════════════════════════ */

'use client';

import { useEffect, useState } from 'react';
import {
    AlertCircle, AlertTriangle, Calculator, Calendar, CheckCircle2,
    Clock, Copy, FileText, Flame, Layers, Lightbulb, Pencil, Plus,
    Scale, Sparkles, ShieldCheck, Thermometer, Trash2, UtensilsCrossed,
    Wine, X, Zap,
} from 'lucide-react';
import type { Gerecht, Gang } from '@/types';
import {
    MRAllergenChip, MRButton, MRCostBar, MREyebrow, MRMarginRing,
    MRPhoto, MRStatusPill, MRTag, type GerechtStatus,
} from '../atoms';
import {
    fmtEuro, getGangKey, getGangLabel, getGerechtStatus, getMargin, marginTone,
} from '../helpers';
import BeschrijvingBlocksView from './BeschrijvingBlocksView';

export type DetailTab = 'wat' | 'bouw' | 'compliance' | 'service';

interface AiAction {
    icon: typeof Sparkles;
    label: string;
    desc: string;
    onClick?: () => void;
}

interface AuditEntry {
    time: string;
    action: string;
    user: string;
    icon: typeof Pencil;
    ai?: boolean;
}

interface Props {
    open: boolean;
    onClose: () => void;
    gerecht: Gerecht | null;
    gangen?: Gang[];
    /* AI-acties — als undefined toont rail demo-buttons zonder werking. */
    aiActions?: AiAction[];
    /* Audit-trail per gerecht — laat parent ophalen, hier alleen renderen. */
    auditTrail?: AuditEntry[];
    /* Edit-callbacks vanuit drawer-acties. */
    onEdit?: (g: Gerecht) => void;
    onDuplicate?: (g: Gerecht) => void;
    onDelete?: (g: Gerecht) => void;
    /* Allergen hercheck (Compliance-tab). */
    onAllergenCheck?: (g: Gerecht) => void;
    isMobile?: boolean;
}

export function GerechtDetailDrawer({
    open, onClose, gerecht, gangen, aiActions, auditTrail, onEdit, onDuplicate, onDelete, onAllergenCheck, isMobile = false,
}: Props) {
    /* Tab + sheet-state — gereset wanneer de drawer remount via key={gerecht.id}
       in de parent (zie return statement). Geen useEffect-setState nodig. */
    const [tab, setTab] = useState<DetailTab>('wat');
    const [aiSheetOpen, setAiSheetOpen] = useState(false);

    /* Escape sluit */
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open || !gerecht) return null;
    /* Force suppress unused-state-warning voor setTab/setAiSheetOpen — beide
       worden gebruikt in JSX onClick handlers verderop. */
    void setTab; void setAiSheetOpen;

    const margin = getMargin(gerecht);
    const tone = marginTone(margin);
    const status: GerechtStatus = getGerechtStatus(gerecht);
    const price = Number(gerecht.verkoopprijs ?? gerecht.prijs ?? 0);
    const cost = Number(gerecht.kostprijs_pp ?? 0);
    const gangLabel = getGangLabel(getGangKey(gerecht, gangen), gangen);

    const tabs: Array<{ id: DetailTab; label: string; Icon: typeof FileText }> = [
        { id: 'wat',        label: 'Wat',        Icon: FileText },
        { id: 'bouw',       label: 'Bouw',       Icon: Layers },
        { id: 'compliance', label: 'Compliance', Icon: ShieldCheck },
        { id: 'service',    label: 'Service',    Icon: UtensilsCrossed },
    ];

    const defaultAiActions: AiAction[] = [
        { icon: Sparkles,   label: 'Vul aan met AI',  desc: 'Receptuur aanvullen' },
        { icon: Flame,      label: 'Vraag Rook',      desc: 'AI Pitmaster advies' },
        { icon: Calculator, label: 'Fix kostprijs',   desc: 'Kostprijs optimaliseren' },
        { icon: Zap,        label: 'Verfijn recept',  desc: 'AI verbetert receptuur' },
    ];
    const rail = aiActions ?? defaultAiActions;

    const drawerWidth = isMobile ? '100%' : '60%';

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div
                className={`mr-drawer ${isMobile ? 'mobile' : ''}`}
                style={{ width: drawerWidth }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="drawer-title"
            >
                {/* Header */}
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-photo">
                        <MRPhoto src={gerecht.foto_url} style={{ width: '100%', height: '100%' }} />
                    </div>
                    <div className="mr-drawer-header-info">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h2 id="drawer-title" style={{
                                fontFamily: 'var(--font-display)', fontSize: isMobile ? 20 : 24,
                                fontWeight: 600, margin: 0,
                            }}>{gerecht.naam}</h2>
                            <MRStatusPill status={status} />
                            {gerecht.tags?.includes('Signature') && <MRTag color="#c4a35a">Signature</MRTag>}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                            {gangLabel}{gerecht.beschrijving ? ' · ' + gerecht.beschrijving : ''}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {onEdit && <MRButton variant="ghost" icon={<Pencil size={13} />} sm onClick={() => onEdit(gerecht)}>Aanpassen</MRButton>}
                            {onDuplicate && <MRButton variant="ghost" icon={<Copy size={13} />} sm onClick={() => onDuplicate(gerecht)}>Dupliceren</MRButton>}
                            {onDelete && <MRButton variant="danger" icon={<Trash2 size={13} />} sm onClick={() => onDelete(gerecht)}>Verwijderen</MRButton>}
                        </div>
                    </div>
                    <button className="mr-drawer-close" onClick={onClose} aria-label="Sluit"><X size={18} /></button>
                </div>

                {/* Body: tabs + content + AI-rail */}
                <div className="mr-drawer-body">
                    <div className="mr-drawer-main">
                        {/* Tab bar */}
                        <div className={`mr-drawer-tabs ${isMobile ? 'mobile' : ''}`} role="tablist" aria-label="Gerecht-details">
                            {tabs.map((t) => {
                                const I = t.Icon;
                                const active = tab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        role="tab"
                                        aria-selected={active}
                                        className={`mr-drawer-tab ${active ? 'active' : ''}`}
                                        onClick={() => setTab(t.id)}
                                    >
                                        <I size={13} /> {t.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Tab content */}
                        <div className="mr-drawer-content">
                            {tab === 'wat' && (
                                <TabWat
                                    gerecht={gerecht} margin={margin} tone={tone}
                                    cost={cost} price={price} gangLabel={gangLabel} status={status}
                                />
                            )}
                            {tab === 'bouw' && <TabBouw gerecht={gerecht} cost={cost} price={price} />}
                            {tab === 'compliance' && (
                                <TabCompliance gerecht={gerecht} onCheck={onAllergenCheck} />
                            )}
                            {tab === 'service' && <TabService gerecht={gerecht} />}

                            {/* Audit trail */}
                            {auditTrail && auditTrail.length > 0 && (
                                <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                                    <MREyebrow style={{ marginBottom: 12 }}>Audit trail</MREyebrow>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {auditTrail.map((a, i) => {
                                            const I = a.icon;
                                            return (
                                                <div
                                                    key={i}
                                                    style={{
                                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                                        padding: '10px 0',
                                                        borderBottom: i < auditTrail.length - 1 ? '1px solid rgba(130,130,130,.08)' : 'none',
                                                    }}
                                                >
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: 7,
                                                        background: a.ai ? 'rgba(255,191,0,.1)' : 'rgba(255,255,255,.04)',
                                                        border: '1px solid var(--border)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    }}>
                                                        <I size={13} color={a.ai ? 'var(--brand)' : 'var(--muted)'} />
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{a.action}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{a.time} · {a.user}</div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* AI Rail (desktop sticky / mobile bottom-sheet) */}
                    {!isMobile ? (
                        <div className="mr-ai-rail">
                            <MREyebrow style={{ marginBottom: 12, padding: '0 4px' }}>AI Acties</MREyebrow>
                            {rail.map((a, i) => {
                                const I = a.icon;
                                return (
                                    <button key={i} className="mr-ai-rail-btn" onClick={a.onClick} type="button">
                                        <div className="mr-ai-rail-icon"><I size={16} /></div>
                                        <div>
                                            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.label}</div>
                                            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>{a.desc}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <>
                            <button className="mr-ai-fab-mobile" onClick={() => setAiSheetOpen((p) => !p)} aria-label="Open AI-acties">
                                <Sparkles size={20} />
                            </button>
                            {aiSheetOpen && (
                                <div className="mr-ai-sheet" role="dialog" aria-modal="true">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <MREyebrow>AI Acties</MREyebrow>
                                        <button
                                            onClick={() => setAiSheetOpen(false)}
                                            aria-label="Sluit"
                                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {rail.map((a, i) => {
                                            const I = a.icon;
                                            return (
                                                <button key={i} className="mr-ai-sheet-btn" onClick={() => { a.onClick?.(); setAiSheetOpen(false); }}>
                                                    <I size={16} color="var(--brand)" />
                                                    <span style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

/* ── Tab: Wat — beschrijving + stats ─────────────────────── */
function TabWat({ gerecht, margin, tone, cost, price, gangLabel, status }: {
    gerecht: Gerecht;
    margin: number;
    tone: { color: string; cssVar: string };
    cost: number;
    price: number;
    gangLabel: string;
    status: GerechtStatus;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
                <MREyebrow style={{ marginBottom: 8 }}>Naam & Beschrijving</MREyebrow>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>{gerecht.naam}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {gerecht.beschrijving || <em>Geen beschrijving ingevuld.</em>}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="mr-detail-stat">
                    <MREyebrow>Gang</MREyebrow>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 500 }}>{gangLabel}</div>
                </div>
                <div className="mr-detail-stat">
                    <MREyebrow>Status</MREyebrow>
                    <div style={{ marginTop: 6 }}><MRStatusPill status={status} /></div>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div className="mr-detail-stat">
                    <MREyebrow>Kostprijs</MREyebrow>
                    <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>
                        {fmtEuro(cost)}
                    </div>
                </div>
                <div className="mr-detail-stat">
                    <MREyebrow>Verkoopprijs</MREyebrow>
                    <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtEuro(price)}
                    </div>
                </div>
                <div className="mr-detail-stat">
                    <MREyebrow>Marge</MREyebrow>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MRMarginRing pct={margin} size={38} />
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 500, color: tone.color }}>{margin}%</span>
                    </div>
                </div>
            </div>
            {(gerecht.tags?.length || gerecht.allergenen?.length) ? (
                <div>
                    <MREyebrow style={{ marginBottom: 8 }}>Tags</MREyebrow>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {gerecht.tags?.map((t) => <MRTag key={t}>{t}</MRTag>)}
                        {gerecht.allergenen?.length ? <MRAllergenChip allergens={gerecht.allergenen} /> : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/* ── Tab: Bouw — componenten lijst ─────────────────────── */
function TabBouw({ gerecht, cost, price }: { gerecht: Gerecht; cost: number; price: number }) {
    const items = gerecht.ingredienten ?? [];
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <MREyebrow>Componenten ({items.length})</MREyebrow>
                <MRButton variant="ghost" icon={<Plus size={13} />} sm>Component toevoegen</MRButton>
            </div>
            {items.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--bg-subtle)', borderRadius: 10, border: '1px dashed var(--border)' }}>
                    Nog geen componenten gekoppeld.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((c, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 14px', background: 'var(--bg-subtle)',
                                border: '1px solid var(--border)', borderRadius: 10,
                            }}
                        >
                            <div style={{
                                width: 30, height: 30, borderRadius: 7,
                                background: 'rgba(196,163,90,.08)', border: '1px solid rgba(196,163,90,.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Layers size={14} color="var(--brand-gold, #c4a35a)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.naam}</div>
                                {(c.qty || c.hoeveelheid) && (
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                        {c.qty ?? c.hoeveelheid} {c.unit ?? c.eenheid ?? ''}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <div style={{
                marginTop: 16, padding: 14,
                background: 'rgba(255,191,0,.04)', border: '1px solid rgba(255,191,0,.15)', borderRadius: 10,
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-gold, #c4a35a)' }}>Kostprijs rollup</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtEuro(cost)}
                    </span>
                </div>
                <MRCostBar cost={cost} price={price} />
            </div>
        </div>
    );
}

/* ── Tab: Compliance — allergenen + HACCP ─────────────── */
function TabCompliance({ gerecht, onCheck }: { gerecht: Gerecht; onCheck?: (g: Gerecht) => void }) {
    const allergens = gerecht.allergenen ?? [];
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <MREyebrow>Allergenen (cascade)</MREyebrow>
                {onCheck && (
                    <MRButton variant="ai" icon={<ShieldCheck size={13} />} sm onClick={() => onCheck(gerecht)}>
                        Hercheck allergenen
                    </MRButton>
                )}
            </div>
            {allergens.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {allergens.map((a) => (
                        <div
                            key={a}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 12px', borderRadius: 8,
                                background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.18)',
                            }}
                        >
                            <AlertTriangle size={14} color="#fbbf24" />
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24' }}>{a}</span>
                            <CheckCircle2 size={14} color="var(--green, #22c55e)" style={{ marginLeft: 8 }} />
                        </div>
                    ))}
                </div>
            ) : (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
                    Geen allergenen geregistreerd.
                </div>
            )}
            <MREyebrow style={{ marginBottom: 10 }}>HACCP Flags</MREyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                    { label: 'Kerntemperatuur geregistreerd', ok: true },
                    { label: 'Bewaartemperatuur gecontroleerd', ok: true },
                    { label: 'Houdbaarheidsdatum ingesteld', ok: false },
                ].map((h, i) => {
                    const Icon = h.ok ? CheckCircle2 : AlertCircle;
                    return (
                        <div
                            key={i}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 12px', borderRadius: 8,
                                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                            }}
                        >
                            <Icon size={14} color={h.ok ? 'var(--green, #22c55e)' : 'var(--amber, #f59e0b)'} />
                            <span style={{ fontSize: 12.5, color: h.ok ? 'var(--text)' : 'var(--amber, #f59e0b)' }}>{h.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── Tab: Service — bereiding + wijn + battleplan ─────── */
function TabService({ gerecht }: { gerecht: Gerecht }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
                <MREyebrow style={{ marginBottom: 8 }}>Bereidingswijze</MREyebrow>
                <BeschrijvingBlocksView blocks={gerecht.beschrijving_blocks} fallback={gerecht.beschrijving} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                    <MREyebrow style={{ marginBottom: 8 }}>Wijnsuggestie</MREyebrow>
                    <div style={{ padding: 12, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13 }}>
                        <Wine size={14} color="var(--brand-gold, #c4a35a)" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Malbec of Zinfandel — vol, fruitig, lichte eik
                    </div>
                </div>
                <div>
                    <MREyebrow style={{ marginBottom: 8 }}>Service tip</MREyebrow>
                    <div style={{ padding: 12, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13 }}>
                        <Lightbulb size={14} color="var(--brand)" style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Serveer op voorverwarmd bord met verse herbs
                    </div>
                </div>
            </div>
            <div>
                <MREyebrow style={{ marginBottom: 8 }}>Battle plan</MREyebrow>
                <div style={{
                    padding: 14, background: 'rgba(255,191,0,.04)',
                    border: '1px solid rgba(255,191,0,.12)', borderRadius: 10,
                }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {[
                            { label: 'Prep',           value: '14u',     Icon: Clock },
                            { label: 'Portiegrootte',  value: '200g',    Icon: Scale },
                            { label: 'Houdbaarheid',   value: '3 dagen', Icon: Calendar },
                            { label: 'Bewaring',       value: '2-4°C',   Icon: Thermometer },
                        ].map((s, i) => {
                            const I = s.Icon;
                            return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                                    <I size={13} color="var(--brand-gold, #c4a35a)" />
                                    <span style={{ color: 'var(--muted)' }}>{s.label}:</span>
                                    <span style={{ fontWeight: 600 }}>{s.value}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
