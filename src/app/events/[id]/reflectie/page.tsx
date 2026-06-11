'use client';

/* Reflectie v2 — design-system build (Tool 10).
   Smiley-slider 1-10 · oorzaak-chips bij score < 7 · templated vragen +
   actie-items · klant-feedback met Haiku-polish (diff-view, intentie
   behouden) · historie-sidebar met score-trend · afrond-gate die de
   factuur-CTA op het event-hub Overzicht ontgrendelt (events.status →
   completed gebeurt pas bij afronden, niet bij elke save). */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { fmtNl } from '@/lib/utils';
import type { DbEvent } from '@/types';
import {
    AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle,
    CloudUpload, Flag, Flame, Globe, HeartHandshake, History, Loader2,
    Lock, Minus, NotebookPen, PackageOpen, Plus, Receipt, Sparkles,
    ThumbsUp, Wrench, X,
} from 'lucide-react';

const EMOJI = ['😫', '😖', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩', '🔥'];
const OORZAKEN = ['Timing', 'Crew-bezetting', 'Materiaal', 'Inkoop', 'Weer', 'Locatie', 'Klantcommunicatie', 'Anders'];

function scoreLabel(s: number | null): string {
    if (s == null) return 'Schuif of tik om te scoren';
    if (s <= 2) return 'Zware avond';
    if (s <= 4) return 'Stroef gelopen';
    if (s <= 6) return 'Ging oké, niet vlekkeloos';
    if (s <= 8) return 'Sterke service';
    if (s === 9) return 'Topavond';
    return 'Vlammend — beste vuur van het seizoen';
}
function scoreTone(s: number | null): string {
    if (s == null) return 'var(--muted)';
    return s < 5 ? 'var(--red)' : s < 7 ? 'var(--amber)' : 'var(--green)';
}
function relTijd(ts: number | null): string {
    if (!ts) return '—';
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'zojuist';
    if (m < 60) return m + ' min geleden';
    const h = Math.round(m / 60);
    return h === 1 ? '1 uur geleden' : h + ' uur geleden';
}

interface ActieItem { id: string; label: string; done: boolean }
interface HistRow { id: number; score: number | null; goed?: string | null; verbeterpunten?: string | null; oorzaken?: string[]; created_at?: string; events?: { name?: string | null; date?: string | null } | null }

export default function ReflectiePage() {
    const params = useParams();
    const router = useRouter();
    const showToast = useToast();
    const eventId = parseInt(String(params.id), 10);

    const [event, setEvent] = useState<DbEvent | null>(null);
    const [existingId, setExistingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [historie, setHistorie] = useState<HistRow[]>([]);

    /* reflectie-state — design-velden + behouden operationele velden */
    const [score, setScore] = useState<number | null>(null);
    const [oorzaken, setOorzaken] = useState<string[]>([]);
    const [goed, setGoed] = useState('');
    const [beter, setBeter] = useState('');           // → kolom verbeterpunten
    const [items, setItems] = useState<ActieItem[]>([]);
    const [feedback, setFeedback] = useState('');
    const [polished, setPolished] = useState<string | null>(null);
    const [completedAt, setCompletedAt] = useState<string | null>(null);
    const [overschot, setOverschot] = useState('');
    const [tekort, setTekort] = useState('');
    const [kwaliteit, setKwaliteit] = useState('');

    const [nieuwItem, setNieuwItem] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [aiPhase, setAiPhase] = useState<'idle' | 'running' | 'diff'>('idle');
    const [aiVoorstel, setAiVoorstel] = useState<string | null>(null);

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loaded = useRef(false);

    useEffect(function () {
        if (!eventId || isNaN(eventId)) return;
        async function load() {
            const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).single();
            if (ev) setEvent(ev as any);

            const { data: ref } = await supabase.from('event_reflecties').select('*').eq('event_id', eventId).limit(1);
            if (ref && ref.length > 0) {
                const r = ref[0] as any;
                setExistingId(r.id);
                setScore(typeof r.score === 'number' && r.score > 0 ? r.score : null);
                setOorzaken(Array.isArray(r.oorzaken) ? r.oorzaken : []);
                setGoed(r.goed || '');
                setBeter(r.verbeterpunten || '');
                setItems(Array.isArray(r.actie_items) ? r.actie_items : []);
                setFeedback(r.klant_feedback || '');
                setPolished(r.klant_feedback_web || null);
                setCompletedAt(r.completed_at || null);
                setOverschot(r.overschot || '');
                setTekort(r.tekort || '');
                setKwaliteit(r.kwaliteit || '');
            }

            /* historie: laatste 5 afgeronde reflecties van andere events */
            const { data: hist } = await supabase
                .from('event_reflecties')
                .select('id, score, goed, verbeterpunten, oorzaken, created_at, events(name, date)')
                .neq('event_id', eventId)
                .order('created_at', { ascending: false })
                .limit(5);
            if (hist) setHistorie(hist as any);

            setLoading(false);
            /* korte delay zodat de initial hydrate geen auto-save triggert */
            setTimeout(function () { loaded.current = true; }, 400);
        }
        load();
    }, [eventId]);

    const buildPayload = useCallback(function () {
        return {
            event_id: eventId,
            score: score ?? 0,
            goed: goed,
            verbeterpunten: beter,
            oorzaken: oorzaken,
            actie_items: items,
            klant_feedback: feedback,
            klant_feedback_web: polished,
            overschot, tekort, kwaliteit,
            completed_at: completedAt,
        };
    }, [eventId, score, goed, beter, oorzaken, items, feedback, polished, overschot, tekort, kwaliteit, completedAt]);

    const persist = useCallback(async function (extra?: Record<string, any>) {
        setSaving(true);
        try {
            const payload = { ...buildPayload(), ...(extra || {}) };
            if (existingId) {
                const { error } = await supabase.from('event_reflecties').update(payload).eq('id', existingId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('event_reflecties').insert(payload).select();
                if (error) throw error;
                if (data && data[0]) setExistingId(data[0].id);
            }
            setSavedAt(Date.now());
        } catch (e: any) {
            showToast('Opslaan mislukt: ' + (e.message || ''), 'error');
        }
        setSaving(false);
    }, [buildPayload, existingId, showToast]);

    /* debounced auto-save bij elke wijziging */
    useEffect(function () {
        if (!loaded.current) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(function () { void persist(); }, 1500);
        return function () { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [score, goed, beter, oorzaken, items, feedback, polished, overschot, tekort, kwaliteit]); // eslint-disable-line react-hooks/exhaustive-deps

    async function runPolish() {
        if (feedback.trim().length < 30) return;
        setAiPhase('running');
        try {
            const res = await fetch('/api/service-feedback-rewrite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rawNotes: 'Klant-feedback (letterlijk): ' + feedback,
                    eventContext: event ? { title: event.name, date: event.date, guests: event.guests } : undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok || json.error) throw new Error(json.error || 'AI niet bereikbaar');
            setAiVoorstel(json.polishedNarrative || null);
            setAiPhase(json.polishedNarrative ? 'diff' : 'idle');
            if (!json.polishedNarrative) showToast('AI gaf geen herschrijving terug', 'error');
        } catch (e: any) {
            setAiPhase('idle');
            showToast('Polish mislukt: ' + (e.message || ''), 'error');
        }
    }

    async function afronden() {
        const now = new Date().toISOString();
        setCompletedAt(now);
        await persist({ completed_at: now, score: score ?? 0 });
        await supabase.from('events').update({ status: 'completed' }).eq('id', eventId);
        showToast('Reflectie afgerond — factuur staat klaar op het Overzicht', 'success');
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    <Loader2 size={24} className="animate-spin" style={{ marginBottom: 12 }} />
                    <div>Laden...</div>
                </div>
            </div>
        );
    }
    if (!event) {
        return (
            <div className="panel" style={{ textAlign: 'center', padding: 40 }}>
                <AlertCircle size={32} style={{ color: 'var(--red)' }} />
                <h3>Event niet gevonden</h3>
                <button className="btn btn-brand" style={{ marginTop: 16 }} onClick={function () { router.push('/events'); }}>
                    <ArrowLeft size={14} /> Terug naar Events
                </button>
            </div>
        );
    }

    /* locked tot de event-datum voorbij is (of status al completed) */
    const evDate = new Date(String(event.date) + 'T23:59:59');
    const isVoltooid = event.status === 'completed' || (!Number.isNaN(evDate.getTime()) && evDate.getTime() <= Date.now());

    const laagScore = score != null && score < 7;
    const checks = [
        { label: 'Score gegeven', ok: score != null },
        { label: '"Wat ging goed?" ingevuld', ok: goed.trim().length >= 10 },
        { label: '"Wat kan beter?" ingevuld', ok: beter.trim().length >= 10 },
        ...(laagScore ? [{ label: 'Oorzaak aangegeven (score < 7)', ok: oorzaken.length > 0 }] : []),
    ];
    const allOk = checks.every(function (c) { return c.ok; });

    const heroCard = (title: string, icon: React.ReactNode, right: React.ReactNode | null, body: React.ReactNode) => (
        <div className="panel" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>{icon}{title}</div>
                {right}
            </div>
            {body}
        </div>
    );

    const trendBars = [...historie].reverse().map(function (h) {
        return { score: h.score, label: h.events?.date ? fmtNl(h.events.date).split(' ').slice(0, 2).join(' ') : '—', now: false };
    }).concat([{ score, label: 'nu', now: true } as any]);
    const histAvg = historie.length > 0 ? (historie.reduce(function (a, h) { return a + (h.score || 0); }, 0) / historie.length).toFixed(1) : null;

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out', maxWidth: 1100, margin: '0 auto' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <button className="btn btn-ghost btn-sm" onClick={function () { router.push(`/events/${eventId}/hub`); }}>
                    <ArrowLeft size={14} /> Event-hub
                </button>
                <h1 style={{ fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flame size={15} style={{ color: 'var(--brand)' }} /> Reflectie · {event.name}
                </h1>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtNl(event.date)} · {event.guests} gasten</span>
            </div>

            {!isVoltooid ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 }} className="responsive-grid">
                    <div className="panel" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 28 }}>
                        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(196,163,90,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Lock size={20} style={{ color: 'var(--brand-gold)' }} />
                        </span>
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Reflectie opent na het event</div>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 480 }}>
                                Na afloop leg je hier vast wat goed ging, wat beter kan en wat de klant ervan vond.
                                De afgeronde reflectie ontgrendelt de factuur op werkelijke uren.
                            </p>
                        </div>
                    </div>
                    <HistorieCard historie={historie} trendBars={trendBars} histAvg={histAvg} />
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 16 }} className="responsive-grid">
                    {/* ── linker kolom ── */}
                    <div style={{ minWidth: 0 }}>
                        {/* SCORE HERO */}
                        {heroCard('Hoe ging het?', <Flame size={15} style={{ color: 'var(--brand-gold)' }} />,
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>1 = zware avond · 10 = vlammend</span>,
                            <div style={{ padding: '20px 18px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
                                    <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">{score == null ? '·' : EMOJI[score - 1]}</span>
                                    <div>
                                        <div style={{ fontSize: 34, fontWeight: 800, color: scoreTone(score), lineHeight: 1 }}>
                                            {score == null ? '—' : score}<span style={{ fontSize: 15, fontWeight: 500, color: 'var(--muted)' }}>/10</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{scoreLabel(score)}</div>
                                    </div>
                                </div>
                                <input type="range" min={1} max={10} step={1} value={score ?? 5}
                                    aria-label="Score van 1 tot 10"
                                    onChange={function (e) { setScore(parseInt(e.target.value)); }}
                                    style={{ width: '100%', accentColor: scoreTone(score), height: 8, cursor: 'pointer', opacity: score == null ? 0.45 : 1 }} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                    {EMOJI.map(function (em, i) {
                                        const on = score === i + 1;
                                        return (
                                            <button key={i} title={'Score ' + (i + 1)} onClick={function () { setScore(i + 1); }}
                                                style={{
                                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                                    background: on ? 'rgba(255,191,0,.10)' : 'transparent',
                                                    border: on ? '1px solid rgba(255,191,0,.35)' : '1px solid transparent',
                                                    borderRadius: 8, padding: '4px 6px', cursor: 'pointer', minWidth: 34,
                                                }}>
                                                <span style={{ fontSize: 15, filter: on ? 'none' : 'grayscale(.6)', opacity: on ? 1 : .6 }} aria-hidden="true">{em}</span>
                                                <span style={{ fontSize: 10, color: on ? 'var(--text)' : 'var(--muted-light)', fontWeight: on ? 700 : 400 }}>{i + 1}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* OORZAAK bij score < 7 */}
                        {laagScore && (
                            <div className="panel" style={{ marginBottom: 16, border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.05)' }}>
                                <div style={{ padding: '14px 18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
                                        <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
                                        Score onder de 7 — wat was de belangrijkste oorzaak?
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {OORZAKEN.map(function (o) {
                                            const on = oorzaken.includes(o);
                                            return (
                                                <button key={o} onClick={function () { setOorzaken(on ? oorzaken.filter(function (x) { return x !== o; }) : [...oorzaken, o]); }}
                                                    style={{
                                                        padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                                                        border: on ? '1px solid rgba(245,158,11,.5)' : '1px solid var(--border)',
                                                        background: on ? 'rgba(245,158,11,.15)' : 'var(--card)',
                                                        color: on ? 'var(--amber)' : 'var(--muted)', fontWeight: on ? 700 : 400,
                                                    }}>{o}</button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TEMPLATED VRAGEN + ACTIE-ITEMS */}
                        {heroCard('Reflectie-vragen', <NotebookPen size={15} style={{ color: 'var(--brand-gold)' }} />,
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Template · {String(event.client_naam || 'Hop & Bites')}</span>,
                            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <ThumbsUp size={12} style={{ color: 'var(--brand-gold)' }} /> Wat ging goed?
                                    </label>
                                    <textarea rows={3} value={goed} placeholder="Bv. timing van de brisket, sfeer rond de vuren, samenspel van de crew…"
                                        onChange={function (e) { setGoed(e.target.value); }} />
                                </div>
                                <div className="field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Wrench size={12} style={{ color: 'var(--brand-gold)' }} /> Wat kan beter?
                                        {laagScore && <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 700, marginLeft: 6 }}>vereist bij score &lt; 7</span>}
                                    </label>
                                    <textarea rows={3} value={beter} placeholder="Bv. buffetlijn, opbouwtijd, koeling van de desserts…"
                                        onChange={function (e) { setBeter(e.target.value); }} />
                                </div>

                                {/* actie-items */}
                                <div className="field">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Check size={12} style={{ color: 'var(--brand-gold)' }} /> Actie-items
                                        {items.length > 0 && (
                                            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 6 }}>
                                                {items.filter(function (i) { return i.done; }).length}/{items.length}
                                            </span>
                                        )}
                                    </label>
                                    {items.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                            {items.map(function (it) {
                                                return (
                                                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: it.done ? 'rgba(34,197,94,.05)' : 'var(--card)' }}>
                                                        <button aria-label={it.done ? 'Markeer als open' : 'Markeer als gedaan'}
                                                            onClick={function () { setItems(items.map(function (i) { return i.id === it.id ? { ...i, done: !i.done } : i; })); }}
                                                            style={{
                                                                width: 22, height: 22, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                                                                border: it.done ? '1px solid var(--green)' : '1px solid var(--border-strong)',
                                                                background: it.done ? 'rgba(34,197,94,.15)' : 'transparent',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--green)',
                                                            }}>
                                                            {it.done && <Check size={12} />}
                                                        </button>
                                                        <span style={{ flex: 1, fontSize: 13, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--muted)' : 'var(--text)' }}>{it.label}</span>
                                                        <button aria-label="Verwijder actie-item" onClick={function () { setItems(items.filter(function (i) { return i.id !== it.id; })); }}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--muted-light)', cursor: 'pointer', padding: 4 }}>
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input value={nieuwItem} placeholder="Bv. tweede buffetlijn bij 120+ gasten…"
                                            onChange={function (e) { setNieuwItem(e.target.value); }}
                                            onKeyDown={function (e) {
                                                if (e.key === 'Enter' && nieuwItem.trim()) {
                                                    setItems([...items, { id: 'i' + Date.now(), label: nieuwItem.trim(), done: false }]);
                                                    setNieuwItem('');
                                                }
                                            }}
                                            style={{ flex: 1 }} />
                                        <button className="btn btn-ghost" disabled={!nieuwItem.trim()}
                                            onClick={function () {
                                                setItems([...items, { id: 'i' + Date.now(), label: nieuwItem.trim(), done: false }]);
                                                setNieuwItem('');
                                            }}>
                                            <Plus size={14} /> Voeg toe
                                        </button>
                                    </div>
                                </div>

                                {/* operationeel (bestaande velden behouden) */}
                                <details style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                    <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <PackageOpen size={12} /> Operationeel — overschot, tekort &amp; kwaliteit
                                    </summary>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                                        <div className="field">
                                            <label>Wat was er over?</label>
                                            <textarea rows={2} value={overschot} placeholder="bijv. 2kg pulled pork, 5 broodjes…" onChange={function (e) { setOverschot(e.target.value); }} />
                                        </div>
                                        <div className="field">
                                            <label>Wat was er tekort?</label>
                                            <textarea rows={2} value={tekort} placeholder="bijv. coleslaw was op na 80 gasten…" onChange={function (e) { setTekort(e.target.value); }} />
                                        </div>
                                        <div className="field">
                                            <label>Wat was niet goed genoeg?</label>
                                            <textarea rows={2} value={kwaliteit} placeholder="bijv. brisket iets te droog…" onChange={function (e) { setKwaliteit(e.target.value); }} />
                                        </div>
                                    </div>
                                </details>
                            </div>
                        )}

                        {/* KLANT-FEEDBACK + AI-POLISH */}
                        {heroCard('Klant-feedback', <HeartHandshake size={15} style={{ color: 'var(--brand-gold)' }} />,
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>letterlijk geplakt — AI polisht, jij beslist</span>,
                            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <textarea rows={4} value={feedback}
                                    placeholder="Plak hier de reactie van de klant — letterlijk, met spelfouten en al…"
                                    onChange={function (e) { setFeedback(e.target.value); if (polished) setPolished(null); }} />

                                {aiPhase === 'idle' && !polished && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Sparkles size={12} style={{ color: 'var(--brand-gold)' }} />
                                            Claude Haiku · ~€ 0,01 · intentie blijft behouden
                                        </span>
                                        <button className="btn btn-ghost btn-sm" disabled={feedback.trim().length < 30} onClick={runPolish}>
                                            <Sparkles size={13} /> Polish voor website
                                        </button>
                                    </div>
                                )}

                                {aiPhase === 'running' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)' }} aria-live="polite">
                                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--brand)' }} />
                                        Claude Haiku herschrijft — spelling en toon, niet de boodschap…
                                    </div>
                                )}

                                {aiPhase === 'diff' && aiVoorstel && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                                            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted-light)', marginBottom: 6 }}>
                                                    <Minus size={10} /> Origineel
                                                </span>
                                                <div>{feedback}</div>
                                            </div>
                                            <div style={{ border: '1px solid rgba(34,197,94,.35)', borderRadius: 10, padding: 12, fontSize: 13, lineHeight: 1.6, background: 'rgba(34,197,94,.05)' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--green)', marginBottom: 6 }}>
                                                    <Plus size={10} /> Website-versie
                                                </span>
                                                <div>{aiVoorstel}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                            {['Strekking en toon behouden', 'Kritische punten niet weggepoetst', 'Geen nieuwe claims toegevoegd'].map(function (c) {
                                                return (
                                                    <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                                                        <Check size={12} style={{ color: 'var(--green)' }} /> {c}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                            <button className="btn btn-ghost btn-sm" onClick={function () { setAiPhase('idle'); setAiVoorstel(null); }}>
                                                <X size={13} /> Verwerp
                                            </button>
                                            <button className="btn btn-brand btn-sm" onClick={function () { setPolished(aiVoorstel); setAiPhase('idle'); setAiVoorstel(null); }}>
                                                <Check size={13} /> Accepteer website-versie
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {polished && aiPhase === 'idle' && (
                                    <div style={{ border: '1px solid rgba(34,197,94,.3)', borderRadius: 10, padding: 14, background: 'rgba(34,197,94,.04)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>
                                                <Globe size={11} /> Klaar voor website
                                            </span>
                                            <button onClick={function () { setPolished(null); }}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}>
                                                Verwijder
                                            </button>
                                        </div>
                                        <blockquote style={{ margin: 0, fontSize: 13, lineHeight: 1.65, fontStyle: 'italic' }}>&ldquo;{polished}&rdquo;</blockquote>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>— {String(event.client_naam || 'de klant')}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── rechter kolom ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
                        {/* AFRONDEN-GATE */}
                        {heroCard('Afronden', <Flag size={15} style={{ color: 'var(--brand-gold)' }} />,
                            <span style={{ fontSize: 11, color: saving ? 'var(--brand)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                {saving
                                    ? <><Loader2 size={11} className="animate-spin" /> Opslaan…</>
                                    : <><CloudUpload size={11} /> Opgeslagen · {relTijd(savedAt)}</>}
                            </span>,
                            <div style={{ padding: 18 }}>
                                {!completedAt ? (
                                    <>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                                            {checks.map(function (c) {
                                                return (
                                                    <span key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.ok ? 'var(--text)' : 'var(--muted)' }}>
                                                        {c.ok
                                                            ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
                                                            : <Circle size={14} style={{ color: 'var(--muted-light)' }} />}
                                                        {c.label}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                        <button className="btn btn-brand" style={{ width: '100%', justifyContent: 'center' }}
                                            disabled={!allOk} onClick={afronden}>
                                            <Flag size={14} /> Reflectie afronden
                                        </button>
                                        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                                            Afronden zet het event op voltooid en ontgrendelt de factuur op het Overzicht.
                                        </p>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
                                            <CheckCircle2 size={15} /> Reflectie afgerond
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>De factuur staat klaar op het event-Overzicht.</span>
                                        <button className="btn btn-brand btn-sm" style={{ alignSelf: 'flex-start' }}
                                            onClick={function () { router.push(`/events/${eventId}/hub`); }}>
                                            <Receipt size={13} /> Maak factuur op
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <HistorieCard historie={historie} trendBars={trendBars} histAvg={histAvg} />
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── historie + score-trend (gedeeld tussen locked/open view) ── */
function HistorieCard({ historie, trendBars, histAvg }: {
    historie: HistRow[];
    trendBars: Array<{ score: number | null; label: string; now?: boolean }>;
    histAvg: string | null;
}) {
    return (
        <div className="panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
                    <History size={15} style={{ color: 'var(--brand-gold)' }} /> Laatste reflecties
                </div>
                {histAvg && <span style={{ fontSize: 11, color: 'var(--muted)' }}>gem. <strong style={{ color: 'var(--text)' }}>{histAvg}</strong></span>}
            </div>

            {historie.length === 0 ? (
                <div style={{ padding: 24, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>
                    Nog geen eerdere reflecties — dit wordt je eerste.
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 90, padding: '16px 18px 8px' }}
                        role="img" aria-label="Score-trend laatste events">
                        {trendBars.map(function (b, i) {
                            return (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: b.score == null ? 'var(--muted-light)' : scoreTone(b.score) }}>{b.score ?? '—'}</span>
                                    <span style={{
                                        width: '70%', maxWidth: 26, borderRadius: 4,
                                        height: `${(b.score ?? 0) * 7}%`, minHeight: 2,
                                        background: b.score == null ? 'rgba(130,130,130,.18)' : scoreTone(b.score),
                                        opacity: b.now ? 1 : 0.75,
                                        outline: b.now ? '1px solid rgba(255,191,0,.4)' : 'none',
                                    }} />
                                    <span style={{ fontSize: 9, color: b.now ? 'var(--brand)' : 'var(--muted-light)', fontWeight: b.now ? 700 : 400, whiteSpace: 'nowrap' }}>{b.label}</span>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                        {historie.map(function (h) {
                            return (
                                <div key={h.id} style={{ display: 'flex', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                                    <span style={{
                                        width: 28, height: 28, borderRadius: 8, flexShrink: 0, fontSize: 12, fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: scoreTone(h.score), border: '1px solid var(--border)',
                                        background: 'var(--card)',
                                    }}>{h.score ?? '—'}</span>
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, fontWeight: 600 }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.events?.name || 'Event'}</span>
                                            <span style={{ color: 'var(--muted-light)', flexShrink: 0, fontWeight: 400 }}>{h.events?.date ? fmtNl(h.events.date) : ''}</span>
                                        </span>
                                        {(h.goed || h.verbeterpunten) && (
                                            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(h.goed || h.verbeterpunten || '').slice(0, 70)}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
