'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * MenuWizard — Step-by-step dish selection wizard
 * Props:
 *   onComplete(result) — called with { menu_selectie, aantal_gasten, aantal_vega, basis_prijs_pp, korting, client_naam, client_adres, datum, items }
 *   onClose() — close wizard
 *   settings — company settings
 *   existingOfferte — optional, pre-fill from existing offerte
 */
export default function MenuWizard({ onComplete, onClose, settings, existingOfferte }) {
    var ex = existingOfferte || {};
    var existingMenu = ex.menu_selectie ? (typeof ex.menu_selectie === 'string' ? JSON.parse(ex.menu_selectie) : ex.menu_selectie) : {};

    var [gangen, setGangen] = useState([]);
    var [gerechten, setGerechten] = useState([]);
    var [step, setStep] = useState(0);
    var [selected, setSelected] = useState(existingMenu);
    var [aantalGasten, setAantalGasten] = useState(ex.aantal_gasten || 40);
    var [aantalVega, setAantalVega] = useState(ex.aantal_vega || 0);
    var [basisPrijs, setBasisPrijs] = useState(ex.basis_prijs_pp || 38.50);
    var [korting, setKorting] = useState(ex.korting || 0);
    var [clientNaam, setClientNaam] = useState(ex.client_naam || '');
    var [clientAdres, setClientAdres] = useState(ex.client_adres || '');
    var [datum, setDatum] = useState(ex.datum || new Date().toISOString().split('T')[0]);

    useEffect(function () {
        supabase.from('gangen').select('*').eq('actief', true).order('volgorde').then(function (res) {
            if (res.data) setGangen(res.data);
        });
        supabase.from('gerechten').select('*').eq('actief', true).order('volgorde').then(function (res) {
            if (res.data) setGerechten(res.data);
        });
    }, []);


    var totalSteps = gangen.length + 1; // gang steps + overview step
    var isOverview = step === gangen.length;
    var currentGang = gangen[step] || null;

    function toggleDish(gangSlug, dishName) {
        setSelected(function (prev) {
            var list = (prev[gangSlug] || []).slice();
            var idx = list.indexOf(dishName);
            if (idx >= 0) {
                list.splice(idx, 1);
            } else {
                list.push(dishName);
            }
            return Object.assign({}, prev, { [gangSlug]: list });
        });
    }

    function canGoNext() {
        if (isOverview) return clientNaam.trim() !== '' && aantalGasten > 0;
        if (!currentGang) return false;
        var count = (selected[currentGang.slug] || []).length;
        return count >= currentGang.minimum;
    }

    function goNext() {
        if (step < totalSteps - 1) setStep(step + 1);
    }
    function goBack() {
        if (step > 0) setStep(step - 1);
    }

    // Calculate price
    function calcTotal() {
        var base = basisPrijs * aantalGasten;
        var extras = 0;
        gangen.forEach(function (gang) {
            var sel = (selected[gang.slug] || []).length;
            var over = sel - gang.minimum;
            if (over > 0 && gang.extra_prijs_pp > 0) {
                extras += over * gang.extra_prijs_pp * aantalGasten;
            }
        });
        return { base: base, extras: extras, korting: korting, totaal: base + extras - korting };
    }

    function handleComplete() {
        var prices = calcTotal();
        var aantalNormaal = aantalGasten - aantalVega;
        var defaultBtw = (settings && settings.default_btw) || 9;

        // Build items array for the offerte
        var items = [];
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
        // Extra dishes beyond minimum
        gangen.forEach(function (gang) {
            var sel = (selected[gang.slug] || []).length;
            var over = sel - gang.minimum;
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
            items.push({
                desc: 'Korting',
                qty: 1,
                prijs: -korting,
                btw: 0
            });
        }

        onComplete({
            menu_selectie: selected,
            aantal_gasten: aantalGasten,
            aantal_vega: aantalVega,
            basis_prijs_pp: basisPrijs,
            korting: korting,
            client_naam: clientNaam,
            client_adres: clientAdres,
            datum: datum,
            items: items
        });
    }

    var gangDishes = currentGang ? gerechten.filter(function (g) { return g.gang_slug === currentGang.slug; }) : [];
    var selectedCount = currentGang ? (selected[currentGang.slug] || []).length : 0;

    return (
        <div className="modal-bg" onClick={function (e) { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-box" style={{ maxWidth: 700, width: '95%', maxHeight: '90vh', overflow: 'auto' }}>

                {/* Step indicator */}
                <div className="wizard-steps">
                    {gangen.map(function (g, i) {
                        var cls = 'wizard-step';
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
                        <div className={'wizard-step' + (isOverview ? ' active' : (step > gangen.length ? ' done' : ''))} onClick={function () { setStep(gangen.length); }}>✓</div>
                    </div>
                </div>

                {!isOverview && currentGang ? (
                    <div>
                        {/* Gang title */}
                        <h3 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 16 }}>{currentGang.naam}</h3>

                        {/* Info bar */}
                        <div className="wizard-info-bar">
                            <div className="gang-title">
                                Selecteer minimaal {currentGang.minimum} {currentGang.naam.toLowerCase()}
                            </div>
                            {currentGang.extra_prijs_pp > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                    Extra {currentGang.naam.toLowerCase().replace(/en$/, '')}: +€{Number(currentGang.extra_prijs_pp).toFixed(2)} p.p.
                                </div>
                            )}
                            <div className="gang-counter">{selectedCount} / {currentGang.minimum}</div>
                        </div>

                        {/* Dish selection grid */}
                        <div className="dish-select-grid">
                            {gangDishes.map(function (dish) {
                                var isSelected = (selected[currentGang.slug] || []).indexOf(dish.naam) >= 0;
                                return (
                                    <button
                                        key={dish.id}
                                        className={'dish-select-btn' + (isSelected ? ' selected' : '')}
                                        onClick={function () { toggleDish(currentGang.slug, dish.naam); }}
                                    >
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

                        {/* Menu summary */}
                        <div style={{ marginBottom: 20 }}>
                            {gangen.map(function (g) {
                                var sel = selected[g.slug] || [];
                                return (
                                    <div key={g.slug} style={{ marginBottom: 10/*, padding: '8px 12px', background: 'rgba(255,255,255,.02)', borderRadius: 8*/ }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1 }}>{g.naam}</div>
                                        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
                                            {sel.length > 0 ? sel.join(', ') : <span style={{ color: 'var(--muted)' }}>Geen selectie</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="form-grid" style={{ marginBottom: 16 }}>
                            <div className="field">
                                <label>Klantnaam</label>
                                <input value={clientNaam} onChange={function (e) { setClientNaam(e.target.value); }} placeholder="Naam klant" />
                            </div>
                            <div className="field">
                                <label>Klantadres</label>
                                <input value={clientAdres} onChange={function (e) { setClientAdres(e.target.value); }} placeholder="Adres" />
                            </div>
                            <div className="field">
                                <label>Datum Event</label>
                                <input type="date" value={datum} onChange={function (e) { setDatum(e.target.value); }} />
                            </div>
                            <div className="field">
                                <label>Basisprijs p.p. (€)</label>
                                <input type="number" step="0.50" value={basisPrijs} onChange={function (e) { setBasisPrijs(parseFloat(e.target.value) || 0); }} />
                            </div>
                            <div className="field">
                                <label>Totaal Gasten</label>
                                <input type="number" value={aantalGasten} onChange={function (e) { setAantalGasten(parseInt(e.target.value) || 0); }} />
                            </div>
                            <div className="field">
                                <label>Waarvan Vega</label>
                                <input type="number" value={aantalVega} onChange={function (e) { setAantalVega(Math.min(parseInt(e.target.value) || 0, aantalGasten)); }} />
                            </div>
                        </div>

                        {/* Auto-calculated split */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                            <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(180,140,20,.08)', border: '1px solid rgba(180,140,20,.15)', borderRadius: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#B48C14' }}>🍖 {aantalGasten - aantalVega}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Normaal</div>
                            </div>
                            <div style={{ flex: 1, padding: '10px 14px', background: 'rgba(107,122,47,.08)', border: '1px solid rgba(107,122,47,.15)', borderRadius: 10, textAlign: 'center' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: '#6B7A2F' }}>🌿 {aantalVega}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Vega</div>
                            </div>
                        </div>

                        {/* Korting */}
                        <div className="field" style={{ marginBottom: 16 }}>
                            <label>Korting (€)</label>
                            <input type="number" step="5" value={korting} onChange={function (e) { setKorting(parseFloat(e.target.value) || 0); }} placeholder="0" />
                        </div>

                        {/* Price calculation */}
                        {(function () {
                            var p = calcTotal();
                            return (
                                <div style={{ padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                        <span style={{ color: 'var(--muted)' }}>Basis ({aantalGasten} × €{basisPrijs.toFixed(2)})</span>
                                        <span>€{p.base.toFixed(2)}</span>
                                    </div>
                                    {p.extras > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--muted)' }}>Extra gerechten</span>
                                            <span>+€{p.extras.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {p.korting > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                                            <span style={{ color: 'var(--red)' }}>Korting</span>
                                            <span style={{ color: 'var(--red)' }}>-€{p.korting.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700 }}>
                                        <span>Totaal</span>
                                        <span style={{ color: '#B48C14' }}>€{p.totaal.toFixed(2)}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Navigation buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                    <button className="btn btn-ghost" onClick={step === 0 ? onClose : goBack} style={{ flex: 1, marginRight: 8, justifyContent: 'center' }}>
                        {step === 0 ? 'Annuleren' : '← Terug'}
                    </button>
                    {isOverview ? (
                        <button
                            className="btn btn-brand"
                            onClick={handleComplete}
                            disabled={!canGoNext()}
                            style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}
                        >
                            🔒 Maak Definitief
                        </button>
                    ) : (
                        <button
                            className="btn btn-brand"
                            onClick={goNext}
                            disabled={!canGoNext()}
                            style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}
                        >
                            Volgende →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
