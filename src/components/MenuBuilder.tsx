/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, GripVertical, Plus, Minus, ChefHat, Euro, Users, Flame } from 'lucide-react';

interface GangRow {
    slug: string;
    naam: string;
    minimum: number;
    extra_prijs_pp: number;
    volgorde: number;
}

interface DishRow {
    id: number;
    naam: string;
    gang_slug: string;
    beschrijving?: string;
    prijs?: number;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onApply: (menuSelectie: Record<string, string[]>) => void;
    initialMenu?: Record<string, string[]>;
}

export default function MenuBuilder({ open, onClose, onApply, initialMenu }: Props) {
    const [gangen, setGangen] = useState<GangRow[]>([]);
    const [gerechten, setGerechten] = useState<DishRow[]>([]);
    const [menu, setMenu] = useState<Record<string, string[]>>(initialMenu || {});
    const [searchQuery, setSearchQuery] = useState('');
    const [dragItem, setDragItem] = useState<{ naam: string; gang: string } | null>(null);
    const [dragOverGang, setDragOverGang] = useState<string | null>(null);

    useEffect(function () {
        if (!supabase || !open) return;
        Promise.all([
            supabase.from('website_gangen').select('*').eq('actief', true).order('volgorde'),
            supabase.from('website_gerechten').select('*').eq('actief', true).order('volgorde'),
        ]).then(function ([gRes, dRes]) {
            if (gRes.data) setGangen(gRes.data);
            if (dRes.data) setGerechten(dRes.data);
        });
    }, [open]);

    useEffect(function () {
        if (initialMenu) setMenu(initialMenu);
    }, [initialMenu]);

    function addToMenu(gangSlug: string, dishName: string) {
        setMenu(function (prev) {
            const current = prev[gangSlug] || [];
            if (current.includes(dishName)) return prev;
            return Object.assign({}, prev, { [gangSlug]: current.concat([dishName]) });
        });
    }

    function removeFromMenu(gangSlug: string, dishName: string) {
        setMenu(function (prev) {
            const current = prev[gangSlug] || [];
            return Object.assign({}, prev, { [gangSlug]: current.filter(function (n) { return n !== dishName; }) });
        });
    }

    function handleDragStart(naam: string, gangSlug: string) {
        setDragItem({ naam: naam, gang: gangSlug });
    }

    function handleDragOver(e: React.DragEvent, gangSlug: string) {
        e.preventDefault();
        setDragOverGang(gangSlug);
    }

    function handleDrop(e: React.DragEvent, gangSlug: string) {
        e.preventDefault();
        setDragOverGang(null);
        if (dragItem) {
            addToMenu(gangSlug, dragItem.naam);
            setDragItem(null);
        }
    }

    function handleDragEnd() {
        setDragItem(null);
        setDragOverGang(null);
    }

    function getTotalDishes() {
        return Object.values(menu).reduce(function (sum, arr) { return sum + arr.length; }, 0);
    }

    const filteredGerechten = gerechten.filter(function (d) {
        if (!searchQuery) return true;
        return d.naam.toLowerCase().includes(searchQuery.toLowerCase());
    });

    // Group available dishes by gang
    const dishesByGang: Record<string, DishRow[]> = {};
    filteredGerechten.forEach(function (d) {
        if (!dishesByGang[d.gang_slug]) dishesByGang[d.gang_slug] = [];
        dishesByGang[d.gang_slug].push(d);
    });

    if (!open) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'stretch',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                flex: 1,
                display: 'flex',
                maxWidth: 1100,
                margin: '24px auto',
                background: '#151518',
                borderRadius: 16,
                border: '1px solid rgba(130,130,130,0.15)',
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                animation: 'cmdFadeIn 0.2s ease',
            }}>
                {/* Left: Available Dishes */}
                <div style={{ width: 380, borderRight: '1px solid rgba(130,130,130,0.1)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(130,130,130,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ChefHat size={16} style={{ color: 'var(--brand)' }} /> Beschikbare Gerechten
                            </h3>
                        </div>
                        <input
                            value={searchQuery}
                            onChange={function (e) { setSearchQuery(e.target.value); }}
                            placeholder="Zoek gerecht..."
                            style={{ width: '100%', padding: '7px 12px', fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                        />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                        {gangen.map(function (gang) {
                            const dishes = dishesByGang[gang.slug] || [];
                            if (dishes.length === 0) return null;
                            return (
                                <div key={gang.slug} style={{ marginBottom: 8 }}>
                                    <div style={{ padding: '6px 18px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>
                                        {gang.naam} ({dishes.length})
                                    </div>
                                    {dishes.map(function (dish) {
                                        const isInMenu = (menu[gang.slug] || []).includes(dish.naam);
                                        return (
                                            <div
                                                key={dish.id}
                                                draggable={!isInMenu}
                                                onDragStart={function () { handleDragStart(dish.naam, gang.slug); }}
                                                onDragEnd={handleDragEnd}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '8px 18px',
                                                    cursor: isInMenu ? 'default' : 'grab',
                                                    opacity: isInMenu ? 0.4 : 1,
                                                    transition: 'opacity 0.2s',
                                                }}
                                            >
                                                {!isInMenu && <GripVertical size={12} style={{ color: 'var(--muted-light)', flexShrink: 0 }} />}
                                                {isInMenu && <span style={{ fontSize: 12, color: 'var(--green)', flexShrink: 0 }}>✓</span>}
                                                <span style={{ fontSize: 13, color: isInMenu ? 'var(--muted)' : 'var(--text)', flex: 1 }}>{dish.naam}</span>
                                                {!isInMenu && (
                                                    <button
                                                        onClick={function () { addToMenu(gang.slug, dish.naam); }}
                                                        style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 4, fontSize: 14, lineHeight: 1 }}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        {gangen.length === 0 && (
                            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                                Geen gerechten gevonden. Maak eerst gerechten aan in Website Beheer.
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Your Menu (Drop Zones) */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(130,130,130,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Flame size={16} style={{ color: 'var(--brand)' }} /> Jouw Menu
                            </h3>
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{getTotalDishes()} gerecht(en) geselecteerd</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={function () { onApply(menu); onClose(); }} className="btn btn-brand btn-sm">
                                <i className="fa-solid fa-check" style={{ marginRight: 4 }}></i>Toepassen
                            </button>
                            <button onClick={onClose} className="btn btn-ghost btn-sm">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                        {gangen.map(function (gang) {
                            const gangDishes = menu[gang.slug] || [];
                            const isDragOver = dragOverGang === gang.slug;
                            const meetsMin = gangDishes.length >= gang.minimum;
                            return (
                                <div
                                    key={gang.slug}
                                    onDragOver={function (e) { handleDragOver(e, gang.slug); }}
                                    onDragLeave={function () { setDragOverGang(null); }}
                                    onDrop={function (e) { handleDrop(e, gang.slug); }}
                                    style={{
                                        marginBottom: 12,
                                        padding: 12,
                                        borderRadius: 12,
                                        border: isDragOver ? '2px dashed var(--brand)' : '1px solid rgba(130,130,130,0.1)',
                                        background: isDragOver ? 'rgba(196,163,90,0.05)' : 'rgba(130,130,130,0.03)',
                                        transition: 'all 0.2s',
                                        minHeight: 60,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {gang.naam}
                                        </span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {gang.extra_prijs_pp > 0 && (
                                                <span style={{ fontSize: 10, color: 'var(--brand)', background: 'rgba(196,163,90,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                                    +€{gang.extra_prijs_pp.toFixed(2)}/p.p.
                                                </span>
                                            )}
                                            <span style={{
                                                fontSize: 10,
                                                fontWeight: 700,
                                                color: meetsMin ? 'var(--green)' : gangDishes.length > 0 ? 'var(--amber)' : 'var(--muted)',
                                                padding: '2px 6px',
                                                borderRadius: 4,
                                                background: meetsMin ? 'rgba(34,197,94,0.1)' : 'rgba(130,130,130,0.06)',
                                            }}>
                                                {gangDishes.length}/{gang.minimum}
                                            </span>
                                        </div>
                                    </div>
                                    {gangDishes.length === 0 ? (
                                        <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--muted-light)', fontSize: 11 }}>
                                            Sleep gerechten hierheen of klik + om toe te voegen
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {gangDishes.map(function (name) {
                                                return (
                                                    <div key={name} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        padding: '5px 10px',
                                                        borderRadius: 8,
                                                        background: 'rgba(196,163,90,0.08)',
                                                        border: '1px solid rgba(196,163,90,0.15)',
                                                        fontSize: 12,
                                                        color: 'var(--text)',
                                                        fontWeight: 500,
                                                    }}>
                                                        {name}
                                                        <button
                                                            onClick={function () { removeFromMenu(gang.slug, name); }}
                                                            style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, display: 'flex' }}
                                                        >
                                                            <X size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes cmdFadeIn {
                    from { opacity: 0; transform: scale(0.98); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
