'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';
import DishQuickEditor, { type DishDraft } from '@/components/DishQuickEditor';
import { Plus, Pencil, BookOpen } from 'lucide-react';
import LoadMenuTemplateSheet, { type LoadedMenuTemplate } from '@/components/menu/LoadMenuTemplateSheet';

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
    /* Alleen aanwezig in mode === 'template' — caller persisteert ze in menu_templates. */
    template_naam?: string;
    template_beschrijving?: string;
    template_id?: number;
}

export interface MenuTemplateInput {
    id?: number;
    naam: string;
    beschrijving?: string;
    menu_selectie: Record<string, string[]>;
    basis_prijs_pp?: number;
    aantal_gasten?: number;
}

interface MenuWizardProps {
    onComplete: (result: WizardResult) => void;
    onClose: () => void;
    settings?: Partial<Settings> | null;
    existingOfferte?: Record<string, any> | null;
    /* 'offerte' = klantgegevens + prijs (default, bestaande gedrag).
       'template' = naam + beschrijving voor herbruikbaar menu, geen klant. */
    mode?: 'template' | 'offerte';
    existingTemplate?: MenuTemplateInput | null;
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
    kostprijs_pp?: number;
    verkoopprijs?: number;
    marge_pct?: number;
    ingredienten?: string[];
    allergenen?: string[];
    foto_url?: string;
}

