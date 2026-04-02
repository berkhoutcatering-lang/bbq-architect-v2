'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface WizardResult {
    menu_selectie: Record<string, string[]>;
    aantal_gasten: number;
    aantal_vega: number;
    basis_prijs_pp: number;
    korting: number;
    client_naam: string;
    client_adres: string;
    datum: string;
    items: Array<{ desc: string; qty: number; prijs: number; btw: number }>;
}

interface MenuWizardProps {
    onComplete: (result: WizardResult) => void;
    onClose: () => void;
    settings?: Partial<Settings> | null;
    existingOfferte?: Record<string, any> | null;
}

interface GangRow {
    slug: string;
    naam: string;
    minimum: number;
    extra_prijs_pp: number;
    volgorde: number;
    actief?: boolean;
}

interface DishRow {
    id: number;
    naam: string;
    gang_slug: string;
    beschrijving?: string;
}

export default function MenuWizard({ onComplete, onClose, settings, existingOfferte }: MenuWizardProps) {
    const ex = existingOfferte || {};
    const existingMenu: Record<string, string[]> = ex.menu_selectie ? (typeof ex.menu_selectie === 'string' ? JSON.parse(ex.menu_selectie) : ex.menu_selectie) : {};

    const [gangen, setGangen] = useState<GangRow[]>([]);
    const [gerechten, setGerechten] = useState<DishRow[]>([]);
    const [step, setStep] = useState(0);
    const [selected, setSelected] = useState<Record<string, string[]>>(existingMenu);
    const [aantalGasten, setAantalGasten] = useState(ex.aantal_gasten || 40);
    const [aantalVega, setAantalVega] = useState(ex.aantal_vega || 0);
    const [basisPrijs, setBasisPrijs] = useState(ex.basis_prijs_pp || 38.50);
    const [korting, setKorting] = useState(ex.korting || 0);
    const [clientNaam, setClientNaam] = useState(ex.client_naam || '');
    const [clientAdres, setClientAdres] = useState(ex.client_adres || '');
    const [datum, setDatum] = useState(ex.datum || new Date().toISOString().split('T')[0]);

    useEffect(function () {
        if (!supabase) return;
        supabase.from('gangen').select('*').eq('actief', true).order('volgorde').then(function (res) {
            if (res.data) setGangen(res.data as GangRow[]);
        });
        supabase.from('gerechten').select('*').eq('actief', true).order('volgorde').then(function (res) {
            if (res.data) setGerechten(res.data as DishRow[]);
        });
    }, []);

    const totalSteps = gangen.length + 1;
    const isOverview = step === gangen.length;
    const currentGang = gangen[step] || null;

    function toggleDish(gangSlug: string, dishName: string) {
        setSelected(function (prev) {
            const list = (prev[gangSlug] || []).slice();
            const idx = list.indexOf(dishName);
            if (idx >= 0) {
                list.splice(idx, 1);
            } else {
                list.push(dishName);
            }
            return Object.assign({}, prev, { [gangSlug]: list });
        });
    }

    function canGoNext(): boolean {
        if (isOverview) return clientNaam.trim() !== '' && aantalGasten > 0;
        if (!currentGang) return false;
        const count = (selected[currentGang.slug] || []).length;
        return count >= currentGang.minimum;
    }

    function goNext() {
        if (step < totalSteps - 1) setStep(step + 1);
    }
    function goBack() {
        if (step > 0) setStep(step - 1);
    }

    function calcTotal() {
        const base = basisPrijs * aantalGasten;
        let extras = 0;
        gangen.forEach(function (gang) {
            const sel = (selected[gang.slug] || []).length;
            const over = sel - gang.minimum;
            if (over > 0 && gang.extra_prijs_pp > 0) {
                extras += over * gang.extra_prijs_pp * aantalGasten;
            }
        });
        return { base, extras, korting, totaal: base + extras - korting };
    }

    function handleComplete() {
        const prices = calcTotal();
        const aantalNormaal = aantalGasten - aantalVega;
        const defaultBtw = (settings && settings.default_btw) || 9;

        const items: Array<{ desc: string; qty: number; prijs: number; btw: number }> = [];
        items.push({
            desc: 'Signature Menu ' + datum + ' - ' + aantalNormaal + ' personen',
            qty: aantalNormaal,
            prijs: basisPrijs,
            btw: defaultBtw
        });
        if (aantalVega > 0) {
            items.push({
                desc: 'Vegetarisch menu - ' + aantalVega + ' personen',
                qty: aantalVega,
                prijs: basisPrijs,
                btw: defaultBtw
            });
        }
        gangen.forEach(function (gang) {
            const sel = (selected[gang.slug] || []).length;
            const over = sel - gang.minimum;
            if (over > 0 && gang.extra_prijs_pp > 0) {
                items.push({
                    desc: 'Extra ' + gang.naam.toLowerCase() + ' (' + over + ' extra, ' + aantalGasten + ' pers.)',
                    qty: aantalGasten,
                    prijs: gang.extra_prijs_pp * over,
                    btw: defaultBtw
                });
            }
        });
        if (korting > 0) {
            items.push({ desc: 'Korting', qty: 1, prijs: -korting, btw: 0 });
        }

        onComplete({
            menu_selectie: selected,
            aantal_gasten: aantalGasten,
            aantal_vega: aantalVega,
            basis_prijs_pp: basisPrijs,
            korting,
            client_naam: clientNaam,
            client_adres: clientAdres,
            datum,
            items
        });
    }

    const gangDishes = currentGang ? gerechten.filter(function (g) { return g.gang_slug === currentGang.slug; }) : [];
    const selectedCount = currentGang ? (selected[currentGang.slug] || []).length : 0;

    return (
        <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-box" style={{ maxWidth: 700, width: '95%', maxHeight: '90vh', overflow: 'auto' }}>

                <div className="wizard-steps">
                    {gangen.map(function (g, i) {
                        let cls = 'wizard-step';
                        if (i < step) cls += ' done';
                        if (i === step) cls += ' active';
                        return (
                            <div key={g.slug} style={{ display: 'flex', alignItems: 'center' }}>
                                <div className={cls} onClick={function () { setStep(i); }}>{i + 1}</div>
                                {i < gangen.length - 1 && <div className={'wizard-line' + (i < step ? ' done' : '')} />}
                            </div>
                        );
                    })}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className={'wizard-line' + (step >= gangen.length ? ' done' : '')} />
                        <div className={'wizard-step' + (isOverview ? ' active' : (step > gangen.length ? ' done' : ''))} onClick={function () { setStep(gangen.length); }}>{'\u2713'}</div>
                    </div>
                </div>

                {!isOverview && currentGang ? (
                    <div>
                        <h3 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{currentGang.naam}</h3>
                        <div className="wizard-info-bar">
                            <div className="gang-title">Selecteer minimaal {currentGang.minimum} {currentGang.naam.toLowerCase()}</div>
                            {currentGang.extra_prijs_pp > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    Extra {currentGang.naam.toLowerCase().replace(/en$/, '')}: +{'\u20ac'}{Number(currentGang.extra_prijs_pp).toFixed(2)} p.p.
                                </div>
                            )}
                            <div className="gang-counter">{selectedCount} / {currentGang.minimum}</div>
                        </div>
                        <div className="dish-select-grid">
                            {gangDishes.map(function (dish) {
                                const isSelected = (selected[currentGang.slug] || []).indexOf(dish.naam) >= 0;
                                return (
                                    <button key={dish.id} className={'dish-select-btn' + (isSelected ? ' selected' : '')} onClick={function () { toggleDish(currentGang.slug, dish.naam); }}>
                                        <div className="dish-select-name">{dish.naam}</div>
                                        <div className="dish-select-desc">{dish.beschrijving || ''}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div>
                        <h3 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Overzicht & Definitief</h3>
                        <div style={{ marginBottom: 20 }}>
                            {gangen.map(function (g) {
                                const sel = selected[g.slug] || [];
                                return (
                                    <div key={g.slug} style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase' as const, letterSpacing: 1 }}>{g.naam}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
                                            {sel.length > 0 ? sel.join(', ') : <span style={{ color: 'var(--muted)' }}>Geen selectie</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="form-grid" style={{ marginBottom: 16 }}>
                            <div className="field"><label>Klantnaam</label><input value={clientNaam} onChange={function (e) { setClientNaam(e.target.value); }} placeholder="Naam klant" /></div>
                            <div className="field"><label>Klantadres</label><input value={clientAdres} onChange={function (e) { setClientAdres(e.target.value); }} placeholder="Adres" /></div>
                            <div className="field"><label>Datum Event</label><input type="date" value={datum} onChange={function (e) { setDatum(e.target.value); }} /></div>
                            <div className="field"><label>Basisprijs p.p. ({'\u20ac'})</label><input type="number" step="0.50" value={basisPrijs} onChange={function (e) { setBasisPrijs(parseFloat(e.target.value) || 0); }} /></div>
                            <div className="field"><label>Totaal Gasten</label><input type="number" value={aantalGasten} onChange={function (e) { setAantalGasten(parseInt(e.target.value) || 0); }} /></div>
                            <div className="field"><label>Waarvan Vega</label><input type="number" value={aantalVega} onChange={function (e) { setAantalVega(Math.min(parseInt(e.target.value) || 0, aantalGasten)); }} /></div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(180,140,20,.08)', border: '1px solid rgba(180,140,20,.15)', borderRadius: 10, textAlign: 'center' as const }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#B48C14' }}>{'\ud83c\udf56'} {aantalGasten - aantalVega}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Normaal</div>
                            </div>
                            <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(107,122,47,.08)', border: '1px solid rgba(107,122,47,.15)', borderRadius: 10, textAlign: 'center' as const }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#6B7A2F' }}>{'\ud83c\udf3f'} {aantalVega}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Vega</div>
                            </div>
                        </div>
                        <div className="field" style={{ marginBottom: 16 }}>
                            <label>Korting ({'\u20ac'})</label>
                            <input type="number" step="5" value={korting} onChange={function (e) { setKorting(parseFloat(e.target.value) || 0); }} placeholder="0" />
                        </div>
                        {(function () {
                            const p = calcTotal();
                            return (
                                <div style={{ padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                        <span style={{ color: 'var(--muted)' }}>Basis ({aantalGasten} {'\u00d7'} {'\u20ac'}{basisPrijs.toFixed(2)})</span>
                                        <span>{'\u20ac'}{p.base.toFixed(2)}</span>
                                    </div>
                                    {p.extras > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--muted)' }}>Extra gerechten</span>
                                            <span>+{'\u20ac'}{p.extras.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {p.korting > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--red)' }}>Korting</span>
                                            <span style={{ color: 'var(--red)' }}>-{'\u20ac'}{p.korting.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
                                        <span>Totaal</span>
                                        <span style={{ color: '#B48C14' }}>{'\u20ac'}{p.totaal.toFixed(2)}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                    <button className="btn btn-ghost" onClick={step === 0 ? onClose : goBack} style={{ flex: 1, marginRight: 8, justifyContent: 'center' }}>
                        {step === 0 ? 'Annuleren' : '\u2190 Terug'}
                    </button>
                    {isOverview ? (
                        <button className="btn btn-brand" onClick={handleComplete} disabled={!canGoNext()} style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}>
                            {'\ud83d\udd12'} Maak Definitief
                        </button>
                    ) : (
                        <button className="btn btn-brand" onClick={goNext} disabled={!canGoNext()} style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}>
                            Volgende {'\u2192'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
