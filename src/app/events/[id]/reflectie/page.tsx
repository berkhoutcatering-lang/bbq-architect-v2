/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { fmtNl } from '@/lib/utils';
import type { DbEvent, EventReflectie } from '@/types';
import { AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle, ClipboardCheck, Flame, Lightbulb, Loader2, PackageOpen, Pencil, StarHalf } from 'lucide-react';

export default function ReflectiePage() {
    const params = useParams();
    const router = useRouter();
    const showToast = useToast();
    const eventId = parseInt(String(params.id), 10);

    const [event, setEvent] = useState<DbEvent | null>(null);
    const [reflectie, setReflectie] = useState<Partial<EventReflectie>>({
        overschot: '',
        tekort: '',
        kwaliteit: '',
        verbeterpunten: '',
        score: 7,
        notities: '',
        fotos: []
    });
    const [existingId, setExistingId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(function () {
        if (!eventId || isNaN(eventId)) return;
        async function load() {
            const { data: eventData } = await supabase.from('events').select('*').eq('id', eventId).single();
            if (eventData) setEvent(eventData as any);

            const { data: refData } = await supabase.from('event_reflecties').select('*').eq('event_id', eventId).limit(1);
            if (refData && refData.length > 0) {
                setReflectie(refData[0] as any);
                setExistingId(refData[0].id);
            }
            setLoading(false);
        }
        load();
    }, [eventId]);

    function setField(key: string, val: any) {
        setReflectie(Object.assign({}, reflectie, { [key]: val }));
    }

    async function handleSave() {
        setSaving(true);
        try {
            const payload = {
                event_id: eventId,
                overschot: reflectie.overschot || '',
                tekort: reflectie.tekort || '',
                kwaliteit: reflectie.kwaliteit || '',
                verbeterpunten: reflectie.verbeterpunten || '',
                score: reflectie.score || 0,
                notities: reflectie.notities || '',
                fotos: reflectie.fotos || []
            };

            if (existingId) {
                const { error } = await supabase.from('event_reflecties').update(payload).eq('id', existingId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('event_reflecties').insert(payload).select();
                if (error) throw error;
                if (data && data[0]) setExistingId(data[0].id);
            }

            // Update event status to completed
            await supabase.from('events').update({ status: 'completed' }).eq('id', eventId);

            showToast('Reflectie opgeslagen!', 'success');
        } catch (e: any) {
            showToast('Fout: ' + (e.message || ''), 'error');
        }
        setSaving(false);
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

    const scoreColor = (reflectie.score || 0) >= 8 ? 'var(--green)' : (reflectie.score || 0) >= 6 ? 'var(--brand)' : 'var(--red)';

    return (
        <div style={{ animation: 'fadeIn 0.4s ease-out', maxWidth: 800, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <button className="btn btn-ghost btn-sm" onClick={function () { router.push('/events'); }}>
                    <ArrowLeft size={14} /> Events
                </button>
                <h1 style={{ fontSize: 18, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardCheck size={14} style={{ color: 'var(--brand)' }} /> Event Reflectie
                </h1>
                <div></div>
            </div>

            {/* Event Header — read-only */}
            <div className="panel" style={{ marginBottom: 20, background: 'linear-gradient(135deg, rgba(255,191,0,.04), rgba(255,191,0,.01))' }}>
                <div style={{ padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,191,0,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Flame size={16} style={{ color: 'var(--brand)' }} />
                        </div>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: 16 }}>{event.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {fmtNl(event.date)} &middot; {event.guests} gasten &middot; {event.location || 'Geen locatie'}
                            </div>
                        </div>
                    </div>
                    {existingId && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 8, background: 'rgba(34,197,94,.1)', color: 'var(--green)', fontSize: 12, fontWeight: 700 }}>
                            <CheckCircle size={14} /> Reflectie ingevuld
                        </div>
                    )}
                </div>
            </div>

            {/* Score */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div style={{ padding: 24, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>
                        Totaalscore Event
                    </div>
                    <div style={{ fontSize: 56, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                        {reflectie.score || 0}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>/ 10</div>
                    <input
                        type="range"
                        min={0} max={10} step={1}
                        value={reflectie.score || 0}
                        onChange={function (e) { setField('score', parseInt(e.target.value)); }}
                        style={{
                            width: '100%',
                            maxWidth: 300,
                            accentColor: 'var(--brand)',
                            height: 8,
                            cursor: 'pointer'
                        }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 300, margin: '4px auto 0', fontSize: 12, color: 'var(--muted)' }}>
                        <span>Slecht</span><span>Goed</span><span>Uitstekend</span>
                    </div>
                </div>
            </div>

            {/* Evaluation Fields */}
            <div className="panel" style={{ marginBottom: 20 }}>
                <div className="panel-head"><h3>Evaluatie</h3></div>
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <PackageOpen size={11} style={{ color: 'var(--green)' }} /> Wat was er over?
                        </label>
                        <textarea
                            rows={3}
                            value={reflectie.overschot || ''}
                            onChange={function (e) { setField('overschot', e.target.value); }}
                            placeholder="bijv. 2kg pulled pork, 5 broodjes, saus..."
                        />
                    </div>
                    <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <AlertTriangle size={11} style={{ color: 'var(--red)' }} /> Wat was er tekort?
                        </label>
                        <textarea
                            rows={3}
                            value={reflectie.tekort || ''}
                            onChange={function (e) { setField('tekort', e.target.value); }}
                            placeholder="bijv. Coleslaw was op na 80 gasten..."
                        />
                    </div>
                    <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <StarHalf size={11} style={{ color: 'var(--brand)' }} /> Wat was niet goed genoeg?
                        </label>
                        <textarea
                            rows={3}
                            value={reflectie.kwaliteit || ''}
                            onChange={function (e) { setField('kwaliteit', e.target.value); }}
                            placeholder="bijv. Brisket was iets te droog, timing sauzen..."
                        />
                    </div>
                    <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Lightbulb size={11} style={{ color: '#a78bfa' }} /> Verbeterpunten
                        </label>
                        <textarea
                            rows={3}
                            value={reflectie.verbeterpunten || ''}
                            onChange={function (e) { setField('verbeterpunten', e.target.value); }}
                            placeholder="bijv. Eerder beginnen met smoker, extra personeel voor service..."
                        />
                    </div>
                    <div className="field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Pencil size={11} style={{ color: 'var(--muted)' }} /> Vrije Notities
                        </label>
                        <textarea
                            rows={3}
                            value={reflectie.notities || ''}
                            onChange={function (e) { setField('notities', e.target.value); }}
                            placeholder="Overige opmerkingen, feedback klant, etc."
                        />
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 40 }}>
                <button className="btn btn-ghost" onClick={function () { router.push('/events'); }}>
                    Annuleren
                </button>
                <button
                    className="btn btn-brand btn-lg"
                    onClick={handleSave}
                    disabled={saving}
                    style={{ padding: '12px 32px' }}
                >
                    {saving ? (
                        <><Loader2 size={14} className="animate-spin" /> Opslaan...</>
                    ) : (
                        <><Check size={14} /> {existingId ? 'Reflectie Bijwerken' : 'Reflectie Opslaan'}</>
                    )}
                </button>
            </div>
        </div>
    );
}
