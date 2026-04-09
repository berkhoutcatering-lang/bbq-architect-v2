/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { Suspense, useEffect, useMemo, useState } from "react";
import {
    Plus,
    Save,
    Loader2,
    CheckCircle2,
    AlertCircle,
    X,
    Trash2,
    PanelLeft,
    ArrowLeft,
    FileText,
    Euro,
    Users,
    ChevronRight,
    UtensilsCrossed
} from "lucide-react";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSupabase, useSettings } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmt, genNummer, nextNummer, today, addDays } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

const MetallicCard = ({ children, className = "", hover = false, onClick }: { children: React.ReactNode; className?: string; hover?: boolean; onClick?: () => void }) => (
    <div
        onClick={onClick}
        className={`
      relative rounded-2xl overflow-hidden
      bg-gradient-to-br from-[#0a0a0a] to-[#050505]
      border border-[rgba(212,175,55,.12)]
      ${hover ? "hover:border-[rgba(212,175,55,.3)] hover:shadow-lg hover:shadow-[rgba(212,175,55,.08)] transition-all duration-500 cursor-pointer" : ""}
      ${className}
    `}
    >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37] to-transparent opacity-30" />
        {children}
    </div>
);

interface LineItem {
    lineId: string;
    menuItemId: number;
    name: string;
    unitPriceExcl: number;
    quantity: number;
    vatRate: number;
}

interface LineErrors {
    [lineId: string]: {
        vatRate?: string;
        price?: string;
        quantity?: string;
    };
}

export default function OfferCreationDashboardPage() {
    return (
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', color: 'var(--muted)' }}>Laden...</div>}>
            <OfferCreationDashboard />
        </Suspense>
    );
}

