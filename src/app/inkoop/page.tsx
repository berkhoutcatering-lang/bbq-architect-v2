/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/ConfirmDialog';
import { parseActions } from '@/lib/ai-actions';
import { fmt, resizeImage } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';
import { supabase } from '@/lib/supabase';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import PageHeader from '@/components/PageHeader';
import PageSection from '@/components/PageSection';
import { Camera, FileText, Flame, Info, Loader2, Phone, PlusCircle, Receipt, User, Wand2, X } from 'lucide-react';
import type { Leverancier, Inkooplijst, InventoryItem, Event as DbEvent, Offerte, Gerecht, Bon } from '@/types';

export default function Inkoop() {
    const { data: leveranciers, loading: levLoading, insert: insertLev, update: updateLev, remove: removeLev } = useSupabase<Leverancier>('leveranciers', []);
    const { data: inkooplijsten, insert: insertInk, update: updateInk, remove: removeInk } = useSupabase<Inkooplijst>('inkooplijsten', []);
    const { data: inventoryData } = useSupabase<InventoryItem>('inventory', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: bonnen, insert: insertBon } = useSupabase<Bon>('bonnen', []);
    const { settings } = useSettings();
    const showToast = useToast();
    const showConfirm = useConfirm();
    const [tab, setTab] = useState('leveranciers');
    const [editingLev, setEditingLev] = useState<string | number | null>(null);
    const [levForm, setLevForm] = useState<Record<string, any> | null>(null);
    const [expandedInk, setExpandedInk] = useState<number | null>(null);
    const [newInkEvent, setNewInkEvent] = useState('');
    const [newInkItem, setNewInkItem] = useState({ desc: '', qty: 1, eenheid: 'kg', leverancier: '' });
    const [boodschappenOfferte, setBoodschappenOfferte] = useState('');

    const [receiptScanning, setReceiptScanning] = useState(false);
    const [pendingActions, setPendingActions] = useState<any[]>([]);
    const [scanStatus, setScanStatus] = useState('');
    const [scanInsight, setScanInsight] = useState('');
    const [lastScanData, setLastScanData] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setReceiptScanning(true);
        setPendingActions([]);
        setScanInsight('');
        setScanStatus('FOTO OPTIMALISEREN...');

        const reader = new FileReader();
        reader.onload = async function (ev: ProgressEvent<FileReader>) {
            const rawB64 = ev.target!.result as string;
            const b64 = await resizeImage(rawB64, 1920, 2560, 0.92);

            setScanStatus('FACTUUR LEZEN — ELKE REGEL...');
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pageContext: '/inkoop',
                        contextData: { leveranciers: leveranciers },
                        messages: [{
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Lees deze factuur regel voor regel van boven naar beneden. Voor ELKE productregel maak je ONE ACTION-blok. Neem de tijd. Sla geen enkele regel over. Begin direct met het eerste <<<ACTION>>> blok.'
                                },
                                { type: 'image_url', image_url: { url: b64, detail: 'high' } }
                            ]
                        }]
                    })
                });
                const json = await res.json();
                if (json.error) throw new Error(json.error);
                const content = (json.choices && json.choices[0] && json.choices[0].message.content) || '';
                if (!content) {
                    setScanStatus('GEEN RESPONSE');
                    showToast('AI gaf geen tekst terug. Is de foto te wazig?', 'info');
                    setReceiptScanning(false);
                    return;
                }
                const { actions, cleanText } = parseActions(content);
                setScanInsight(cleanText);

                if (actions.length > 0) {
                    const aggregated: any[] = [];
                    actions.forEach((action: any) => {
                        if (action.type !== 'process_receipt') { aggregated.push(action); return; }
                        const item = action.data.items?.[0];
                        if (!item) { aggregated.push(action); return; }

                        const key = `${item.naam.toLowerCase().trim()}_${item.prijs}_${item.eenheid}`;
                        const existing = aggregated.find((a: any) => {
                            const eItem = a.data.items?.[0];
                            return eItem && `${eItem.naam.toLowerCase().trim()}_${eItem.prijs}_${eItem.eenheid}` === key;
                        });

                        if (existing) {
                            existing.data.items[0].aantal += item.aantal;
                            if (!existing.data.items[0].breakdown) existing.data.items[0].breakdown = [existing.data.items[0].aantal - item.aantal];
                            existing.data.items[0].breakdown.push(item.aantal);
                        } else {
                            const newAction = JSON.parse(JSON.stringify(action));
                            aggregated.push(newAction);
                        }
                    });

                    setPendingActions(aggregated);
                    setScanStatus('READY ✓ — ' + aggregated.length + ' GROEPEN');
                    setLastScanData({ b64, actions: aggregated, cleanText });
                    showToast('Bon geanalyseerd! ' + aggregated.length + ' groepen gevormd.', 'success');
                } else {
                    setScanStatus('GEEN ITEMS GEVONDEN');
                    showToast('Geen items herkend. Is de foto scherp genoeg?', 'info');
                }
            } catch (err: any) {
                setScanStatus('SCAN FOUT MET RECEPT');
                showToast('Fout: ' + err.message, 'error');
            }
            setReceiptScanning(false);
        };
        reader.readAsDataURL(file);
    }

    async function runAction(action: any) {
        try {
            await supabase.from(action.meta.table).insert(action.data);
            setPendingActions(prev => prev.filter(a => a.id !== action.id));
            showToast('Item ingeboekt: ' + action.description, 'success');
        } catch (err: any) {
            showToast('Fout bij inboeken: ' + err.message, 'error');
        }
    }

    async function saveToArchive() {
        if (!lastScanData) return;
        setScanStatus('ARCHIVEREN...');

        try {
            const winkel = lastScanData.actions[0]?.data?.winkel || 'Groothandel';
            const datum = lastScanData.actions[0]?.data?.datum || new Date().toISOString().split('T')[0];
            const totaal = lastScanData.actions[0]?.data?.totaal_bedrag || 0;

            const fileName = `bon_${Date.now()}.jpg`;
            const blob = await (await fetch(lastScanData.b64)).blob();
            const { data: uploadData, error: uploadError } = await supabase.storage.from('bonnen').upload(fileName, blob);

            const imageUrl = uploadData ? supabase.storage.from('bonnen').getPublicUrl(fileName).data.publicUrl : lastScanData.b64;

            await insertBon({
                winkel,
                datum,
                totaal_bedrag: totaal,
                image_url: imageUrl,
                raw_analysis: lastScanData.actions,
                notities: lastScanData.cleanText
            });

            showToast('Bon gearchiveerd in The Vault!', 'success');
            setLastScanData(null);
            setPendingActions([]);
            setScanInsight('');
        } catch (e: any) {
            console.error(e);
            showToast('Archiveren mislukt (Bucket "bonnen" bestaat wellicht niet)', 'warning');
        }
        setScanStatus('');
    }

    async function downloadReceiptPDF(bon: any) {
        const items = bon.raw_analysis?.flatMap((a: any) => a.data.items || []) || [];
        await generatePDF({
            type: 'receipt',
            winkel: bon.winkel,
            datum: bon.datum,
            totaal_bedrag: bon.totaal_bedrag,
            items: items,
            imageData: bon.image_url,
            settings: settings || {}
        });
    }

    function newLeverancier() { setEditingLev('new'); setLevForm({ naam: '', type: 'Overig', contact: '', email: '', tel: '' }); }
    function editLeverancier(l: Leverancier) { setEditingLev(l.id); setLevForm(JSON.parse(JSON.stringify(l))); }
    function saveLeverancier() {
        if (!levForm!.naam) { showToast('Vul een naam in', 'error'); return; }
        if (editingLev === 'new') {
            insertLev(levForm!).then(function () { showToast('Leverancier toegevoegd', 'success'); setEditingLev(null); });
        } else {
            const { id, ...rest } = levForm!;
            updateLev(editingLev as number, rest).then(function () { showToast('Bijgewerkt', 'success'); setEditingLev(null); });
        }
    }

    const boodOfferte = offertes.find(function (o) { return String(o.id) === boodschappenOfferte; });
    const winkelGroepen: Record<string, string[]> = { Sligro: [], Crisp: [], PLUS: [], Overig: [] };
    if (boodOfferte && boodOfferte.menu_selectie) {
        const menuSel: any = typeof boodOfferte.menu_selectie === 'string' ? JSON.parse(boodOfferte.menu_selectie) : boodOfferte.menu_selectie;
        Object.values(menuSel || {}).forEach(function (dishes: any) {
            (dishes || []).forEach(function (dishName: string) {
                const dish: any = gerechtenData.find(function (g) { return g.naam === dishName; });
                if (dish && dish.ingredienten) {
                    const winkels = dish.ingredienten_winkels || {};
                    dish.ingredienten.forEach(function (ing: string) {
                        const winkel = winkels[ing] || 'Overig';
                        if (!winkelGroepen[winkel]) winkelGroepen[winkel] = [];
                        if (winkelGroepen[winkel].indexOf(ing) < 0) winkelGroepen[winkel].push(ing);
                    });
                }
            });
        });
    }

    if (levLoading) {
        return (
            <div className="min-h-screen bg-[#121215] flex items-center justify-center">
                <Flame className="w-8 h-8 text-[#c4a35a] animate-pulse" />
            </div>
        );
    }

    return (
        <div className="artisan-page inkoop-page">
            <PageHeader title="Inkoop & Logistiek" description="Beheer leveranciers, boodschappen en bonnen" />

            <PageHint id="inkoop" title="Inkoop" description="Beheer inkooporders en leveranciers. Scan bonnen voor automatische verwerking." />

            <div className="tab-bar mb-24">
                <button className={'tab-btn' + (tab === 'leveranciers' ? ' active' : '')} onClick={() => setTab('leveranciers')}>LEVERANCIERS</button>
                <button className={'tab-btn' + (tab === 'inkooplijsten' ? ' active' : '')} onClick={() => setTab('inkooplijsten')}>LIJSTEN</button>
                <button className={'tab-btn' + (tab === 'boodschappen' ? ' active' : '')} onClick={() => setTab('boodschappen')}>BOODSCHAPPEN</button>
                <button className={'tab-btn' + (tab === 'bonnen' ? ' active' : '')} onClick={() => setTab('bonnen')}>BON-SCANNER</button>
                <button className={'tab-btn' + (tab === 'archief' ? ' active' : '')} onClick={() => setTab('archief')}>ARCHIEF</button>
            </div>

            {tab === 'leveranciers' && (
                <>
                {leveranciers.length === 0 && <EmptyState page="/inkoop" onAction={newLeverancier} />}
                <div className="grid-3">
                    <div className="artisan-panel" style={{ cursor: 'pointer', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 140 }} onClick={newLeverancier}>
                        <div style={{ textAlign: 'center' }}>
                            <PlusCircle size={24} style={{ color: 'var(--brand)' }} />
                            <div style={{ fontWeight: 800, fontSize: 12 }}>NIEUWE LEVERANCIER</div>
                        </div>
                    </div>
                    {leveranciers.map((l: any) => (
                        <div key={l.id} className="artisan-panel" onClick={() => editLeverancier(l)} style={{ cursor: 'pointer' }}>
                            <div style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 900, letterSpacing: 1, marginBottom: 8 }}>{l.type?.toUpperCase()}</div>
                            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 12 }}>{l.naam.toUpperCase()}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {l.contact && <div><User size={14} /> {l.contact}</div>}
                                {l.tel && <div><Phone size={14} /> {l.tel}</div>}
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}

            {tab === 'bonnen' && (
                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    <div className="artisan-panel" style={{ textAlign: 'center', padding: 48, marginBottom: 24 }}>
                        <Receipt size={48} style={{ color: 'var(--brand)' }} />
                        <h2 style={{ fontFamily: 'var(--font-artisan)', letterSpacing: 2, fontSize: 24, marginBottom: 16 }}>VISION INKOOP TRACKER</h2>
                        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8, maxWidth: 500, margin: '0 auto 8px' }}>
                            Scan je Sligro of Makro bon. De AI herkent items, hoeveelheden en prijzen.
                        </p>
                        <p style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 900, letterSpacing: 1, marginBottom: 32 }}>
                            <Info size={14} /> MOMENTEEL ENKEL FOTO'S & SCREENSHOTS (PDF WORDT NOG NIET ONDERSTEUND)
                        </p>

                        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleReceiptUpload} style={{ display: 'none' }} />

                        <button className="btn-brand" style={{ padding: '16px 40px', fontSize: 16 }} onClick={() => fileInputRef.current!.click()} disabled={receiptScanning}>
                            {receiptScanning ? (
                                <><Loader2 size={14} className="animate-spin" /> ANALYSEREN...</>
                            ) : (
                                <><Camera size={14} /> SCAN KASSABON</>
                            )}
                        </button>

                        {scanStatus && <div style={{ marginTop: 20, fontSize: 12, fontWeight: 900, color: 'var(--brand)', letterSpacing: 2 }}>{scanStatus}</div>}
                    </div>

                    {scanInsight && (
                        <div className="artisan-panel" style={{ marginBottom: 24, borderLeft: '4px solid var(--brand)', background: 'rgba(213, 178, 98, 0.05)' }}>
                            <div className="panel-head"><h3><Wand2 size={14} /> PITMASTER INSIGHT</h3></div>
                            <div className="panel-body" style={{ fontSize: 13, color: 'var(--white)', fontStyle: 'italic', lineHeight: 1.6 }}>
                                {scanInsight}
                            </div>
                        </div>
                    )}

                    {pendingActions.length > 0 && (
                        <div className="artisan-panel">
                            <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3>GEVONDEN ITEMS ({pendingActions.length})</h3>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="tab-btn" style={{ padding: '6px 12px', fontSize: 12, borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={saveToArchive}>SLA OP IN ARCHIEF</button>
                                    <button className="btn-brand" style={{ padding: '6px 12px', fontSize: 12 }} onClick={async () => {
                                        for (const a of [...pendingActions]) {
                                            try { await supabase.from(a.meta.table).insert(a.data); } catch (e) { console.error("Error inserting action:", e); }
                                        }
                                        setPendingActions([]);
                                        showToast('Alles ingeboekt!', 'success');
                                    }}>ALLES INBOEKEN</button>
                                </div>
                            </div>
                            <div className="panel-body">
                                {pendingActions.map((action: any) => (
                                    <div key={action.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, marginBottom: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--brand)' }}>{action.description.split(':').pop()?.trim().toUpperCase() || 'ITEM'}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                                                {(() => {
                                                    const item = action.data.items?.[0] || {};
                                                    const prijs = item.prijs || action.data.prijs || 0;
                                                    const aantal = item.aantal || action.data.aantal || 1;
                                                    const eenheid = item.eenheid || action.data.eenheid || 'stks';
                                                    const totaal = prijs * aantal;
                                                    const breakdown = item.breakdown ? `(${item.breakdown.join(' + ')}) ` : '';
                                                    return `${breakdown}€${prijs.toFixed(2)}/${eenheid} × ${aantal.toFixed(3)} ${eenheid} = €${totaal.toFixed(2)}`;
                                                })()}
                                            </div>
                                        </div>
                                        <button className="tab-btn" style={{ padding: '6px 16px', fontSize: 12, border: '1px solid var(--brand)', color: 'var(--brand)' }} onClick={async () => {
                                            try { await supabase.from(action.meta.table).insert(action.data); } catch (e) { console.error("Error inserting action:", e); }
                                            setPendingActions(prev => prev.filter(a => a.id !== action.id));
                                            showToast('Item ingeboekt', 'success');
                                        }}>BEVESTIG</button>
                                    </div>
                                ))}
                                <button className="tab-btn w-full mt-16" style={{ opacity: 0.5, fontSize: 12 }} onClick={() => setPendingActions([])}>WISSEN</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === 'archief' && (
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
                        {(bonnen || []).map((bon: any) => (
                            <div key={bon.id} className="artisan-panel" style={{ padding: 16 }}>
                                <div style={{ height: 120, background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 12, overflow: 'hidden', cursor: 'pointer' }} onClick={() => window.open(bon.image_url, '_blank')}>
                                    <img src={bon.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Bon" />
                                </div>
                                <div style={{ fontWeight: 900, fontSize: 14 }}>{bon.winkel.toUpperCase()}</div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>{bon.datum} • {fmt(bon.totaal_bedrag)}</div>
                                <button className="btn-brand w-full" style={{ padding: '8px', fontSize: 12 }} onClick={() => downloadReceiptPDF(bon)}>
                                    <FileText size={14} /> DOWNLOAD PDF RAPPORT
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {editingLev && (
                <div className="architect-modal-overlay">
                    <div className="architect-modal" style={{ maxWidth: 500 }}>
                        <div className="modal-head">
                            <h3>{editingLev === 'new' ? 'NIEUWE LEVERANCIER' : 'LEVERANCIER BEWERKEN'}</h3>
                            <button className="close-btn" onClick={() => setEditingLev(null)} aria-label="Sluiten"><X size={14} /></button>
                        </div>
                        <div className="modal-body">
                            <div className="field mb-16"><label>NAAM</label><input value={levForm!.naam} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLevForm({ ...levForm!, naam: e.target.value })} /></div>
                            <div className="field mb-16">
                                <label>TYPE</label>
                                <select value={levForm!.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLevForm({ ...levForm!, type: e.target.value })}>
                                    {['Vlees', 'Groente', 'Dranken', 'Overig'].map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="field mb-16"><label>CONTACTPERSOON</label><input value={levForm!.contact} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLevForm({ ...levForm!, contact: e.target.value })} /></div>
                            <div className="field mb-16"><label>TELEFOON</label><input value={levForm!.tel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLevForm({ ...levForm!, tel: e.target.value })} /></div>
                            <div className="field mb-24"><label>EMAIL</label><input value={levForm!.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLevForm({ ...levForm!, email: e.target.value })} /></div>

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