export default function MenuWizard({ onComplete, onClose, settings, existingOfferte, mode = 'offerte', existingTemplate }: MenuWizardProps) {
    const isTemplateMode = mode === 'template';
    const ex = existingOfferte || {};
    /* Prefill: in template-mode komt menu_selectie + prijs uit existingTemplate;
       in offerte-mode (default) komt 't uit existingOfferte zoals voorheen. */
    const seed = isTemplateMode && existingTemplate ? existingTemplate : ex;
    const seedMenu: unknown = (seed as Record<string, unknown>).menu_selectie;
    const existingMenu: Record<string, string[]> = seedMenu
        ? (typeof seedMenu === 'string' ? JSON.parse(seedMenu) : (seedMenu as Record<string, string[]>))
        : {};

    const [gangen, setGangen] = useState<GangRow[]>([]);
    const [gerechten, setGerechten] = useState<DishRow[]>([]);
    const [step, setStep] = useState(0);
    const [selected, setSelected] = useState<Record<string, string[]>>(existingMenu);
    const [aantalGasten, setAantalGasten] = useState(ex.aantal_gasten || existingTemplate?.aantal_gasten || 40);
    const [aantalVega, setAantalVega] = useState(ex.aantal_vega || 0);
    const [basisPrijs, setBasisPrijs] = useState(ex.basis_prijs_pp || existingTemplate?.basis_prijs_pp || 38.50);
    const [korting, setKorting] = useState(ex.korting || 0);
    const [clientNaam, setClientNaam] = useState(ex.client_naam || '');
    const [clientAdres, setClientAdres] = useState(ex.client_adres || '');
    const [datum, setDatum] = useState(ex.datum || new Date().toISOString().split('T')[0]);
    const [templateNaam, setTemplateNaam] = useState(existingTemplate?.naam || '');
    const [templateBeschrijving, setTemplateBeschrijving] = useState(existingTemplate?.beschrijving || '');
    const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
    const [editingDish, setEditingDish] = useState<DishRow | null>(null);
    /* Stel-menu-samen v2 (2026-06): Sheet om een bestaande menukaart te laden
       als startpunt voor deze wizard. Alleen actief in 'offerte'-mode. */
    const [showLoadSheet, setShowLoadSheet] = useState(false);

    function applyLoadedTemplate(t: LoadedMenuTemplate) {
        setSelected(t.menu_selectie);
        if (t.basis_prijs_pp > 0) setBasisPrijs(t.basis_prijs_pp);
        if (t.aantal_gasten > 0) setAantalGasten(t.aantal_gasten);
        setShowLoadSheet(false);
        setStep(0);
    }

    function refreshGerechten() {
        if (!supabase) return;
        /* Wizard toont alleen klant-klare gerechten — concepten en
           review_nodig blijven verstopt tot ze geactiveerd zijn. Status is de
           single source of truth (migratie 016); we filteren hier in JS zodat
           pre-migratie omgevingen ook werken (status undefined → val terug op
           legacy `actief`-vlag). */
        supabase.from('gerechten').select('*').order('volgorde').then(function (res) {
            const rows = ((res.data as DishRow[]) || []).filter(g => {
                const r = g as unknown as Record<string, unknown>;
                /* Inspiratie Bibliotheek v5: respect is_in_wizard. Defensive `!== false`
                   zodat oude omgevingen (zonder de kolom) niet plots leeg lopen. */
                if (r.is_in_wizard === false) return false;
                const status = r.status;
                if (typeof status === 'string') return status === 'actief';
                return r.actief !== false;
            });
            setGerechten(rows);
        });
    }

    function handleDishSaved(saved: DishDraft) {
        // Vernieuw de catalog uit DB (creates + edits met sync zijn al opgeslagen).
        refreshGerechten();
        // Bij create: meteen toevoegen aan huidige gang-selectie.
        if (editorMode === 'create' && currentGang && saved.gang_slug === currentGang.slug) {
            setSelected(prev => {
                const list = (prev[currentGang.slug] || []).slice();
                if (list.indexOf(saved.naam) < 0) list.push(saved.naam);
                return Object.assign({}, prev, { [currentGang.slug]: list });
            });
        }
        setEditorMode(null);
        setEditingDish(null);
    }

    useEffect(function () {
        if (!supabase) return;
        supabase.from('gangen').select('*').eq('actief', true).order('volgorde').then(function (res) {
            if (res.data) setGangen(res.data as GangRow[]);
        });
        /* Initial load gebruikt dezelfde status-filter als refreshGerechten. */
        supabase.from('gerechten').select('*').order('volgorde').then(function (res) {
            const rows = ((res.data as DishRow[]) || []).filter(g => {
                const r = g as unknown as Record<string, unknown>;
                /* Inspiratie Bibliotheek v5: respect is_in_wizard. Defensive `!== false`
                   zodat oude omgevingen (zonder de kolom) niet plots leeg lopen. */
                if (r.is_in_wizard === false) return false;
                const status = r.status;
                if (typeof status === 'string') return status === 'actief';
                return r.actief !== false;
            });
            setGerechten(rows);
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
        if (isOverview) {
            if (isTemplateMode) return templateNaam.trim() !== '';
            return clientNaam.trim() !== '' && aantalGasten > 0;
        }
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
        /* Template-mode: geen offerte-items, alleen menu + naam + beschrijving.
           Caller (op /gerechten) persisteert 't naar menu_templates. */
        if (isTemplateMode) {
            onComplete({
                menu_selectie: selected,
                aantal_gasten: aantalGasten,
                aantal_vega: aantalVega,
                basis_prijs_pp: basisPrijs,
                korting: 0,
                client_naam: '',
                client_adres: '',
                datum: '',
                items: [],
                template_naam: templateNaam.trim(),
                template_beschrijving: templateBeschrijving.trim() || undefined,
                template_id: existingTemplate?.id,
            });
            return;
        }

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
                        {/* Stel-menu-samen v2: snelle import van een bestaande menukaart.
                            Alleen op stap 0 en alleen in offerte-mode — in template-mode
                            ben je zelf de menukaart aan het schrijven. */}
                        {step === 0 && !isTemplateMode && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                                <button
                                    type="button"
                                    onClick={() => setShowLoadSheet(true)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                        padding: '6px 12px', border: '1px solid var(--brand, #c4a35a)', borderRadius: 6,
                                        background: 'rgba(196,163,90,.06)', color: 'var(--brand, #c4a35a)',
                                        cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                    }}
                                >
                                    <BookOpen size={14} /> Laad bestaande menukaart
                                </button>
                            </div>
                        )}
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
                            <button
                                type="button"
                                className="dish-select-btn dish-select-btn--add"
                                onClick={function () { setEditingDish(null); setEditorMode('create'); }}
                                style={{
                                    borderStyle: 'dashed',
                                    color: 'var(--brand)',
                                    minHeight: 64,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    fontWeight: 600,
                                }}
                            >
                                <Plus size={16} />
                                Nieuw gerecht
                            </button>
                            {gangDishes.map(function (dish) {
                                const isSelected = (selected[currentGang.slug] || []).indexOf(dish.naam) >= 0;
                                return (
                                    <div key={dish.id} style={{ position: 'relative' }}>
                                        <button className={'dish-select-btn' + (isSelected ? ' selected' : '')} onClick={function () { toggleDish(currentGang.slug, dish.naam); }} style={{ width: '100%' }}>
                                            <div className="dish-select-name">{dish.naam}</div>
                                            <div className="dish-select-desc">{dish.beschrijving || ''}</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={function (e) { e.stopPropagation(); setEditingDish(dish); setEditorMode('edit'); }}
                                            aria-label={'Gerecht ' + dish.naam + ' aanpassen'}
                                            title="Aanpassen"
                                            style={{
                                                position: 'absolute',
                                                top: 6,
                                                right: 6,
                                                width: 28,
                                                height: 28,
                                                borderRadius: 6,
                                                border: '1px solid var(--border)',
                                                background: 'rgba(0,0,0,.35)',
                                                color: 'var(--muted)',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <Pencil size={12} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div>
                        <h3 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, marginBottom: 20 }}>{isTemplateMode ? 'Menu opslaan' : 'Overzicht & Definitief'}</h3>
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
                        {isTemplateMode ? (
                            <div className="form-grid" style={{ marginBottom: 16 }}>
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <label>Naam menu *</label>
                                    <input value={templateNaam} onChange={function (e) { setTemplateNaam(e.target.value); }} placeholder="bv. Zomers BBQ 4 gangen, Bruiloft Signature, Zakenlunch" autoFocus />
                                </div>
                                <div className="field" style={{ gridColumn: '1 / -1' }}>
                                    <label>Beschrijving</label>
                                    <input value={templateBeschrijving} onChange={function (e) { setTemplateBeschrijving(e.target.value); }} placeholder="Korte omschrijving (optioneel)" />
                                </div>
                                <div className="field"><label>Basisprijs p.p. ({'\u20ac'})</label><input type="number" step="0.50" value={basisPrijs} onChange={function (e) { setBasisPrijs(parseFloat(e.target.value) || 0); }} /></div>
                                <div className="field"><label>Referentie gasten</label><input type="number" value={aantalGasten} onChange={function (e) { setAantalGasten(parseInt(e.target.value) || 0); }} /></div>
                            </div>
                        ) : (
                        <div className="form-grid" style={{ marginBottom: 16 }}>
                            <div className="field"><label>Klantnaam</label><input value={clientNaam} onChange={function (e) { setClientNaam(e.target.value); }} placeholder="Naam klant" /></div>
                            <div className="field"><label>Klantadres</label><input value={clientAdres} onChange={function (e) { setClientAdres(e.target.value); }} placeholder="Adres" /></div>
                            <div className="field"><label>Datum Event</label><input type="date" value={datum} onChange={function (e) { setDatum(e.target.value); }} /></div>
                            <div className="field"><label>Basisprijs p.p. ({'\u20ac'})</label><input type="number" step="0.50" value={basisPrijs} onChange={function (e) { setBasisPrijs(parseFloat(e.target.value) || 0); }} /></div>
                            <div className="field"><label>Totaal Gasten</label><input type="number" value={aantalGasten} onChange={function (e) { setAantalGasten(parseInt(e.target.value) || 0); }} /></div>
                            <div className="field"><label>Waarvan Vega</label><input type="number" value={aantalVega} onChange={function (e) { setAantalVega(Math.min(parseInt(e.target.value) || 0, aantalGasten)); }} /></div>
                        </div>
                        )}
                        {!isTemplateMode && (<>
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
                        </>)}
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                    <button className="btn btn-ghost" onClick={step === 0 ? onClose : goBack} style={{ flex: 1, marginRight: 8, justifyContent: 'center' }}>
                        {step === 0 ? 'Annuleren' : '\u2190 Terug'}
                    </button>
                    {isOverview ? (
                        <button className="btn btn-brand" onClick={handleComplete} disabled={!canGoNext()} style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}>
                            {isTemplateMode ? '\ud83d\udcbe Menu opslaan' : '\ud83d\udd12 Maak Definitief'}
                        </button>
                    ) : (
                        <button className="btn btn-brand" onClick={goNext} disabled={!canGoNext()} style={{ flex: 1, marginLeft: 8, justifyContent: 'center', opacity: canGoNext() ? 1 : 0.5 }}>
                            Volgende {'\u2192'}
                        </button>
                    )}
                </div>
            </div>

            {editorMode && (
                <DishQuickEditor
                    mode={editorMode}
                    gangSlug={currentGang?.slug}
                    gangOptions={gangen.map(g => ({ slug: g.slug, naam: g.naam }))}
                    existing={editingDish ? {
                        id: editingDish.id,
                        naam: editingDish.naam,
                        gang_slug: editingDish.gang_slug,
                        beschrijving: editingDish.beschrijving,
                        kostprijs_pp: editingDish.kostprijs_pp,
                        verkoopprijs: editingDish.verkoopprijs,
                        ingredienten: editingDish.ingredienten,
                        allergenen: editingDish.allergenen,
                        foto_url: editingDish.foto_url,
                    } : null}
                    onSave={handleDishSaved}
                    onClose={() => { setEditorMode(null); setEditingDish(null); }}
                />
            )}

            {/* Stel-menu-samen v2: rechter-drawer voor "Laad menukaart". */}
            <LoadMenuTemplateSheet
                open={showLoadSheet}
                onClose={() => setShowLoadSheet(false)}
                onLoad={applyLoadedTemplate}
            />
        </div>
    );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
