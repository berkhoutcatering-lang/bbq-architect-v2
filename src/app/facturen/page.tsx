/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { fmt, fmtNl, calcLineTotals, today, addDays, genNummer, nextNummer } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { generatePDF } from '@/lib/pdfGenerator';
import { buildBrandingConfig } from '@/lib/branding';
import { downloadUBL } from '@/lib/ublExport';
import { facturenToCsv, downloadCsv } from '@/lib/csvExport';
import { mailFactuur, mailBetaalherinnering } from '@/lib/emailHelper';
import EmptyState from '@/components/EmptyState';
import FollowUpPrompt, { type FollowUpAction } from '@/components/FollowUpPrompt';
import type { Factuur } from '@/types';
import { ArrowLeft, Bell, Code, FileSpreadsheet, FileText, Loader2, Mail, Plus, Save, Trash2 } from 'lucide-react';

export default function Facturen() {
    const { data: facturen, loading, insert, update, remove } = useSupabase<Factuur>('facturen', []);
    const { settings } = useSettings();
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [editing, setEditing] = useState<string | number | null>(null);
    const [form, setForm] = useState<Record<string, any> | null>(null);
    const [filterStatus, setFilterStatus] = useState<string>('alle');
    const [searchQuery, setSearchQuery] = useState('');
    const [followUpActions, setFollowUpActions] = useState<FollowUpAction[] | null>(null);
    const [followUpTitle, setFollowUpTitle] = useState('');

    function newFactuur() {
        const nummer = nextNummer((settings && settings.factuur_prefix) || 'F2026-', facturen.map((f: any) => f.nummer));
        const betaaltermijn = (settings && settings.betaaltermijn) || 14;
        setEditing('new');
        setForm({ nummer: nummer, status: 'concept', client_naam: '', client_adres: '', datum: today(), vervaldatum: addDays(today(), betaaltermijn), items: [{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }] });
    }

    function editFactuur(f: Factuur) { setEditing(f.id); setForm(JSON.parse(JSON.stringify(f))); }

    function setField(key: string, val: any) { setForm(Object.assign({}, form, { [key]: val })); }

    function saveFactuur() {
        if (!form!.client_naam) { showToast('Vul een klantnaam in', 'error'); return; }
        const oldFactuur = facturen.find(function (f) { return f.id === editing; });
        const statusChanged = oldFactuur && oldFactuur.status !== form!.status && (form!.status === 'verzonden' || form!.status === 'betaald');
        if (editing === 'new') {
            insert(form!).then(function () {
                showToast('Factuur aangemaakt', 'success');
                setFollowUpTitle('Factuur aangemaakt!');
                setFollowUpActions([
                    { icon: '📧', label: 'Factuur versturen per email', onClick: function () { /* trigger email */ } },
                    { icon: '📄', label: 'PDF downloaden', onClick: function () { /* trigger PDF */ } },
                    { icon: '📊', label: 'Analytics bekijken', href: '/financien' },
                ]);
                setEditing(null); setForm(null);
            }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        } else {
            const { id, created_at, ...rest } = form!;
            update(editing as number, rest).then(function () {
                showToast('Factuur bijgewerkt', 'success');
                if (statusChanged) { drainInventory(form!); }
                setEditing(null); setForm(null);
            }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        }
    }

    function drainInventory(factuur: Record<string, any>) {
        supabase.from('inventory').select('*').then(function (res: any) {
            const items = res.data || [];
            if (items.length === 0) return;
            const deducted: string[] = [];
            (factuur.items || []).forEach(function (lineItem: any) {
                const desc = (lineItem.desc || '').toLowerCase();
                items.forEach(function (inv: any) {
                    if (desc.indexOf(inv.naam.toLowerCase()) >= 0) {
                        const newStock = Math.max(0, (inv.current_stock || 0) - (lineItem.qty || 0));
                        supabase.from('inventory').update({ current_stock: newStock }).eq('id', inv.id).then(function () { });
                        deducted.push(inv.naam + ' -' + lineItem.qty);
                    }
                });
            });
            if (deducted.length > 0) {
                showToast('📉 Voorraad afgetrokken: ' + deducted.join(', '), 'info');
            }
        });
    }

    function deleteFactuur() {
        showConfirm('Weet je zeker dat je deze factuur wilt verwijderen?', function () {
            remove(editing as number).then(function () { showToast('Factuur verwijderd', 'success'); setEditing(null); setForm(null); }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
        });
    }

    function addItem() { setField('items', (form!.items || []).concat([{ desc: '', qty: 1, prijs: 0, btw: (settings && settings.default_btw) || 21 }])); }
    function updateItem(idx: number, key: string, val: any) {
        const items = form!.items.map(function (item: any, i: number) { return i === idx ? Object.assign({}, item, { [key]: val }) : item; });
        setField('items', items);
    }
    function removeItem(idx: number) { setField('items', form!.items.filter(function (_: any, i: number) { return i !== idx; })); }

    function downloadFactuur() {
        const totals = calcLineTotals(form!.items);
        const branding = buildBrandingConfig(settings);
        generatePDF({ type: 'factuur', form: form, settings: settings, totals: totals, branding: branding });
    }

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <Loader2 size={32} className="animate-spin" style={{ marginBottom: 12, display: 'block' }} />
                Laden...
            </div>
        </div>
    );

    if (editing !== null && form) {
        const totals = calcLineTotals(form.items);
        return (
            <div className="panel">
                <div className="panel-head">
                    <h3>{editing === 'new' ? 'Nieuwe Factuur' : 'Factuur Bewerken'}</h3>
                    <button className="btn btn-ghost btn-sm" onClick={function () { setEditing(null); setForm(null); }}>
                        <ArrowLeft size={14} /> Terug
                    </button>
                </div>
                <div className="panel-body">
                    <div className="form-grid">
                        <div className="field"><label>Factuurnummer</label><input value={form.nummer} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('nummer', e.target.value); }} /></div>
                        <div className="field"><label>Status</label>
                            <select value={form.status} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('status', e.target.value); }}>
                                {['concept', 'verzonden', 'betaald', 'vervallen'].map(function (s) { return <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>; })}
                            </select>
                        </div>
                        <div className="field"><label>Klantnaam</label><input value={form.client_naam} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_naam', e.target.value); }} /></div>
                        <div className="field"><label>Klantadres</label><input value={form.client_adres} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('client_adres', e.target.value); }} /></div>
                        <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); }} /></div>
                        <div className="field"><label>Vervaldatum</label><input type="date" value={form.vervaldatum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('vervaldatum', e.target.value); }} /></div>
                    </div>
                    <div style={{ marginTop: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h4 style={{ fontSize: 14, fontWeight: 600 }}>Regels</h4>
                            <button className="btn btn-brand btn-sm" onClick={addItem}><Plus size={14} /> Regel</button>
                        </div>
                        <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Omschrijving</th><th style={{ width: 80 }}>Aantal</th><th style={{ width: 100 }}>Prijs</th><th style={{ width: 70 }}>BTW%</th><th style={{ width: 90 }}>Totaal</th><th style={{ width: 30 }}></th></tr></thead>
                            <tbody>
                                {(form.items || []).map(function (item: any, idx: number) {
                                    return (
                                        <tr key={idx}>
                                            <td><input value={item.desc} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'desc', e.target.value); }} /></td>
                                            <td><input type="number" value={item.qty} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'qty', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" step="0.01" value={item.prijs} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'prijs', parseFloat(e.target.value) || 0); }} /></td>
                                            <td><input type="number" value={item.btw} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { updateItem(idx, 'btw', parseFloat(e.target.value) || 0); }} /></td>
                                            <td style={{ fontWeight: 600 }}>{fmt((item.qty || 0) * (item.prijs || 0))}</td>
                                            <td><button className="del-btn" onClick={function () { removeItem(idx); }} aria-label="Regel verwijderen"><Trash2 size={14} /></button></td>
                                        </tr>
                                    );
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
                    {/* Aanbetaling tracking */}
                    {editing !== 'new' && (
                        <div style={{ marginTop: 16, padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.1em' }}>Betalingen</span>
                                <button className="btn btn-ghost btn-sm" onClick={function () {
                                    const betalingen = form!.betalingen || [];
                                    setField('betalingen', betalingen.concat([{ bedrag: 0, datum: today(), notitie: 'Aanbetaling' }]));
                                }} style={{ fontSize: 12 }}><Plus size={14} /> Betaling</button>
                            </div>
                            {(form!.betalingen || []).map(function (b: any, i: number) {
                                return (
                                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                        <input type="number" step="0.01" value={b.bedrag} onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                                            const bets = [...(form!.betalingen || [])]; bets[i] = Object.assign({}, bets[i], { bedrag: parseFloat(e.target.value) || 0 }); setField('betalingen', bets);
                                        }} style={{ width: 100, padding: '4px 8px', fontSize: 12, background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} placeholder="Bedrag" />
                                        <input type="date" value={b.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                                            const bets = [...(form!.betalingen || [])]; bets[i] = Object.assign({}, bets[i], { datum: e.target.value }); setField('betalingen', bets);
                                        }} style={{ padding: '4px 8px', fontSize: 12, background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
                                        <input value={b.notitie} onChange={function (e: React.ChangeEvent<HTMLInputElement>) {
                                            const bets = [...(form!.betalingen || [])]; bets[i] = Object.assign({}, bets[i], { notitie: e.target.value }); setField('betalingen', bets);
                                        }} style={{ flex: 1, padding: '4px 8px', fontSize: 12, background: 'var(--card-solid)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} placeholder="Notitie" />
                                        <button onClick={function () { const bets = [...(form!.betalingen || [])]; bets.splice(i, 1); setField('betalingen', bets); }}
                                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }}>✕</button>
                                    </div>
                                );
                            })}
                            {(function () {
                                const betaald = (form!.betalingen || []).reduce(function (s: number, b: any) { return s + (b.bedrag || 0); }, 0);
                                const openstaand = totals.totaal - betaald;
                                return (form!.betalingen || []).length > 0 ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, fontWeight: 600 }}>
                                        <span style={{ color: 'var(--green)' }}>Betaald: {fmt(betaald)}</span>
                                        <span style={{ color: openstaand > 0 ? 'var(--red)' : 'var(--green)' }}>Openstaand: {fmt(openstaand)}</span>
                                    </div>
                                ) : <div style={{ fontSize: 12, color: 'var(--muted-light)' }}>Geen betalingen geregistreerd</div>;
                            })()}
                        </div>
                    )}

                    <div className="editor-actions">
                        <button className="btn btn-brand" onClick={saveFactuur}><Save size={14} /> Opslaan</button>
                        <button className="btn btn-cyan" onClick={downloadFactuur}><FileText size={14} /> PDF</button>
                        <button className="btn btn-ghost" onClick={function () { mailFactuur(form, settings?.bedrijfsnaam || 'Hop & Bites'); }} title="Open email met factuur"><Mail size={14} /> Mail</button>
                        {form!.status === 'verzonden' && form!.vervaldatum && form!.vervaldatum < today() && (
                            <button className="btn btn-ghost" onClick={function () { mailBetaalherinnering(form, settings?.bedrijfsnaam || 'Hop & Bites'); }} title="Stuur betalingsherinnering" style={{ color: 'var(--red)' }}><Bell size={14} /> Herinnering</button>
                        )}
                        <button className="btn btn-ghost" onClick={function () { downloadUBL(form as unknown as Factuur, { leverancier: { naam: settings?.bedrijfsnaam || 'Hop & Bites', kvk: settings?.kvk || '', btw_nummer: settings?.btw || '', adres: settings?.adres || '', iban: settings?.iban || '' } }); showToast('UBL 2.0 XML gedownload'); }} title="UBL 2.0 e-factuur (Peppol)"><Code size={14} /> UBL</button>
                        {editing !== 'new' && <button className="btn btn-red" onClick={deleteFactuur}><Trash2 size={14} /> Verwijderen</button>}
                    </div>
                </div>
            </div>
        );
    }

    const filteredFacturen = facturen.filter(function (f) {
        if (filterStatus !== 'alle' && f.status !== filterStatus) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (f.client_naam || '').toLowerCase().includes(q) || (f.nummer || '').toLowerCase().includes(q);
        }
        return true;
    }).sort(function (a, b) { return (b.datum || '').localeCompare(a.datum || ''); });

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>Facturen ({filteredFacturen.length}{filteredFacturen.length !== facturen.length ? ' / ' + facturen.length : ''})</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={function () { downloadCsv(facturenToCsv(facturen), 'facturen-export.csv'); showToast('CSV gedownload'); }} title="Exporteer als CSV voor boekhouding"><FileSpreadsheet size={14} /> CSV</button>
                    <button className="btn btn-brand" onClick={newFactuur}><Plus size={14} /> Nieuwe Factuur</button>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    value={searchQuery}
                    onChange={function (e) { setSearchQuery(e.target.value); }}
                    placeholder="Zoek op klant of nummer..."
                    style={{ flex: 1, minWidth: 180, padding: '7px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                />
                {['alle', 'concept', 'verzonden', 'betaald', 'vervallen'].map(function (s) {
                    return <button key={s} className={'btn btn-sm ' + (filterStatus === s ? 'btn-brand' : 'btn-ghost')}
                        onClick={function () { setFilterStatus(s); }}
                        style={{ fontSize: 12, textTransform: 'capitalize' }}>{s}</button>;
                })}
            </div>
            <div className="panel">
                {facturen.length === 0 && <EmptyState page="/facturen" onAction={newFactuur} />}
                {filteredFacturen.map(function (f) {
                    let total = 0;
                    (f.items || []).forEach(function (item: any) { total += (item.qty || 0) * (item.prijs || 0); });
                    const pill = f.status === 'betaald' ? 'pill-green' : f.status === 'verzonden' ? 'pill-amber' : f.status === 'vervallen' ? 'pill-red' : 'pill-blue';
                    return (
                        <div key={f.id} className="ev-row" onClick={function () { editFactuur(f); }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, marginBottom: 2 }}>{f.nummer}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.client_naam} — {fmtNl(f.datum)}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>{fmt(total)}</div>
                                <span className={'pill ' + pill}>{f.status.charAt(0).toUpperCase() + f.status.slice(1)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Follow-Up Prompt */}
            {followUpActions && (
                <FollowUpPrompt
                    title={followUpTitle}
                    actions={followUpActions}
                    onDismiss={function () { setFollowUpActions(null); }}
                    autoHideMs={15000}
                />
            )}
        </>
    );
}
