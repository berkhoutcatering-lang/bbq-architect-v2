'use client';

/**
 * Service-bord V2 — bord-onderdelen (uit design-handoff service-board.jsx):
 * topbar, Rook directive-strip, tab-balk, gangen-rail, focus-kaart en
 * rechterkolom (straks + mini-plattegrond). Bedraad op echte data.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    Brush, Check, ChevronLeft, ChevronRight, CircleCheck, CircleHelp, ClockAlert,
    Flame, HandPlatter, ListChecks, MessageSquare, OctagonAlert, Package, Sparkles, BookOpen,
} from 'lucide-react';
import type { ServiceEvent, Course, AllergyEntry } from '../../_types/service';
import type { TableZoneInfo } from '@/lib/floorPlanZones';
import type { ServiceZone } from '@/types/database.types';
import { SBPhoto, SBDot, SBStatusPill, SBTableGrid, SBMiniMap, type MiniMapTafel } from './atoms';
import {
    sbActie, sbTijd, gangTijdMin, tafelStatusVan, berekenNu,
    type CourseChecks, type TafelStatus,
} from './helpers';

export interface RookStripBericht {
    tekst: string;
    ernst: 'info' | 'warn' | 'crit';
    tijd: string;
}

/* ── Topbar (56px) ─────────── */
export function SBTopbar({ event, klok, achterMin, toonAfronden, onAfronden, onTerug, onCoach }: {
    event: ServiceEvent;
    klok: string;
    achterMin: number;
    toonAfronden: boolean;
    onAfronden: () => void;
    onTerug: () => void;
    onCoach: () => void;
}) {
    const klaar = event.courses.filter(c => c.status === 'served').length;
    const achter = achterMin > 5;
    return (
        <header className="sb-top">
            <button className="sb-top-terug" onClick={onTerug} aria-label="Terug naar event">
                <ChevronLeft size={20} />
            </button>
            <div className="sb-top-id">
                <span className="sb-top-naam">{event.title}</span>
                <span className="sb-top-meta">{event.venue} · {event.guests} gasten</span>
            </div>
            <div className="sb-top-rechts">
                <span className="sb-top-voortgang">{klaar}/{event.courses.length} gangen</span>
                <span className="sb-top-klok">{klok}</span>
                <span className={`sb-schema ${achter ? 'sb-schema-achter' : ''}`}>
                    {achter ? <ClockAlert size={13} /> : <CircleCheck size={13} />}
                    {achter ? `+${achterMin} min achter` : 'Op schema'}
                </span>
                {toonAfronden && (
                    <button className="sb-top-afronden" onClick={onAfronden}>
                        <Brush size={13} /> Afronden
                    </button>
                )}
                <button className="sb-top-help" onClick={onCoach} aria-label="Uitleg opnieuw tonen">
                    <CircleHelp size={16} />
                </button>
            </div>
        </header>
    );
}

/* ── Rook directive-strip (40px) — tap opent het chat-paneel ─────────── */
export function SBRookStrip({ bericht, open, onToggle }: {
    bericht: RookStripBericht;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            className={`sb-rook-strip sb-rook-${bericht.ernst} ${open ? 'is-open' : ''}`}
            onClick={onToggle}
            aria-expanded={open}
        >
            <Sparkles size={14} />
            <span className="sb-rook-tekst">{bericht.tekst}</span>
            <span className="sb-rook-tijd">{bericht.tijd}</span>
            {open ? <ChevronRight size={14} /> : <MessageSquare size={14} />}
        </button>
    );
}

/* ── Tab-balk: Gangen (hier) ⇄ Plattegrond (bestaande Konva-route) ── */
export function SBTabBarV2({ eventId }: { eventId: number }) {
    return (
        <nav className="sb-tabbar" aria-label="Service-weergave">
            <span className="sb-tab is-actief" aria-current="page">Gangen</span>
            <Link className="sb-tab" href={`/events/${eventId}/service/plattegrond`}>Plattegrond</Link>
        </nav>
    );
}

