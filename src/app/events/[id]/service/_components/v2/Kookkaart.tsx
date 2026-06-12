'use client';

/**
 * Kookkaart V2 — fullscreen slide-up sheet (uit design-handoff
 * service-kookkaart.jsx). Tabs: Actieplan · Mise en place · Per tafel ·
 * Kwaliteit. Geen aparte route: ESC of de sluitknop terug naar het bord.
 * AI (actieplan-generator, Rook-check) stelt voor — jij bevestigt.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronDown, CircleCheck, ClockAlert, Flame, HandPlatter, Loader2, Package, Sparkles } from 'lucide-react';
import type { ServiceEvent, Course } from '../../_types/service';
import type { TableZoneInfo } from '@/lib/floorPlanZones';
import { generateActieplan, type ActieplanResult } from '@/lib/actieplan';
import { useToast } from '@/components/Toast';
import { SBPhoto, SBStatusPill, SBTableGrid, SBProgress } from './atoms';
import { sbActie, sbTijd, gangTijdMin, groepeerStappen, type CourseChecks, type TafelStatus } from './helpers';

const KK_TABS = ['Actieplan', 'Mise en place', 'Per tafel', 'Kwaliteit'] as const;
type KkTab = typeof KK_TABS[number];

export function SBKookkaart({ event, course, index, checks, tableZones, onSetTafel, onActie, onToggle, onApplyActieplan, onClose }: {
    event: ServiceEvent;
    course: Course;
    index: number;
    checks: CourseChecks;
    tableZones: Record<number, TableZoneInfo>;
    onSetTafel: (course: Course, item: Course['items'][number], status: TafelStatus) => void;
    onActie: (course: Course, next: Course['status']) => void;
    onToggle: (type: 'stappen' | 'mise' | 'kwaliteit', key: string) => void;
    onApplyActieplan: (courseId: string, result: ActieplanResult) => Promise<void>;
    onClose: () => void;
}) {
    const showToast = useToast();
    const [tab, setTab] = useState<KkTab>('Actieplan');
    const [genStaat, setGenStaat] = useState<'idle' | 'bezig' | 'voorstel'>('idle');
    const [voorstel, setVoorstel] = useState<ActieplanResult | null>(null);
    const [overnemen, setOvernemen] = useState(false);
    const [rookCheck, setRookCheck] = useState<'idle' | 'bezig' | 'klaar'>('idle');
    const [rookAntwoord, setRookAntwoord] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const geserveerd = course.items.filter(i => i.served).length;
    const actie = sbActie(course, geserveerd, course.items.length);

    /* Voortgang over alle stappen */
    const totaal = course.steps.length;
    const af = course.steps.filter(s => checks.stappen[String(s.n)]).length;
    const pct = totaal ? (af / totaal) * 100 : 0;

    /* Mise — kritiek = niet afgevinkt + gang start < 15 min */
    const nuDate = new Date();
    const minTotStart = gangTijdMin(event.startTime, course) - (nuDate.getHours() * 60 + nuDate.getMinutes());
    const kritiekVenster = minTotStart < 15;
    const miseItems = course.mise.map((m, i) => ({ ...m, key: String(i) }));
    const miseSort = [...miseItems].sort((a, b) => {
        const ka = kritiekVenster && !checks.mise[a.key] ? 0 : 1;
        const kb = kritiekVenster && !checks.mise[b.key] ? 0 : 1;
        return ka - kb;
    });

    const kwaliteitItems = course.qualityChecks.map((txt, i) => ({ txt, key: String(i) }));

    const groepen = groepeerStappen(course);
    const portions = course.items.reduce((a, i) => a + (i.count || 0), 0);

    async function startGen() {
        setGenStaat('bezig');
        try {
            const { supabase } = await import('@/lib/supabase');
            const result = await generateActieplan(supabase, {
                gerechtIds: (course.gerechten || []).map(g => g.id).filter((x): x is string => !!x),
                dishNames: course.description.split(',').map(s => s.trim()).filter(Boolean),
                portions,
            });
            if (result.steps.length === 0) {
                showToast(result.sources[0] || 'Geen receptuur gevonden voor deze gang.', 'warning');
                setGenStaat('idle');
                return;
            }
            setVoorstel(result);
            setGenStaat('voorstel');
        } catch (e) {
            showToast('Actieplan genereren mislukt: ' + (e instanceof Error ? e.message : 'onbekende fout'), 'error');
            setGenStaat('idle');
        }
    }

    async function bevestigVoorstel() {
        if (!voorstel) return;
        setOvernemen(true);
        try {
            await onApplyActieplan(course.id, voorstel);
            setVoorstel(null);
            setGenStaat('idle');
        } finally {
            setOvernemen(false);
        }
    }

    /* Rook laatste-check — bestaande chef-coach call met de kwaliteitslijst. */
    async function vraagRook() {
        setRookCheck('bezig');
        try {
            const res = await fetch('/api/chef-coach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    now: new Date().toTimeString().slice(0, 5),
                    eventTitle: event.title,
                    eventGuests: event.guests,
                    activeCourseTitle: course.title,
                    activeCourseStatus: course.status,
                    miseRemaining: course.qualityChecks.map(q => ({ label: q })),
                    userQuestion: 'Doe de laatste kwaliteitscheck voor deze gang — kort en concreet.',
                }),
            });
            const body = await res.json();
            setRookAntwoord(body.success ? body.directive : 'Rook is even niet bereikbaar — loop de checks zelf na.');
        } catch {
            setRookAntwoord('Rook is even niet bereikbaar — loop de checks zelf na.');
        }
        setRookCheck('klaar');
    }

    return (
        <div className="sb-kk-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="sb-kk" role="dialog" aria-modal="true" aria-label={`Kookkaart ${course.title}`}>

                {/* Hero */}
                <div className="sb-kk-hero">
                    <SBPhoto src={course.fotoUrl} alt={course.title} className="sb-kk-foto" />
                    <div className="sb-kk-hero-grad" aria-hidden="true" />
                    <button className="sb-kk-sluit" onClick={onClose} aria-label="Sluiten (Esc)"><ChevronDown size={20} /></button>
                    <div className="sb-kk-hero-txt">
                        <span className="sb-focus-gangnr">Gang {index + 1} · {sbTijd(gangTijdMin(event.startTime, course))}</span>
                        <span className="sb-kk-titel">{course.title}</span>
                        <div className="sb-kk-cijfers">
                            <span>{portions} porties</span>
                            <span>prep {course.prepTime} min</span>
                            <span>{geserveerd}/{course.items.length} tafels geserveerd</span>
                            <SBStatusPill status={course.status} />
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <nav className="sb-kk-tabs" aria-label="Kookkaart-onderdelen">
                    {KK_TABS.map(t => (
                        <button key={t} className={`sb-kk-tab ${tab === t ? 'is-actief' : ''}`} onClick={() => setTab(t)} aria-current={tab === t}>{t}</button>
                    ))}
                </nav>

                <div className="sb-kk-body">

                    {/* ── ACTIEPLAN ── */}
                    {tab === 'Actieplan' && (
                        <div className="sb-kk-pane">
                            {totaal > 0 && (
                                <div className="sb-kk-progrij">
                                    <SBProgress pct={pct} />
                                    <span className="sb-kk-progtxt">{af}/{totaal} stappen</span>
                                </div>
                            )}

                            {totaal === 0 ? (
                                /* Lege gang → generator-flow: voorstel, jij bevestigt. */
                                <section className="sb-kk-gerecht">
                                    <div className="sb-kk-gerecht-kop">
                                        {(course.gerechten || [])[0] && (
                                            <SBPhoto src={course.gerechten![0].fotoUrl} alt={course.gerechten![0].naam} className="sb-kk-thumb" />
                                        )}
                                        <strong>{(course.gerechten || []).map(g => g.naam).join(' · ') || course.title}</strong>
                                    </div>
                                    {genStaat === 'voorstel' && voorstel ? (
                                        <div className="sb-kk-voorstel">
                                            <div className="sb-kk-voorstel-kop">
                                                <Sparkles size={14} />
                                                <span>Voorstel uit de receptuur, geschaald naar {portions}p — {voorstel.sources.join(' · ')}. Jij bevestigt.</span>
                                            </div>
                                            <div className="sb-kk-comp is-voorstel">
                                                {voorstel.steps.map(s => (
                                                    <div key={s.n} className="sb-kk-stap is-vast">
                                                        <span className="sb-kk-stap-ring" />
                                                        <span className="sb-kk-stap-txt">{s.action}</span>
                                                        <span className="sb-kk-stap-hoev">{s.detail}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="sb-kk-voorstel-acties">
                                                <button className="sb-kk-bevestig" onClick={bevestigVoorstel} disabled={overnemen}>
                                                    <Check size={15} /> {overnemen ? 'Opslaan…' : 'Plan overnemen'}
                                                </button>
                                                <button className="sb-kk-weiger" onClick={() => { setVoorstel(null); setGenStaat('idle'); }} disabled={overnemen}>
                                                    Verwerpen
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button className="sb-kk-gen" onClick={startGen} disabled={genStaat === 'bezig'}>
                                            {genStaat === 'bezig' ? <Loader2 size={16} className="sb-spin" /> : <Sparkles size={16} />}
                                            {genStaat === 'bezig' ? 'Rook leest de receptuur…' : 'Actieplan genereren uit receptuur'}
                                        </button>
                                    )}
                                </section>
                            ) : (
                                groepen.map((g, gi) => (
                                    <section key={gi} className="sb-kk-gerecht">
                                        <div className="sb-kk-gerecht-kop">
                                            <SBPhoto src={g.fotoUrl} alt={g.naam} className="sb-kk-thumb" />
                                            <strong>{g.naam}</strong>
                                        </div>
                                        <div className="sb-kk-comp">
                                            {g.stappen.map(s => {
                                                const key = String(s.n);
                                                const aan = !!checks.stappen[key];
                                                return (
                                                    <button key={s.n} className={`sb-kk-stap ${aan ? 'is-af' : ''}`} onClick={() => onToggle('stappen', key)} aria-pressed={aan}>
                                                        <span className="sb-kk-stap-ring">{aan && <Check size={13} />}</span>
                                                        <span className="sb-kk-stap-txt">{s.txt}</span>
                                                        <span className="sb-kk-stap-hoev">{s.hoev}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {g.serviceTip && <p className="sb-kk-tip">“{g.serviceTip}”</p>}
                                    </section>
                                ))
                            )}
                        </div>
                    )}

                    {/* ── MISE EN PLACE ── */}
                    {tab === 'Mise en place' && (
                        <div className="sb-kk-pane">
                            {miseItems.length === 0 ? (
                                <p className="sb-kk-leegtxt">Geen mise en place gekoppeld aan deze gang.</p>
                            ) : miseSort.map(m => {
                                const aan = !!checks.mise[m.key];
                                const kritiek = kritiekVenster && !aan;
                                return (
                                    <button key={m.key} className={`sb-kk-mise ${aan ? 'is-af' : ''} ${kritiek ? 'is-kritiek' : ''}`} onClick={() => onToggle('mise', m.key)} aria-pressed={aan}>
                                        <span className="sb-kk-stap-ring">{aan && <Check size={13} />}</span>
                                        <span className="sb-kk-mise-main">
                                            <span className="sb-kk-mise-naam">{m.item}</span>
                                            <span className="sb-kk-mise-bron"><Package size={11} /> {m.source || '—'}</span>
                                        </span>
                                        {kritiek && <span className="sb-kk-kritiek-tag"><ClockAlert size={12} /> &lt; 15 min</span>}
                                        <span className="sb-kk-stap-hoev">{m.qty}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* ── PER TAFEL ── */}
                    {tab === 'Per tafel' && (
                        <div className="sb-kk-pane">
                            <SBTableGrid
                                big
                                items={course.items}
                                tableZones={tableZones}
                                allergieen={event.allergyTable}
                                onSet={(item, status) => onSetTafel(course, item, status)}
                            />
                        </div>
                    )}

                    {/* ── KWALITEIT ── */}
                    {tab === 'Kwaliteit' && (
                        <div className="sb-kk-pane">
                            {kwaliteitItems.length === 0 ? (
                                <p className="sb-kk-leegtxt">Geen kwaliteitschecks voor deze gang.</p>
                            ) : kwaliteitItems.map(q => {
                                const aan = !!checks.kwaliteit[q.key];
                                return (
                                    <button key={q.key} className={`sb-kk-stap sb-kk-kwal ${aan ? 'is-af' : ''}`} onClick={() => onToggle('kwaliteit', q.key)} aria-pressed={aan}>
                                        <span className="sb-kk-stap-ring">{aan && <Check size={13} />}</span>
                                        <span className="sb-kk-stap-txt">{q.txt}</span>
                                    </button>
                                );
                            })}
                            <button className="sb-kk-rookcheck" onClick={vraagRook} disabled={rookCheck === 'bezig'}>
                                {rookCheck === 'bezig' ? <Loader2 size={15} className="sb-spin" /> : <Sparkles size={15} />}
                                {rookCheck === 'bezig' ? 'Rook kijkt mee…' : 'Vraag Rook om laatste check'}
                            </button>
                            {rookCheck === 'klaar' && rookAntwoord && (
                                <div className="sb-kk-rookantwoord">
                                    <span className="sb-rook-avatar"><Sparkles size={13} /></span>
                                    <p>{rookAntwoord}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Eén primaire actie — zelfde flow als het bord */}
                {actie && (
                    <button className="sb-primair sb-kk-primair" onClick={() => onActie(course, actie.next)}>
                        {course.status === 'queued' ? <Flame size={20} /> : course.status === 'active' ? <CircleCheck size={20} /> : <HandPlatter size={20} />}
                        {actie.label}
                    </button>
                )}
            </div>
        </div>
    );
}
