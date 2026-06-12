'use client';

/**
 * ServiceBoardV2 — container die het design-handoff service-bord
 * (rail + focus-kaart + straks + mini-plattegrond + Rook-strip +
 * kookkaart-sheet + coach-marks) bedraadt op de echte event-data.
 * De pagina levert data + mutaties; dit component bezit alleen
 * UI-state: klok, afvink-checks (localStorage), kookkaart, coach-marks.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ServiceEvent, Course } from '../../_types/service';
import type { TableZoneInfo } from '@/lib/floorPlanZones';
import type { ServiceZone } from '@/types/database.types';
import type { ActieplanResult } from '@/lib/actieplan';
import { buildServiceDirectives } from '../../_lib/serviceDirectives';
import { SBTopbar, SBRookStrip, SBTabBarV2, SBRail, SBFocusCard, SBRechts, type RookStripBericht } from './Board';
import { SBKookkaart } from './Kookkaart';
import type { MiniMapTafel } from './atoms';
import {
    laadChecks, bewaarChecks, checksVoor, gangTijdMin, isLichteKleur,
    SB_COACH, SB_COACH_KEY, type ChecksState, type TafelStatus,
} from './helpers';
import './service-v2.css';

export interface RookDirectiveInfo {
    text: string;
    severity: 'praise' | 'normal' | 'urgent' | 'critical';
    generatedAt?: string;
}

export default function ServiceBoardV2({
    event, eventDbId, tableZones, floorZones, mmTafels,
    rookDirective, rookOpen, onToggleRook,
    onAdvance, onSetTafel, onApplyActieplan, onExit, onWrapup,
}: {
    event: ServiceEvent;
    eventDbId: number;
    tableZones: Record<number, TableZoneInfo>;
    floorZones: ServiceZone[];
    mmTafels: MiniMapTafel[];
    rookDirective: RookDirectiveInfo | null;
    rookOpen: boolean;
    onToggleRook: () => void;
    onAdvance: (course: Course, next: Course['status']) => void;
    onSetTafel: (course: Course, item: Course['items'][number], status: TafelStatus) => void;
    onApplyActieplan: (courseId: string, result: ActieplanResult) => Promise<void>;
    onExit: () => void;
    onWrapup: () => void;
}) {
    /* ── Klok (1s) ── */
    const [nu, setNu] = useState(() => new Date());
    useEffect(() => {
        const iv = setInterval(() => setNu(new Date()), 1000);
        return () => clearInterval(iv);
    }, []);
    const klok = nu.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    /* ── --on-primary: donkere tekst op lichte brand-kleur ── */
    const [onPrimary, setOnPrimary] = useState('#16100a');
    useEffect(() => {
        try {
            const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim();
            setOnPrimary(isLichteKleur(brand) ? '#16100a' : '#ffffff');
        } catch { /* default blijft staan */ }
    }, []);

    /* ── Afvink-checks per gang (localStorage) ── */
    const [checks, setChecks] = useState<ChecksState>(() =>
        typeof window !== 'undefined' ? laadChecks(eventDbId) : {});
    useEffect(() => { bewaarChecks(eventDbId, checks); }, [eventDbId, checks]);

    function toggleCheck(courseId: string, type: 'stappen' | 'mise' | 'kwaliteit', key: string) {
        setChecks(st => {
            const c = checksVoor(st, courseId);
            return { ...st, [courseId]: { ...c, [type]: { ...c[type], [key]: !c[type][key] } } };
        });
    }

    /* ── Coach-marks (eenmalig) ── */
    const [coach, setCoach] = useState<number | null>(() => {
        if (typeof window === 'undefined') return null;
        try { return localStorage.getItem(SB_COACH_KEY) ? null : 0; } catch { return null; }
    });
    function sluitCoach() {
        setCoach(null);
        try { localStorage.setItem(SB_COACH_KEY, '1'); } catch { /* */ }
    }

    /* ── Kookkaart ── */
    const [kkId, setKkId] = useState<string | null>(null);
    const kkCourse = kkId ? event.courses.find(c => c.id === kkId) || null : null;

    /* ── Actief = eerste niet-geserveerde gang — het bord is nooit leeg ── */
    const actief = event.courses.find(c => c.status !== 'served') || event.courses[event.courses.length - 1];
    const actiefIndex = event.courses.indexOf(actief);
    const volgende = event.courses[actiefIndex + 1] || null;

    /* ── Op schema / achter ── */
    const nuMin = nu.getHours() * 60 + nu.getMinutes();
    const achterMin = (actief.status === 'queued' || actief.status === 'active')
        ? Math.max(0, Math.round(nuMin - gangTijdMin(event.startTime, actief)))
        : 0;

    /* ── Rook-strip: laatste echte directive, anders lokale signalen ── */
    const stripBericht = useMemo<RookStripBericht>(() => {
        if (rookDirective) {
            const ernst = rookDirective.severity === 'critical' ? 'crit'
                : rookDirective.severity === 'urgent' ? 'warn' : 'info';
            const tijd = rookDirective.generatedAt
                ? new Date(rookDirective.generatedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                : 'nu';
            return { tekst: rookDirective.text, ernst, tijd };
        }
        const lokaal = buildServiceDirectives(event)[0];
        if (lokaal) {
            return {
                tekst: `${lokaal.title} — ${lokaal.body}`,
                ernst: lokaal.severity === 'critical' ? 'crit' : lokaal.severity === 'opportunity' ? 'warn' : 'info',
                tijd: 'nu',
            };
        }
        return { tekst: 'Rook kijkt mee — tik hier om iets te vragen.', ernst: 'info', tijd: 'nu' };
    }, [rookDirective, event]);

    const served = event.courses.filter(c => c.status === 'served').length;
    const toonAfronden = served >= Math.ceil(event.courses.length / 2);

    return (
        <div className="sbv2" style={{ ['--on-primary' as string]: onPrimary }} data-screen-label="Service-bord">
            <SBTopbar
                event={event}
                klok={klok}
                achterMin={achterMin}
                toonAfronden={toonAfronden}
                onAfronden={onWrapup}
                onTerug={onExit}
                onCoach={() => setCoach(0)}
            />
            <SBRookStrip bericht={stripBericht} open={rookOpen} onToggle={onToggleRook} />
            <SBTabBarV2 eventId={eventDbId} />

            <main className="sb-main">
                <SBRail event={event} actiefId={actief.id} onOpen={setKkId} />
                <SBFocusCard
                    event={event}
                    course={actief}
                    index={actiefIndex}
                    checks={checksVoor(checks, actief.id)}
                    tableZones={tableZones}
                    onSetTafel={onSetTafel}
                    onActie={onAdvance}
                    onOpenKookkaart={setKkId}
                />
                <SBRechts
                    event={event}
                    volgende={volgende}
                    volgendeIndex={actiefIndex + 1}
                    actief={actief}
                    zones={floorZones}
                    mmTafels={mmTafels}
                    plattegrondHref={`/events/${eventDbId}/service/plattegrond`}
                />
            </main>

            {/* Kookkaart-sheet */}
            {kkCourse && (
                <SBKookkaart
                    event={event}
                    course={kkCourse}
                    index={event.courses.indexOf(kkCourse)}
                    checks={checksVoor(checks, kkCourse.id)}
                    tableZones={tableZones}
                    onSetTafel={onSetTafel}
                    onActie={onAdvance}
                    onToggle={(type, key) => toggleCheck(kkCourse.id, type, key)}
                    onApplyActieplan={onApplyActieplan}
                    onClose={() => setKkId(null)}
                />
            )}

            {/* Coach-marks (eenmalig; '?' in de topbar haalt ze terug) */}
            {coach !== null && SB_COACH[coach] && (
                <div className="sb-coach-scrim" onClick={sluitCoach}>
                    <div className={`sb-coach sb-coach-${SB_COACH[coach].pos}`} onClick={e => e.stopPropagation()}>
                        <span className="sb-coach-stap">{coach + 1} / {SB_COACH.length}</span>
                        <strong>{SB_COACH[coach].titel}</strong>
                        <p>{SB_COACH[coach].tekst}</p>
                        <div className="sb-coach-acties">
                            <button className="sb-coach-skip" onClick={sluitCoach}>Overslaan</button>
                            {coach < SB_COACH.length - 1
                                ? <button className="sb-coach-next" onClick={() => setCoach(c => Math.min((c ?? 0) + 1, SB_COACH.length - 1))}>Volgende</button>
                                : <button className="sb-coach-next" onClick={sluitCoach}>Aan de slag</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
