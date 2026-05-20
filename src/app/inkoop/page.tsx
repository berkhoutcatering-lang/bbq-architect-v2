/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import React, { useState } from 'react';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmt } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { FileText, Phone, PlusCircle, User, X } from 'lucide-react';
import PageGuideNote from '@/components/PageGuideNote';
import { ShoppingCart } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { LoadingState } from '@/components/LoadingState';
import type { Leverancier, Inkooplijst, InventoryItem, Event as DbEvent, Offerte, Gerecht, Bon } from '@/types';
import { RequireTier } from '@/components/PaywallPrompt';
import BestelvoorstelLaan from '@/app/inkoop/_components/BestelvoorstelLaan';
import Scanner from '@/app/inkoop/_components/Scanner';

export default function Inkoop() {
    const { data: leveranciers, loading: levLoading, insert: insertLev, update: updateLev } = useSupabase<Leverancier>('leveranciers', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const { data: gerechtenData } = useSupabase<Gerecht>('gerechten', []);
    const { data: bonnen } = useSupabase<Bon>('bonnen', []);
    const { settings } = useSettings();
    const showToast = useToast();
    /* Tab via URL: /inkoop?tab=bonnen opent direct de scanner — sidebar +
       /factuur-lezer 308-redirect gebruiken dit. Valid tabs: leveranciers,
       bonnen, archief. */
    const searchParams = useSearchParams();
    const tabParam = searchParams?.get('tab');
    const initialTab = tabParam === 'bonnen' || tabParam === 'archief' ? tabParam : 'leveranciers';
    const [tab, setTab] = useState(initialTab);
    const [editingLev, setEditingLev] = useState<string | number | null>(null);
    const [levForm, setLevForm] = useState<Record<string, any> | null>(null);
    const [boodschappenOfferte] = useState('');

    async function downloadReceiptPDF(bon: any) {
        /* raw_analysis kan string-JSON of array zijn; eerste guarden, anders
           crasht .flatMap. */
        let raw: any = bon.raw_analysis;
        if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
        const items = Array.isArray(raw) ? raw.flatMap((a: any) => (a?.data?.items || [])) : [];
        await generatePDF({
            type: 'receipt',
            winkel: bon.winkel || '—',
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
            insertLev(levForm!).then(function () { showToast('Leverancier toegevoegd', 'success'); setEditingLev(null); })
                .catch(function (e: any) { console.error('[inkoop] insertLev:', e); showToast('Toevoegen mislukt: ' + (e?.message || 'onbekende fout'), 'error'); });
        } else {
            const { id, ...rest } = levForm!;
            updateLev(editingLev as number, rest).then(function () { showToast('Bijgewerkt', 'success'); setEditingLev(null); })
                .catch(function (e: any) { console.error('[inkoop] updateLev:', e); showToast('Opslaan mislukt: ' + (e?.message || 'onbekende fout'), 'error'); });
        }
    }

    const boodOfferte = offertes.find(function (o) { return String(o.id) === boodschappenOfferte; });
    const winkelGroepen: Record<string, string[]> = { Sligro: [], Crisp: [], PLUS: [], Overig: [] };
    if (boodOfferte && boodOfferte.menu_selectie) {
        /* menu_selectie kan in DB string-JSON óf object zijn; ingredienten kan
           legacy als string staan i.p.v. array. Beide cases hard guarden zodat
           page niet meer crasht bij oude offerte-data. */
        let menuSel: any = boodOfferte.menu_selectie;
        if (typeof menuSel === 'string') { try { menuSel = JSON.parse(menuSel); } catch { menuSel = null; } }
        const menuValues = menuSel && typeof menuSel === 'object' ? Object.values(menuSel) : [];
        menuValues.forEach(function (dishes: any) {
            const dishArr = Array.isArray(dishes) ? dishes : [];
            dishArr.forEach(function (dishName: string) {
                const dish: any = gerechtenData.find(function (g) { return g.naam === dishName; });
                if (!dish) return;
                const ingredienten = Array.isArray(dish.ingredienten) ? dish.ingredienten : [];
                const winkels = dish.ingredienten_winkels || {};
                ingredienten.forEach(function (ing: string) {
                    const winkel = winkels[ing] || 'Overig';
                    if (!winkelGroepen[winkel]) winkelGroepen[winkel] = [];
                    if (winkelGroepen[winkel].indexOf(ing) < 0) winkelGroepen[winkel].push(ing);
                });
            });
        });
    }

    if (levLoading) {
        return <LoadingState label="Inkoop laden" />;
    }

    return (
        <RequireTier feature="inkoop">
        <div className="artisan-page inkoop-page">
            <PageHeader title="Inkoop & Logistiek" description="Beheer leveranciers, boodschappen en bonnen" />

            <PageGuideNote
                id="inkoop"
                accent="#6366f1"
                icon={ShoppingCart}
                intro="Beheer je leveranciers en scan bonnen na een inkooprit — alles komt automatisch in voorraad terecht."
                actions={[
                    { lead: 'Leveranciers', text: '— voeg je vaste toeleveranciers toe met contactgegevens en prijzen.' },
                    { lead: 'Scan een bon', text: 'na een ritje naar de Makro en de regels worden automatisch in voorraad bijgeschreven.' },
                    { lead: 'Archief', text: '— alle gescande bonnen terugvinden, ook voor de boekhouding.' },
                ]}
            />

            <BestelvoorstelLaan />

            <div className="tab-bar mb-24">
                <button className={'tab-btn' + (tab === 'leveranciers' ? ' active' : '')} onClick={() => setTab('leveranciers')}>LEVERANCIERS</button>
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
                <Scanner leveranciers={leveranciers as Array<{ id: number | string; naam: string }>} />
            )}

            {tab === 'archief' && (
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16">
                        {(bonnen || []).map((bon: any) => (
                            <div key={bon.id} className="artisan-panel" style={{ padding: 16 }}>
                                <div style={{ height: 120, background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 12, overflow: 'hidden', cursor: 'pointer' }} onClick={() => window.open(bon.image_url, '_blank')}>
                                    <img src={bon.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Bon" />
                                </div>
                                <div style={{ fontWeight: 900, fontSize: 14 }}>{(bon.winkel || '—').toUpperCase()}</div>
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
        </RequireTier>
    );
}
