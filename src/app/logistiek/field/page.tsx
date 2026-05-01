/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, CheckCircle2, Truck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';

/**
 * Logistiek — Veldmodus
 *
 * Tablet/handschoen-vriendelijke variant van /logistiek.
 * Doel: voor vertrek alle bus-items aftikken in <2 minuten.
 * Auto-selecteert eerstvolgend bevestigd event; geen klikken in dropdowns.
 *
 * Pattern volgt /haccp/field — same look-and-feel:
 *  - 64px+ tap-targets
 *  - Geen typen vereist
 *  - Bulk "Alles OK" voor snelle afronding
 *  - Persistente save in offerte.bus_check.checked
 */

interface BusItem {
    naam: string;
    totaal: number;
    categorie: string;
    bron: 'gerecht' | 'standaard';
}

// Bekende categorieën in voorkeurs-volgorde — onbekende komen automatisch achteraan.
const CATEGORY_ORDER = ['BBQ', 'apparatuur', 'servies', 'branding', 'koeling', 'transport', 'meubilair', 'overig'];
const CATEGORY_ICONS: Record<string, string> = {
    BBQ: '🔥',
    apparatuur: '🔥',
    servies: '🍽️',
    branding: '💡',
    koeling: '❄️',
    transport: '🚚',
    meubilair: '🪑',
    overig: '📦',
};