function OfferCreationDashboard() {
    const { data: gerechten, loading: loadingMenu } = useSupabase('gerechten', []);
    const { data: offertes, insert: insertOfferte } = useSupabase('offertes', []);
    const { settings } = useSettings();
    const showToast: (msg: string, type?: string) => void = useToast();
    const searchParams = useSearchParams();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [errors, setErrors] = useState<LineErrors>({});
    const [priceIncludesVat, setPriceIncludesVat] = useState(false);
    const [saving, setSaving] = useState(false);

    const [clientInfo, setClientInfo] = useState({
        name: '',
        address: '',
        date: today(),
        note: ''
    });

    // Pre-fill from searchParams (e.g. when coming from Events page)
    useEffect(() => {
        const client = searchParams.get('client');
        const datum = searchParams.get('datum');
        const gasten = searchParams.get('gasten');
        const ppp = searchParams.get('ppp');
        const event = searchParams.get('event');
        if (client || datum || event) {
            setClientInfo(prev => ({
                ...prev,
                name: client || prev.name,
                date: datum || prev.date,
                note: event ? `Event: ${event}` + (prev.note ? `\n${prev.note}` : '') : prev.note,
            }));
            if (gasten && ppp) {
                const qty = parseInt(gasten) || 50;
                const price = parseFloat(ppp) || 45;
                setLineItems(prev => prev.length === 0 ? [{
                    lineId: `line_${Date.now()}`,
                    menuItemId: 0,
                    name: `BBQ Catering${event ? ' - ' + event : ''}`,
                    unitPriceExcl: price,
                    quantity: qty,
                    vatRate: 0.09,
                }] : prev);
            }
        }
    }, [searchParams]);

    const formatEUR = (value: number) => fmt(value);

    const openMenuModal = () => setIsMenuOpen(true);
    const closeMenuModal = () => setIsMenuOpen(false);

    const addItemToQuote = (item: any) => {
        setLineItems((prev) => {
            const existing = prev.find((p) => p.menuItemId === item.id);
            if (existing) {
                return prev.map((p) =>
                    p.menuItemId === item.id ? { ...p, quantity: p.quantity + 1 } : p
                );
            }
            const newLine: LineItem = {
                lineId: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                menuItemId: item.id,
                name: item.naam,
                unitPriceExcl: item.kostprijs_pp || 15,
                quantity: 1,
                vatRate: 0.09,
            };
            return [...prev, newLine];
        });
    };

    const removeLine = (lineId: string) => {
        setLineItems((prev) => prev.filter((l) => l.lineId !== lineId));
        setErrors((prev) => {
            const next = { ...prev };
            delete next[lineId];
            return next;
        });
    };

    const lineDisplayUnitPrice = (line: LineItem) =>
        priceIncludesVat ? line.unitPriceExcl * (1 + line.vatRate) : line.unitPriceExcl;

    const validateLine = (line: LineItem) => {
        const lineError: Record<string, string> = {};
        if (!line.vatRate && line.vatRate !== 0) lineError.vatRate = "BTW-percentage ontbreekt.";
        if (!Number.isFinite(line.unitPriceExcl) || line.unitPriceExcl <= 0)
            lineError.price = "Prijs moet groter zijn dan 0.";
        if (!Number.isInteger(line.quantity) || line.quantity < 1)
            lineError.quantity = "Aantal moet minimaal 1 zijn.";
        return lineError;
    };

    const updateLineField = (lineId: string, field: string, rawValue: string) => {
        setLineItems((prev) =>
            prev.map((line) => {
                if (line.lineId !== lineId) return line;
                const updated = { ...line };

                if (field === "quantity") {
                    const parsed = Number.parseInt(rawValue, 10);
                    updated.quantity = Number.isNaN(parsed) ? 0 : parsed;
                }

                if (field === "price") {
                    const parsed = Number.parseFloat(rawValue);
                    const normalized = Number.isNaN(parsed) ? 0 : parsed;
                    updated.unitPriceExcl = priceIncludesVat
                        ? normalized / (1 + updated.vatRate)
                        : normalized;
                }

                return updated;
            })
        );

        setErrors((prev) => {
            const line = lineItems.find((l) => l.lineId === lineId);
            if (!line) return prev;
            const simulatedLine: LineItem = {
                ...line,
                ...(field === "quantity"
                    ? { quantity: Number.parseInt(rawValue, 10) || 0 }
                    : {}),
                ...(field === "price"
                    ? {
                        unitPriceExcl: priceIncludesVat
                            ? (Number.parseFloat(rawValue) || 0) / (1 + line.vatRate)
                            : Number.parseFloat(rawValue) || 0,
                    }
                    : {}),
            };
            return { ...prev, [lineId]: validateLine(simulatedLine) };
        });
    };

    const totals = useMemo(() => {
        const subtotalExcl = lineItems.reduce(
            (sum, l) => sum + l.unitPriceExcl * l.quantity,
            0
        );
        const vatAmount = lineItems.reduce(
            (sum, l) => sum + l.unitPriceExcl * l.quantity * l.vatRate,
            0
        );
        const totalIncl = subtotalExcl + vatAmount;
        return { subtotalExcl, vatAmount, totalIncl };
    }, [lineItems]);

    const handleToggleVatView = () => setPriceIncludesVat((prev) => !prev);

    async function syncToAgenda(quoteId: number, quoteData: any) {
        if (!quoteId) return;

        const estimatedGuests = lineItems.reduce((max, l) => Math.max(max, l.quantity), 0);
        const ppp = estimatedGuests > 0 ? totals.subtotalExcl / estimatedGuests : 0;

        const payload = {
            name: 'Offerte: ' + (clientInfo.name || 'Onbekend'),
            date: clientInfo.date,
            guests: estimatedGuests || 50,
            ppp: Math.round(ppp * 100) / 100,
            location: clientInfo.address || '',
            client_naam: clientInfo.name || '',
            client_adres: clientInfo.address || '',
            status: 'optie',
            notitie: clientInfo.note || '',
            offerte_id: quoteId,
            type: 'Zakelijk'
        };

        const { data: existing } = await supabase.from('events').select('id').eq('offerte_id', quoteId).single();

        if (existing) {
            await supabase.from('events').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('events').insert(payload);
        }
    }

    const handleSaveQuote = async () => {
        if (!clientInfo.name) {
            showToast("Vul een klantnaam in.", "error");
            return;
        }

        const nextErrors: LineErrors = {};
        lineItems.forEach((line) => {
            const e = validateLine(line);
            if (Object.keys(e).length > 0) nextErrors[line.lineId] = e;
        });
        setErrors(nextErrors);

        if (lineItems.length === 0) {
            showToast("Voeg minimaal één item toe.", "error");
            return;
        }

        if (Object.keys(nextErrors).length > 0) {
            showToast("Controleer de fouten in de regels.", "error");
            return;
        }

        setSaving(true);
        try {
            const geldigDagen = (settings && settings.offerte_geldig) || 30;
            const nummer = nextNummer((settings && settings.offerte_prefix) || 'OFF-2026-', offertes.map((o: any) => o.nummer));

            const payload = {
                nummer: nummer,
                status: 'concept',
                client_naam: clientInfo.name,
                client_adres: clientInfo.address,
                datum: clientInfo.date,
                geldig_tot: addDays(clientInfo.date, geldigDagen),
                notitie: clientInfo.note,
                items: lineItems.map((l) => ({
                    desc: l.name,
                    qty: l.quantity,
                    prijs: Number(l.unitPriceExcl.toFixed(2)),
                    btw: l.vatRate * 100
                }))
            };

            const result = await insertOfferte(payload);
            if (result && result.id) {
                await syncToAgenda(result.id, payload);
                showToast("Offerte succesvol opgeslagen en gesynchroniseerd!", "success");
                setLineItems([]);
                setClientInfo({ name: '', address: '', date: today(), note: '' });
            }
        } catch (err: any) {
            console.error(err);
            showToast("Fout bij opslaan: " + err.message, "error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="hopbites-theme min-h-screen bg-[#050505] text-[#f5f0e6]">
            <header className="border-b border-[rgba(212,175,55,.15)] bg-[#0a0a0a]/90 backdrop-blur-md sticky top-0 z-40">
                <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
                    <div className="flex items-center gap-4">
                        <Link href="/offertes" className="p-2 hover:bg-[rgba(212,175,55,.08)] rounded-lg transition-colors">
                            <ArrowLeft className="h-5 w-5 text-[#d4af37]" />
                        </Link>
                        <div>
                            <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 300, textTransform: 'uppercase', letterSpacing: 3, color: '#8a8272', marginBottom: 2 }}>BBQ Architect</div>
                            <h1 className="text-lg font-semibold sm:text-xl tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>Nieuwe Offerte</h1>
                            <p className="text-[11px] text-[var(--muted)] uppercase tracking-widest font-medium">Design & Logistics</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={openMenuModal}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 text-xs font-bold uppercase tracking-wider transition hover:bg-white/10"
                        >
                            <Plus className="h-4 w-4 text-[var(--brand)]" />
                            Menu Wizard
                        </button>
                        <button
                            onClick={handleSaveQuote}
                            disabled={saving}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-6 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-90 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? "Opslaan..." : "Bewaar Offerte"}
                        </button>
                    </div>
                </div>
            </header>

            <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 pb-24">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

                    <div className="lg:col-span-2 space-y-6">

                        <MetallicCard className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-[var(--brand)]/10 rounded-lg border border-[var(--brand)]/20">
                                    <Users className="h-4 w-4 text-[var(--brand)]" />
                                </div>
                                <h2 className="text-sm font-bold uppercase tracking-widest">Klantgegevens</h2>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-[var(--muted)] ml-1">Naam Klant / Bedrijf</label>
                                    <input
                                        value={clientInfo.name}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientInfo({ ...clientInfo, name: e.target.value })}
                                        placeholder="bijv. Jansen Catering"
                                        className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-[var(--brand)] outline-none transition-colors"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-[var(--muted)] ml-1">Datum Event</label>
                                    <input
                                        type="date"
                                        value={clientInfo.date}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientInfo({ ...clientInfo, date: e.target.value })}
                                        className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-[var(--brand)] outline-none transition-colors"
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-bold uppercase text-[var(--muted)] ml-1">Locatie / Adres</label>
                                    <input
                                        value={clientInfo.address}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientInfo({ ...clientInfo, address: e.target.value })}
                                        placeholder="Straat 1, Stad"
                                        className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-sm focus:border-[var(--brand)] outline-none transition-colors"
                                    />
                                </div>
                            </div>
                        </MetallicCard>

                        <MetallicCard className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[var(--brand)]/10 rounded-lg border border-[var(--brand)]/20">
                                        <FileText className="h-4 w-4 text-[var(--brand)]" />
                                    </div>
                                    <h2 className="text-sm font-bold uppercase tracking-widest">Offerte Regels</h2>
                                </div>

                                <button
                                    onClick={handleToggleVatView}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-[var(--border)] text-[10px] font-bold uppercase tracking-tighter hover:border-[var(--muted)] transition-colors"
                                >
                                    <span className={priceIncludesVat ? "text-[var(--brand)]" : "text-[var(--muted)]"}>Incl. BTW</span>
                                    <div className={`w-6 h-3 rounded-full relative transition-colors ${priceIncludesVat ? 'bg-[var(--brand)]' : 'bg-[#333]'}`}>
                                        <div className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${priceIncludesVat ? 'right-0.5' : 'left-0.5'}`} />
                                    </div>
                                </button>
                            </div>

                            {lineItems.length === 0 ? (
                                <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-[var(--border)] rounded-2xl bg-black/20 text-[var(--muted)]">
                                    <Plus className="h-8 w-8 mb-3 opacity-20" />
                                    <p className="text-xs font-medium uppercase tracking-widest">Nog geen items — kies uit het menu</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="hidden md:grid grid-cols-12 gap-4 px-2 text-[10px] font-bold uppercase text-[var(--muted)] tracking-widest">
                                        <div className="col-span-5">Omschrijving</div>
                                        <div className="col-span-2 text-center">Aantal</div>
                                        <div className="col-span-2 text-right">Prijs p.p.</div>
                                        <div className="col-span-2 text-right">Totaal</div>
                                        <div className="col-span-1"></div>
                                    </div>

                                    {lineItems.map((line) => {
                                        const lineExcl = line.unitPriceExcl * line.quantity;
                                        const lineErr = errors[line.lineId] || {};
                                        return (
                                            <div key={line.lineId} className="group grid grid-cols-12 gap-4 p-4 bg-black/40 border border-[var(--border)] rounded-2xl hover:border-[var(--muted)] transition-all">
                                                <div className="col-span-12 md:col-span-5">
                                                    <p className="text-sm font-bold text-white mb-1">{line.name}</p>
                                                    <p className="text-[10px] text-[var(--muted)] uppercase tracking-tighter">BTW: {Math.round(line.vatRate * 100)}%</p>
                                                    {lineErr.price && <p className="text-[10px] text-red-400 mt-1 font-bold">{lineErr.price}</p>}
                                                </div>

                                                <div className="col-span-6 md:col-span-2 flex items-center justify-center">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={line.quantity}
                                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLineField(line.lineId, "quantity", e.target.value)}
                                                        className="w-full bg-black/20 border border-[var(--border)] rounded-lg px-2 py-1.5 text-center text-sm focus:border-[var(--brand)] outline-none"
                                                    />
                                                </div>

                                                <div className="col-span-6 md:col-span-2">
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1.5 text-[10px] text-[var(--muted)]">€</span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={lineDisplayUnitPrice(line).toFixed(2)}
                                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateLineField(line.lineId, "price", e.target.value)}
                                                            className="w-full bg-black/20 border border-[var(--border)] rounded-lg pl-5 pr-2 py-1.5 text-right text-sm focus:border-[var(--brand)] outline-none"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="col-span-10 md:col-span-2 flex items-center justify-end">
                                                    <p className="text-sm font-black tabular-nums">{formatEUR(lineExcl)}</p>
                                                </div>

                                                <div className="col-span-2 md:col-span-1 flex items-center justify-end">
                                                    <button
                                                        onClick={() => removeLine(line.lineId)}
                                                        className="p-2 hover:bg-red-500/10 hover:text-red-400 text-[var(--muted)] transition-all rounded-lg"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </MetallicCard>
                    </div>

                    <div className="space-y-6">
                        <MetallicCard className="p-6 sticky top-24">
                            <h3 className="text-sm font-bold uppercase tracking-widest mb-6">Overzicht</h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs text-[var(--muted)] font-medium">Subtotaal Excl.</span>
                                    <span className="text-sm font-bold">{formatEUR(totals.subtotalExcl)}</span>
                                </div>
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs text-[var(--muted)] font-medium">BTW Bedrag</span>
                                    <span className="text-sm font-bold">{formatEUR(totals.vatAmount)}</span>
                                </div>

                                <div className="pt-4 border-t border-[var(--border)]">
                                    <div className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                                        <span className="text-xs font-black uppercase tracking-wider">Totaal Incl.</span>
                                        <span className="text-xl font-black text-[var(--brand)]">{formatEUR(totals.totalIncl)}</span>
                                    </div>
                                </div>

                                <div className="pt-6 space-y-3">
                                    <div className="flex items-start gap-3 p-3 bg-[var(--brand)]/5 border border-[var(--brand)]/10 rounded-xl">
                                        <CheckCircle2 className="h-4 w-4 text-[var(--brand)] mt-0.5" />
                                        <p className="text-[10px] text-[var(--muted)] font-medium leading-relaxed">
                                            Opslaan synchroniseert automatisch met de agenda voor voorlopige logistieke planning.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </MetallicCard>
                    </div>
                </div>
            </main>

            {isMenuOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={closeMenuModal}
                    />
                    <MetallicCard className="relative w-full max-w-2xl max-h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-black/20">
                            <div className="flex items-center gap-3">
                                <UtensilsCrossed className="h-5 w-5 text-[var(--brand)]" />
                                <h3 className="text-lg font-bold tracking-tight">Selecteer uit Menu</h3>
                            </div>
                            <button
                                onClick={closeMenuModal}
                                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                            >
                                <X className="h-5 w-5 text-[var(--muted)]" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
                            {loadingMenu ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
                                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Systeem laden...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {gerechten.map((item: any) => (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                addItemToQuote(item);
                                                closeMenuModal();
                                                showToast(`Toegevoegd: ${item.naam}`, "success");
                                            }}
                                            className="group p-4 bg-black/40 border border-[var(--border)] rounded-2xl cursor-pointer hover:border-[var(--brand)] hover:scale-[1.02] transition-all duration-300"
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--brand)] bg-[var(--brand)]/10 px-2 py-0.5 rounded-full border border-[var(--brand)]/20">
                                                    {item.categorie || 'Gerecht'}
                                                </span>
                                                <Plus className="h-4 w-4 text-[var(--muted)] group-hover:text-[var(--brand)] transition-colors" />
                                            </div>
                                            <p className="font-bold text-sm mb-1 line-clamp-1">{item.naam}</p>
                                            <p className="text-[11px] text-[var(--muted)] font-medium">Indicatie p.p. {formatEUR(item.kostprijs_pp || 15)}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </MetallicCard>
                </div>
            )}
        </div>
    );
}
