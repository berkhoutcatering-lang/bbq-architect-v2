'use client';
import { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import MenuWizard from '@/components/MenuWizard';

export default function Offertes() {
    var { data: offertes, insert, update, remove } = useSupabase('offertes', []);
    var facturen = useSupabase('facturen', []);
    var { data: gerechtenData } = useSupabase('gerechten', []);
    var { data: inventoryData } = useSupabase('inventory', []);
    var { settings } = useSettings();
    var showToast = useToast();
    var showConfirm = useConfirm();
    var [editing, setEditing] = useState(null);
    var [form, setForm] = useState(null);
    var [showWizard, setShowWizard] = useState(false);
    var [showWizardForExisting, setShowWizardForExisting] = useState(false);
    var [vasteKostenInput, setVasteKostenInput] = useState({ naam: '', bedrag: '' });

    // ── Marge Calculation Engine ──
    function getInvPrice(naam) {
        var inv = inventoryData.find(function (i) { return i.naam && i.naam.toLowerCase() === naam.toLowerCase(); });
        return inv ? { price: inv.purchase_price || 0, unit: inv.unit || 'kg', yield_factor: inv.yield_factor || 1.0 } : null;
    }
    function calcDishCostPP(gerechtNaam) {
        var gerecht = gerechtenData.find(function (g) { return g.naam === gerechtNaam; });
        if (!gerecht || !gerecht.ingredient_costs) return 0;
        return (gerecht.ingredient_costs || []).reduce(function (sum, item) {
            var inv = getInvPrice(item.naam);
            var price = inv ? inv.price : 0;
            var yld = item.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
            var unitFactor = 1;
            if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
            if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
            return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
        }, 0);
    }
    function calcOfferteMargeData(offerte) {
        try {
            var gasten = offerte.aantal_gasten || (offerte.items && offerte.items[0] ? offerte.items[0].qty : 0) || 0;
            var prijsPP = offerte.basis_prijs_pp || 38.50;
            var omzet = gasten * prijsPP;
            var menuGerechten = offerte.menu_selectie || [];
            if (!Array.isArray(menuGerechten)) menuGerechten = [];
            var foodcostPP = 0;
            menuGerechten.forEach(function (sel) {
                if (sel) foodcostPP += calcDishCostPP(sel.gerecht_naam || sel.naam || '');
            });
            var foodcostTotaal = foodcostPP * gasten;
            var vk = offerte.vaste_kosten;
            if (!Array.isArray(vk)) vk = [];
            var vasteKosten = vk.reduce(function (s, k) { return s + (parseFloat(k.bedrag) || 0); }, 0);
            var nettoWinst = omzet - foodcostTotaal - vasteKosten;
            var margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;
            return { gasten: gasten, prijsPP: prijsPP, omzet: omzet, foodcostPP: foodcostPP, foodcostTotaal: foodcostTotaal, vasteKosten: vasteKosten, nettoWinst: nettoWinst, margePct: margePct };
        } catch (e) {
            console.error('[MARGE] calcOfferteMargeData error:', e);
            return { gasten: 0, prijsPP: 38.50, omzet: 0, foodcostPP: 0, foodcostTotaal: 0, vasteKosten: 0, nettoWinst: 0, margePct: 0 };
        }
    }
    function margeColor(pct) { return pct > 70 ? 'green' : pct >= 60 ? 'orange' : 'red'; }
    function margeLabel(pct) { return pct > 70 ? 'Strong' : pct >= 60 ? 'Watchful' : 'Low Margin'; }
    function margeEmoji(pct) { return pct > 70 ? '🟢' : pct >= 60 ? '🟡' : '🔴'; }

    function handleWizardComplete(result) {
        var geldigDagen = (settings && settings.offerte_geldig) || 30;
        var nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
        setShowWizard(false);
        setEditing('new');
        setForm({
            nummer: nummer,
            status: 'definitief',
            client_naam: result.client_naam,
            client_adres: result.client_adres,
            datum: result.datum,
            geldig_tot: addDays(result.datum, geldigDagen),
            notitie: 'Signature Menu - ' + result.aantal_gasten + ' gasten',
            items: result.items,
            menu_selectie: result.menu_selectie,
            aantal_gasten: result.aantal_gasten,
            aantal_vega: result.aantal_vega,
            basis_prijs_pp: result.basis_prijs_pp,
            korting: result.korting
        });
        showToast('Menu samengesteld! Klik Opslaan om definitief te maken.', 'info');
    }

    function handleWizardUpdateExisting(result) {
        setShowWizardForExisting(false);
        setForm(Object.assign({}, form, {
            menu_selectie: result.menu_selectie,
            aantal_gasten: result.aantal_gasten,
            aantal_vega: result.aantal_vega,
            basis_prijs_pp: result.basis_prijs_pp,
            korting: result.korting,
            client_naam: result.client_naam,
            client_adres: result.client_adres,
            datum: result.datum,
            items: result.items
        }));
        showToast('🍽️ Menu bijgewerkt! Klik Opslaan om wijzigingen door te voeren.', 'info');
    }

    function newOfferte() {
        var geldigDagen = (settings && settings.offerte_geldig) || 30;
        var nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), geldig_tot: addDays(today(), geldigDagen), notitie: '', items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editOfferte(o) { setEditing(o.id); setForm(JSON.parse(JSON.stringify(o))); }
    function setField(key, val) { setForm(Object.assign({}, form, { [key]: val })); }

    // =====================================================
    // CENTRAL SYNC: syncQuoteToEvent — Robust Watcher v2
    // Called on EVERY offerte save/update. Upserts the event.
    // Always overwrites event data from offerte.
    // =====================================================
    function syncQuoteToEvent(quoteId, quoteData) {
        console.log('[SYNC] ═══════════════════════════════════════');
        console.log('[SYNC] syncQuoteToEvent v2 called');
        console.log('[SYNC] Quote ID:', quoteId, '(type:', typeof quoteId + ')');
        console.log('[SYNC] Quote status:', quoteData.status);
        console.log('[SYNC] Quote client:', quoteData.client_naam);
        console.log('[SYNC] Quote datum:', quoteData.datum);

        if (!quoteId) {
            console.error('[SYNC] ❌ ABORT: No quote ID provided');
            return;
        }

        // Normalize quoteId to integer
        var qid = parseInt(quoteId, 10);
        if (isNaN(qid)) {
            console.error('[SYNC] ❌ ABORT: Invalid quote ID:', quoteId);
            return;
        }

        var newStatus = quoteData.status;

        // Calculate guests/ppp from offerte items
        var totalBedrag = 0;
        var estimatedGuests = 0;
        (quoteData.items || []).forEach(function (item) {
            totalBedrag += (item.qty || 0) * (item.prijs || 0);
            if ((item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
        });
        var ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;
        console.log('[SYNC] Calculated: guests=' + estimatedGuests + ', ppp=€' + ppp.toFixed(2) + ', totaal=€' + totalBedrag.toFixed(2));

        // Map offerte status → event status
        var eventStatus;
        if (newStatus === 'geaccepteerd' || newStatus === 'akkoord' || newStatus === 'betaald') {
            eventStatus = 'confirmed';
        } else if (newStatus === 'afgewezen' || newStatus === 'verlopen') {
            eventStatus = '__DELETE__';
        } else {
            // concept, verzonden → optie
            eventStatus = 'optie';
        }
        console.log('[SYNC] Status mapping:', newStatus, '→', eventStatus);

        // Step 1: Check if event exists for this offerte
        console.log('[SYNC] Step 1: Querying events WHERE offerte_id=' + qid);
        supabase.from('events').select('id, status, name').eq('offerte_id', qid)
            .then(function (res) {
                if (res.error) {
                    console.error('[SYNC] ❌ Step 1 FAILED:', res.error.message);
                    showToast('Sync fout: ' + res.error.message, 'error');
                    return;
                }

                var rows = res.data || [];
                console.log('[SYNC] Step 1 result: ' + rows.length + ' event(s) found', JSON.stringify(rows));

                // Clean up duplicates if any (defensive)
                if (rows.length > 1) {
                    console.warn('[SYNC] ⚠ Multiple events found for offerte_id=' + qid + ', cleaning duplicates');
                    for (var i = 1; i < rows.length; i++) {
                        supabase.from('events').delete().eq('id', rows[i].id).then(function () { });
                    }
                }

                var existing = rows.length > 0 ? rows[0] : null;
                console.log('[SYNC] Step 2: Existing event?', existing ? 'YES (id=' + existing.id + ', status=' + existing.status + ')' : 'NO');

                // === DELETE PATH ===
                if (eventStatus === '__DELETE__') {
                    if (existing) {
                        console.log('[SYNC] Step 3: DELETING event for afgewezen/verlopen offerte');
                        supabase.from('events').delete().eq('offerte_id', qid)
                            .then(function (d) {
                                if (d.error) {
                                    console.error('[SYNC] ❌ Delete failed:', d.error.message);
                                } else {
                                    console.log('[SYNC] ✅ Event deleted successfully');
                                    showToast('🗑️ Optie verwijderd uit Agenda', 'info');
                                }
                            })
                            .catch(function (e) { console.error('[SYNC] Delete catch:', e); });
                    } else {
                        console.log('[SYNC] No event to delete — skip');
                    }
                    console.log('[SYNC] ═══════════════════════════════════════');
                    return;
                }

                // === BUILD EVENT PAYLOAD (always overwrite) ===
                var payload = {
                    name: 'Offerte: ' + (quoteData.client_naam || quoteData.nummer || 'Onbekend'),
                    date: quoteData.datum || new Date().toISOString().slice(0, 10),
                    guests: estimatedGuests || 50,
                    ppp: Math.round(ppp * 100) / 100,
                    location: quoteData.client_adres || '',
                    client_naam: quoteData.client_naam || '',
                    client_adres: quoteData.client_adres || '',
                    status: eventStatus,
                    notitie: quoteData.notitie || ''
                };
                console.log('[SYNC] Step 3: Event payload:', JSON.stringify(payload));

                if (existing) {
                    // === UPDATE existing event ===
                    console.log('[SYNC] Step 4: UPDATING event id=' + existing.id);
                    supabase.from('events').update(payload).eq('id', existing.id).select()
                        .then(function (u) {
                            if (u.error) {
                                console.error('[SYNC] ❌ Update FAILED:', u.error.message, JSON.stringify(u.error));
                                showToast('Sync fout bij update: ' + u.error.message, 'error');
                            } else {
                                console.log('[SYNC] ✅ Event UPDATED successfully:', JSON.stringify(u.data));
                                var msg = eventStatus === 'confirmed'
                                    ? '✅ Agenda gesynchroniseerd — Event bevestigd!'
                                    : '📅 Agenda gesynchroniseerd met Offerte';
                                showToast(msg, 'success');
                            }
                        })
                        .catch(function (e) { console.error('[SYNC] Update catch:', e); });
                } else {
                    // === INSERT new event ===
                    payload.offerte_id = qid;
                    payload.type = 'Zakelijk';
                    payload.menu = [];  // JSONB — must be array, NOT string
                    console.log('[SYNC] Step 4: INSERTING new event');
                    console.log('[SYNC] Full insert payload:', JSON.stringify(payload));
                    supabase.from('events').insert(payload).select()
                        .then(function (ins) {
                            if (ins.error) {
                                console.error('[SYNC] ❌ Insert FAILED:', ins.error.message, JSON.stringify(ins.error));
                                showToast('Sync fout bij insert: ' + ins.error.message, 'error');
                            } else {
                                console.log('[SYNC] ✅ New event INSERTED:', JSON.stringify(ins.data));
                                showToast('📅 Agenda gesynchroniseerd — Optie toegevoegd!', 'success');
                            }
                        })
                        .catch(function (e) { console.error('[SYNC] Insert catch:', e); });
                }
                console.log('[SYNC] ═══════════════════════════════════════');
            })
            .catch(function (e) {
                console.error('[SYNC] ❌ Step 1 CATCH:', e);
                showToast('Sync fout: kon events niet ophalen', 'error');
            });
    }

    // =====================================================
    // SAVE — always triggers syncQuoteToEvent
    // =====================================================
    function saveOfferte() {
        if (!form.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        console.log('[SAVE] ═══════════════════════════════════════');
        console.log('[SAVE] editing=', editing, 'status=', form.status);

        if (editing === 'new') {
            console.log('[SAVE] Inserting new offerte...');
            insert(form).then(function (insertedRow) {
                console.log('[SAVE] Insert returned:', JSON.stringify(insertedRow));
                showToast('Offerte aangemaakt', 'success');

                var newId = insertedRow && insertedRow.id ? insertedRow.id : null;
                console.log('[SAVE] Extracted ID:', newId);

                if (newId) {
                    syncQuoteToEvent(newId, form);
                } else {
                    console.log('[SAVE] No ID from insert — trying direct DB lookup');
                    // Direct Supabase fallback — find by nummer
                    supabase.from('offertes').select('id').eq('nummer', form.nummer).order('id', { ascending: false }).limit(1)
                        .then(function (lookup) {
                            console.log('[SAVE] Lookup result:', JSON.stringify(lookup.data), 'error:', lookup.error);
                            if (lookup.data && lookup.data.length > 0) {
                                console.log('[SAVE] Found offerte via lookup, id=' + lookup.data[0].id);
                                syncQuoteToEvent(lookup.data[0].id, form);
                            } else {
                                console.error('[SAVE] ❌ Could not find offerte ID — sync skipped');
                            }
                        })
                        .catch(function (e) { console.error('[SAVE] Lookup catch:', e); });
                }

                setEditing(null); setForm(null);
            }).catch(function (err) {
                console.error('[SAVE] Insert error:', err);
                showToast('Fout bij aanmaken: ' + (err.message || ''), 'error');
            });
        } else {
            console.log('[SAVE] Updating offerte id=', editing);
            var { id, created_at, ...rest } = form;
            update(editing, rest).then(function () {
                showToast('Offerte bijgewerkt', 'success');
                console.log('[SAVE] Update done, calling syncQuoteToEvent with id=', editing);
                syncQuoteToEvent(editing, form);
                setEditing(null); setForm(null);
            }).catch(function (err) {
                console.error('[SAVE] Update error:', err);
                showToast('Fout bij opslaan: ' + (err.message || ''), 'error');
            });
        }
        console.log('[SAVE] ═══════════════════════════════════════');
    }

    function deleteOfferte() {
        showConfirm('Weet je zeker dat je deze offerte wilt verwijderen?', function () {
            console.log('[DELETE] Deleting offerte id=', editing, '— also removing linked event');
            supabase.from('events').delete().eq('offerte_id', editing).then(function (res) {
                if (res.error) console.error('[DELETE] Event delete error:', res.error);
                else console.log('[DELETE] ✅ Linked event removed');
            });
            remove(editing).then(function () { showToast('Offerte verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function convertToFactuur() {
        var betaaltermijn = (settings && settings.betaaltermijn) || 14;
        var factuurNum = genNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.data.length + 1);
        var factuurData = {
            nummer: factuurNum,
            status: 'concept',
            client_naam: form.client_naam,
            client_adres: form.client_adres,
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: form.items
        };
        facturen.insert(factuurData).then(function () {
            var { id, created_at, ...rest } = Object.assign({}, form, { status: 'geaccepteerd' });
            update(editing, rest).then(function () {
                showToast('Factuur aangemaakt vanuit offerte', 'success');
                syncQuoteToEvent(editing, Object.assign({}, form, { status: 'geaccepteerd' }));
                setEditing(null); setForm(null);
            });
        });
    }

    function addItem() { setField('items', (form.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx, key, val) {
        var items = form.items.map(function (item, i) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx) { setField('items', form.items.filter(function (_, i) { return i !== idx; })); }

    function downloadOfferte() {
        var totals = calcLineTotals(form.items);
        generatePDF({ type: 'offerte', form: form, settings: settings, totals: totals });
    }

    // Editor
    if (editing !== null && form) {
        var totals = calcLineTotals(form.items);
        var pillMap = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };

        // Sync status indicator text
        var syncMsg = '📅 Opslaan synchroniseert automatisch met de Agenda';
        if (form.status === 'geaccepteerd' || form.status === 'akkoord' || form.status === 'betaald') syncMsg = '✅ Event bevestigd in Agenda — Groene glow actief';
        else if (form.status === 'afgewezen' || form.status === 'verlopen') syncMsg = '🗑️ Optie wordt verwijderd uit Agenda bij opslaan';

        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Offerte' : 'Offerte Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Offertenummer</label><input value={form.nummer} onChange={function (e) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'geaccepteerd', 'akkoord', 'betaald', 'afgewezen', 'verlopen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Geldig Tot</label><input type="date" value={form.geldig_tot} onChange={function (e) { setField('geldig_tot', e.target.value); }} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={function (e) { setField('notitie', e.target.value); }} /></div>
                    </div>

                    {/* Sync indicator */}
                    <div style={{ margin: '16px 0 8px', padding: '10px 14px', background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.12)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-link" style={{ color: 'var(--brand)', fontSize: 11 }}></i>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{syncMsg}</span>
                    </div>

                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Regels</h4>
                            <button className="btn btn-brand btn-sm" onClick={addItem}><i className="fa-solid fa-plus"></i> Regel</button>
                        </div>
                        <table className="tbl">
                            <thead><tr><th>Omschrijving</th><th style={{ width: 80 }}>Aantal</th><th style={{ width: 100 }}>Prijs</th><th style={{ width: 70 }}>BTW%</th><th style={{ width: 90 }}>Totaal</th><th style={{ width: 30 }}></th></tr></thead>
                            <tbody>
                                {(form.items || []).map(function (item, idx) {
                                    return <tr key={idx}>
                                        <td><input value={item.desc} onChange={function (e) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                        <td><input type="number" value={item.qty} onChange={function (e) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" step="0.01" value={item.prijs} onChange={function (e) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" value={item.btw} onChange={function (e) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
                                        <td style={{ fontWeight: 600 }}>{fmt((item.qty || 0) * (item.prijs || 0))}</td>
                                        <td><button className="del-btn" onClick={function () { removeItem(idx); }}><i className="fa-solid fa-trash"></i></button></td>
                                    </tr>;
                                })}
                            </tbody>
                        </table>
                        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 14 }}>
                            <div style={{ color: 'var(--muted)' }}>Subtotaal: {fmt(totals.subtotaal)}</div>
                            <div style={{ color: 'var(--muted)' }}>BTW: {fmt(totals.btw)}</div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>Totaal: {fmt(totals.totaal)}</div>
                        </div>
                    </div>
                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveOfferte}><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn" style={{ background: '#B48C14', color: '#000' }} onClick={function () { setShowWizardForExisting(true); }}><i className="fa-solid fa-utensils"></i> Menu Samenstellen</button>
                        <button className="btn btn-cyan" onClick={downloadOfferte}><i className="fa-solid fa-file-pdf"></i> PDF</button>
                        {editing !== 'new' && form.status === 'geaccepteerd' && <button className="btn btn-green" onClick={convertToFactuur}><i className="fa-solid fa-file-invoice"></i> Naar Factuur</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteOfferte}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>

                    {/* ═══ VASTE KOSTEN ═══ */}
                    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                            ⚙️ Vaste Kosten per Event
                        </div>
                        {(form.vaste_kosten || []).length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                                {(form.vaste_kosten || []).map(function (k, idx) {
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(180,140,20,.04)', borderRadius: 8, border: '1px solid rgba(180,140,20,.1)' }}>
                                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{k.naam}</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>€{(parseFloat(k.bedrag) || 0).toFixed(2)}</span>
                                            <button type="button" className="tag-remove" onClick={function () {
                                                var items = (form.vaste_kosten || []).slice();
                                                items.splice(idx, 1);
                                                setField('vaste_kosten', items);
                                            }}>×</button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                            <div className="field" style={{ flex: 1 }}>
                                <label>Kostenpost</label>
                                <input value={vasteKostenInput.naam} onChange={function (e) { setVasteKostenInput(Object.assign({}, vasteKostenInput, { naam: e.target.value })); }}
                                    placeholder="bijv. Brandstof, Personeel" style={{ fontSize: 12, padding: '7px 10px' }} />
                            </div>
                            <div className="field" style={{ width: 100 }}>
                                <label>Bedrag €</label>
                                <input type="number" step="0.01" value={vasteKostenInput.bedrag}
                                    onChange={function (e) { setVasteKostenInput(Object.assign({}, vasteKostenInput, { bedrag: e.target.value })); }}
                                    placeholder="75" style={{ fontSize: 12, padding: '7px 10px' }} />
                            </div>
                            <button type="button" className="btn btn-brand btn-sm" style={{ height: 34 }} onClick={function () {
                                if (!vasteKostenInput.naam.trim()) return;
                                setField('vaste_kosten', (form.vaste_kosten || []).concat([{ naam: vasteKostenInput.naam.trim(), bedrag: parseFloat(vasteKostenInput.bedrag) || 0 }]));
                                setVasteKostenInput({ naam: '', bedrag: '' });
                            }}>+</button>
                        </div>
                    </div>

                    {/* ═══ PROFIT BREAKDOWN ═══ */}
                    {(function () {
                        var m = calcOfferteMargeData(form);
                        if (m.gasten === 0) return null;
                        var color = margeColor(m.margePct);
                        var barWidth = Math.min(100, Math.max(0, m.margePct));
                        return (
                            <div className="profit-breakdown">
                                <div className="profit-breakdown-head">
                                    <span style={{ fontWeight: 800, fontSize: 13 }}>📊 Profit Breakdown</span>
                                    <span className={'marge-badge marge-' + color}>{margeEmoji(m.margePct)} {m.margePct.toFixed(1)}% {margeLabel(m.margePct)}</span>
                                </div>
                                <div className="profit-breakdown-bar">
                                    <div className="profit-breakdown-fill" style={{ width: barWidth + '%', background: color === 'green' ? 'var(--green)' : color === 'orange' ? 'var(--amber)' : 'var(--red)' }}></div>
                                </div>
                                <div className="profit-breakdown-grid">
                                    <div className="profit-breakdown-cell">
                                        <div className="profit-breakdown-label">Omzet</div>
                                        <div className="profit-breakdown-value" style={{ color: 'var(--green)' }}>€{m.omzet.toFixed(2)}</div>
                                        <div className="profit-breakdown-sub">{m.gasten} gasten × €{m.prijsPP.toFixed(2)}</div>
                                    </div>
                                    <div className="profit-breakdown-cell">
                                        <div className="profit-breakdown-label">Foodcost</div>
                                        <div className="profit-breakdown-value" style={{ color: 'var(--red)' }}>-€{m.foodcostTotaal.toFixed(2)}</div>
                                        <div className="profit-breakdown-sub">€{m.foodcostPP.toFixed(2)} p.p.</div>
                                    </div>
                                    <div className="profit-breakdown-cell">
                                        <div className="profit-breakdown-label">Vaste Kosten</div>
                                        <div className="profit-breakdown-value" style={{ color: 'var(--amber)' }}>-€{m.vasteKosten.toFixed(2)}</div>
                                    </div>
                                    <div className="profit-breakdown-cell">
                                        <div className="profit-breakdown-label">Netto Winst</div>
                                        <div className="profit-breakdown-value" style={{ fontSize: 18, fontWeight: 900, color: m.nettoWinst >= 0 ? 'var(--green)' : 'var(--red)' }}>€{m.nettoWinst.toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {showWizardForExisting && <MenuWizard onComplete={handleWizardUpdateExisting} onClose={function () { setShowWizardForExisting(false); }} settings={settings} existingOfferte={form} />}
                </div>
            </div>
        );
    }

    // List
    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Offertes ({offertes.length})</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-brand" onClick={function () { setShowWizard(true); }} style={{ background: '#B48C14' }}><i className="fa-solid fa-utensils"></i> Stel Menu Samen</button>
                    <button className="btn btn-brand" onClick={newOfferte}><i className="fa-solid fa-plus"></i> Nieuwe Offerte</button>
                </div>
            </div>
            {showWizard && <MenuWizard onComplete={handleWizardComplete} onClose={function () { setShowWizard(false); }} settings={settings} />}
            <div className="panel">
                {offertes.length === 0 && <div className="empty-state"><i className="fa-solid fa-file-signature"></i><p>Nog geen offertes aangemaakt</p></div>}
                {offertes.map(function (o) {
                    var total = 0;
                    (o.items || []).forEach(function (item) { total += (item.qty || 0) * (item.prijs || 0); });
                    var pillMap = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', akkoord: 'pill-green', betaald: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };
                    var m = calcOfferteMargeData(o);
                    var hasMenu = (o.menu_selectie || []).length > 0;
                    return (
                        <div key={o.id} className="ev-row" onClick={function () { editOfferte(o); }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>{o.nummer}
                                    {hasMenu && m.gasten > 0 && <span className={'marge-badge marge-badge-sm marge-' + margeColor(m.margePct)}>{margeEmoji(m.margePct)} {m.margePct.toFixed(0)}%</span>}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.client_naam} — {fmtNl(o.datum)}</div>
                                {o.notitie && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{o.notitie}</div>}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                <span className={'pill ' + (pillMap[o.status] || 'pill-blue')}>{o.status}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
