'use client';

/**
 * Service-bord V2 — atoms (uit design-handoff service-atoms.jsx).
 * Status nooit alleen kleur: dot + label/icoon overal.
 * Foto-fallback = rustige gradient met beginletter, geen emoji.
 */

import { useEffect, useRef, useState } from 'react';
import {
    Check, CircleCheck, Info, OctagonAlert, TriangleAlert, Map as MapIcon,
} from 'lucide-react';
import type { CourseItem, CourseStatus, AllergyEntry } from '../../_types/service';
import type { TableZoneInfo } from '@/lib/floorPlanZones';
import type { ServiceZone } from '@/types/database.types';
import { SB_STATUS, SB_TSTATUS, tafelStatusVan, type TafelStatus } from './helpers';

/* ── Foto met gradient-fallback ─────────── */
export function SBPhoto({ src, alt, className }: { src?: string; alt: string; className?: string }) {
    const [err, setErr] = useState(false);
    if (!src || err) {
        return (
            <div className={`sb-foto-fallback ${className || ''}`} role="img" aria-label={alt}>
                <span>{(alt || '?').charAt(0).toUpperCase()}</span>
            </div>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setErr(true)} />;
}

/* ── Status-dot (dot + vinkje bij geserveerd) ─────────── */
export function SBDot({ status, size = 10 }: { status: CourseStatus; size?: number }) {
    const s = SB_STATUS[status] || SB_STATUS.queued;
    if (status === 'served') {
        return (
            <span className="sb-dot sb-dot-check" style={{ width: size + 6, height: size + 6 }} aria-label="Geserveerd">
                <Check size={size} />
            </span>
        );
    }
    return <span className="sb-dot" style={{ width: size, height: size, background: s.cssKleur }} aria-label={s.label} />;
}

export function SBStatusPill({ status }: { status: CourseStatus }) {
    const s = SB_STATUS[status] || SB_STATUS.queued;
    return (
        <span className={`sb-spill sb-spill-${status}`}>
            <CircleCheck size={13} />
            {s.label}
        </span>
    );
}

/* ── Allergie-tag: icoon + label, nooit alleen kleur ─────────── */
export function SBAllergieTag({ a, klein }: { a: AllergyEntry; klein?: boolean }) {
    const streng = a.severity === 'critical';
    const wat = a.note || a.allergens.join(' + ') || 'allergie';
    return (
        <span className={`sb-allerg ${streng ? 'sb-allerg-streng' : ''} ${klein ? 'sb-allerg-klein' : ''}`}>
            {streng ? <OctagonAlert size={klein ? 11 : 13} /> : <Info size={klein ? 11 : 13} />}
            {wat}
        </span>
    );
}

/* ── Tafel-grid + gasten-popover ───────────────────────────────
   items komen uit courses.items; zones uit de plattegrond;
   allergieën uit event_allergies (per tafel). */
export function SBTableGrid({ items, tableZones, allergieen, onSet, big }: {
    items: CourseItem[];
    tableZones: Record<number, TableZoneInfo>;
    allergieen: AllergyEntry[];
    onSet: (item: CourseItem, status: TafelStatus) => void;
    big?: boolean;
}) {
    const [open, setOpen] = useState<number | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDoc = (e: PointerEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
        document.addEventListener('pointerdown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey); };
    }, []);

    return (
        <div className={`sb-tgrid ${big ? 'sb-tgrid-big' : ''}`} ref={wrapRef}>
            {items.map(item => {
                const st = tafelStatusVan(item);
                const allerg = allergieen.filter(a => a.table === item.table);
                const streng = allerg.some(a => a.severity === 'critical');
                const zone = tableZones[item.table] || null;
                const isOpen = open === item.table;
                return (
                    <div key={item.id} className="sb-tcell-wrap">
                        <button
                            className={`sb-tcell sb-tcell-${st} ${streng ? 'sb-tcell-allerg' : ''} ${isOpen ? 'sb-tcell-open' : ''}`}
                            onClick={() => setOpen(isOpen ? null : item.table)}
                            aria-expanded={isOpen}
                        >
                            <span className="sb-tcell-top">
                                <span className="sb-tcell-nr">T{item.table}</span>
                                <span className="sb-tcell-port">{item.count}p</span>
                            </span>
                            <span className="sb-tcell-zone">
                                <span className="sb-tcell-zonedot" style={{ background: zone?.color || 'var(--sb-dim)' }} />
                                {zone ? zone.name : '—'}
                            </span>
                            <span className="sb-tcell-onder">
                                <span className={`sb-tcell-st sb-tcell-st-${st}`}>{SB_TSTATUS[st].label}</span>
                                {allerg.length > 0 && (
                                    <span className={`sb-tcell-allerg-lbl ${streng ? 'is-streng' : ''}`}>
                                        <TriangleAlert size={12} /> {allerg.length} allergie
                                    </span>
                                )}
                            </span>
                        </button>

                        {isOpen && (
                            <div className="sb-pop" role="dialog" aria-label={`Tafel ${item.table}`}>
                                <div className="sb-pop-head">
                                    <strong>Tafel {item.table}</strong>
                                    <span className="sb-pop-zone">{zone ? zone.name + ' · ' : ''}{item.count} gasten</span>
                                </div>
                                {allerg.length > 0 ? (
                                    <div className="sb-pop-gasten">
                                        {allerg.map((a, i) => (
                                            <div key={i} className="sb-pop-gast">
                                                <span className="sb-pop-wie">{a.name}</span>
                                                <SBAllergieTag a={a} klein />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="sb-pop-leeg">Geen allergieën gemeld</div>
                                )}
                                <div className="sb-pop-acties">
                                    <button
                                        className={`sb-pop-btn ${st === 'klaar' ? 'on-warn' : ''}`}
                                        onClick={() => onSet(item, st === 'klaar' ? 'wachtend' : 'klaar')}
                                    >
                                        <CircleCheck size={15} /> Klaar
                                    </button>
                                    <button
                                        className={`sb-pop-btn ${st === 'geserveerd' ? 'on-ok' : ''}`}
                                        onClick={() => { onSet(item, st === 'geserveerd' ? 'klaar' : 'geserveerd'); setOpen(null); }}
                                    >
                                        <Check size={15} /> Geserveerd
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ── Mini-plattegrond: echte zones (polygonen) + tafelnummers ──
   Zones uit service_zones.geometry, tafels uit canvas_json-shapes.
   Coördinaten zijn x_pct/y_pct (0-100) — SVG met preserveAspectRatio
   none vult het 4:3-vlak. */
export interface MiniMapTafel { nr: number; cx: number; cy: number }

export function SBMiniMap({ zones, tafels, tafelStatus, href, leeg }: {
    zones: ServiceZone[];
    tafels: MiniMapTafel[];
    tafelStatus: Record<number, TafelStatus>;
    href: string;
    leeg: boolean;
}) {
    if (leeg) {
        return (
            <a className="sb-minimap sb-minimap-leeg" href={href}>
                <MapIcon size={18} />
                <span>Plattegrond intekenen</span>
            </a>
        );
    }
    return (
        <a className="sb-minimap" href={href} aria-label="Open plattegrond">
            <span className="sb-minimap-vlak">
                <svg className="sb-mm-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {zones.map(z => {
                        const pts = (z.geometry?.points || []).map(p => `${p.x_pct},${p.y_pct}`).join(' ');
                        if (!pts) return null;
                        const kleur = z.color || '#FFBF00';
                        return <polygon key={z.id} points={pts} fill={kleur} fillOpacity={0.16} stroke={kleur} strokeOpacity={0.5} strokeWidth={0.6} strokeDasharray="3 2" />;
                    })}
                </svg>
                {zones.map(z => {
                    const pts = z.geometry?.points || [];
                    if (pts.length < 3) return null;
                    const cx = pts.reduce((s, p) => s + p.x_pct, 0) / pts.length;
                    const cy = pts.reduce((s, p) => s + p.y_pct, 0) / pts.length;
                    return (
                        <span key={z.id} className="sb-mm-zone-naam" style={{ left: `${cx}%`, top: `${cy}%`, color: z.color || 'var(--primary)' }}>
                            {z.name}
                        </span>
                    );
                })}
                {tafels.map(t => {
                    const st = tafelStatus[t.nr] || 'wachtend';
                    return (
                        <span key={t.nr} className={`sb-mm-nr sb-mm-nr-${st}`} style={{ left: `${t.cx}%`, top: `${t.cy}%` }}>
                            {t.nr}
                        </span>
                    );
                })}
            </span>
            <span className="sb-minimap-onder">
                {zones.map(z => (
                    <span key={z.id} className="sb-mm-leg">
                        <span className="sb-mm-leg-dot" style={{ background: z.color || 'var(--primary)' }} />{z.name}
                    </span>
                ))}
            </span>
        </a>
    );
}

/* ── Voortgangsbalk ─────────── */
export function SBProgress({ pct }: { pct: number }) {
    return (
        <div className="sb-prog" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="sb-prog-fill" style={{ width: `${pct}%`, background: 'var(--primary)' }} />
        </div>
    );
}
