/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { fmtNl } from '@/lib/utils';
import { ArrowLeft, Check, CheckCircle, ChevronDown, ChevronUp, FileText, Flag, Flame, ListChecks, Pencil, ShoppingCart, Star, Thermometer } from 'lucide-react';

// ── Stage colors ──
const COLORS: Record<string, { main: string; bg: string }> = {
    offerte:       { main: '#b2913e', bg: 'rgba(178,145,62,.12)' },
    acceptatie:    { main: '#22c55e', bg: 'rgba(34,197,94,.12)' },
    voorbereiding: { main: '#3b82f6', bg: 'rgba(59,130,246,.12)' },
    eventdag:      { main: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
    afronding:     { main: '#a78bfa', bg: 'rgba(167,139,250,.12)' },
};

function pillClass(status: string) {
    const map: Record<string, string> = { done: 'pill-green', active: 'pill-amber', upcoming: 'pill-blue' };
    return 'pill ' + (map[status] || 'pill-blue');
}
function pillLabel(status: string) {
    const map: Record<string, string> = { done: 'Afgerond', active: 'Actief', upcoming: 'Open' };
    return map[status] || status;
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function EventFlowPage() {
    const params = useParams();
    const router = useRouter();
    const showToast = useToast();
    const eventId = parseInt(String(params.id), 10);

    const [event, setEvent] = useState<any>(null);
    const [offerte, setOfferte] = useState<any>(null);
    const [prepTasks, setPrepTasks] = useState<any[]>([]);
    const [haccpRecords, setHaccpRecords] = useState<any[]>([]);
    const [factuur, setFactuur] = useState<any>(null);
    const [inkooplijst, setInkooplijst] = useState<any>(null);
    const [serviceLogs, setServiceLogs] = useState<any[]>([]);
    const [reflectie, setReflectie] = useState<any>(null);
    const [gangen, setGangen] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [openStages, setOpenStages] = useState<Record<string, boolean>>({});

    useEffect(function () {
        if (!eventId || isNaN(eventId)) return;
        async function load() {
            // Phase 1: load event
            const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single();
            if (!ev) { setLoading(false); return; }
            setEvent(ev);

            // Phase 2: parallel fetch all related data
            const queries = [
                ev.offerte_id ? supabase.from('offertes').select('*').eq('id', ev.offerte_id).single() as any : Promise.resolve({ data: null }),
                supabase.from('prep_tasks').select('*').eq('event_id', eventId).order('dagen', { ascending: true }) as any,
                supabase.from('haccp_records').select('*').eq('event_id', eventId) as any,
                supabase.from('facturen').select('*').eq('client_naam', ev.client_naam || '__none__') as any,
                supabase.from('inkooplijsten').select('*').eq('event_id', eventId).limit(1) as any,
                ev.offerte_id ? supabase.from('service_logs').select('*').eq('offerte_id', ev.offerte_id) as any : Promise.resolve({ data: [] }),
                supabase.from('event_reflecties').select('*').eq('event_id', eventId).limit(1) as any,
                supabase.from('gangen').select('*').order('volgorde', { ascending: true }) as any,
            ];

            const [rOff, rPrep, rHaccp, rFact, rInkoop, rService, rRefl, rGangen] = await Promise.all(queries);

            if (rOff.data) setOfferte(rOff.data);
            setPrepTasks(rPrep.data || []);
            setHaccpRecords(rHaccp.data || []);
            if (rFact.data && rFact.data.length > 0) setFactuur(rFact.data[0]);
            if (rInkoop.data && rInkoop.data.length > 0) setInkooplijst(rInkoop.data[0]);
            setServiceLogs(rService.data || []);
            if (rRefl.data && rRefl.data.length > 0) setReflectie(rRefl.data[0]);
            setGangen(rGangen.data || []);

            // Auto-expand first active stage
            const stages = computeStages(ev, rOff.data, rPrep.data || [], rHaccp.data || [], rFact.data?.[0], rInkoop.data?.[0], rService.data || [], rRefl.data?.[0]);
            const firstActive = stages.find(function (s: any) { return s.status === 'active'; });
            if (firstActive) setOpenStages(function (o) { return Object.assign({}, o, { [firstActive.key]: true }); });

            setLoading(false);
        }
        load();
    }, [eventId]);

    // ── Stage status computation ──
    function computeStages(ev: any, off: any, prep: any[], haccp: any[], fact: any, inkoop: any, svc: any[], refl: any) {
        const isConfirmed = ev.status === 'confirmed' || ev.status === 'completed';
        const isCompleted = ev.status === 'completed';
        const acceptedStatuses = ['geaccepteerd', 'akkoord', 'betaald', 'definitief', 'goedgekeurd'];
        const isToday = ev.date === todayStr();

        // Offerte
        let offerteStatus: string = 'upcoming';
        if (off && acceptedStatuses.includes(off.status)) offerteStatus = 'done';
        else if (off) offerteStatus = 'active';

        // Acceptatie
        let acceptatieStatus: string = 'upcoming';
        if (isConfirmed && fact && prep.length > 0) acceptatieStatus = 'done';
        else if (isConfirmed) acceptatieStatus = 'active';

        // Voorbereiding
        const allPrepDone = prep.length > 0 && prep.every(function (t: any) { return t.done; });
        let voorbereidingStatus: string = 'upcoming';
        if (allPrepDone) voorbereidingStatus = 'done';
        else if (isConfirmed && prep.length > 0) voorbereidingStatus = 'active';

        // Event Dag
        let eventDagStatus: string = 'upcoming';
        if (isCompleted) eventDagStatus = 'done';
        else if (isToday || (isConfirmed && svc.length > 0)) eventDagStatus = 'active';

        // Afronding
        const factBetaald = fact && fact.status === 'betaald';
        let afrondingStatus: string = 'upcoming';
        if (factBetaald && refl) afrondingStatus = 'done';
        else if (isCompleted) afrondingStatus = 'active';

        return [
            { key: 'offerte', label: 'Offerte', status: offerteStatus },
            { key: 'acceptatie', label: 'Acceptatie', status: acceptatieStatus },
            { key: 'voorbereiding', label: 'Voorbereiding', status: voorbereidingStatus },
            { key: 'eventdag', label: 'Event Dag', status: eventDagStatus },
            { key: 'afronding', label: 'Afronding', status: afrondingStatus },
        ];
    }

    // ── Prep task toggle ──
    async function togglePrep(taskId: number, done: boolean) {
        setPrepTasks(function (prev) { return prev.map(function (t) { return t.id === taskId ? Object.assign({}, t, { done: !done }) : t; }); });
        await supabase.from('prep_tasks').update({ done: !done }).eq('id', taskId);
    }

    // ── Toggle stage open/close ──
    function toggleStage(key: string) {
        setOpenStages(function (o) { return Object.assign({}, o, { [key]: !o[key] }); });
    }

    if (loading) return <div className="hopbites-theme" style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>Laden...</div>;
    if (!event) return <div className="hopbites-theme" style={{ padding: 60, textAlign: 'center', color: 'var(--red)' }}>Event niet gevonden</div>;

    const stages = computeStages(event, offerte, prepTasks, haccpRecords, factuur, inkooplijst, serviceLogs, reflectie);
    const totalBedrag = offerte ? (offerte.items || []).reduce(function (s: number, i: any) { return s + (i.qty || 0) * (i.prijs || 0); }, 0) : 0;

    // ── Group prep tasks by day ──
    const prepByDay: Record<number, any[]> = {};
    prepTasks.forEach(function (t) {
        const d = t.dagen || 0;
        if (!prepByDay[d]) prepByDay[d] = [];
        prepByDay[d].push(t);
    });
    const dayLabels: Record<number, string> = { '-3': 'D-3: Bestellen & checken', '-2': 'D-2: Marineren & rubben', '-1': 'D-1: Inladen & mise-en-place', '0': 'D-0: Event dag' };

    // ── Gang name lookup ──
    const gangNameMap: Record<string, string> = {};
    gangen.forEach(function (g: any) { gangNameMap[g.slug] = g.naam; });

    // ── Menu items from offerte ──
    let menuItems: string[] = [];
    if (offerte && offerte.menu_selectie) {
        const sel = offerte.menu_selectie;
        if (typeof sel === 'object' && !Array.isArray(sel)) {
            Object.values(sel).forEach(function (arr: any) {
                if (Array.isArray(arr)) arr.forEach(function (item: any, idx: number) {
                    if (idx % 2 === 0) menuItems.push(typeof item === 'string' ? item : (item.naam || ''));
                });
            });
        }
    }

    return (
        <div className="hopbites-theme">
            {/* Header */}
            <div className="panel" style={{ marginBottom: 24 }}>
                <div className="panel-head">
                    <div>
                        <h3 style={{ margin: 0 }}>{event.name}</h3>
                        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                            {fmtNl(event.date)} &bull; {event.guests} gasten &bull; {event.location || 'Geen locatie'}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={function () { router.push('/events'); }}><ArrowLeft size={14} /> Events</button>
                        <span className={'pill pill-' + (event.status === 'confirmed' ? 'green' : event.status === 'completed' ? 'purple' : 'amber')} style={{ alignSelf: 'center' }}>
                            {event.status.toUpperCase()}
                        </span>
                    </div>
                </div>
                <div className="panel-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div style={{ background: 'var(--card)', padding: '12px 18px', borderRadius: 12, flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Klant</div>
                        <div style={{ fontWeight: 700, marginTop: 4 }}>{event.client_naam || '—'}</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '12px 18px', borderRadius: 12, flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Omzet</div>
                        <div style={{ fontWeight: 700, marginTop: 4, color: 'var(--brand)' }}>{totalBedrag > 0 ? '\u20ac ' + totalBedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2 }) : '\u20ac ' + ((event.guests || 0) * (event.ppp || 0)).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div style={{ background: 'var(--card)', padding: '12px 18px', borderRadius: 12, flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Type</div>
                        <div style={{ fontWeight: 700, marginTop: 4 }}>{event.type || 'Zakelijk'}</div>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div style={{ position: 'relative', paddingLeft: 36 }}>
                {/* Vertical line */}
                <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: 'var(--border)', borderRadius: 1 }} />

                {stages.map(function (stage, idx) {
                    const color = COLORS[stage.key] || COLORS.offerte;
                    const isOpen = openStages[stage.key];
                    const isDone = stage.status === 'done';
                    const isActive = stage.status === 'active';

                    return (
                        <div key={stage.key} style={{ position: 'relative', marginBottom: 8 }}>
                            {/* Circle indicator */}
                            <div style={{
                                position: 'absolute', left: -36 + 6, top: 14, width: 20, height: 20, borderRadius: '50%',
                                background: isDone ? color.main : color.bg,
                                border: '2px solid ' + color.main,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                            }}>
                                {isDone && <Check size={10} style={{ color: '#fff' }} />}
                                {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: color.main }} />}
                            </div>

                            {/* Stage card */}
                            <div className="panel" style={{ borderLeft: '3px solid ' + color.main, cursor: 'pointer' }} onClick={function () { toggleStage(stage.key); }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontWeight: 800, fontSize: 14, color: color.main }}>{stage.label}</span>
                                        <span className={pillClass(stage.status)} style={{ fontSize: 12 }}>{pillLabel(stage.status)}</span>
                                    </div>
                                    {isOpen ? <ChevronUp size={12} style={{ color: 'var(--muted)' }} /> : <ChevronDown size={12} style={{ color: 'var(--muted)' }} />}
                                </div>

                                {isOpen && (
                                    <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>

                                        {/* ═══ STAGE 1: OFFERTE ═══ */}
                                        {stage.key === 'offerte' && (
                                            <div style={{ paddingTop: 14 }}>
                                                {offerte ? (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                            <div>
                                                                <span style={{ fontWeight: 700 }}>{offerte.nummer}</span>
                                                                <span className={'pill pill-' + (offerte.status === 'geaccepteerd' ? 'green' : offerte.status === 'concept' ? 'blue' : 'amber')} style={{ marginLeft: 8, fontSize: 12 }}>{offerte.status}</span>
                                                            </div>
                                                            <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{'\u20ac ' + totalBedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        {menuItems.length > 0 && (
                                                            <div style={{ marginBottom: 14 }}>
                                                                <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Menu</div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                                    {menuItems.map(function (item, i) { return <span key={i} style={{ background: 'var(--card)', padding: '4px 10px', borderRadius: 8, fontSize: 12, border: '1px solid var(--border)' }}>{item}</span>; })}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <button className="btn btn-ghost btn-sm" onClick={function (e) { e.stopPropagation(); router.push('/offertes'); }}>
                                                            <FileText size={14} /> Naar Offerte
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div style={{ color: 'var(--muted)', fontStyle: 'italic', paddingTop: 8 }}>Nog geen offerte gekoppeld aan dit event</div>
                                                )}
                                            </div>
                                        )}

                                        {/* ═══ STAGE 2: ACCEPTATIE ═══ */}
                                        {stage.key === 'acceptatie' && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" style={{ paddingTop: 14 }}>
                                                {[
                                                    { label: 'Factuur', Icon: FileText, count: factuur ? 1 : 0, detail: factuur ? factuur.nummer : 'Niet aangemaakt', ok: !!factuur },
                                                    { label: 'Prep Tasks', Icon: ListChecks, count: prepTasks.length, detail: prepTasks.length + ' taken', ok: prepTasks.length > 0 },
                                                    { label: 'Inkooplijst', Icon: ShoppingCart, count: inkooplijst ? (inkooplijst.items || []).length : 0, detail: inkooplijst ? (inkooplijst.items || []).length + ' items' : 'Niet aangemaakt', ok: !!inkooplijst },
                                                    { label: 'HACCP', Icon: Thermometer, count: haccpRecords.length, detail: haccpRecords.length + ' registraties', ok: haccpRecords.length > 0 },
                                                ].map(function (item) {
                                                    return (
                                                        <div key={item.label} style={{ background: item.ok ? 'rgba(34,197,94,.06)' : 'rgba(130,130,130,.06)', padding: '12px 14px', borderRadius: 10, border: '1px solid ' + (item.ok ? 'rgba(34,197,94,.2)' : 'var(--border)') }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                                <item.Icon size={13} style={{ color: item.ok ? '#22c55e' : 'var(--muted)' }} />
                                                                <span style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</span>
                                                                {item.ok && <CheckCircle size={11} style={{ color: '#22c55e' }} />}
                                                            </div>
                                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.detail}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* ═══ STAGE 3: VOORBEREIDING ═══ */}
                                        {stage.key === 'voorbereiding' && (
                                            <div style={{ paddingTop: 14 }}>
                                                {prepTasks.length === 0 ? (
                                                    <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Nog geen prep-taken aangemaakt</div>
                                                ) : (
                                                    Object.keys(prepByDay).sort(function (a, b) { return Number(a) - Number(b); }).map(function (dayKey) {
                                                        const tasks = prepByDay[Number(dayKey)];
                                                        const doneCount = tasks.filter(function (t: any) { return t.done; }).length;
                                                        const pct = Math.round((doneCount / tasks.length) * 100);
                                                        return (
                                                            <div key={dayKey} style={{ marginBottom: 16 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                    <span style={{ fontWeight: 700, fontSize: 12, color: '#3b82f6' }}>{dayLabels[dayKey] || 'Dag ' + dayKey}</span>
                                                                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{doneCount}/{tasks.length}</span>
                                                                </div>
                                                                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
                                                                    <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? '#22c55e' : '#3b82f6', borderRadius: 2, transition: 'width .3s' }} />
                                                                </div>
                                                                {tasks.map(function (task: any) {
                                                                    return (
                                                                        <label key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer', fontSize: 13 }}
                                                                            onClick={function (e) { e.stopPropagation(); togglePrep(task.id, task.done); }}>
                                                                            <div style={{
                                                                                width: 18, height: 18, borderRadius: 4, border: '2px solid ' + (task.done ? '#22c55e' : 'var(--border)'),
                                                                                background: task.done ? '#22c55e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                                            }}>
                                                                                {task.done && <Check size={10} style={{ color: '#fff' }} />}
                                                                            </div>
                                                                            <span style={{ textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--muted)' : 'var(--text)' }}>{task.text}</span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}

                                        {/* ═══ STAGE 4: EVENT DAG ═══ */}
                                        {stage.key === 'eventdag' && (
                                            <div style={{ paddingTop: 14 }}>
                                                {serviceLogs.length > 0 ? (
                                                    <>
                                                        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Service Logs</div>
                                                        {serviceLogs.map(function (log: any, i: number) {
                                                            const gangName = gangNameMap[log.gang_slug] || log.gang_slug;
                                                            const mins = log.duration_seconds ? Math.round(log.duration_seconds / 60) : null;
                                                            return (
                                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--card)', borderRadius: 8, marginBottom: 6, border: '1px solid var(--border)' }}>
                                                                    <span style={{ fontWeight: 600 }}>{gangName}</span>
                                                                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{mins ? mins + ' min' : '—'}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                ) : (
                                                    <div style={{ color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>Nog geen service logs</div>
                                                )}

                                                {haccpRecords.length > 0 && (
                                                    <>
                                                        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 14 }}>HACCP Registraties</div>
                                                        {haccpRecords.slice(0, 8).map(function (rec: any, i: number) {
                                                            const statusColor = rec.status === 'ok' ? '#22c55e' : rec.status === 'warn' ? '#f59e0b' : '#ef4444';
                                                            return (
                                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'var(--card)', borderRadius: 8, marginBottom: 4, border: '1px solid var(--border)', fontSize: 12 }}>
                                                                    <span>{rec.wat}</span>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                        <span style={{ fontWeight: 700 }}>{rec.temp > 0 ? rec.temp + '\u00b0C' : '—'}</span>
                                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }}></span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        {haccpRecords.length > 8 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>+ {haccpRecords.length - 8} meer...</div>}
                                                    </>
                                                )}

                                                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={function (e) { e.stopPropagation(); router.push('/service'); }}>
                                                    <Flame size={14} /> Naar Service Mode
                                                </button>
                                            </div>
                                        )}

                                        {/* ═══ STAGE 5: AFRONDING ═══ */}
                                        {stage.key === 'afronding' && (
                                            <div style={{ paddingTop: 14 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {/* Factuur */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <FileText size={14} />
                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>Factuur</span>
                                                        </div>
                                                        {factuur ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{factuur.nummer}</span>
                                                                <span className={'pill pill-' + (factuur.status === 'betaald' ? 'green' : factuur.status === 'verzonden' ? 'amber' : 'blue')} style={{ fontSize: 12 }}>{factuur.status}</span>
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Niet aangemaakt</span>
                                                        )}
                                                    </div>

                                                    {/* Reflectie */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <Star size={14} />
                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>Reflectie</span>
                                                        </div>
                                                        {reflectie ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Score: {reflectie.score}/10</span>
                                                                <span className="pill pill-green" style={{ fontSize: 12 }}>Ingevuld</span>
                                                            </div>
                                                        ) : (
                                                            <button className="btn btn-ghost btn-sm" onClick={function (e) { e.stopPropagation(); router.push('/events/' + eventId + '/reflectie'); }}>
                                                                <Pencil size={14} /> Invullen
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Event Status */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--border)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <Flag size={14} />
                                                            <span style={{ fontWeight: 600, fontSize: 13 }}>Event Status</span>
                                                        </div>
                                                        <span className={'pill pill-' + (event.status === 'completed' ? 'green' : 'amber')} style={{ fontSize: 12 }}>{event.status}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