export default function LogistiekFieldPage() {
    const { orgId } = useOrg();
    const [offertes, setOffertes] = useState<any[]>([]);
    const [gerechten, setGerechten] = useState<any[]>([]);
    const [hardwareStandaard, setHardwareStandaard] = useState<any[]>([]);
    const [selectedOfferteId, setSelectedOfferteId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Eerste load: data + auto-select eerstvolgend event
    useEffect(function () {
        if (!orgId || !supabase) return;
        Promise.all([
            supabase.from('offertes').select('*').eq('organization_id', orgId).in('status', ['goedgekeurd', 'geaccepteerd']).order('datum', { ascending: true }),
            supabase.from('gerechten').select('naam,hardware_items').eq('organization_id', orgId),
            supabase.from('hardware_items').select('*').eq('organization_id', orgId).eq('standaard_event', true),
        ]).then(function ([off, ger, hw]) {
            const todayStr = new Date().toISOString().slice(0, 10);
            const upcoming = (off.data || []).filter(function (o: any) { return o.datum >= todayStr; });
            setOffertes(upcoming);
            setGerechten(ger.data || []);
            setHardwareStandaard(hw.data || []);
            // Auto-select eerstvolgend
            if (upcoming.length > 0 && !selectedOfferteId) {
                setSelectedOfferteId(String(upcoming[0].id));
            }
            setLoading(false);
        });
    }, [orgId, savedAt, selectedOfferteId]);

    const selectedOfferte = useMemo(function () {
        return offertes.find(function (o: any) { return String(o.id) === selectedOfferteId; });
    }, [offertes, selectedOfferteId]);

    // Bouw bus-items uit gekozen offerte
    const busItems = useMemo<BusItem[]>(function () {
        if (!selectedOfferte) return [];
        const hwMap: Record<string, BusItem> = {};
        const ms = selectedOfferte.menu_selectie;
        const dishNames: string[] = [];
        if (Array.isArray(ms)) {
            ms.forEach(function (sel: any) {
                if (typeof sel === 'string') dishNames.push(sel);
                else if (sel && (sel.gerecht_naam || sel.naam)) dishNames.push(sel.gerecht_naam || sel.naam);
            });
        } else if (ms && typeof ms === 'object') {
            Object.values(ms).forEach(function (arr: any) {
                (arr || []).forEach(function (sel: any) {
                    if (typeof sel === 'string') dishNames.push(sel);
                    else if (sel && (sel.gerecht_naam || sel.naam)) dishNames.push(sel.gerecht_naam || sel.naam);
                });
            });
        }
        const gasten = selectedOfferte.aantal_gasten || 0;
        dishNames.forEach(function (dishName: string) {
            const dish: any = gerechten.find(function (g: any) { return g.naam === dishName; });
            if (dish && dish.hardware_items) {
                (dish.hardware_items || []).forEach(function (hw: any) {
                    const basis = gasten * (hw.ratio || 1);
                    const buffer = Math.ceil(basis * (hw.buffer_pct || 0) / 100);
                    const totaal = Math.ceil(basis) + buffer + (hw.min_extra || 0);
                    if (hwMap[hw.naam]) hwMap[hw.naam].totaal += totaal;
                    else hwMap[hw.naam] = { naam: hw.naam, totaal, categorie: hw.categorie || 'overig', bron: 'gerecht' };
                });
            }
        });
        // Voeg standaard-items toe (als ze nog niet uit gerechten kwamen)
        hardwareStandaard.forEach(function (h: any) {
            if (!hwMap[h.naam]) hwMap[h.naam] = { naam: h.naam, totaal: 1, categorie: h.categorie || 'overig', bron: 'standaard' };
        });
        return Object.values(hwMap);
    }, [selectedOfferte, gerechten, hardwareStandaard]);

    const itemsByCat = useMemo(function () {
        const grp: Record<string, BusItem[]> = {};
        busItems.forEach(function (it) {
            const cat = it.categorie || 'overig';
            if (!grp[cat]) grp[cat] = [];
            grp[cat].push(it);
        });
        return grp;
    }, [busItems]);

    const checked: string[] = (selectedOfferte && selectedOfferte.bus_check && selectedOfferte.bus_check.checked) || [];
    const allChecked = busItems.length > 0 && busItems.every(function (i) { return checked.includes(i.naam); });
    const checkedCount = busItems.filter(function (i) { return checked.includes(i.naam); }).length;

    async function toggle(naam: string) {
        if (!selectedOfferte || !supabase) return;
        const cur = (selectedOfferte.bus_check && selectedOfferte.bus_check.checked) || [];
        const next = cur.includes(naam) ? cur.filter(function (n: string) { return n !== naam; }) : [...cur, naam];
        const newBusCheck = { ...(selectedOfferte.bus_check || {}), checked: next };
        // Optimistic update
        setOffertes(function (prev) {
            return prev.map(function (o: any) { return o.id === selectedOfferte.id ? { ...o, bus_check: newBusCheck } : o; });
        });
        await supabase.from('offertes').update({ bus_check: newBusCheck }).eq('id', selectedOfferte.id);
    }

    async function checkAll() {
        if (!selectedOfferte || !supabase) return;
        const all = busItems.map(function (i) { return i.naam; });
        const newBusCheck = { ...(selectedOfferte.bus_check || {}), checked: all };
        setOffertes(function (prev) {
            return prev.map(function (o: any) { return o.id === selectedOfferte.id ? { ...o, bus_check: newBusCheck } : o; });
        });
        await supabase.from('offertes').update({ bus_check: newBusCheck }).eq('id', selectedOfferte.id);
        setSavedAt(new Date().toISOString());
    }

    async function markComplete() {
        if (!selectedOfferte || !supabase) return;
        setSaving(true);
        const newBusCheck = { ...(selectedOfferte.bus_check || {}), checked: busItems.map(function (i) { return i.naam; }), completed_at: new Date().toISOString() };
        await supabase.from('offertes').update({ bus_check: newBusCheck }).eq('id', selectedOfferte.id);
        setSaving(false);
        setSavedAt(new Date().toISOString());
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] p-8 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-accent-gold)]" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--text)] p-4 md:p-8">
            {/* Header */}
            <div className="max-w-[900px] mx-auto flex items-center justify-between mb-6">
                <Link href="/logistiek" className="inline-flex items-center gap-2 px-4 py-3 rounded-lg text-[14px] text-[var(--muted)] hover:text-[var(--text)] no-underline" style={{ minHeight: 56 }}>
                    <ArrowLeft className="w-5 h-5" />
                    Terug
                </Link>
                <div className="text-right">
                    <div className="text-[18px] font-bold">Bus-check — Veldmodus</div>
                    <div className="text-[12px] text-[var(--muted)]">Snel aftikken voor vertrek</div>
                </div>
            </div>

            {/* Geen events */}
            {offertes.length === 0 && (
                <div className="max-w-[900px] mx-auto rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-8 text-center">
                    <Truck className="w-12 h-12 mx-auto text-[var(--muted)] mb-4" />
                    <div className="text-[15px] font-bold mb-1">Geen bevestigde events</div>
                    <div className="text-[12px] text-[var(--muted)]">Bus-check verschijnt zodra een offerte op &lsquo;goedgekeurd&rsquo; staat.</div>
                </div>
            )}

            {/* Event-selector als er meerdere zijn */}
            {offertes.length > 1 && (
                <div className="max-w-[900px] mx-auto mb-4 flex flex-wrap gap-2">
                    {offertes.slice(0, 5).map(function (o: any) {
                        const active = String(o.id) === selectedOfferteId;
                        const datum = new Date(o.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
                        return (
                            <button key={o.id} onClick={function () { setSelectedOfferteId(String(o.id)); }}
                                className={`rounded-lg px-4 py-2 text-[13px] font-medium border-2 transition-all ${active ? 'bg-[var(--color-accent-gold)] text-black border-[var(--color-accent-gold)]' : 'bg-[var(--card)] text-[var(--text)] border-[var(--card-solid)]'}`}
                                style={{ minHeight: 48 }}>
                                <span className="font-bold">{datum}</span>
                                <span className="ml-2 opacity-80">{o.client_naam || o.nummer}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Hoofdcontent — alleen als event geselecteerd */}
            {selectedOfferte && (
                <div className="max-w-[900px] mx-auto">
                    {/* Event-header */}
                    <div className="rounded-2xl border border-[var(--card-solid)] bg-gradient-to-br from-[var(--color-accent-gold)]/10 to-transparent p-5 mb-4">
                        <div className="flex items-baseline justify-between flex-wrap gap-2">
                            <div>
                                <div className="text-[20px] font-bold">{selectedOfferte.client_naam || selectedOfferte.nummer}</div>
                                <div className="text-[13px] text-[var(--muted)]">
                                    {new Date(selectedOfferte.datum).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    {selectedOfferte.aantal_gasten ? ` · ${selectedOfferte.aantal_gasten} gasten` : ''}
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-[28px] font-light tabular-nums text-[var(--color-accent-gold)]">{checkedCount}/{busItems.length}</div>
                                <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)]">items</div>
                            </div>
                        </div>
                    </div>

                    {/* Geen menu = geen items */}
                    {busItems.length === 0 && (
                        <div className="rounded-2xl border border-[var(--card-solid)] bg-[var(--card)] p-6 text-center text-[13px] text-[var(--muted)]">
                            Dit event heeft nog geen menu gekoppeld — geen hardware om in te laden. Koppel eerst gerechten via /events.
                        </div>
                    )}

                    {/* Bulk-button bovenaan */}
                    {busItems.length > 0 && !allChecked && (
                        <button onClick={checkAll}
                            className="w-full mb-4 rounded-xl bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-300 font-bold text-[15px] flex items-center justify-center gap-2 hover:bg-emerald-500/20"
                            style={{ minHeight: 64 }}>
                            <CheckCircle2 className="w-5 h-5" />
                            Alles OK — vink alles tegelijk
                        </button>
                    )}

                    {/* Items per categorie — bekende categorieën eerst, daarna onbekende */}
                    {[
                        ...CATEGORY_ORDER.filter(function (c) { return itemsByCat[c]; }),
                        ...Object.keys(itemsByCat).filter(function (c) { return CATEGORY_ORDER.indexOf(c) === -1; }),
                    ].map(function (cat) {
                        return (
                            <div key={cat} className="mb-5">
                                <div className="flex items-center gap-2 mb-2 px-1">
                                    <span className="text-[18px]">{CATEGORY_ICONS[cat] || '📦'}</span>
                                    <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-[var(--muted)]">{cat}</span>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-2">
                                    {(itemsByCat[cat] || []).map(function (item) {
                                        const isChecked = checked.includes(item.naam);
                                        return (
                                            <button key={item.naam} onClick={function () { toggle(item.naam); }}
                                                className={`text-left rounded-xl px-4 py-3 transition-all border-2 ${isChecked ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-[var(--card)] border-[var(--card-solid)]'}`}
                                                style={{ minHeight: 72 }}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isChecked ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--card-solid)]'}`}>
                                                        {isChecked && <Check className="w-5 h-5 text-black" strokeWidth={3} />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`font-bold text-[14px] truncate ${isChecked ? 'text-emerald-300' : 'text-[var(--text)]'}`}>{item.naam}</div>
                                                        <div className="text-[12px] text-[var(--muted)] tabular-nums">
                                                            {item.totaal}× {item.bron === 'standaard' && <span className="opacity-60">· standaard</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}

                    {/* Final action */}
                    {busItems.length > 0 && (
                        <button onClick={markComplete} disabled={saving || !allChecked}
                            className={`w-full mt-6 rounded-xl text-[16px] font-bold flex items-center justify-center gap-2 transition-all ${allChecked ? 'bg-[var(--color-accent-gold)] text-black' : 'bg-[var(--card)] text-[var(--muted)] border-2 border-[var(--card-solid)]'}`}
                            style={{ minHeight: 72 }}>
                            <Truck className="w-5 h-5" />
                            {saving ? 'Opslaan...' : allChecked ? 'BUS KLAAR — VERTREK!' : `Nog ${busItems.length - checkedCount} te checken`}
                        </button>
                    )}

                    {savedAt && (
                        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-emerald-400">
                            <Check className="w-4 h-4" />
                            Opgeslagen om {new Date(savedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
