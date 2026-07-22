'use client';
/**
 * MargeDrawer — "kloppen de maatjes?" per menukaart.
 *
 * Rechter-drawer op de menukaart: toont marge per gerecht én voor het hele menu
 * (tegen elk gerecht z'n eigen verkoopprijs), tegen een instelbare doel-marge,
 * en markeert wat eronder zakt. Met een "Ververs prijzen"-knop die de recepten
 * met de nieuwste leverancier-prijzen bijwerkt (batch, code-rekenwerk).
 */

import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Loader2, TrendingUp, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import type { MenuMargins } from '@/lib/dal/menuTemplates';
import { getMenuMarginsAction, refreshRecipePricesAction, setDoelMargeAction } from '@/app/menu-templates/actions';
import '@/components/redesign/redesign.css';

export default function MargeDrawer({ templateId, onClose }: { templateId: number; onClose: () => void }) {
    const toast = useToast();
    const [margins, setMargins] = useState<MenuMargins | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [targetInput, setTargetInput] = useState('');
    const [savingTarget, setSavingTarget] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getMenuMarginsAction(templateId);
        if ('error' in res) { toast(res.error, 'error'); setLoading(false); return; }
        setMargins(res.data);
        setTargetInput(String(res.data.target));
        setLoading(false);
    }, [templateId, toast]);

    useEffect(() => { load(); }, [load]);

    async function handleRefresh() {
        setRefreshing(true);
        const res = await refreshRecipePricesAction(templateId);
        setRefreshing(false);
        if ('error' in res) { toast(res.error, 'error'); return; }
        const r = res.data;
        const delta = r.pctDelta == null ? '' : ` · ${r.pctDelta >= 0 ? '+' : ''}${r.pctDelta.toFixed(1)}%`;
        const extra = (r.overgeslagenHandmatig ? ` · ${r.overgeslagenHandmatig} handmatig overgeslagen` : '')
            + (r.ongekoppeld.length ? ` · ${r.ongekoppeld.length} zonder actuele prijs` : '');
        toast(`${r.receptenBijgewerkt} recept(en) bijgewerkt${delta}${extra}`, 'success');
        await load();
    }

    async function saveTarget() {
        const raw = targetInput.trim();
        if (raw === '') { toast('Vul een doel-marge in', 'error'); return; }
        const pct = Number(raw.replace(',', '.'));
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast('Doel-marge moet 0–100% zijn', 'error'); return; }
        if (margins && pct === margins.target) return;
        setSavingTarget(true);
        const res = await setDoelMargeAction(pct);
        setSavingTarget(false);
        if ('error' in res) { toast(res.error, 'error'); return; }
        toast('Doel-marge opgeslagen', 'success');
        await load();
    }

    const belowCount = margins?.dishes.filter(d => d.belowTarget).length ?? 0;
    const margeColor = (pct: number | null, below: boolean) =>
        pct == null ? 'var(--muted)' : below ? 'var(--red, #e5484d)' : 'var(--brand)';

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer kdrawer" role="dialog" aria-modal="true" aria-labelledby="marge-drawer-title">
                <div className="kdrawer-head">
                    <div className="flex-1 min-w-0">
                        <span className="kf-eyebrow"><TrendingUp size={12} /> Marge-check</span>
                        <h2 id="marge-drawer-title" className="kdrawer-title">Kloppen de maatjes?</h2>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Sluit" className="kf-icon-x"><X size={17} /></button>
                </div>

                {loading ? (
                    <div className="flex flex-1 items-center justify-center gap-2" style={{ color: 'var(--muted)', padding: 24 }}>
                        <Loader2 size={18} className="animate-spin" /> Laden…
                    </div>
                ) : !margins ? (
                    <div className="kf-body"><p style={{ color: 'var(--muted)' }}>Geen gegevens.</p></div>
                ) : (
                    <div className="kf-body">
                        <div className="kf-card" style={{ padding: 14, marginBottom: 12 }}>
                            <div className="flex items-center justify-between" style={{ gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>Menu-marge</div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: margeColor(margins.blendedPct, margins.blendedPct != null && margins.blendedPct < margins.target) }}>
                                        {margins.blendedPct == null ? '—' : `${margins.blendedPct.toFixed(0)}%`}
                                    </div>
                                </div>
                                <label style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'right' }}>
                                    Doel-marge
                                    <span className="flex items-center gap-1" style={{ marginTop: 4, justifyContent: 'flex-end' }}>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={targetInput}
                                            onChange={e => setTargetInput(e.target.value)}
                                            onBlur={saveTarget}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                            className="kf-input"
                                            style={{ width: 64, textAlign: 'right' }}
                                            aria-label="Doel-marge percentage"
                                        />
                                        <span>%</span>
                                        {savingTarget && <Loader2 size={12} className="animate-spin" />}
                                    </span>
                                </label>
                            </div>
                            <button type="button" onClick={handleRefresh} disabled={refreshing} className="kf-add" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}>
                                {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {refreshing ? 'Verversen…' : 'Ververs prijzen'}
                            </button>
                        </div>

                        {belowCount > 0 && (
                            <div className="kf-banner kf-banner-warn" style={{ marginBottom: 10 }}>
                                <AlertTriangle size={14} />
                                <span><strong>{belowCount}</strong> gerecht{belowCount === 1 ? '' : 'en'} onder je doel-marge van {margins.target}%.</span>
                            </div>
                        )}

                        <div className="flex flex-col gap-1">
                            {margins.dishes.map(d => (
                                <div
                                    key={d.gerecht_id}
                                    className="flex items-center justify-between"
                                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: d.belowTarget ? 'var(--red-bg, rgba(229,72,77,.08))' : 'transparent' }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.naam}</div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                            kost €{d.kostPP.toFixed(2)} · prijs {d.verkoop > 0 ? `€${d.verkoop.toFixed(2)}` : '— n.t.b.'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 15, fontWeight: 700, flexShrink: 0, color: margeColor(d.margePct, d.belowTarget) }}>
                                        {d.margePct == null ? '—' : `${d.margePct.toFixed(0)}%`}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {margins.missingPrice.length > 0 && (
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                                {margins.missingPrice.length} gerecht(en) zonder verkoopprijs tellen niet mee in de menu-marge — vul een verkoopprijs in op het gerecht.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
