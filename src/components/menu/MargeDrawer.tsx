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

    const outliers = margins?.dishes.filter(d => d.costOutlier) ?? [];
    const menuBelow = !!margins && margins.hasMenuPrice && margins.menuMargePct != null && margins.menuMargePct < margins.target;
    /* Incomplete dekking = elk gerecht zonder kostprijs telt als €0 en vleit de
       marge. Dan NIET groen kleuren: het cijfer is nog niet te beoordelen. */
    const dekkingIncompleet = !!margins && margins.dishesTotaal > 0 && !margins.dekkingCompleet;
    const ontbrekend = margins ? margins.dishesTotaal - margins.dishesMetKostprijs : 0;
    const menuColor = !margins?.hasMenuPrice ? 'var(--muted)'
        : dekkingIncompleet ? 'var(--muted)'
            : menuBelow ? 'var(--red, #e5484d)' : 'var(--brand)';

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
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)' }}>Menu-marge</div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: menuColor }}>
                                        {!margins.hasMenuPrice || margins.menuMargePct == null ? '—' : `${margins.menuMargePct.toFixed(0)}%`}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                        {margins.hasMenuPrice
                                            ? `€${margins.foodcostPP.toFixed(2)} kostprijs op €${margins.menuPricePP.toFixed(2)} p.p.${margins.foodcostPct != null ? ` · food cost ${margins.foodcostPct.toFixed(0)}%` : ''}`
                                            : 'Stel een menu-prijs (basisprijs p.p.) in om de menu-marge te zien.'}
                                    </div>
                                    {margins.hasMenuPrice && (
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                            Gerekend over {margins.dishesMetKostprijs} van de {margins.dishesTotaal} gerechten
                                        </div>
                                    )}
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

                        {dekkingIncompleet && (
                            <div className="kf-banner kf-banner-warn" style={{ marginBottom: 10 }}>
                                <AlertTriangle size={14} />
                                {/* "hebben nog geen kostprijs" was te stellig geworden. Sinds
                                    dishesMetKostprijs alleen gerechten telt die VOLLEDIG
                                    doorgerekend zijn, zit hier ook het gerecht bij dat wél een
                                    kostprijs heeft maar waarvan één bouwsteen nog geen prijs
                                    kent. Dat gerecht "heeft" een kostprijs — alleen een te lage. */}
                                <span>
                                    <strong>{ontbrekend} van de {margins.dishesTotaal} gerechten</strong> zijn nog niet
                                    volledig doorgerekend: er ontbreekt een kostprijs, of er zit een bouwsteen in
                                    zonder prijs. Dat deel telt nu als €0 mee, dus deze marge is te rooskleurig —
                                    vul het aan voor een echt cijfer.
                                </span>
                            </div>
                        )}
                        {menuBelow && !dekkingIncompleet && (
                            <div className="kf-banner kf-banner-warn" style={{ marginBottom: 10 }}>
                                <AlertTriangle size={14} />
                                <span>Menu-marge <strong>{margins.menuMargePct?.toFixed(0)}%</strong> ligt onder je doel van {margins.target}%.</span>
                            </div>
                        )}
                        {!menuBelow && !dekkingIncompleet && outliers.length > 0 && (
                            <div className="kf-banner" style={{ marginBottom: 10, color: 'var(--muted)', fontSize: 12 }}>
                                <span><strong>{outliers.length}</strong> gerecht{outliers.length === 1 ? '' : 'en'} weegt zwaar op dit menu — maar het menu-totaal telt, niet het losse gerecht.</span>
                            </div>
                        )}

                        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--muted)', margin: '4px 2px 6px' }}>
                            Kostprijs per gerecht <span style={{ textTransform: 'none', letterSpacing: 0 }}>· signaal</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            {margins.dishes.map(d => (
                                <div
                                    key={d.gerecht_id}
                                    className="flex items-center justify-between"
                                    style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: !d.heeftKostprijs ? 'rgba(245,158,11,.06)' : d.costOutlier ? 'var(--amber-bg, rgba(245,158,11,.08))' : 'transparent' }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.naam}</div>
                                        <div style={{ fontSize: 11, color: d.heeftKostprijs ? 'var(--muted)' : 'var(--amber, #f59e0b)' }}>
                                            {d.heeftKostprijs
                                                ? `kost €${d.kostPP.toFixed(2)}${d.costSharePct != null ? ` · ${d.costSharePct.toFixed(0)}% van menu` : ''}`
                                                : 'nog geen kostprijs — koppel componenten aan dit gerecht'}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, color: !d.heeftKostprijs ? 'var(--amber, #f59e0b)' : d.costOutlier ? 'var(--amber, #f59e0b)' : 'var(--muted)' }}>
                                        {!d.heeftKostprijs ? '—' : d.costOutlier ? 'zwaar' : (d.costSharePct != null ? `${d.costSharePct.toFixed(0)}%` : `€${d.kostPP.toFixed(2)}`)}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {!margins.hasMenuPrice && margins.dishes.length > 0 && (
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                                Zonder menu-prijs kan de menu-marge niet berekend worden — zet de basisprijs p.p. op deze menukaart.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