/* ── Gangen-rail — geserveerd klapt in tot één regel ─────────── */
export function SBRail({ event, actiefId, onOpen }: {
    event: ServiceEvent;
    actiefId: string | null;
    onOpen: (courseId: string) => void;
}) {
    return (
        <div className="sb-rail" role="list" aria-label="Alle gangen">
            {event.courses.map((c, i) => {
                const tijd = sbTijd(gangTijdMin(event.startTime, c));
                if (c.status === 'served') {
                    return (
                        <button key={c.id} role="listitem" className="sb-rij sb-rij-mini" onClick={() => onOpen(c.id)}
                            aria-label={`${c.title} — geserveerd, open kookkaart`}>
                            <span className="sb-rij-nr">{i + 1}</span>
                            <span className="sb-rij-titel">{c.title}</span>
                            <span className="sb-rij-tijd">{tijd}</span>
                            <SBDot status="served" size={9} />
                        </button>
                    );
                }
                return (
                    <button
                        key={c.id} role="listitem"
                        className={`sb-rij ${c.id === actiefId ? 'is-actief' : ''}`}
                        onClick={() => onOpen(c.id)}
                        aria-label={`${c.title} — open kookkaart`}
                    >
                        <span className="sb-rij-nr">{i + 1}</span>
                        <SBPhoto src={c.fotoUrl} alt={c.title} className="sb-rij-foto" />
                        <span className="sb-rij-main">
                            <span className="sb-rij-titel">{c.title}</span>
                            <span className="sb-rij-tijd">{tijd}</span>
                        </span>
                        <SBDot status={c.status} />
                    </button>
                );
            })}
        </div>
    );
}

/* ── Focus-kaart: de actieve gang groot ─────────── */
export function SBFocusCard({ event, course, index, checks, tableZones, onSetTafel, onActie, onOpenKookkaart }: {
    event: ServiceEvent;
    course: Course;
    index: number;
    checks: CourseChecks;
    tableZones: Record<number, TableZoneInfo>;
    onSetTafel: (course: Course, item: Course['items'][number], status: TafelStatus) => void;
    onActie: (course: Course, next: Course['status']) => void;
    onOpenKookkaart: (courseId: string) => void;
}) {
    const geserveerd = course.items.filter(i => i.served).length;
    const actie = sbActie(course, geserveerd, course.items.length);
    const nu = berekenNu(course, checks, event.allergyTable);
    const gerechtNamen = (course.gerechten || []).map(g => g.naam).join(' · ') || course.description;

    return (
        <section className="sb-focus" aria-label={`Actieve gang: ${course.title}`}>
            <button className="sb-focus-hero" onClick={() => onOpenKookkaart(course.id)} aria-label="Open kookkaart">
                <SBPhoto src={course.fotoUrl} alt={course.title} className="sb-focus-foto" />
                <span className="sb-focus-hero-grad" aria-hidden="true" />
                <span className="sb-focus-hero-onder">
                    <span className="sb-focus-gangnr">Gang {index + 1} · {sbTijd(gangTijdMin(event.startTime, course))}</span>
                    <span className="sb-focus-titel">{course.title}</span>
                    <span className="sb-focus-gerechten">{gerechtNamen}</span>
                </span>
                <span className="sb-focus-hero-rechts">
                    <SBStatusPill status={course.status} />
                    <span className="sb-focus-cijfers">
                        {course.items.reduce((a, i) => a + (i.count || 0), 0)}p · prep {course.prepTime}m · {geserveerd}/{course.items.length} tafels
                    </span>
                </span>
            </button>

            <div className="sb-focus-body">
                <div className="sb-focus-kop-rij">
                    <span className="sb-focus-sublabel">Per tafel</span>
                    <button className="sb-focus-kk" onClick={() => onOpenKookkaart(course.id)}>
                        <BookOpen size={14} /> Kookkaart
                    </button>
                </div>
                <SBTableGrid
                    items={course.items}
                    tableZones={tableZones}
                    allergieen={event.allergyTable}
                    onSet={(item, status) => onSetTafel(course, item, status)}
                />

                {/* ── NU: wat vraagt direct aandacht ── */}
                <div className="sb-nu" aria-label="Nu belangrijk">
                    <span className="sb-nu-label">Nu</span>
                    <div className="sb-nu-grid">
                        <div className={`sb-nu-item ${nu.miseMis.length ? 'is-warn' : 'is-ok'}`}>
                            <Package size={15} />
                            <span className="sb-nu-txt">
                                <strong>{nu.miseMis.length
                                    ? `${nu.miseMis[0].item}${nu.miseMis.length > 1 ? ` +${nu.miseMis.length - 1}` : ''}`
                                    : 'Mise compleet'}</strong>
                                <span>{nu.miseMis.length ? 'mise mist nog' : 'alles staat klaar'}</span>
                            </span>
                        </div>
                        <div className="sb-nu-item">
                            <ListChecks size={15} />
                            <span className="sb-nu-txt">
                                <strong>{nu.volgendeStap || (course.steps.length > 0 ? 'Alle stappen afgevinkt' : 'Nog geen actieplan — open de kookkaart')}</strong>
                                <span>volgende stap</span>
                            </span>
                        </div>
                        <div className={`sb-nu-item ${nu.strengeAllergieen.length ? 'is-crit' : ''}`}>
                            <OctagonAlert size={15} />
                            <span className="sb-nu-txt">
                                <strong>{nu.strengeAllergieen.length ? nu.strengeAllergieen.join(' · ') : 'Geen strenge allergieën'}</strong>
                                <span>{nu.strengeAllergieen.length ? 'streng — apart gereedschap' : 'deze avond'}</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {actie ? (
                <button className="sb-primair" onClick={() => onActie(course, actie.next)}>
                    {course.status === 'queued' ? <Flame size={20} /> : course.status === 'active' ? <CircleCheck size={20} /> : <HandPlatter size={20} />}
                    {actie.label}
                </button>
            ) : (
                <div className="sb-primair sb-primair-af">
                    <Check size={20} /> Gang geserveerd
                </div>
            )}
        </section>
    );
}

