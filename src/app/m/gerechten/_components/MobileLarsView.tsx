'use client';

/* ═══════════════════════════════════════════════════════════════
   MOBILE-LARS view — recreated from Claude Design package
   Pillar #5: Lars-friendly mobile assembly (touch ≥56px, voice, swipe)
   Persona: Lars (foodtruck-operator, tablet + handschoenen + zonlicht)
   ─────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    Flame, Mic, MicOff, Search, CalendarCheck, ShieldCheck, Package,
    ClipboardList, Menu, Sparkles, UserCheck, Timer, Thermometer, X,
} from 'lucide-react';
import styles from './MobileLarsView.module.css';
import { useVoiceSearch } from './useVoiceSearch';

export interface MobileDish {
    id: string;
    name: string;
    glyph: string;
    sub: string;
    cost: number;
    price: number;
    tags: string[];
    provenance: 'ai' | 'curated';
    allergens: string[];
    status: 'live' | 'concept';
    gang: string | null;
}

interface Props {
    dishes: MobileDish[];
}

const COURSES: Array<{ key: string; label: string }> = [
    { key: 'Alles',    label: 'Alles' },
    { key: 'Hoofd',    label: 'Hoofd' },
    { key: 'Bij',      label: 'Bij' },
    { key: 'Dessert',  label: 'Dessert' },
    { key: 'Bites',    label: 'Bites' },
    { key: 'Vegan',    label: 'Vegan' },
];

const NAV_ITEMS = [
    { key: 'vandaag',  label: 'Vandaag',  href: '/',          icon: CalendarCheck },
    { key: 'haccp',    label: 'HACCP',    href: '/haccp',     icon: ShieldCheck },
    { key: 'voorraad', label: 'Voorraad', href: '/voorraad',  icon: Package },
    { key: 'prep',     label: 'Prep',     href: '/prep-counter', icon: ClipboardList },
    { key: 'meer',     label: 'Meer',     href: '/sitemap',   icon: Menu },
] as const;

/* Margin computed from cost+price; defensieve guard tegen price=0. */
function calcMargin(price: number, cost: number): number {
    if (!price || price <= 0) return 0;
    return Math.max(0, Math.min(1, (price - cost) / price));
}

/* Color voor de marge-bar — Pillar #3 (one-glance margin-truth). */
function marginColor(margin: number): string {
    if (margin > 0.5) return '#00d4a1';
    if (margin > 0.3) return '#f59e0b';
    return '#ef4444';
}

function MobileMargeBar({ margin }: { margin: number }) {
    const c = marginColor(margin);
    const left = 1 - margin;
    return (
        <div className={styles.marge}>
            <div className={styles.margeTrack} aria-hidden>
                <div style={{ flex: left, background: '#2a2a2e', borderRadius: '3px 0 0 3px' }} />
                <div style={{ flex: margin, background: c, borderRadius: '0 3px 3px 0' }} />
            </div>
            <span className={styles.margePct} style={{ color: c }}>
                {Math.round(margin * 100)}%
            </span>
        </div>
    );
}

function MobileDishCard({
    dish, isOpen, onTap,
}: {
    dish: MobileDish;
    isOpen: boolean;
    onTap: (id: string) => void;
}) {
    const margin = calcMargin(dish.price, dish.cost);
    return (
        <button
            type="button"
            className={`${styles.card} ${isOpen ? styles.cardOpen : ''}`}
            onClick={() => onTap(dish.id)}
            aria-expanded={isOpen}
            aria-label={`${dish.name}, verkoop €${dish.price.toFixed(2).replace('.', ',')}, marge ${Math.round(margin * 100)} procent`}
        >
            <div className={styles.cardTop}>
                <div className={styles.cardGlyph} aria-hidden>{dish.glyph}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.cardName}>{dish.name}</div>
                    {dish.sub && <div className={styles.cardSub}>{dish.sub}</div>}
                </div>
                <div className={styles.cardRight}>
                    <div className={styles.cardRightLabel}>Verkoop</div>
                    <div className={styles.cardRightPrice}>
                        €{dish.price.toFixed(2).replace('.', ',')}
                    </div>
                </div>
            </div>

            <div className={styles.chips}>
                {dish.tags.map((t) => (
                    <span key={t} className={styles.tag}>{t}</span>
                ))}
                <span className={`${styles.prov} ${dish.provenance === 'ai' ? styles.provAi : styles.provCurated}`}>
                    {dish.provenance === 'ai' ? <Sparkles size={9} /> : <UserCheck size={9} />}
                    {dish.provenance === 'ai' ? 'AI' : 'Curated'}
                </span>
                {dish.status === 'concept' && (
                    <span className={`${styles.tag} ${styles.conceptTag}`}>Concept</span>
                )}
            </div>

            <MobileMargeBar margin={margin} />
        </button>
    );
}

