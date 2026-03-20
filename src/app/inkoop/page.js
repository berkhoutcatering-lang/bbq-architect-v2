'use client';
import { useState, useRef } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { parseActions, executeAction } from '@/lib/ai-actions';
import { fmt, fmtNl, today } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export default function Inkoop() {
    var { data: leveranciers, insert: insertLev, update: updateLev, remove: removeLev } = useSupabase('leveranciers', []);
    var { data: inkooplijsten, insert: insertInk, update: updateInk, remove: removeInk } = useSupabase('inkooplijsten', []);
    var { data: events } = useSupabase('events', []);
    var { data: offertes } = useSupabase('offertes', []);
    var { data: gerechtenData } = useSupabase('gerechten', []);
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [tab, setTab] = useState('leveranciers');
    var [editingLev, setEditingLev] = useState(null);
    var [levForm, setLevForm] = useState(null);
    var [expandedInk, setExpandedInk] = useState(null);
    var [newInkEvent, setNewInkEvent] = useState('');
    var [newInkItem, setNewInkItem] = useState({ desc: '', qty: 1, eenheid: 'kg', leverancier: '' });
    var [boodschappenOfferte, setBoodschappenOfferte] = useState('');

    // Receipt Scanning State
    var [receiptScanning, setReceiptScanning] = useState(false);
    var [pendingActions, setPendingActions] = useState([]);
    var [scanStatus, setScanStatus] = useState('');
    var fileInputRef = useRef(null);

    async function handleReceiptUpload(e) {
        var file = e.target.files[0];
        if (!file) return;
        setReceiptScanning(true);
        setPendingActions([]);
        setScanStatus('AFBEELDING INLADEN...');

        var reader = new FileReader();
        reader.onload = async function (ev) {
            var b64 = ev.target.result;
            setScanStatus('LLAMA VISION ANALYSEERT BON...');
            try {
                var res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageContext: '/inkoop',
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Scan deze kassabon. Zoek naar items, prijzen en aantallen. Gebruik de process_receipt tool.' },
                                { type: 'image_url', image_url: { url: b64 } }
                            ]
                        }]
                    })
                });
                var json = await res.json();
                var content = (json.choices && json.choices[0] && json.choices[0].message.content) || '';
                var { actions } = parseActions(content);

                if (actions.length > 0) {
                    setPendingActions(actions);
                    setScanStatus('SCAN VOLTOOID ✓');
                    showToast('Bon geanalyseerd! Bevestig de items.', 'success');
                } else {
                    setScanStatus('GEEN ITEMS GEVONDEN');
                    showToast('Geen herkenbare items op de bon', 'info');
                }
            } catch (err) {
                setScanStatus('SCAN FOUT MET RECEPT');
                showToast('Fout: ' + err.message, 'error');
            }
            setReceiptScanning(false);
        };
        reader.readAsDataURL(file);
    }

    async function runAction(action) {
        try {
            await executeAction(action, supabase);
            setPendingActions(prev => prev.filter(a => a.id !== action.id));
            showToast('Item ingeboekt: ' + action.description, 'success');
        } catch (err) {
            showToast('Fout bij inboeken: ' + err.message, 'error');
        }
    }

    // Standard CRUD
    function newLeverancier() { setEditingLev('new'); setLevForm({ naam: '', type: 'Overig', contact: '', email: '', tel: '' }); }
    function editLeverancier(l) { setEditingLev(l.id); setLevForm(JSON.parse(JSON.stringify(l))); }
    function saveLeverancier() {
        if (!levForm.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editingLev === 'new') {
            insertLev(levForm).then(function () { showToast('Leverancier toegevoegd', 'success'); setEditingLev(null); });
        } else {
            var { id, ...rest } = levForm;
            updateLev(editingLev, rest).then(function () { showToast('Bijgewerkt', 'success'); setEditingLev(null); });
        }
    }

    // Boodschappen Engine
    var boodOfferte = offertes.find(function (o) { return String(o.id) === boodschappenOfferte; });
    var winkelGroepen = { Sligro: [], Crisp: [], PLUS: [], Overig: [] };
    if (boodOfferte && boodOfferte.menu_selectie) {
        var menuSel = typeof boodOfferte.menu_selectie === 'string' ? JSON.parse(boodOfferte.menu_selectie) : boodOfferte.menu_selectie;
        Object.values(menuSel || {}).forEach(function (dishes) {
            (dishes || []).forEach(function (dishName) {
                var dish = gerechtenData.find(function (g) { return g.naam === dishName; });
                if (dish && dish.ingredienten) {
                    var winkels = dish.ingredienten_winkels || {};
                    dish.ingredienten.forEach(function (ing) {
                        var winkel = winkels[ing] || 'Overig';
                        if (!winkelGroepen[winkel]) winkelGroepen[winkel] = [];
                        if (winkelGroepen[winkel].indexOf(ing) < 0) winkelGroepen[winkel].push(ing);
                    });
                }
            });
        });
    }

    return (
        <div className="artisan-page inkoop-page">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                    <h1 className="hero-title">INKOOP & LOGISTIEK</h1>
                    <p style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 1 }}>BEHEER LEVERANCIERS, BOODSCHAPPEN EN BONNEN</p>
                </div>
            </div>

            <div className="tab-bar mb-24">
                <button className={'tab-btn' + (tab === 'leveranciers' ? ' active' : '')} onClick={() => setTab('leveranciers')}>LEVERANCIERS</button>
                <button className={'tab-btn' + (tab === 'inkooplijsten' ? ' active' : '')} onClick={() => setTab('inkooplijsten')}>LIJSTEN</button>
                <button className={'tab-btn' + (tab === 'boodschappen' ? ' active' : '')} onClick={() => setTab('boodschappen')}>BOODSCHAPPEN</button>
                <button className={'tab-btn' + (tab === 'bonnen' ? ' active' : '')} onClick={() => setTab('bonnen')}>BON-SCANNER</button>
            </div>

            {tab === 'leveranciers' && (
                <div className="grid-3">
                    <div className="artisan-panel" style={{ cursor: 'pointer', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }} onClick={newLeverancier}>
                        <div style={{ textAlign: 'center' }}>
                            <i className="fa-solid fa-plus-circle" style={{ fontSize: 24, color: 'var(--brand)', marginBottom: 12 }}></i>
                            <div style={{ fontWeight: 800, fontSize: 12 }}>NIEUWE LEVERANCIER</div>
                        </div>
                    </div>
                    {leveranciers.map(l => (
                        <div key={l.id} className="artisan-panel" onClick={() => editLeverancier(l)} style={{ cursor: 'pointer' }}>
                            <div style={{ color: 'var(--brand)', fontSize: 10, fontWeight: 900, letterSpacing: 1, marginBottom: 8 }}>{l.type?.toUpperCase()}</div>
                            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>{l.naam.toUpperCase()}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                {l.contact && <div><i className="fa-solid fa-user" style={{ width: 16 }}></i> {l.contact}</div>}
                                {l.tel && <div><i className="fa-solid fa-phone" style={{ width: 16 }}></i> {l.tel}</div>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === 'bonnen' && (
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div className="artisan-panel" style={{ textAlign: 'center', padding: 48, marginBottom: 24 }}>
                        <i className="fa-solid fa-receipt" style={{ fontSize: 48, color: 'var(--brand)', marginBottom: 20 }}></i>
                        <h2 style={{ fontFamily: 'var(--font-artisan)', letterSpacing: 2, fontSize: 24, marginBottom: 16 }}>VISION INKOOP TRACKER</h2>
                        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32, maxWidth: 500, margin: '0 auto 32px' }}>
                            Scan je Sligro of Makro bon. De AI herkent items, hoeveelheden en prijzen en boekt ze direct in je inventaris.
                        </p>

                        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleReceiptUpload} style={{ display: 'none' }} />

                        <button className="btn-brand" style={{ padding: '16px 40px', fontSize: 16 }} onClick={() => fileInputRef.current.click()} disabled={receiptScanning}>
                            {receiptScanning ? (
                                <><i className="fa-solid fa-circle-notch fa-spin"></i> ANALYSEREN...</>
                            ) : (
                                <><i className="fa-solid fa-camera"></i> SCAN KASSABON</>
                            )}
                        </button>

                        {scanStatus && <div style={{ marginTop: 20, fontSize: 11, fontWeight: 900, color: 'var(--brand)', letterSpacing: 2 }}>{scanStatus}</div>}
                    </div>

                    {pendingActions.length > 0 && (
                        <div className="artisan-panel">
                            <div className="panel-head"><h3>GEVONDEN ITEMS ({pendingActions.length})</h3></div>
                            <div className="panel-body">
                                {pendingActions.map(action => (
                                    <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 800, fontSize: 13 }}>{action.description.split(':').pop()?.trim().toUpperCase() || 'ITEM'}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                {action.data.aantal} {action.data.eenheid || 'stks'} • €{action.data.prijs?.toFixed(2)}
                                            </div>
                                        </div>
                                        <button className="btn-brand" style={{ padding: '6px 16px', fontSize: 11 }} onClick={() => runAction(action)}>BOEK IN</button>
                                    </div>
                                ))}
                                <button className="tab-btn w-full mt-16" onClick={() => setPendingActions([])}>ALLES WISSEN</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Editing Modal */}
            {editingLev && (
                <div className="architect-modal-overlay">
                    <div className="architect-modal" style={{ maxWidth: 500 }}>
                        <div className="modal-head">
                            <h3>{editingLev === 'new' ? 'NIEUWE LEVERANCIER' : 'LEVERANCIER BEWERKEN'}</h3>
                            <button className="close-btn" onClick={() => setEditingLev(null)}><i className="fa-solid fa-xmark"></i></button>
                        </div>
                        <div className="modal-body">
                            <div className="field mb-16"><label>NAAM</label><input value={levForm.naam} onChange={e => setLevForm({ ...levForm, naam: e.target.value })} /></div>
                            <div className="field mb-16">
                                <label>TYPE</label>
                                <select value={levForm.type} onChange={e => setLevForm({ ...levForm, type: e.target.value })}>
                                    {['Vlees', 'Groente', 'Dranken', 'Overig'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="field mb-16"><label>CONTACTPERSOON</label><input value={levForm.contact} onChange={e => setLevForm({ ...levForm, contact: e.target.value })} /></div>
                            <div className="field mb-16"><label>TELEFOON</label><input value={levForm.tel} onChange={e => setLevForm({ ...levForm, tel: e.target.value })} /></div>
                            <div className="field mb-24"><label>EMAIL</label><input value={levForm.email} onChange={e => setLevForm({ ...levForm, email: e.target.value })} /></div>

                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn-brand flex-1" onClick={saveLeverancier}>OPSLAAN</button>
                                <button className="tab-btn" onClick={() => setEditingLev(null)}>ANNULEREN</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
