/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { printHaccpLabel } from '@/lib/printLabel';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import PageHint from '@/components/PageHint';
import MetallicCard from '@/components/MetallicCard';
import type { Recept, InventoryItem } from '@/types';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, Coins, List, Plus, Printer, Save, Trash2, Users, UtensilsCrossed } from 'lucide-react';

export default function Recepten() {
    const { data: recepten, insert, update, remove } = useSupabase<Recept>('recepten', []);
    const { data: inventory } = useSupabase<InventoryItem>('inventory', []);
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [filter, setFilter] = useState('Alles');
    const [kitchenMode, setKitchenMode] = useState<Recept | null>(null);
    const [kitchenStep, setKitchenStep] = useState(0);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const categories = ['Alles', 'Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'];

    function newRecept() {
        setEditing('new');
        setForm({ naam: '', categorie: 'Vlees', porties: 4, preptime: 30, ingredienten: [], instructies: '', notitie: '' });
    }

    function editRecept(r: Recept) {
        setEditing(r.id);
        setForm(JSON.parse(JSON.stringify(r)));
    }

    function saveRecept() {
        if (!form!.naam) { showToast('Vul een naam in', 'error'); return; }
        if (!form!.categorie) { showToast('Kies een categorie', 'error'); return; }
        if (editing === 'new') {
            insert(form!).then(function () { showToast('Recept aangemaakt', 'success'); setEditing(null); setForm(null); });
        } else {
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () { showToast('Recept bijgewerkt', 'success'); setEditing(null); setForm(null); });
        }
    }

    function deleteRecept() {
        showConfirm('Weet je zeker dat je dit recept wilt verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Recept verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function addIngredient() {
        const ing = (form!.ingredienten || []).concat([{ naam: '', hoeveelheid: '', eenheid: 'gram' }]);
        setField('ingredienten', ing);
    }

    function updateIngredient(idx: number, key: string, val: any) {
        const ing = form!.ingredienten.map(function (item: any, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('ingredienten', ing);
    }

    function removeIngredient(idx: number) {
        setField('ingredienten', form!.ingredienten.filter(function (_: any, i: number) { return i !== idx; }));
    }

    // Kitchen Step-Through Mode
    if (kitchenMode) {
        const steps = (kitchenMode.instructies || '').split('\n').filter(function (s: string) { return s.trim().length > 0; });
        const ingredients = (kitchenMode.ingredienten || []) as any[];
        const totalSteps = steps.length + 1; // ingredients page + instruction steps
        const isIngredientPage = kitchenStep === 0;

        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '16px 12px', position: 'relative' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <button onClick={function () { setKitchenMode(null); setKitchenStep(0); }}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        <ArrowLeft size={14} className="mr-1.5" /> Terug
                    </button>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                        {kitchenStep + 1} / {totalSteps}
                    </span>
                </div>

                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--brand)', textAlign: 'center', marginBottom: 8, textTransform: 'uppercase' }}>
                    {kitchenMode.naam}
                </h2>

                {/* Progress bar */}
                <div style={{ width: '100%', height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 24 }}>
                    <div style={{ width: ((kitchenStep + 1) / totalSteps * 100) + '%', height: '100%', background: 'var(--brand)', borderRadius: 2, transition: 'width 0.3s ease' }} />
                </div>

                {/* Content */}
                {isIngredientPage ? (
                    <div>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, textAlign: 'center', color: 'var(--text)' }}>
                            <List size={14} className="mr-1.5" style={{ color: 'var(--brand)' }} />
                            Ingredienten ({kitchenMode.porties} porties)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ingredients.map(function (ing: any, idx: number) {
                                return (
                                    <div key={idx} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '14px 16px', background: 'var(--card)', border: '1px solid var(--border)',
                                        borderRadius: 12, fontSize: 15,
                                    }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{ing.naam}</span>
                                        <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{ing.hoeveelheid} {ing.eenheid}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{
                            fontSize: 64, fontWeight: 800, color: 'var(--brand)', marginBottom: 16, opacity: 0.3,
                        }}>
                            {kitchenStep}
                        </div>
                        <p style={{
                            fontSize: 20, lineHeight: 1.6, color: 'var(--text)', fontWeight: 500,
                            padding: '0 8px', maxWidth: 500, margin: '0 auto',
                        }}>
                            {steps[kitchenStep - 1]}
                        </p>
                    </div>
                )}

                {/* Navigation buttons */}
                <div style={{ display: 'flex', gap: 12, marginTop: 32, padding: '0 8px' }}>
                    <button onClick={function () { setKitchenStep(Math.max(0, kitchenStep - 1)); }}
                        disabled={kitchenStep === 0}
                        style={{
                            flex: 1, height: 56, borderRadius: 14, fontSize: 16, fontWeight: 700,
                            background: kitchenStep === 0 ? 'var(--card-solid)' : 'rgba(255,255,255,0.05)',
                            border: '1px solid var(--border)', color: kitchenStep === 0 ? 'var(--muted)' : 'var(--text)',
                            cursor: kitchenStep === 0 ? 'not-allowed' : 'pointer',
                        }}>
                        <ChevronLeft size={14} /> Vorige
                    </button>
                    <button onClick={function () {
                        if (kitchenStep < totalSteps - 1) { setKitchenStep(kitchenStep + 1); }
                        else { setKitchenMode(null); setKitchenStep(0); showToast('Recept voltooid!', 'success'); }
                    }}
                        style={{
                            flex: 1, height: 56, borderRadius: 14, fontSize: 16, fontWeight: 700,
                            background: kitchenStep === totalSteps - 1 ? 'var(--brand)' : 'rgba(255,191,0,0.1)',
                            border: kitchenStep === totalSteps - 1 ? 'none' : '1px solid rgba(255,191,0,0.3)',
                            color: kitchenStep === totalSteps - 1 ? '#000' : 'var(--brand)',
                            cursor: 'pointer',
                        }}>
                        {kitchenStep === totalSteps - 1 ? 'Klaar!' : 'Volgende'} <ChevronRight size={14} className="ml-1.5" />
                    </button>
                </div>
            </div>
        );
    }

    if (editing !== null && form) {
        return (
            <>
                <MetallicCard hover={false}>
                    <div className="panel-head">
                        <h3>{editing === 'new' ? 'Nieuw Recept' : 'Recept Bewerken'}</h3>
                        <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                            <ArrowLeft size={14} /> Terug
                        </button>
                    </div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field full">
                                <label>Naam</label>
                                <input value={form.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('naam', e.target.value); }} />
                            </div>
                            <div className="field">
                                <label>Categorie</label>
                                <select value={form.categorie} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('categorie', e.target.value); }}>
                                    {['Vlees', 'Vis', 'Bijgerecht', 'Saus', 'Dessert', 'Drank'].map(function (c) {
                                        return <option key={c} value={c}>{c}</option>;
                                    })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Porties</label>
                                <input type="number" value={form.porties} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('porties', parseInt(e.target.value) || 0); }} />
                            </div>
                            <div className="field">
                                <label>Preptime (min)</label>
                                <input type="number" value={form.preptime} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('preptime', parseInt(e.target.value) || 0); }} />
                            </div>
                        </div>

                        <div style={{ marginTop: 24 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Ingrediënten</h4>
                                <button className="btn btn-brand btn-sm" onClick={addIngredient}>
                                    <Plus size={14} /> Toevoegen
                                </button>
                            </div>
                            {(form.ingredienten || []).map(function (ing: any, idx: number) {
                                return (
                                    <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        <input style={{ flex: 2, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Ingredient" value={ing.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateIngredient(idx, 'naam', e.target.value); }} />
                                        <input style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            placeholder="Hoeveelheid" value={ing.hoeveelheid} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateIngredient(idx, 'hoeveelheid', e.target.value); }} />
                                        <select style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, font: '400 13px DM Sans,sans-serif' }}
                                            value={ing.eenheid} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { updateIngredient(idx, 'eenheid', e.target.value); }}>
                                            {['gram', 'kg', 'ml', 'liter', 'stuks', 'el', 'tl'].map(function (u) { return <option key={u}>{u}</option>; })}
                                        </select>
                                        <button className="del-btn" onClick={function () { removeIngredient(idx); }}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="form-grid" style={{ marginTop: 20 }}>
                            <div className="field full">
                                <label>Instructies</label>
                                <textarea rows={4} value={form.instructies} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('instructies', e.target.value); }} />
                            </div>
                            <div className="field full">
                                <label>Notitie</label>
                                <textarea rows={2} value={form.notitie} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} />
                            </div>
                        </div>

                        <div className="editor-actions">
                            <button className="btn btn-brand" onClick={saveRecept}>
                                <Save size={14} /> Opslaan
                            </button>
                            {editing !== 'new' && (
                                <>
                                    <button className="btn" style={{ background: '#10b981', color: '#fff', border: 'none' }} onClick={function () {
                                        printHaccpLabel({
                                            titel: form.naam,
                                            allergenen: detectAllergenen(form.ingredienten),
                                            notities: form.notitie
                                        });
                                        showToast('Etiket verstuurd naar printer', 'success');
                                    }}>
                                        <Printer size={14} /> Print Etiket
                                    </button>
                                    <button className="btn btn-red" onClick={deleteRecept}>
                                        <Trash2 size={14} /> Verwijderen
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </MetallicCard>
            </>
        );
    }

    function findBestInventoryMatch(ingName: string, items: InventoryItem[]) {
        if (!ingName) return null;
        var needle = ingName.toLowerCase().trim();
        var bestMatch: InventoryItem | null = null;
        var bestScore = 0;
        items.forEach(function (inv) {
            if (!inv.naam) return;
            var haystack = inv.naam.toLowerCase().trim();
            var score = 0;
            if (haystack === needle) {
                score = 3;
            } else if (haystack.startsWith(needle + ' ') || haystack.startsWith(needle + ',')) {
                score = 2;
            } else if (needle.startsWith(haystack + ' ') || needle.startsWith(haystack + ',')) {
                score = 2;
            } else {
                var needleWords = needle.split(/\s+/);
                var haystackWords = haystack.split(/\s+/);
                var matched = needleWords.filter(function (w) { return haystackWords.indexOf(w) >= 0; });
                if (matched.length > 0 && matched.length >= Math.min(needleWords.length, haystackWords.length)) {
                    score = 1;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = inv;
            }
        });
        return bestMatch;
    }

    function detectAllergenen(ingredienten: any[]): string[] {
        const allergeenMap: Record<string, string[]> = {
            'Gluten': ['meel', 'bloem', 'brood', 'pasta', 'couscous', 'bulgur', 'panko', 'bier', 'sojasaus', 'tarwe', 'rogge', 'gerst', 'spelt'],
            'Lactose': ['melk', 'kaas', 'boter', 'room', 'yoghurt', 'creme', 'mascarpone', 'mozzarella', 'parmezaan', 'cheddar', 'brie'],
            'Ei': ['ei', 'eieren', 'mayonaise'],
            'Noten': ['amandel', 'walnoot', 'hazelnoot', 'cashew', 'pistache', 'pecannoot', 'pinda', 'noten'],
            'Soja': ['soja', 'tofu', 'tempeh', 'sojasaus', 'edamame'],
            'Vis': ['vis', 'zalm', 'kabeljauw', 'tonijn', 'makreel', 'haring', 'sardine', 'ansjovis', 'forel'],
            'Schaaldieren': ['garnaal', 'garnalen', 'kreeft', 'krab', 'mosselen', 'oesters', 'langoustine'],
            'Selderij': ['selderij', 'selderijzout', 'knolselderij'],
            'Mosterd': ['mosterd'],
            'Sesamzaad': ['sesam', 'sesamzaad', 'tahini'],
            'Sulfiet': ['wijn', 'azijn', 'gedroogd fruit']
        };
        var found: string[] = [];
        var namen = (ingredienten || []).map(function (ing: any) { return (ing.naam || '').toLowerCase(); });
        Object.keys(allergeenMap).forEach(function (allergeen) {
            var triggers = allergeenMap[allergeen];
            var match = namen.some(function (naam: string) {
                return triggers.some(function (trigger) { return naam.indexOf(trigger) >= 0; });
            });
            if (match) found.push(allergeen);
        });
        return found;
    }

    function calcRecipeCost(recipe: Record<string, any>) {
        let total = 0;
        (recipe.ingredienten || []).forEach(function (ing: any) {
            const match = findBestInventoryMatch(ing.naam, inventory);
            if (match) {
                const qty = parseFloat(ing.hoeveelheid) || 0;
                let unitFactor = 1;
                if (ing.eenheid === 'gram' && match.unit === 'kg') unitFactor = 0.001;
                if (ing.eenheid === 'ml' && match.unit === 'L') unitFactor = 0.001;
                total += qty * unitFactor * (match.purchase_price || 0);
            }
        });
        return total;
    }

    const filtered = filter === 'Alles' ? recepten : recepten.filter(function (r) { return r.categorie === filter; });

    return (
        <>
            <PageHeader
                title="Recepten"
                description="Beheer je recepten met ingrediënten en bereidingswijze"
                actions={<>
                    <button className="btn btn-brand" onClick={newRecept}>
                        <Plus size={14} /> Nieuw Recept
                    </button>
                </>}
            />

            <PageHint id="recepten" title="Recepten" description="Beheer je recepten met ingrediënten en bereidingswijze. Koppel ze aan gerechten voor automatische kostprijsberekening." />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                {categories.map(function (c) {
                    return <button key={c} className={'btn btn-sm ' + (filter === c ? 'btn-brand' : 'btn-ghost')} onClick={function () { setFilter(c); }}>{c}</button>;
                })}
            </div>

            {filtered.length === 0 && (
                <EmptyState page="/recepten" onAction={newRecept} />
            )}

            <PageSection>
            <div className="grid-3">
                {filtered.map(function (r) {
                    return (
                        <div key={r.id} className="rec-card" onClick={function () { editRecept(r); }}>
                            <div className="rec-cat">{r.categorie}</div>
                            <div className="rec-name">{r.naam}</div>
                            <div className="rec-meta">
                                <span><Users size={14} /> {r.porties} porties</span>
                                <span><Clock size={14} /> {r.preptime} min</span>
                                <span><List size={14} /> {(r.ingredienten || []).length} ingr.</span>
                            </div>
                            {(() => {
                                const ings = (r.ingredienten || []) as any[];
                                if (ings.length === 0) return null;
                                const available = ings.filter(function (ing: any) {
                                    const match = findBestInventoryMatch(ing.naam, inventory);
                                    return match && match.current_stock > 0;
                                }).length;
                                const total = ings.length;
                                const ratio = available / total;
                                const color = ratio === 1 ? 'var(--green)' : ratio >= 0.5 ? 'var(--amber)' : 'var(--red)';
                                const icon = ratio === 1 ? '\u{1F7E2}' : ratio >= 0.5 ? '\u{1F7E1}' : '\u{1F534}';
                                return (
                                    <div style={{ fontSize: 12, color: color, fontWeight: 600, marginTop: 6 }}>
                                        {icon} {available}/{total} op voorraad
                                    </div>
                                );
                            })()}
                            {r.instructies && (
                                <button onClick={function (e) { e.stopPropagation(); setKitchenMode(r); setKitchenStep(0); }}
                                    style={{
                                        marginTop: 10, width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                        background: 'rgba(255,191,0,.08)', border: '1px solid rgba(255,191,0,.2)',
                                        color: 'var(--brand)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                                    }}>
                                    <UtensilsCrossed size={14} className="mr-1.5" /> Keuken Mode
                                </button>
                            )}
                            {calcRecipeCost(r) > 0 && (
                                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: 12, color: 'var(--purple)', fontWeight: 700 }}><Coins size={14} className="mr-1.5" /> Kostprijs</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{(calcRecipeCost(r) / (r.porties || 1)).toFixed(2)} /portie</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            </PageSection>
        </>
    );
}
