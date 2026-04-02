/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import MenuWizard from '@/components/MenuWizard';
import type { Offerte, Factuur, Gerecht, InventoryItem } from '@/types';

export default function Offertes() {
    const { data: offertes, insert, update, remove } = useSupabase<Offerte>('offertes', []);
    const facturen = useSupabase<Factuur>('facturen', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const { settings } = useSettings();
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [showWizard, setShowWizard] = useState(false);
    const [showWizardForExisting, setShowWizardForExisting] = useState(false);
    const [vasteKostenInput, setVasteKostenInput] = useState<Record<string, any>>({ naam: '', bedrag: '' });

    function getInvPrice(naam: string) {
        const inv = inventoryData.find(function (i) { return i.naam && i.naam.toLowerCase() === naam.toLowerCase(); });
        return inv ? { price: inv.purchase_price || 0, unit: inv.unit || 'kg', yield_factor: inv.yield_factor || 1.0 } : null;
    }
    function calcDishCostPP(gerechtNaam: string) {
        const gerecht: any = gerechtenData.find(function (g) { return g.naam === gerechtNaam; });
        if (!gerecht || !gerecht.ingredient_costs) return 0;
        return (gerecht.ingredient_costs || []).reduce(function (sum: number, item: any) {
            const inv = getInvPrice(item.naam);
            const price = inv ? inv.price : 0;
            const yld = item.yield || (inv ? inv.yield_factor : 1.0) || 1.0;
            let unitFactor = 1;
            if (item.unit === 'g' && inv && inv.unit === 'kg') unitFactor = 0.001;
            if (item.unit === 'ml' && inv && inv.unit === 'L') unitFactor = 0.001;
            return sum + ((item.qty_pp || 0) * unitFactor / yld) * price;
        }, 0);
    }
    function calcOfferteMargeData(offerte: Record<string, any>) {
        try {
            const gasten = offerte.aantal_gasten || (offerte.items && offerte.items[0] ? offerte.items[0].qty : 0) || 0;
            const prijsPP = offerte.basis_prijs_pp || 38.50;
            const omzet = gasten * prijsPP;
            let menuGerechten = offerte.menu_selectie || [];
            if (!Array.isArray(menuGerechten)) menuGerechten = [];
            let foodcostPP = 0;
            menuGerechten.forEach(function (sel: any) {
                if (sel) foodcostPP += calcDishCostPP(sel.gerecht_naam || sel.naam || '');
            });
            const foodcostTotaal = foodcostPP * gasten;
            let vk = offerte.vaste_kosten;
            if (!Array.isArray(vk)) vk = [];
            const vasteKosten = vk.reduce(function (s: number, k: any) { return s + (parseFloat(k.bedrag) || 0); }, 0);
            const nettoWinst = omzet - foodcostTotaal - vasteKosten;
            const margePct = omzet > 0 ? (nettoWinst / omzet) * 100 : 0;
            return { gasten: gasten, prijsPP: prijsPP, omzet: omzet, foodcostPP: foodcostPP, foodcostTotaal: foodcostTotaal, vasteKosten: vasteKosten, nettoWinst: nettoWinst, margePct: margePct };
        } catch (e) {
            console.error('[MARGE] calcOfferteMargeData error:', e);
            return { gasten: 0, prijsPP: 38.50, omzet: 0, foodcostPP: 0, foodcostTotaal: 0, vasteKosten: 0, nettoWinst: 0, margePct: 0 };
        }
    }
    function margeColor(pct: number) { return pct > 70 ? 'green' : pct >= 60 ? 'orange' : 'red'; }
    function margeLabel(pct: number) { return pct > 70 ? 'Strong' : pct >= 60 ? 'Watchful' : 'Low Margin'; }
    function margeEmoji(pct: number) { return pct > 70 ? '🟢' : pct >= 60 ? '🟡' : '🔴'; }

    function handleWizardComplete(result: any) {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
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

    function handleWizardUpdateExisting(result: any) {
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
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), geldig_tot: addDays(today(), geldigDagen), notitie: '', items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editOfferte(o: Offerte) { setEditing(o.id); setForm(JSON.parse(JSON.stringify(o))); }
    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function syncQuoteToEvent(quoteId: number | string, quoteData: Record<string, any>) {
        console.log('[SYNC] ═══════════════════════════════════════');
        console.log('[SYNC] syncQuoteToEvent v2 called');
        console.log('[SYNC] Quote ID:', quoteId, '(type:', typeof quoteId + ')');
        console.log('[SYNC] Quote status:', quoteData.status);
        console.log('[SYNC] Quote client:', quoteData.client_naam);
        console.log('[SYNC] Quote datum:', quoteData.datum);

        if (!quoteId) {
            console.error('[SYNC] ABORT: No quote ID provided');
            return;
        }

        const qid = parseInt(String(quoteId), 10);
        if (isNaN(qid)) {
            console.error('[SYNC] ABORT: Invalid quote ID:', quoteId);
            return;
        }

        const newStatus = quoteData.status;

        let totalBedrag = 0;
        let estimatedGuests = 0;
        (quoteData.items || []).forEach(function (item: any) {
            totalBedrag += (item.qty || 0) * (item.prijs || 0);
            if ((item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
        });
        const ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;
        console.log('[SYNC] Calculated: guests=' + estimatedGuests + ', ppp=€' + ppp.toFixed(2) + ', totaal=€' + totalBedrag.toFixed(2));

        let eventStatus: string;
        if (newStatus === 'geaccepteerd' || newStatus === 'akkoord' || newStatus === 'betaald') {
            eventStatus = 'confirmed';
        } else if (newStatus === 'afgewezen' || newStatus === 'verlopen') {
            eventStatus = '__DELETE__';
        } else {
            eventStatus = 'optie';
        }
        console.log('[SYNC] Status mapping:', newStatus, '→', eventStatus);

        console.log('[SYNC] Step 1: Querying events WHERE offerte_id=' + qid);
        Promise.resolve(supabase.from('events').select('id, status, name').eq('offerte_id', qid))
            .then(function (res: any) {
                if (res.error) {
                    console.error('[SYNC] Step 1 FAILED:', res.error.message);
                    showToast('Sync fout: ' + res.error.message, 'error');
                    return;
                }

                const rows = res.data || [];
                console.log('[SYNC] Step 1 result: ' + rows.length + ' event(s) found', JSON.stringify(rows));

                if (rows.length > 1) {
                    console.warn('[SYNC] Multiple events found for offerte_id=' + qid + ', cleaning duplicates');
                    for (let i = 1; i < rows.length; i++) {
                        supabase.from('events').delete().eq('id', rows[i].id).then(function () { });
                    }
                }

                const existing = rows.length > 0 ? rows[0] : null;
                console.log('[SYNC] Step 2: Existing event?', existing ? 'YES (id=' + existing.id + ', status=' + existing.status + ')' : 'NO');

                if (eventStatus === '__DELETE__') {
                    if (existing) {
                        console.log('[SYNC] Step 3: DELETING event for afgewezen/verlopen offerte');
                        Promise.resolve(supabase.from('events').delete().eq('offerte_id', qid))
                            .then(function (d: any) {
                                if (d.error) {
                                    console.error('[SYNC] Delete failed:', d.error.message);
                                } else {
                                    console.log('[SYNC] Event deleted successfully');
                                    showToast('🗑️ Optie verwijderd uit Agenda', 'info');
                                }
                            })
                            .catch(function (e: any) { console.error('[SYNC] Delete catch:', e); });
                    } else {
                        console.log('[SYNC] No event to delete — skip');
                    }
                    console.log('[SYNC] ═══════════════════════════════════════');
                    return;
                }

                const payload: Record<string, any> = {
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
                    console.log('[SYNC] Step 4: UPDATING event id=' + existing.id);
                    Promise.resolve(supabase.from('events').update(payload).eq('id', existing.id).select())
                        .then(function (u: any) {
                            if (u.error) {
                                console.error('[SYNC] Update FAILED:', u.error.message, JSON.stringify(u.error));
                                showToast('Sync fout bij update: ' + u.error.message, 'error');
                            } else {
                                console.log('[SYNC] Event UPDATED successfully:', JSON.stringify(u.data));
                                const msg = eventStatus === 'confirmed'
                                    ? '✅ Agenda gesynchroniseerd — Event bevestigd!'
                                    : '📅 Agenda gesynchroniseerd met Offerte';
                                showToast(msg, 'success');
                            }
                        })
                        .catch(function (e: any) { console.error('[SYNC] Update catch:', e); });
                } else {
                    payload.offerte_id = qid;
                    payload.type = 'Zakelijk';
                    payload.menu = [];
                    console.log('[SYNC] Step 4: INSERTING new event');
                    console.log('[SYNC] Full insert payload:', JSON.stringify(payload));
                    Promise.resolve(supabase.from('events').insert(payload).select())
                        .then(function (ins: any) {
                            if (ins.error) {
                                console.error('[SYNC] Insert FAILED:', ins.error.message, JSON.stringify(ins.error));
                                showToast('Sync fout bij insert: ' + ins.error.message, 'error');
                            } else {
                                console.log('[SYNC] New event INSERTED:', JSON.stringify(ins.data));
                                showToast('📅 Agenda gesynchroniseerd — Optie toegevoegd!', 'success');
                            }
                        })
                        .catch(function (e: any) { console.error('[SYNC] Insert catch:', e); });
                }
                console.log('[SYNC] ═══════════════════════════════════════');
            })
            .catch(function (e: any) {
                console.error('[SYNC] Step 1 CATCH:', e);
                showToast('Sync fout: kon events niet ophalen', 'error');
            });
    }

    function saveOfferte() {
        if (!form!.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        if (!form!.items || form!.items.length === 0) { showToast('Voeg minstens één regel toe', 'error'); return; }
        if (!form!.datum) { showToast('Vul een datum in', 'error'); return; }
        console.log('[SAVE] ═══════════════════════════════════════');
        console.log('[SAVE] editing=', editing, 'status=', form!.status);

        if (editing === 'new') {
            console.log('[SAVE] Inserting new offerte...');
            insert(form!).then(function (insertedRow: any) {
                console.log('[SAVE] Insert returned:', JSON.stringify(insertedRow));
                showToast('Offerte aangemaakt', 'success');

                const newId = insertedRow && insertedRow.id ? insertedRow.id : null;
                console.log('[SAVE] Extracted ID:', newId);

                if (newId) {
                    syncQuoteToEvent(newId, form!);
                } else {
                    console.log('[SAVE] No ID from insert — trying direct DB lookup');
                    Promise.resolve(supabase.from('offertes').select('id').eq('nummer', form!.nummer).order('id', { ascending: false }).limit(1))
                        .then(function (lookup: any) {
                            console.log('[SAVE] Lookup result:', JSON.stringify(lookup.data), 'error:', lookup.error);
                            if (lookup.data && lookup.data.length > 0) {
                                console.log('[SAVE] Found offerte via lookup, id=' + lookup.data[0].id);
                                syncQuoteToEvent(lookup.data[0].id, form!);
                            } else {
                                console.error('[SAVE] Could not find offerte ID — sync skipped');
                            }
                        })
                        .catch(function (e: any) { console.error('[SAVE] Lookup catch:', e); });
                }

                setEditing(null); setForm(null);
            }).catch(function (err: any) {
                console.error('[SAVE] Insert error:', err);
                showToast('Fout bij aanmaken: ' + (err.message || ''), 'error');
            });
        } else {
            console.log('[SAVE] Updating offerte id=', editing);
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () {
                showToast('Offerte bijgewerkt', 'success');
                console.log('[SAVE] Update done, calling syncQuoteToEvent with id=', editing);
                syncQuoteToEvent(editing as number, form!);
                setEditing(null); setForm(null);
            }).catch(function (err: any) {
                console.error('[SAVE] Update error:', err);
                showToast('Fout bij opslaan: ' + (err.message || ''), 'error');
            });
        }
        console.log('[SAVE] ═══════════════════════════════════════');
    }

    function deleteOfferte() {
        showConfirm('Weet je zeker dat je deze offerte wilt verwijderen?', function () {
            console.log('[DELETE] Deleting offerte id=', editing, '— also removing linked event');
            supabase.from('events').delete().eq('offerte_id', editing).then(function (res: any) {
                if (res.error) console.error('[DELETE] Event delete error:', res.error);
                else console.log('[DELETE] Linked event removed');
            });
            remove(editing as number).then(function () { showToast('Offerte verwijderd', 'success'); setEditing(null); setForm(null); });
        });
    }

    function convertToFactuur() {
        const betaaltermijn = (settings && settings.betaaltermijn) || 14;
        const factuurNum = genNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.data.length + 1);
        const factuurData = {
            nummer: factuurNum,
            status: 'concept' as const,
            client_naam: form!.client_naam,
            client_adres: form!.client_adres,
            datum: today(),
            vervaldatum: addDays(today(), betaaltermijn),
            items: form!.items
        };
        facturen.insert(factuurData).then(function () {
            const { id, created_at, ...rest } = Object.assign({}, form, { status: 'geaccepteerd' as const });
            update(editing as number, rest).then(function () {
                showToast('Factuur aangemaakt vanuit offerte', 'success');
                syncQuoteToEvent(editing as number, Object.assign({}, form, { status: 'geaccepteerd' }));
                setEditing(null); setForm(null);
            });
        });
    }

    function addItem() { setField('items', (form!.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx: number, key: string, val: any) {
        const items = form!.items.map(function (item: any, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx: number) { setField('items', form!.items.filter(function (_: any, i: number) { return i !== idx; })); }

    function downloadOfferte() {
        const totals = calcLineTotals(form!.items);
        generatePDF({ type: 'offerte', form: form, settings: settings, totals: totals });
    }

    if (editing !== null && form) {
        const totals = calcLineTotals(form.items);
        const pillMap: Record<string, string> = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };

        let syncMsg = '📅 Opslaan synchroniseert automatisch met de Agenda';
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
                        <div className="field"><label>Offertenummer</label><input value={form.nummer} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'geaccepteerd', 'akkoord', 'betaald', 'afgewezen', 'verlopen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Geldig Tot</label><input type="date" value={form.geldig_tot} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('geldig_tot', e.target.value); }} /></div>
                        <div className="field full"><label>Notitie</label><textarea rows={2} value={form.notitie || ''} onChange={function (e: React.ChangeEvent<HTMLTextAreaElement>) { setField('notitie', e.target.value); }} /></div>
                    </div>

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
                                {(form.items || []).map(function (item: any, idx: number) {
                                    return <tr key={idx}>
                                        <td><input value={item.desc} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                        <td><input type="number" value={item.qty} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" step="0.01" value={item.prijs} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                        <td><input type="number" value={item.btw} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
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
                        {editing !== 'new' && (
                            <button className="btn" style={{ background: '#8b5cf6', color: '#fff' }} onClick={function () {
                                const link = window.location.origin + '/q/' + editing;
                                navigator.clipboard.writeText(link);
                                showToast('Magic Link gekopieerd!', 'success');
                            }}>
                                <i className="fa-solid fa-link"></i> Magic Link
                            </button>
                        )}
                        {editing !== 'new' && form.status === 'geaccepteerd' && <button className="btn btn-green" onClick={convertToFactuur}><i className="fa-solid fa-file-invoice"></i> Naar Factuur</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteOfferte}><i className="fa-solid fa-trash"></i> Verwijderen</button>}
                    </div>

                    <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#B48C14', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
                            ⚙️ Vaste Kosten per Event
                        </div>
                        {(form.vaste_kosten || []).length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                                {(form.vaste_kosten || []).map(function (k: any, idx: number) {
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(180,140,20,.04)', borderRadius: 8, border: '1px solid rgba(180,140,20,.1)' }}>
                                            <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{k.naam}</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>€{(parseFloat(k.bedrag) || 0).toFixed(2)}</span>
                                            <button type="button" className="tag-remove" onClick={function () {
                                                const items = (form.vaste_kosten || []).slice();
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
                                <input value={vasteKostenInput.naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setVasteKostenInput(Object.assign({}, vasteKostenInput, { naam: e.target.value })); }}
                                    placeholder="bijv. Brandstof, Personeel" style={{ fontSize: 12, padding: '7px 10px' }} />
                            </div>
                            <div className="field" style={{ width: 100 }}>
                                <label>Bedrag €</label>
                                <input type="number" step="0.01" value={vasteKostenInput.bedrag}
                                    onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setVasteKostenInput(Object.assign({}, vasteKostenInput, { bedrag: e.target.value })); }}
                                    placeholder="75" style={{ fontSize: 12, padding: '7px 10px' }} />
                            </div>
                            <button type="button" className="btn btn-brand btn-sm" style={{ height: 34 }} onClick={function () {
                                if (!vasteKostenInput.naam.trim()) return;
                                setField('vaste_kosten', (form.vaste_kosten || []).concat([{ naam: vasteKostenInput.naam.trim(), bedrag: parseFloat(vasteKostenInput.bedrag) || 0 }]));
                                setVasteKostenInput({ naam: '', bedrag: '' });
                            }}>+</button>
                        </div>
                    </div>

                    {(function () {
                        const m = calcOfferteMargeData(form);
                        if (m.gasten === 0) return null;
                        const color = margeColor(m.margePct);
                        const barWidth = Math.min(100, Math.max(0, m.margePct));
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
                    let total = 0;
                    (o.items || []).forEach(function (item: any) { total += (item.qty || 0) * (item.prijs || 0); });
                    const pillMap: Record<string, string> = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', akkoord: 'pill-green', betaald: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };
                    const m = calcOfferteMargeData(o as any);
                    const hasMenu = (o.menu_selectie as any[] || []).length > 0;
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
