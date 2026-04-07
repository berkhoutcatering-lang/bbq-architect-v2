/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import { mailOfferte } from '@/lib/emailHelper';
import { offertesToCsv, downloadCsv } from '@/lib/csvExport';
import MenuWizard from '@/components/MenuWizard';
import MenuBuilder from '@/components/MenuBuilder';
import KlantAutocomplete from '@/components/KlantAutocomplete';
import EmptyState from '@/components/EmptyState';
import { runAcceptanceWorkflow } from '@/lib/acceptance-workflow';
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
    const [showMenuBuilder, setShowMenuBuilder] = useState(false);
    const [vasteKostenInput, setVasteKostenInput] = useState<Record<string, any>>({ naam: '', bedrag: '' });
    const [filterStatus, setFilterStatus] = useState<string>('alle');
    const [sortField, setSortField] = useState<string>('datum');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

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
    function margeLabel(pct: number) { return pct > 70 ? 'Sterk' : pct >= 60 ? 'Aandacht' : 'Lage marge'; }
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

    async function syncQuoteToEvent(quoteId: number | string, quoteData: Record<string, any>): Promise<number | null> {
        console.log('[SYNC] ═══════════════════════════════════════');
        console.log('[SYNC] syncQuoteToEvent v3 (async) called');
        console.log('[SYNC] Quote ID:', quoteId, '(type:', typeof quoteId + ')');
        console.log('[SYNC] Quote status:', quoteData.status);

        if (!quoteId) { console.error('[SYNC] ABORT: No quote ID'); return null; }

        const qid = parseInt(String(quoteId), 10);
        if (isNaN(qid)) { console.error('[SYNC] ABORT: Invalid ID:', quoteId); return null; }

        const newStatus = quoteData.status;

        let totalBedrag = 0;
        let estimatedGuests = quoteData.aantal_gasten || 0;
        (quoteData.items || []).forEach(function (item: any) {
            totalBedrag += (item.qty || 0) * (item.prijs || 0);
            if (!estimatedGuests && (item.qty || 0) > estimatedGuests) estimatedGuests = item.qty || 0;
        });
        const ppp = estimatedGuests > 0 ? totalBedrag / estimatedGuests : 45;
        console.log('[SYNC] Calculated: guests=' + estimatedGuests + ', ppp=' + ppp.toFixed(2));

        let eventStatus: string;
        if (newStatus === 'geaccepteerd' || newStatus === 'akkoord' || newStatus === 'betaald') {
            eventStatus = 'confirmed';
        } else if (newStatus === 'afgewezen' || newStatus === 'verlopen') {
            eventStatus = '__DELETE__';
        } else {
            eventStatus = 'optie';
        }

        try {
            const res = await supabase.from('events').select('id, status, name').eq('offerte_id', qid);
            if (res.error) {
                console.error('[SYNC] Query failed:', res.error.message);
                showToast('Sync fout: ' + res.error.message, 'error');
                return null;
            }

            const rows = res.data || [];
            console.log('[SYNC] Found ' + rows.length + ' event(s)');

            // Clean duplicates
            if (rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                    await supabase.from('events').delete().eq('id', rows[i].id);
                }
            }

            const existing = rows.length > 0 ? rows[0] : null;

            // Delete event if offerte rejected/expired
            if (eventStatus === '__DELETE__') {
                if (existing) {
                    await supabase.from('events').delete().eq('offerte_id', qid);
                    showToast('🗑️ Optie verwijderd uit Agenda', 'info');
                }
                return null;
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

            if (existing) {
                const u = await supabase.from('events').update(payload).eq('id', existing.id).select();
                if (u.error) {
                    console.error('[SYNC] Update FAILED:', u.error.message);
                    showToast('Sync fout bij update: ' + u.error.message, 'error');
                    return existing.id;
                }
                const msg = eventStatus === 'confirmed'
                    ? '✅ Agenda gesynchroniseerd — Event bevestigd!'
                    : '📅 Agenda gesynchroniseerd met Offerte';
                showToast(msg, 'success');
                console.log('[SYNC] Event UPDATED id=' + existing.id);
                return existing.id;
            } else {
                payload.offerte_id = qid;
                payload.type = 'Zakelijk';
                payload.menu = [];
                const ins = await supabase.from('events').insert(payload).select();
                if (ins.error) {
                    console.error('[SYNC] Insert FAILED:', ins.error.message);
                    showToast('Sync fout bij insert: ' + ins.error.message, 'error');
                    return null;
                }
                const newEventId = ins.data && ins.data[0] ? ins.data[0].id : null;
                showToast('📅 Agenda gesynchroniseerd — Optie toegevoegd!', 'success');
                console.log('[SYNC] Event INSERTED id=' + newEventId);
                return newEventId;
            }
        } catch (e: any) {
            console.error('[SYNC] Error:', e);
            showToast('Sync fout: kon events niet ophalen', 'error');
            return null;
        }
    }

    async function triggerWorkflowIfAccepted(eventId: number | null, formData: Record<string, any>) {
        const isAccepted = formData.status === 'geaccepteerd' || formData.status === 'akkoord' || formData.status === 'betaald';
        if (!isAccepted || !eventId) return;

        console.log('[SAVE] Status is ' + formData.status + ' — triggering acceptance workflow for event ' + eventId);
        try {
            const result = await runAcceptanceWorkflow({
                eventId: eventId,
                offerteData: formData,
                settings: settings,
                facturenCount: facturen.data.length
            });

            // Show toast per sub-task
            if (result.factuur.success) showToast('✅ ' + result.factuur.message, 'success');
            else showToast('⚠️ ' + result.factuur.message, 'error');

            if (result.prep.success && result.prep.count > 0) showToast('✅ ' + result.prep.message, 'success');
            else if (!result.prep.success) showToast('⚠️ ' + result.prep.message, 'error');

            if (result.inkoop.success) showToast('✅ ' + result.inkoop.message, 'success');
            else showToast('⚠️ ' + result.inkoop.message, 'error');

            if (result.haccp.success && result.haccp.count > 0) showToast('✅ ' + result.haccp.message, 'success');
            else if (!result.haccp.success) showToast('⚠️ ' + result.haccp.message, 'error');
        } catch (e: any) {
            console.error('[SAVE] Workflow error:', e);
            showToast('Workflow fout: ' + (e.message || ''), 'error');
        }
    }

    function validateOfferte(): boolean {
        const e: Record<string, string> = {};
        if (!form!.client_naam) e.client_naam = 'Vul een klantnaam in';
        if (!form!.datum) e.datum = 'Vul een datum in';
        if (!form!.items || form!.items.length === 0) e.items = 'Voeg minstens één regel toe';
        setErrors(e);
        return Object.keys(e).length === 0;
    }

    async function saveOfferte() {
        if (!validateOfferte()) return;
        console.log('[SAVE] ═══════════════════════════════════════');
        console.log('[SAVE] editing=', editing, 'status=', form!.status);

        try {
            let quoteId: number | string | null = null;

            if (editing === 'new') {
                console.log('[SAVE] Inserting new offerte...');
                const insertedRow: any = await insert(form!);
                showToast('Offerte aangemaakt', 'success');

                quoteId = insertedRow && insertedRow.id ? insertedRow.id : null;
                if (!quoteId) {
                    console.log('[SAVE] No ID from insert — trying DB lookup');
                    const lookup: any = await supabase.from('offertes').select('id').eq('nummer', form!.nummer).order('id', { ascending: false }).limit(1);
                    if (lookup.data && lookup.data.length > 0) {
                        quoteId = lookup.data[0].id;
                    }
                }
            } else {
                console.log('[SAVE] Updating offerte id=', editing);
                const { id, created_at, ...rest } = form!;
                await update(editing as number, rest);
                showToast('Offerte bijgewerkt', 'success');
                quoteId = editing as number;
            }

            // Sync to event and get event_id back
            const eventId = quoteId ? await syncQuoteToEvent(quoteId, form!) : null;

            // Trigger acceptance workflow if status warrants it
            await triggerWorkflowIfAccepted(eventId, form!);

            setEditing(null); setForm(null);
        } catch (err: any) {
            console.error('[SAVE] Error:', err);
            showToast('Fout bij opslaan: ' + (err.message || ''), 'error');
        }
        console.log('[SAVE] ═══════════════════════════════════════');
    }

    function duplicateOfferte(o: Record<string, any>) {
        const geldigDagen = (settings && settings.offerte_geldig) || 30;
        const nummer = genNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.length + 1);
        const copy = JSON.parse(JSON.stringify(o));
        delete copy.id;
        delete copy.created_at;
        copy.nummer = nummer;
        copy.status = 'concept';
        copy.datum = today();
        copy.geldig_tot = addDays(today(), geldigDagen);
        setEditing('new');
        setForm(copy);
        showToast('Offerte gedupliceerd — pas details aan en sla op', 'info');
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

    async function convertToFactuur() {
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
        await facturen.insert(factuurData);
        const { id, created_at, ...rest } = Object.assign({}, form, { status: 'geaccepteerd' as const });
        await update(editing as number, rest);
        showToast('Factuur aangemaakt vanuit offerte', 'success');
        const eventId = await syncQuoteToEvent(editing as number, Object.assign({}, form, { status: 'geaccepteerd' }));
        // Trigger remaining workflow tasks (prep, inkoop, haccp) — factuur already created manually
        if (eventId) {
            await triggerWorkflowIfAccepted(eventId, Object.assign({}, form, { status: 'geaccepteerd' }));
        }
        setEditing(null); setForm(null);
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
    function downloadMenukaart() {
        generatePDF({ type: 'menukaart', form: form, settings: settings, gerechten: gerechtenData });
    }

    if (editing !== null && form) {
        const totals = calcLineTotals(form.items);
        const pillMap: Record<string, string> = { concept: 'pill-blue', verzonden: 'pill-amber', geaccepteerd: 'pill-green', afgewezen: 'pill-red', verlopen: 'pill-red' };

        let syncMsg = '📅 Opslaan synchroniseert automatisch met de Agenda';
        if (form.status === 'geaccepteerd' || form.status === 'akkoord' || form.status === 'betaald') syncMsg = '✅ Event bevestigd in Agenda — Groene glow actief';
        else if (form.status === 'afgewezen' || form.status === 'verlopen') syncMsg = '🗑️ Optie wordt verwijderd uit Agenda bij opslaan';

        return (
            <div className="hopbites-theme panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Offerte' : 'Offerte Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}><i className="fa-solid fa-arrow-left"></i> Terug</button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Offertenummer</label><input value={form.nummer} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                {[['concept', 'Concept'], ['verzonden', 'Verzonden'], ['geaccepteerd', 'Geaccepteerd'], ['afgewezen', 'Afgewezen'], ['verlopen', 'Verlopen'], ['geannuleerd', 'Geannuleerd']].map(function (s) { return <option key={s[0]} value={s[0]}>{s[1]}</option>; })}
                            </select>
                        </div>
                        <KlantAutocomplete
                            label="Klantnaam"
                            value={form.client_naam}
                            onChange={function (v) { setField('client_naam', v); setErrors(Object.assign({}, errors, { client_naam: '' })); }}
                            onSelect={function (k) { setField('client_naam', k.naam); setField('client_adres', [k.adres, k.postcode, k.plaats].filter(Boolean).join(', ')); }}
                            error={errors.client_naam}
                        />
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); setErrors(Object.assign({}, errors, { datum: '' })); }} style={errors.datum ? { borderColor: 'var(--red)' } : {}} />{errors.datum && <span style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, display: 'block' }}>{errors.datum}</span>}</div>
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
                        <div className="tbl-wrap">
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
                        </div>
                        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 14 }}>
                            <div style={{ color: 'var(--muted)' }}>Subtotaal: {fmt(totals.subtotaal)}</div>
                            <div style={{ color: 'var(--muted)' }}>BTW: {fmt(totals.btw)}</div>
                            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>Totaal: {fmt(totals.totaal)}</div>
                        </div>
                    </div>
                    <div className="editor-actions">
                        <button className="btn-gold" onClick={saveOfferte} title="Sla de offerte op en synchroniseer met de agenda"><i className="fa-solid fa-save"></i> Opslaan</button>
                        <button className="btn-gold-outline" onClick={function () { setShowWizardForExisting(true); }} title="Stapsgewijs een menu samenstellen per gang"><i className="fa-solid fa-utensils"></i> Menu Wizard</button>
                        <button className="btn btn-ghost" onClick={function () { setShowMenuBuilder(true); }} title="Sleep gerechten naar het menu met drag & drop"><i className="fa-solid fa-grip"></i> Menu Builder</button>
                        <button className="btn btn-ghost" onClick={async function () { const res = await mailOfferte(form, settings?.bedrijfsnaam || 'Hop & Bites'); showToast(res.fallback ? 'Mailto geopend — stel RESEND_API_KEY in .env in voor directe verzending' : res.success ? 'Offerte verstuurd!' : 'Fout: ' + res.error, res.success ? 'success' : 'error'); }}><i className="fa-solid fa-envelope"></i> Mail</button>
                        <button className="btn btn-cyan" onClick={downloadOfferte} title="Download de offerte als PDF met prijzen en regels"><i className="fa-solid fa-file-pdf"></i> PDF</button>
                        <button className="btn" style={{ background: 'rgba(15,15,15,.85)', color: '#b2913e', border: '1px solid #b2913e' }} onClick={downloadMenukaart} title="Download een printbare menukaart zonder prijzen"><i className="fa-solid fa-utensils"></i> Menukaart</button>
                        {editing !== 'new' && (
                            <button className="btn" style={{ background: '#8b5cf6', color: '#fff' }} onClick={function () {
                                const link = window.location.origin + '/q/' + editing;
                                navigator.clipboard.writeText(link);
                                showToast('Magic Link gekopieerd!', 'success');
                            }} title="Kopieer een link die de klant kan openen om de offerte te bekijken">
                                <i className="fa-solid fa-link"></i> Magic Link
                            </button>
                        )}
                        {editing !== 'new' && form.status === 'geaccepteerd' && <button className="btn btn-green" onClick={convertToFactuur} title="Zet deze geaccepteerde offerte om naar een factuur"><i className="fa-solid fa-file-invoice"></i> Naar Factuur</button>}
                        {editing !== 'new' && <button className="btn btn-ghost" onClick={function () { duplicateOfferte(form); }} title="Maak een kopie van deze offerte als nieuw concept"><i className="fa-solid fa-copy"></i> Dupliceer</button>}
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteOfferte} title="Verwijder deze offerte permanent"><i className="fa-solid fa-trash"></i> Verwijderen</button>}
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
                    <MenuBuilder
                        open={showMenuBuilder}
                        onClose={function () { setShowMenuBuilder(false); }}
                        onApply={function (menuSel) {
                            setField('menu_selectie', menuSel);
                            showToast('Menu bijgewerkt via Builder', 'success');
                        }}
                        initialMenu={typeof form.menu_selectie === 'object' && !Array.isArray(form.menu_selectie) ? form.menu_selectie : {}}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="hopbites-theme">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap' as const, gap: 12 }}>
                <div>
                    <div className="hb-subtitle" style={{ marginBottom: 4 }}>BBQ Architect</div>
                    <h3 className="hb-title" style={{ fontSize: 20 }}>Offertes ({offertes.length})</h3>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <button className="btn btn-ghost btn-sm" onClick={function () { downloadCsv(offertesToCsv(offertes), 'offertes-export.csv'); showToast('CSV gedownload'); }} title="Exporteer als CSV voor boekhouding"><i className="fa-solid fa-file-csv"></i> CSV</button>
                    <button className="btn-gold-outline" onClick={function () { setShowWizard(true); }}><i className="fa-solid fa-utensils"></i> Stel Menu Samen</button>
                    <button className="btn-gold" onClick={newOfferte}><i className="fa-solid fa-plus"></i> Nieuwe Offerte</button>
                </div>
            </div>
            {showWizard && <MenuWizard onComplete={handleWizardComplete} onClose={function () { setShowWizard(false); }} settings={settings} />}
            <div style={{ marginBottom: 12 }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op klant of nummer..."
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginBottom: 8 }}
                />
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as any }}>
                    {['alle', 'concept', 'verzonden', 'geaccepteerd', 'betaald', 'afgewezen'].map(function (s) {
                        return <button key={s} className={'btn btn-sm ' + (filterStatus === s ? 'btn-brand' : 'btn-ghost')}
                            onClick={function () { setFilterStatus(s); }}
                            style={{ fontSize: 11, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>;
                    })}
                </div>
                <select value={sortField + '_' + sortDir} onChange={function (e) {
                    const [f, d] = e.target.value.split('_');
                    setSortField(f); setSortDir(d as 'asc' | 'desc');
                }} style={{ padding: '6px 10px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', marginTop: 6 }}>
                    <option value="datum_desc">Datum (nieuwste eerst)</option>
                    <option value="datum_asc">Datum (oudste eerst)</option>
                    <option value="totaal_desc">Bedrag (hoog-laag)</option>
                    <option value="totaal_asc">Bedrag (laag-hoog)</option>
                    <option value="client_naam_asc">Klant (A-Z)</option>
                </select>
            </div>
            <div className="panel">
                {offertes.length === 0 && <EmptyState page="/offertes" onAction={newOfferte} />}
                {offertes.filter(function (o) {
                    if (filterStatus !== 'alle' && o.status !== filterStatus) return false;
                    if (searchQuery) {
                        const q = searchQuery.toLowerCase();
                        return (o.client_naam || '').toLowerCase().includes(q) || (o.nummer || '').toLowerCase().includes(q);
                    }
                    return true;
                }).sort(function (a, b) {
                    if (sortField === 'datum') {
                        return sortDir === 'asc' ? (a.datum || '').localeCompare(b.datum || '') : (b.datum || '').localeCompare(a.datum || '');
                    }
                    if (sortField === 'client_naam') {
                        return sortDir === 'asc' ? (a.client_naam || '').localeCompare(b.client_naam || '') : (b.client_naam || '').localeCompare(a.client_naam || '');
                    }
                    if (sortField === 'totaal') {
                        const ta = (a.items || []).reduce(function (s: number, i: any) { return s + (i.qty || 0) * (i.prijs || 0); }, 0);
                        const tb = (b.items || []).reduce(function (s: number, i: any) { return s + (i.qty || 0) * (i.prijs || 0); }, 0);
                        return sortDir === 'asc' ? ta - tb : tb - ta;
                    }
                    return 0;
                }).map(function (o) {
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
                                {o.notitie && (function () {
                                    const txt = String(o.notitie);
                                    const gangIdx = txt.search(/GANG\s*\d|Normaal Menu:|Dieet Menu:|Totaalprijs/i);
                                    const opmerking = gangIdx > 0 ? txt.substring(0, gangIdx).trim() : (gangIdx === 0 ? '' : txt.trim());
                                    return opmerking ? <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{opmerking.length > 80 ? opmerking.substring(0, 80) + '...' : opmerking}</div> : null;
                                })()}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                <span className={'pill ' + (pillMap[o.status] || 'pill-blue')}>{o.status.charAt(0).toUpperCase() + o.status.slice(1)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