/* ── Rechterkolom: straks + mini-plattegrond ─────────── */
export function SBRechts({ event, volgende, volgendeIndex, actief, zones, mmTafels, plattegrondHref }: {
    event: ServiceEvent;
    volgende: Course | null;
    volgendeIndex: number;
    actief: Course;
    zones: ServiceZone[];
    mmTafels: MiniMapTafel[];
    plattegrondHref: string;
}) {
    /* Countdown — tikt per halve minuut mee. */
    const [, tick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => tick(t => t + 1), 30_000);
        return () => clearInterval(iv);
    }, []);

    let countdown: string | null = null;
    if (volgende) {
        const nu = new Date();
        const nuMin = nu.getHours() * 60 + nu.getMinutes();
        const over = Math.round(gangTijdMin(event.startTime, volgende) - nuMin);
        countdown = over > 0 ? `over ${over} min` : 'nu';
    }

    const tafelStatus: Record<number, TafelStatus> = {};
    actief.items.forEach(i => { tafelStatus[i.table] = tafelStatusVan(i); });

    return (
        <div className="sb-rechts">
            {volgende && (
                <div className="sb-straks">
                    <span className="sb-straks-label">Straks · gang {volgendeIndex + 1}</span>
                    <SBPhoto src={volgende.fotoUrl} alt={volgende.title} className="sb-straks-foto" />
                    <div className="sb-straks-txt">
                        <strong>{volgende.title}</strong>
                        <span className="sb-straks-tijd">{sbTijd(gangTijdMin(event.startTime, volgende))} · {countdown}</span>
                    </div>
                </div>
            )}
            <div className="sb-rechts-map">
                <span className="sb-straks-label">Zaal</span>
                <SBMiniMap
                    zones={zones}
                    tafels={mmTafels}
                    tafelStatus={tafelStatus}
                    href={plattegrondHref}
                    leeg={zones.length === 0 && mmTafels.length === 0}
                />
            </div>
        </div>
    );
}