function DishDrawer({
    dish, onClose,
}: {
    dish: MobileDish;
    onClose: () => void;
}) {
    /* Lijst getoonde allergens: gerecht.allergenen[] als die er zijn, anders
       een neutrale fallback. In slice 2 koppelen we dit aan gerecht_allergens_mv
       voor de cascade-aware versie (Pillar #2). */
    const shownAllergens = dish.allergens.length > 0 && dish.allergens[0] !== '—'
        ? dish.allergens
        : [];

    return (
        <>
            <button
                type="button"
                className={styles.drawerOverlay}
                onClick={onClose}
                aria-label="Sluit gerecht-paneel"
            />
            <div className={styles.drawer} role="dialog" aria-modal="true" aria-label={`${dish.name} details`}>
                <div className={styles.drawerHandle} aria-hidden />
                <div className={styles.drawerHead}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 32 }} aria-hidden>{dish.glyph}</span>
                        <div>
                            <div className={styles.drawerHeadTitle}>{dish.name}</div>
                            {dish.sub && <div className={styles.drawerHeadSub}>{dish.sub}</div>}
                        </div>
                    </div>
                </div>
                <div className={styles.drawerBody}>
                    <div className={styles.drawerSection}>
                        <div className={styles.drawerSectionLabel}>Bereidingswijze</div>
                        <div className={styles.recipeText}>
                            <p>Schouder 12 uur op 110°C in de smoker met appelhout. Bestrooi ruim met de House Dry Rub voor het roken.</p>
                            <div className={`${styles.recipeMeta} ${styles.recipeMetaSmoke}`}>
                                <Timer size={14} aria-hidden />
                                <span className={styles.recipeMetaLabel}>Smoke-tijd</span>
                                <span className={styles.recipeMetaValue}>12:00:00</span>
                            </div>
                            <p>Trek het vlees met twee vorken. Meng met Smoked BBQ Sauce — 40ml per portie.</p>
                            <div className={`${styles.recipeMeta} ${styles.recipeMetaTemp}`}>
                                <Thermometer size={14} aria-hidden />
                                <span className={styles.recipeMetaLabel}>Kerntemperatuur</span>
                                <span className={styles.recipeMetaValue}>93°C</span>
                            </div>
                            <p>Serveer op een getoast brioche bun met coleslaw.</p>
                        </div>
                    </div>

                    {shownAllergens.length > 0 && (
                        <div className={styles.drawerSection}>
                            <div className={styles.drawerSectionLabel}>Allergenen</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {shownAllergens.map((a) => (
                                    <span key={a} className={styles.allergenChip}>{a}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <button type="button" className={styles.kitchenBtn}>
                        <Flame size={20} aria-hidden />
                        Start Kitchen Mode
                    </button>
                </div>
            </div>
        </>
    );
}

export default function MobileLarsView({ dishes }: Props) {
    const [activeCourse, setActiveCourse] = useState<string>('Alles');
    const [searchTerm, setSearchTerm] = useState<string>('');
    /* Eén card open by default (zoals in het design) — eerste hoofdgerecht of
       eerste van de lijst als er geen hoofd is. */
    const initialOpen = dishes.find((d) => d.gang === 'hoofd' || d.gang === 'hoofdgerecht')?.id ?? dishes[0]?.id ?? null;
    const [openDishId, setOpenDishId] = useState<string | null>(initialOpen);
    const [activeNav, setActiveNav] = useState<string>('vandaag');

    /* Pillar #5 (Lars-friendly mobile): Web Speech API voice-search.
       Bij final transcript zet de zoekterm en sluit recording. */
    const voice = useVoiceSearch('nl-NL');
    useEffect(() => {
        if (!voice.listening && voice.transcript) {
            setSearchTerm(voice.transcript);
            voice.reset();
        }
    }, [voice.listening, voice.transcript, voice]);

    function toggleVoice() {
        if (voice.listening) voice.stop();
        else voice.start();
    }

    const filtered = useMemo(() => {
        // Eerst gang-filter
        const byGang = activeCourse === 'Alles' ? dishes : dishes.filter((d) => {
            if (activeCourse === 'Hoofd')   return d.gang === 'hoofd'   || d.gang === 'hoofdgerecht';
            if (activeCourse === 'Bij')     return d.gang === 'bij'     || d.gang === 'bijgerecht';
            if (activeCourse === 'Dessert') return d.gang === 'dessert';
            if (activeCourse === 'Bites')   return d.gang === 'bites'   || d.gang === 'hapje';
            if (activeCourse === 'Vegan')   return d.tags.some((t) => t.toLowerCase() === 'vegan');
            return false;
        });
        // Dan zoekterm-filter (case-insensitive op naam + sub + tags)
        const term = searchTerm.trim().toLowerCase();
        if (!term) return byGang;
        return byGang.filter((d) =>
            d.name.toLowerCase().includes(term) ||
            d.sub.toLowerCase().includes(term) ||
            d.tags.some((t) => t.toLowerCase().includes(term))
        );
    }, [dishes, activeCourse, searchTerm]);

    const openDish = openDishId ? dishes.find((d) => d.id === openDishId) ?? null : null;

    return (
        <div className={styles.frameWrap}>
            <div className={styles.phoneFrame}>
                <div className={styles.island} aria-hidden />
                <div className={styles.phoneScreen}>
                    <div className={styles.shell}>
                        {/* Header */}
                        <header className={styles.header}>
                            <div className={styles.headerTop}>
                                <div className={styles.logo}>
                                    <div className={styles.logoMark}>
                                        <Flame size={16} aria-hidden />
                                    </div>
                                    <div>
                                        <div className={styles.logoText}>BBQ ARCHITECT</div>
                                        <div className={styles.logoSub}>Cool Mint Catering</div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className={styles.micBtn}
                                    onClick={toggleVoice}
                                    disabled={!voice.supported}
                                    aria-label={voice.listening ? 'Stop spraakherkenning' : 'Zoek gerecht via spraak'}
                                    aria-pressed={voice.listening}
                                    style={{
                                        ...(voice.listening ? { animation: 'm-pulse 1.2s ease-in-out infinite', background: 'rgba(0,212,161,.22)' } : {}),
                                        ...(!voice.supported ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                                    }}
                                    title={!voice.supported ? 'Spraakherkenning niet beschikbaar in deze browser' : undefined}
                                >
                                    {voice.listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
                                </button>
                            </div>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="search"
                                    className={styles.search}
                                    value={voice.listening ? voice.transcript : searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={voice.listening ? 'Luistert…' : 'Zoek gerecht…'}
                                    aria-label="Zoek gerecht"
                                    style={{ paddingLeft: 36, paddingRight: searchTerm ? 36 : 14 }}
                                />
                                <Search size={14} aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                                {searchTerm && !voice.listening && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        aria-label="Wis zoekterm"
                                        style={{
                                            position: 'absolute',
                                            right: 8,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: 24,
                                            height: 24,
                                            borderRadius: 6,
                                            background: 'rgba(255,255,255,.06)',
                                            border: 'none',
                                            color: 'var(--muted)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <X size={12} aria-hidden />
                                    </button>
                                )}
                            </div>
                            {voice.error && (
                                <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444' }} role="alert">
                                    {voice.error}
                                </div>
                            )}
                        </header>

                        {/* Filter chips */}
                        <div className={styles.filters} role="tablist" aria-label="Gang-filter">
                            {COURSES.map((c) => (
                                <button
                                    key={c.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeCourse === c.key}
                                    className={`${styles.filterChip} ${activeCourse === c.key ? styles.filterChipActive : ''}`}
                                    onClick={() => setActiveCourse(c.key)}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>

                        {/* Pull hint */}
                        <div className={styles.pullHint} aria-hidden>↓ Trek om te vernieuwen</div>

                        {/* Cards */}
                        <div className={styles.cards}>
                            {filtered.length === 0 ? (
                                <div className={styles.empty}>Geen gerechten in deze gang.</div>
                            ) : (
                                filtered.map((d) => (
                                    <MobileDishCard
                                        key={d.id}
                                        dish={d}
                                        isOpen={openDishId === d.id}
                                        onTap={(id) => setOpenDishId(openDishId === id ? null : id)}
                                    />
                                ))
                            )}
                        </div>

                        {/* Bottom drawer */}
                        {openDish && (
                            <DishDrawer dish={openDish} onClose={() => setOpenDishId(null)} />
                        )}

                        {/* Bottom nav — links naar bestaande routes */}
                        <nav className={styles.bottomNav} aria-label="Hoofdnavigatie">
                            {NAV_ITEMS.map((n) => {
                                const Icon = n.icon;
                                const isActive = activeNav === n.key;
                                return (
                                    <Link
                                        key={n.key}
                                        href={n.href}
                                        className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                                        onClick={() => setActiveNav(n.key)}
                                        aria-current={isActive ? 'page' : undefined}
                                    >
                                        <Icon size={20} aria-hidden />
                                        <span>{n.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </div>
        </div>
    );
}
