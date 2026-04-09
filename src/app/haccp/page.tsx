/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/useSupabase';
import { useToast } from '@/components/Toast';
import { fmtNl, today } from '@/lib/utils';
import { generatePDF } from '@/lib/pdfGenerator';
import { buildBrandingConfig } from '@/lib/branding';
import EmptyState from '@/components/EmptyState';
import PageHint from '@/components/PageHint';
import FieldTooltip from '@/components/FieldTooltip';
import VoiceInput from '@/components/VoiceInput';
import type { HaccpRecord, DbEvent, Offerte } from '@/types';

interface HaccpForm {
    event_id: string;
    offerte_id: string;
    datum: string;
    tijd: string;
    wat: string;
    temp: string;
    type: string;
    check_type: string;
    chef: string;
    notitie: string;
}

interface EventGroup {
    id: string;
    records: any[];
    naam: string;
    datum: string;
    offerte?: any;
}

const QUICK_PRODUCTS = [
    'Bavette', 'Spareribs', 'Pulled Pork', 'Kip', 'Worst', 'Zalm',
    'Burger', 'Groenten', 'Saus', 'Salade', 'Brood', 'Anders'
];

export default function HACCP() {
    const { data: records, loading, insert, remove } = useSupabase<HaccpRecord>('haccp_records', []);
    const { data: events } = useSupabase<DbEvent>('events', []);
    const { data: offertes } = useSupabase<Offerte>('offertes', []);
    const showToast = useToast();
    const [tab, setTab] = useState('overzicht');
    const [filterEvent, setFilterEvent] = useState('');
    const [isMobile, setIsMobile] = useState(false);
    const [form, setForm] = useState<HaccpForm>({
        event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '',
        type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: ''
    });

    // Quick-Log state
    const QUICKLOG_PRODUCTS = ['Bavette', 'Spareribs', 'Pulled Pork', 'Kippendij', 'Zalm', 'Moink Balls', 'Bavarois'];
    const QUICKLOG_TYPES = [
        { val: 'kern', label: 'Kern', icon: '\uD83D\uDD25', color: '#ef4444' },
        { val: 'koeling', label: 'Koeling', icon: '\u2744\uFE0F', color: '#3b82f6' },
        { val: 'bewaring', label: 'Bewaring', icon: '\uD83D\uDCE6', color: '#8b5cf6' },
        { val: 'uitgifte', label: 'Uitgifte', icon: '\uD83C\uDF7D\uFE0F', color: '#f59e0b' }
    ];
    const [qlProduct, setQlProduct] = useState('');
    const [qlTemp, setQlTemp] = useState('');
    const [qlType, setQlType] = useState('kern');
    const [qlSaving, setQlSaving] = useState(false);
    const [qlSaved, setQlSaved] = useState(false);
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [qlFoto, setQlFoto] = useState<string | null>(null);

    // Find nearest upcoming confirmed event for auto-fill
    const nearestEvent = (function () {
        if (!events || events.length === 0) return null;
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const upcoming = events
            .filter(function (e: any) { return e.date >= todayStr; })
            .sort(function (a: any, b: any) { return (a.date || '').localeCompare(b.date || ''); });
        return upcoming.length > 0 ? upcoming[0] : null;
    })();

    // Find nearest offerte for auto-fill (confirmed/bevestigd)
    const nearestOfferte = (function () {
        if (!offertes || offertes.length === 0) return null;
        const todayStr = new Date().toISOString().slice(0, 10);
        const upcoming = offertes
            .filter(function (o: any) { return o.datum >= todayStr && (o.status === 'bevestigd' || o.status === 'confirmed' || o.status === 'akkoord'); })
            .sort(function (a: any, b: any) { return (a.datum || '').localeCompare(b.datum || ''); });
        return upcoming.length > 0 ? upcoming[0] : null;
    })();

    function getQuickLogStatus(type: string, temp: string): string {
        const t = parseFloat(temp);
        if (isNaN(t)) return 'ok';
        if (type === 'koeling' || type === 'bewaring') return t >= 0 && t <= 7 ? 'ok' : t <= 10 ? 'warn' : 'danger';
        if (type === 'kern') return t >= 75 ? 'ok' : t >= 65 ? 'warn' : 'danger';
        if (type === 'uitgifte') return t >= 60 ? 'ok' : t >= 55 ? 'warn' : 'danger';
        return 'ok';
    }

    function saveQuickLog() {
        if (!qlProduct || !qlTemp) { showToast('Selecteer product en voer temperatuur in', 'error'); return; }
        setQlSaving(true);
        const now = new Date();
        const status = getQuickLogStatus(qlType, qlTemp);
        const data: any = {
            event_id: nearestEvent ? nearestEvent.id : null,
            offerte_id: nearestOfferte ? String(nearestOfferte.id) : null,
            datum: now.toISOString().slice(0, 10),
            tijd: now.toTimeString().slice(0, 5),
            wat: qlProduct,
            temp: parseFloat(qlTemp),
            type: qlType,
            check_type: qlType === 'kern' ? 'bereiding' : qlType === 'koeling' ? 'opslag' : qlType === 'uitgifte' ? 'uitgifte' : 'opslag',
            chef: 'Cor',
            notitie: '',
            status: status,
            auto_logged: true
        };
        insert(data).then(function () {
            setQlSaving(false);
            setQlSaved(true);
            showToast(
                status === 'ok' ? '\u2705 ' + qlProduct + ' ' + qlTemp + '\u00B0C OK' :
                status === 'warn' ? '\u26A0\uFE0F ' + qlProduct + ' ' + qlTemp + '\u00B0C — Risicozone!' :
                '\uD83D\uDD34 ' + qlProduct + ' ' + qlTemp + '\u00B0C — AFWIJKING!',
                status === 'ok' ? 'success' : 'error'
            );
            // Reset after brief feedback
            setTimeout(function () {
                setQlProduct('');
                setQlTemp('');
                setQlType('kern');
                setQlSaved(false);
            }, 1200);
        }).catch(function (err: any) {
            setQlSaving(false);
            showToast('Fout: ' + (err.message || 'onbekend'), 'error');
        });
    }

    useEffect(() => {
        const check = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    // Set default tab based on viewport (only on first load)
    const [initialTabSet, setInitialTabSet] = useState(false);
    useEffect(function () {
        if (!initialTabSet) {
            setTab(window.innerWidth < 768 ? 'quicklog' : 'overzicht');
            setInitialTabSet(true);
        }
    }, [initialTabSet]);

    function setField(key: string, val: string) { setForm(Object.assign({}, form, { [key]: val })); }

    function getStatus(type: string, temp: string): string {
        const t = parseFloat(temp);
        if (isNaN(t)) return 'ok';
        if (type === 'koeling') return t >= 0 && t <= 7 ? 'ok' : t <= 10 ? 'warn' : 'danger';
        if (type === 'kern') return t >= 75 ? 'ok' : t >= 65 ? 'warn' : 'danger';
        if (type === 'warmhoud') return t >= 60 ? 'ok' : t >= 55 ? 'warn' : 'danger';
        return 'ok';
    }

    function saveRecord() {
        if (!form.wat || !form.temp) { showToast('Vul product en temperatuur in', 'error'); return; }
        const status = getStatus(form.type, form.temp);
        const data = Object.assign({}, form, {
            temp: parseFloat(form.temp),
            status: status,
            event_id: form.event_id ? parseInt(form.event_id) : null,
            offerte_id: form.offerte_id || null,
            auto_logged: false
        });
        insert(data as any).then(function () {
            showToast(status === 'ok' ? '\u2705 Meting OK geregistreerd' : status === 'warn' ? '\u26a0\ufe0f Temperatuur in risicozone!' : '\ud83d\udd34 AFWIJKING \u2014 Temperatuur buiten norm!', status === 'ok' ? 'success' : 'error');
            setForm({ event_id: '', offerte_id: '', datum: today(), tijd: '', wat: '', temp: '', type: 'kern', check_type: 'bereiding', chef: 'Cor', notitie: '' });
        }).catch(function(err: any) { showToast('Fout: ' + (err.message || 'onbekend'), 'error'); });
    }

    const filtered = (function () {
        if (filterEvent === 'afwijkingen') {
            return records.filter(function (r: any) { return r.status === 'danger' || r.status === 'warn'; });
        } else if (filterEvent) {
            return records.filter(function (r: any) {
                return r.event_id === parseInt(filterEvent) || r.offerte_id === filterEvent;
            });
        }
        return records;
    })();

    function getEventGroups(): EventGroup[] {
        const groups: Record<string, any> = {};
        records.forEach(function (r: any) {
            const key = r.offerte_id || (r.event_id ? 'ev_' + r.event_id : 'los');
            if (!groups[key]) groups[key] = { records: [], naam: '', datum: '' };
            groups[key].records.push(r);
            if (r.offerte_id) {
                const off = offertes.find(function (o: any) { return String(o.id) === r.offerte_id; });
                if (off) { groups[key].naam = off.client_naam || 'Onbekend'; groups[key].datum = off.datum || ''; groups[key].offerte = off; }
            } else if (r.event_id) {
                const ev = events.find(function (e: any) { return e.id === r.event_id; });
                if (ev) { groups[key].naam = ev.name || 'Onbekend'; groups[key].datum = ev.date || ''; }
            }
        });
        return Object.keys(groups).map(function (key) { return Object.assign({ id: key }, groups[key]); })
            .filter(function (g: any) { return g.records.length > 0; })
            .sort(function (a: any, b: any) { return (b.datum || '').localeCompare(a.datum || ''); });
    }

    function downloadHACCPRapport(group: EventGroup) {
        generatePDF({
            type: 'haccp',
            eventName: group.naam,
            eventDatum: group.datum,
            eventGasten: group.offerte ? group.offerte.aantal_gasten : '',
            records: group.records.sort(function (a: any, b: any) { return (a.datum + a.tijd) < (b.datum + b.tijd) ? -1 : 1; })
        } as any);
        showToast('\ud83d\udcc4 HACCP Rapport gedownload');
    }

    const checkTypeLabels: Record<string, string> = {
        ontvangst: '\ud83d\udce6 Ontvangst', opslag: '\u2744\ufe0f Opslag/Koeling',
        bereiding: '\ud83d\udd25 Bereiding', regenereren: '\u267b\ufe0f Regenereren', uitgifte: '\ud83c\udf7d\ufe0f Uitgifte'
    };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12, display: 'block' }}></i>
                Laden...
            </div>
        </div>
    );

    return (
        <div className="artisan-page haccp-page">
            <h1 className="hero-title mb-16" style={{ fontSize: 24 }}>HACCP MONITORING</h1>
            <PageHint id="haccp" title="HACCP Monitoring" description="Log temperaturen via Quick Log (ideaal op mobiel). Alle metingen worden gekoppeld aan events voor compliance-dossiers." />

            <div className="tab-bar">
                <button className={'tab-btn' + (tab === 'quicklog' ? ' active' : '')} onClick={function () { setTab('quicklog'); }} style={tab === 'quicklog' ? { borderColor: 'var(--brand)', color: 'var(--brand)' } : {}}>QUICK LOG</button>
                <button className={'tab-btn' + (tab === 'overzicht' ? ' active' : '')} onClick={function () { setTab('overzicht'); }}>OVERZICHT</button>
                <button className={'tab-btn' + (tab === 'registratie' ? ' active' : '')} onClick={function () { setTab('registratie'); }}>REGISTRATIE</button>
                <button className={'tab-btn' + (tab === 'dossier' ? ' active' : '')} onClick={function () { setTab('dossier'); }}>DOSSIER</button>
            </div>

            {/* ═══════════════ QUICK LOG TAB ═══════════════ */}
            {tab === 'quicklog' && (
                <div style={{ padding: '0 4px', maxWidth: 480, margin: '0 auto' }}>
                    {/* Auto-fill info banner */}
                    {(nearestEvent || nearestOfferte) && (
                        <div style={{
                            padding: '10px 14px', marginBottom: 12, borderRadius: 12,
                            background: 'rgba(255,191,0,.06)', border: '1px solid rgba(255,191,0,.15)',
                            fontSize: 12, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 8
                        }}>
                            <i className="fa-solid fa-calendar-check"></i>
                            <span style={{ opacity: 0.85 }}>
                                {nearestOfferte ? nearestOfferte.client_naam : (nearestEvent ? (nearestEvent as any).name : '')}
                                {' \u2022 Cor \u2022 '}{new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    )}

                    {/* Step 1: Product selectie */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                            {qlProduct ? '\u2705 Product' : '\u2776 Kies product'}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                            {QUICKLOG_PRODUCTS.map(function (p) {
                                const selected = qlProduct === p;
                                return (
                                    <button key={p} onClick={function () { setQlProduct(p); }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: 16, fontWeight: 700,
                                            background: selected ? 'rgba(255,191,0,.12)' : 'var(--card-solid)',
                                            border: selected ? '2px solid var(--brand)' : '1px solid var(--border)',
                                            color: selected ? 'var(--brand)' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            letterSpacing: '0.02em'
                                        }}>
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Temperature numpad */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                            {qlTemp ? '\u2705 Temperatuur' : '\u2777 Voer temperatuur in'}
                        </label>
                        {/* Temperature display */}
                        <div style={{
                            textAlign: 'center', padding: '20px 0', marginBottom: 10,
                            background: qlTemp ? (function () { var s = getQuickLogStatus(qlType, qlTemp); return s === 'ok' ? 'rgba(16,185,129,.08)' : s === 'warn' ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)'; })() : 'var(--card-solid)',
                            border: qlTemp ? (function () { var s = getQuickLogStatus(qlType, qlTemp); return '2px solid ' + (s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'); })() : '1px solid var(--border)',
                            borderRadius: 16, transition: 'all 0.2s'
                        }}>
                            <span style={{
                                fontSize: 48, fontWeight: 300, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums',
                                color: qlTemp ? (function () { var s = getQuickLogStatus(qlType, qlTemp); return s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'; })() : 'var(--muted-light)'
                            }}>
                                {qlTemp || '\u2014'}
                            </span>
                            <span style={{ fontSize: 24, color: 'var(--muted)', marginLeft: 4 }}>{'\u00B0C'}</span>
                            {qlTemp && (function () {
                                var s = getQuickLogStatus(qlType, qlTemp);
                                return <div style={{ fontSize: 13, fontWeight: 700, marginTop: 6, color: s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444' }}>
                                    {s === 'ok' ? '\u2713 OK' : s === 'warn' ? '\u26A0 Risicozone' : '\u2717 AFWIJKING'}
                                </div>;
                            })()}
                        </div>
                        {/* Number pad */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxWidth: 320, margin: '0 auto' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '\u232B'].map(function (key) {
                                return (
                                    <button key={key} onClick={function () {
                                        if (key === '\u232B') { setQlTemp(qlTemp.slice(0, -1)); }
                                        else if (key === '.' && qlTemp.indexOf('.') >= 0) { /* no double dot */ }
                                        else { setQlTemp(qlTemp + key); }
                                    }}
                                        style={{
                                            height: 56, borderRadius: 14, fontSize: key === '\u232B' ? 22 : 24, fontWeight: 600,
                                            background: key === '\u232B' ? 'rgba(239,68,68,.08)' : 'var(--card-solid)',
                                            border: key === '\u232B' ? '1px solid rgba(239,68,68,.2)' : '1px solid var(--border)',
                                            color: key === '\u232B' ? '#ef4444' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.1s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontVariantNumeric: 'tabular-nums'
                                        }}>
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 3: Measurement type */}
                    <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                            {'\u2778 Type meting'}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                            {QUICKLOG_TYPES.map(function (t) {
                                var selected = qlType === t.val;
                                return (
                                    <button key={t.val} onClick={function () { setQlType(t.val); }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: 12, fontWeight: 700,
                                            background: selected ? t.color + '18' : 'var(--card-solid)',
                                            border: selected ? '2px solid ' + t.color : '1px solid var(--border)',
                                            color: selected ? t.color : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 4
                                        }}>
                                        <span style={{ fontSize: 18 }}>{t.icon}</span>
                                        <span>{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Voice + Camera row */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button onClick={function () { setVoiceOpen(true); }}
                            style={{
                                flex: 1, height: 52, borderRadius: 14, fontSize: 14, fontWeight: 700,
                                background: 'rgba(196,163,90,0.08)', border: '1px solid rgba(196,163,90,0.2)',
                                color: '#c4a35a', cursor: 'pointer', transition: 'all 0.15s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}>
                            🎤 Spraak
                        </button>
                        <label style={{
                            flex: 1, height: 52, borderRadius: 14, fontSize: 14, fontWeight: 700,
                            background: qlFoto ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)',
                            border: qlFoto ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(59,130,246,0.2)',
                            color: qlFoto ? '#10b981' : '#3b82f6', cursor: 'pointer', transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}>
                            {qlFoto ? '✅ Foto' : '📸 Foto'}
                            <input type="file" accept="image/*" capture="environment"
                                style={{ display: 'none' }}
                                onChange={function (e) {
                                    const file = e.target.files && e.target.files[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = function (ev) {
                                        setQlFoto(ev.target?.result as string);
                                    };
                                    reader.readAsDataURL(file);
                                }}
                            />
                        </label>
                    </div>

                    {/* Foto preview */}
                    {qlFoto && (
                        <div style={{ marginBottom: 12, position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <img src={qlFoto} alt="HACCP foto" style={{ width: '100%', maxHeight: 150, objectFit: 'cover' }} />
                            <button onClick={function () { setQlFoto(null); }}
                                style={{
                                    position: 'absolute', top: 8, right: 8,
                                    width: 28, height: 28, borderRadius: 8,
                                    background: 'rgba(0,0,0,0.6)', border: 'none',
                                    color: 'white', cursor: 'pointer', fontSize: 14,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>✕</button>
                        </div>
                    )}

                    {/* Voice Input Modal */}
                    <VoiceInput
                        isOpen={voiceOpen}
                        onClose={function () { setVoiceOpen(false); }}
                        products={QUICKLOG_PRODUCTS}
                        onResult={function () {}}
                        onParsed={function (data) {
                            if (data.product) setQlProduct(data.product);
                            if (data.temp) setQlTemp(data.temp);
                            if (data.type) setQlType(data.type);
                            setVoiceOpen(false);
                        }}
                    />

                    {/* Save button */}
                    <button onClick={saveQuickLog} disabled={!qlProduct || !qlTemp || qlSaving}
                        style={{
                            width: '100%', height: 64, borderRadius: 14, fontSize: 18, fontWeight: 800,
                            background: (!qlProduct || !qlTemp) ? 'var(--card-solid)' :
                                qlSaved ? 'linear-gradient(135deg, #10b981, #059669)' :
                                'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none',
                            color: (!qlProduct || !qlTemp) ? 'var(--muted)' : '#fff',
                            cursor: (!qlProduct || !qlTemp || qlSaving) ? 'not-allowed' : 'pointer',
                            letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'all 0.2s',
                            boxShadow: (qlProduct && qlTemp && !qlSaving) ? '0 4px 20px rgba(16,185,129,.3)' : 'none',
                            opacity: qlSaving ? 0.7 : 1
                        }}>
                        {qlSaving ? (
                            <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }}></i>OPSLAAN...</>
                        ) : qlSaved ? (
                            <><i className="fa-solid fa-check-circle" style={{ marginRight: 8 }}></i>OPGESLAGEN!</>
                        ) : (
                            <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 8 }}></i>OPSLAAN</>
                        )}
                    </button>

                    {/* Summary of what will be saved */}
                    {(qlProduct || qlTemp) && (
                        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: 'var(--muted)', opacity: 0.7 }}>
                            {qlProduct && <span style={{ color: 'var(--brand)' }}>{qlProduct}</span>}
                            {qlProduct && qlTemp && ' \u2022 '}
                            {qlTemp && <span>{qlTemp}{'\u00B0C'}</span>}
                            {' \u2022 '}{QUICKLOG_TYPES.find(function (t) { return t.val === qlType; })?.label || qlType}
                        </div>
                    )}

                    {/* Quick access to recent logs */}
                    {records.length > 0 && (
                        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                            <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                                Laatste metingen
                            </label>
                            {records.slice().reverse().slice(0, 5).map(function (rec: any) {
                                return (
                                    <div key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{
                                            width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 13, fontWeight: 700, flexShrink: 0,
                                            background: rec.status === 'ok' ? 'rgba(16,185,129,.1)' : rec.status === 'warn' ? 'rgba(245,158,11,.1)' : 'rgba(239,68,68,.1)',
                                            color: rec.status === 'ok' ? '#10b981' : rec.status === 'warn' ? '#f59e0b' : '#ef4444'
                                        }}>
                                            {rec.temp}{'\u00B0'}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600 }}>{rec.wat}</div>
                                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{rec.tijd || ''} {'\u2022'} {rec.type}</div>
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: rec.status === 'ok' ? '#10b981' : rec.status === 'warn' ? '#f59e0b' : '#ef4444' }}>
                                            {rec.status === 'ok' ? 'OK' : rec.status === 'warn' ? 'LET OP' : 'AFWIJKING'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {tab === 'registratie' && isMobile && (
                <div style={{ padding: '0 4px' }}>
                    {/* Step 1: Product selectie */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Product</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                            {QUICK_PRODUCTS.map(function (p) {
                                return (
                                    <button key={p} onClick={function () { setField('wat', p); }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: 13, fontWeight: 600,
                                            background: form.wat === p ? 'rgba(59,130,246,.15)' : 'var(--card-solid)',
                                            border: form.wat === p ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            color: form.wat === p ? '#3b82f6' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s'
                                        }}>
                                        {p}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Temp type pills */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Type meting</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[{ val: 'kern', label: 'Kern ≥75°C', icon: '🔥' }, { val: 'koeling', label: 'Koeling 0-7°C', icon: '❄️' }, { val: 'warmhoud', label: 'Warmhoud ≥60°C', icon: '♨️' }].map(function (t) {
                                return (
                                    <button key={t.val} onClick={function () { setField('type', t.val); }}
                                        style={{
                                            flex: 1, height: 56, borderRadius: 14, fontSize: 12, fontWeight: 600,
                                            background: form.type === t.val ? 'rgba(59,130,246,.15)' : 'var(--card-solid)',
                                            border: form.type === t.val ? '2px solid #3b82f6' : '1px solid var(--border)',
                                            color: form.type === t.val ? '#3b82f6' : 'var(--text)',
                                            cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 2
                                        }}>
                                        <span style={{ fontSize: 14 }}>{t.icon}</span>
                                        <span>{t.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 3: Numpad temperature input */}
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>Temperatuur</label>
                        <div style={{
                            textAlign: 'center', padding: '16px 0', marginBottom: 8,
                            background: form.temp ? (function () { const s = getStatus(form.type, form.temp); return s === 'ok' ? 'rgba(16,185,129,.08)' : s === 'warn' ? 'rgba(245,158,11,.08)' : 'rgba(239,68,68,.08)'; })() : 'var(--card-solid)',
                            border: form.temp ? (function () { const s = getStatus(form.type, form.temp); return '2px solid ' + (s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'); })() : '1px solid var(--border)',
                            borderRadius: 16, transition: 'all 0.2s'
                        }}>
                            <span style={{
                                fontSize: 48, fontWeight: 300, letterSpacing: '-2px',
                                color: form.temp ? (function () { const s = getStatus(form.type, form.temp); return s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444'; })() : 'var(--muted-light)'
                            }}>
                                {form.temp || '—'}
                            </span>
                            <span style={{ fontSize: 24, color: 'var(--muted)', marginLeft: 4 }}>°C</span>
                            {form.temp && (function () {
                                const s = getStatus(form.type, form.temp);
                                return <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: s === 'ok' ? '#10b981' : s === 'warn' ? '#f59e0b' : '#ef4444' }}>
                                    {s === 'ok' ? '✓ OK' : s === 'warn' ? '⚠ Risicozone' : '✗ AFWIJKING'}
                                </div>;
                            })()}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxWidth: 280, margin: '0 auto' }}>
                            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(function (key) {
                                return (
                                    <button key={key} onClick={function () {
                                        if (key === '⌫') { setField('temp', form.temp.slice(0, -1)); }
                                        else { setField('temp', form.temp + key); }
                                    }}
                                        style={{
                                            height: 64, borderRadius: 14, fontSize: key === '⌫' ? 20 : 24, fontWeight: 500,
                                            background: 'var(--card-solid)', border: '1px solid var(--border)',
                                            color: 'var(--text)', cursor: 'pointer', transition: 'all 0.1s',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Save button */}
                    <button onClick={saveRecord} disabled={!form.wat || !form.temp}
                        style={{
                            width: '100%', height: 64, borderRadius: 14, fontSize: 16, fontWeight: 700,
                            background: (!form.wat || !form.temp) ? 'var(--card-solid)' : 'linear-gradient(135deg, #c4a35a, #a8893e)',
                            border: 'none', color: (!form.wat || !form.temp) ? 'var(--muted)' : '#000',
                            cursor: (!form.wat || !form.temp) ? 'not-allowed' : 'pointer',
                            letterSpacing: '0.05em', textTransform: 'uppercase', transition: 'all 0.2s'
                        }}>
                        <i className="fa-solid fa-fire" style={{ marginRight: 8 }}></i>
                        REGISTREER METING
                    </button>
                </div>
            )}

            {tab === 'registratie' && !isMobile && (
                <div className="panel">
                    <div className="panel-head"><h3><i className="fa-solid fa-thermometer"></i> TEMPERATUUR REGISTREREN</h3></div>
                    <div className="panel-body">
                        <div className="form-grid">
                            <div className="field">
                                <label>Event / Offerte</label>
                                <select value={form.offerte_id} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('offerte_id', e.target.value); }}>
                                    <option value="">— Optioneel —</option>
                                    {offertes.map(function (o: any) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                                </select>
                            </div>
                            <div className="field">
                                <label>Check Type</label>
                                <select value={form.check_type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('check_type', e.target.value); }}>
                                    <option value="ontvangst">📦 Ontvangst</option>
                                    <option value="opslag">❄️ Opslag/Koeling</option>
                                    <option value="bereiding">🔥 Bereiding</option>
                                    <option value="regenereren">♻️ Regenereren</option>
                                    <option value="uitgifte">🍽️ Uitgifte</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Temp Type</label>
                                <select value={form.type} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setField('type', e.target.value); }}>
                                    <option value="kern">Kerntemperatuur (≥75°C)</option>
                                    <option value="koeling">Koeling (0-7°C)</option>
                                    <option value="warmhoud">Warmhouden (≥60°C)</option>
                                </select>
                            </div>
                            <div className="field">
                                <label>Chef</label>
                                <input value={form.chef} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('chef', e.target.value); }} placeholder="Cor" />
                            </div>
                            <div className="field"><label>Datum</label><input type="date" value={form.datum} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('datum', e.target.value); }} /></div>
                            <div className="field"><label>Tijd</label><input type="time" value={form.tijd} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('tijd', e.target.value); }} /></div>
                            <div className="field"><label>Product</label><input value={form.wat} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('wat', e.target.value); }} placeholder="bijv. Bavette kern" /></div>
                            <div className="field">
                                <label>Temperatuur (°C)<FieldTooltip text="Kerntemperatuur \u226575\u00B0C voor veilige bereiding. Koeling \u22647\u00B0C." /></label>
                                <input type="number" step="0.1" value={form.temp} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('temp', e.target.value); }} />
                            </div>
                            <div className="field full"><label>Notitie</label><input value={form.notitie} onChange={function (e: React.ChangeEvent<HTMLInputElement>) { setField('notitie', e.target.value); }} /></div>
                        </div>

                        {form.temp && (function () {
                            const s = getStatus(form.type, form.temp);
                            if (s === 'ok') return null;
                            return (
                                <div className={'haccp-boundary-warn haccp-boundary-' + s} style={{ marginTop: 20 }}>
                                    <i className={'fa-solid ' + (s === 'warn' ? 'fa-triangle-exclamation' : 'fa-skull-crossbones')}></i>
                                    <span>{s === 'warn' ? '⚠️ Temperatuur in risicozone!' : '🔴 AFWIJKING — Temperatuur buiten veilige norm!'}</span>
                                </div>
                            );
                        })()}

                        <div style={{ marginTop: 24 }}>
                            <button className="btn-brand" onClick={saveRecord}><i className="fa-solid fa-fire"></i> METING OPSLAAN</button>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'overzicht' && (
                <>
                    <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                        <select className="artisan-select" style={{ flex: 1, padding: 10, background: 'var(--card-solid)', border: '1px solid var(--border-steel)', borderRadius: 8, color: 'var(--brand)' }}
                            value={filterEvent} onChange={function (e: React.ChangeEvent<HTMLSelectElement>) { setFilterEvent(e.target.value); }}>
                            <option value="">Alle Records</option>
                            <option value="afwijkingen">🔴 Afwijkingen</option>
                            {offertes.map(function (o: any) { return <option key={o.id} value={o.id}>{o.client_naam} — {o.datum}</option>; })}
                            {events.map(function (ev: any) { return <option key={ev.id} value={ev.id}>{ev.name}</option>; })}
                        </select>
                    </div>
                    <div className="panel">
                        <div className="panel-body">
                            {filtered.length === 0 && <EmptyState page="/haccp" onAction={function () { setTab('registratie'); }} />}
                            {filtered.slice().reverse().map(function (rec: any) {
                                const pillClass = rec.status === 'ok' ? 'pill-green' : rec.status === 'warn' ? 'pill-amber' : 'pill-red';
                                const ev = events.find(function (e: any) { return e.id === rec.event_id; });
                                const off = rec.offerte_id ? offertes.find(function (o: any) { return String(o.id) === rec.offerte_id; }) : null;
                                const eventLabel = off ? off.client_naam : (ev ? ev.name : '');
                                return (
                                    <div key={rec.id} className="side-row" style={{ padding: '16px 0' }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, flexShrink: 0, background: 'var(--bg)', border: '1px solid var(--border)', color: rec.status === 'ok' ? 'var(--green)' : rec.status === 'warn' ? 'var(--amber)' : 'var(--red)' }}>
                                            {rec.temp}°
                                        </div>
                                        <div style={{ flex: 1, marginLeft: 16 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{rec.wat}</div>
                                            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                                                {checkTypeLabels[rec.check_type] || rec.check_type || rec.type} • {fmtNl(rec.datum)} {rec.tijd || ''}
                                                {eventLabel && <span> • {eventLabel}</span>}
                                                {rec.chef && <span> • 👨‍🍳 {rec.chef}</span>}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span className={'pill ' + pillClass}>{rec.status === 'ok' ? 'OK' : rec.status === 'warn' ? 'Let op' : 'Afwijking'}</span>
                                            <button className="del-btn" style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }} onClick={function () { remove(rec.id); }} aria-label="Meting verwijderen"><i className="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}

            {tab === 'dossier' && (
                <div className="panel">
                    <div className="panel-head"><h3><i className="fa-solid fa-folder-open"></i> NVWA-READY DOSSIERS</h3></div>
                    <div className="panel-body">
                        {getEventGroups().length === 0 && (
                            <div className="empty-state"><i className="fa-solid fa-folder-open"></i><p>Geen HACCP dossiers beschikbaar</p></div>
                        )}
                        {getEventGroups().map(function (group: EventGroup) {
                            const okCount = group.records.filter(function (r: any) { return r.status === 'ok'; }).length;
                            const warnCount = group.records.filter(function (r: any) { return r.status === 'warn'; }).length;
                            const dangerCount = group.records.filter(function (r: any) { return r.status === 'danger'; }).length;
                            return (
                                <div key={group.id} className="haccp-dossier-card artisan-panel mb-16" style={{ padding: 20 }}>
                                    <div className="haccp-dossier-head" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--brand)' }}>{group.naam || 'Losse metingen'}</div>
                                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtNl(group.datum)} • {group.records.length} metingen</div>
                                        </div>
                                        <button className="btn-brand btn-sm" style={{ padding: '6px 12px', fontSize: 12 }} onClick={function () { downloadHACCPRapport(group); }}>
                                            <i className="fa-solid fa-file-pdf"></i> PDF RAPPORT
                                        </button>
                                    </div>
                                    <div className="haccp-dossier-stats" style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                                        <span style={{ color: 'var(--green)' }}>✅ {okCount} OK</span>
                                        {warnCount > 0 && <span style={{ color: 'var(--amber)' }}>⚠️ {warnCount} WAARSCHUWING</span>}
                                        {dangerCount > 0 && <span style={{ color: 'var(--red)' }}>🔴 {dangerCount} AFWIJKING</span>}
                                    </div>
                                    <div className="haccp-timeline" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
                                        {group.records.sort(function (a: any, b: any) { return (a.datum + (a.tijd || '')) < (b.datum + (b.tijd || '')) ? -1 : 1; }).map(function (rec: any) {
                                            return (
                                                <div key={rec.id} className={'haccp-timeline-item mb-16'} style={{ position: 'relative' }}>
                                                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>{rec.wat}</span>
                                                        <span style={{ color: rec.status === 'ok' ? 'var(--green)' : 'var(--red)' }}>{rec.temp}°C</span>
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                                                        {rec.tijd || ''} • {checkTypeLabels[rec.check_type] || rec.type} • {rec.chef || 'Cor'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
