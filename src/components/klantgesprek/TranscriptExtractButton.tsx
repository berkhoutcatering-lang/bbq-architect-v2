'use client';

/**
 * TranscriptExtractButton — UI-binding voor /api/klantgesprek/extract.
 *
 * Knop in de klantgesprek-wizard die een modal opent voor:
 *   1. Plak/typ transcript (of opname via Web Speech API als beschikbaar)
 *   2. AI-extract via Haiku tool-use
 *   3. Review wat geëxtract is + confidence
 *   4. Apply naar wizard-state via callbacks
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Mic, MicOff, Wand2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/Toast';

export interface ExtractedFields {
    klant_naam?: string;
    klant_email?: string;
    klant_telefoon?: string;
    event_datum?: string;
    event_locatie?: string;
    aantal_gasten?: number;
    aantal_vega?: number;
    allergenen?: string[];
    dieet_wensen?: string[];
    budget_pp_eur?: number;
    budget_totaal_eur?: number;
    menu_wensen?: string;
    notities?: string;
    urgentie?: 'laag' | 'normaal' | 'hoog';
    confidence?: number;
}

interface Props {
    onApply: (extracted: ExtractedFields) => void;
}

const GOLD = '#c4a35a';

export default function TranscriptExtractButton({ onApply }: Props) {
    const [open, setOpen] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [extracting, setExtracting] = useState(false);
    const [result, setResult] = useState<ExtractedFields | null>(null);
    const [voiceListening, setVoiceListening] = useState(false);
    const [voiceSupported, setVoiceSupported] = useState(false);
    const recognitionRef = useRef<any>(null);
    const showToast = useToast();

    useEffect(function () {
        if (typeof window === 'undefined') return;
        const w: any = window;
        setVoiceSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    }, []);

    function startVoice() {
        if (typeof window === 'undefined') return;
        const w: any = window;
        const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) return;
        try {
            const rec = new Ctor();
            rec.lang = 'nl-NL';
            rec.continuous = true;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            let finalText = '';
            rec.onresult = function (event: any) {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const r = event.results[i];
                    if (r.isFinal) finalText += r[0].transcript + ' ';
                    else interim += r[0].transcript;
                }
                setTranscript(finalText + interim);
            };
            rec.onerror = function (event: any) {
                setVoiceListening(false);
                showToast('Spraak-fout: ' + (event.error || 'onbekend'), 'error');
            };
            rec.onend = function () { setVoiceListening(false); };

            recognitionRef.current = rec;
            setVoiceListening(true);
            rec.start();
        } catch (e: any) {
            setVoiceListening(false);
            showToast('Spraak-start mislukt: ' + (e.message || ''), 'error');
        }
    }

    function stopVoice() {
        try { recognitionRef.current?.stop(); } catch { /* */ }
        setVoiceListening(false);
    }

    async function runExtract() {
        if (transcript.trim().length < 10) {
            showToast('Transcript te kort — schrijf of plak het hele gesprek.', 'warning');
            return;
        }
        setExtracting(true);
        setResult(null);
        try {
            const res = await fetch('/api/klantgesprek/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript }),
            });
            const data = await res.json();
            if (!res.ok) {
                showToast(data?.error || 'AI fout', 'error');
                return;
            }
            setResult(data.structured as ExtractedFields);
            showToast(`Klaar — vertrouwen ${Math.round((data.confidence || 0) * 100)}%`, 'success');
        } catch (e: any) {
            showToast('Netwerk-fout: ' + (e?.message || ''), 'error');
        } finally {
            setExtracting(false);
        }
    }

    function apply() {
        if (!result) return;
        onApply(result);
        setOpen(false);
        setTranscript('');
        setResult(null);
        showToast('Velden ingevuld vanuit transcript', 'success');
    }

    return (
        <>
            <button
                type="button"
                onClick={function () { setOpen(true); }}
                className="inline-flex items-center gap-2 rounded-lg text-[12px] font-bold touch-manipulation"
                style={{
                    minHeight: 44,
                    paddingInline: 14,
                    background: 'rgba(196,163,90,.12)',
                    color: GOLD,
                    border: '1px solid rgba(196,163,90,.3)',
                }}
                aria-label="Vul wizard via spraak of plak-transcript"
            >
                <Sparkles size={14} /> Vul via transcript
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Transcript-extract"
                    onClick={function () { setOpen(false); }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9000,
                        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    }}
                >
                    <div
                        onClick={function (e) { e.stopPropagation(); }}
                        style={{
                            width: 'min(680px, 96vw)', maxHeight: '90vh',
                            background: 'var(--card-solid, #15151a)',
                            border: '1px solid var(--border, #2a2a30)',
                            borderRadius: 16, overflow: 'hidden',
                            display: 'flex', flexDirection: 'column',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--border, #2a2a30)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Sparkles size={16} style={{ color: GOLD }} />
                                <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Transcript naar wizard</div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Plak of spreek het klantgesprek — AI vult de wizard.</div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={function () { setOpen(false); }}
                                aria-label="Sluit"
                                style={{
                                    background: 'transparent', border: 'none', color: 'var(--muted)',
                                    cursor: 'pointer', padding: 8, minWidth: 44, minHeight: 44,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div style={{ padding: 20, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {voiceSupported && (
                                    <button
                                        type="button"
                                        onClick={voiceListening ? stopVoice : startVoice}
                                        className="inline-flex items-center gap-2 touch-manipulation"
                                        style={{
                                            padding: '10px 14px', borderRadius: 8,
                                            minHeight: 44,
                                            background: voiceListening ? 'rgba(239,68,68,.12)' : 'rgba(196,163,90,.1)',
                                            color: voiceListening ? 'var(--red)' : GOLD,
                                            border: '1px solid ' + (voiceListening ? 'rgba(239,68,68,.4)' : 'rgba(196,163,90,.3)'),
                                            fontSize: 12, fontWeight: 600,
                                            animation: voiceListening ? 'pulse 1.6s ease-in-out infinite' : undefined,
                                        }}
                                    >
                                        {voiceListening ? <MicOff size={14} /> : <Mic size={14} />}
                                        {voiceListening ? 'Stop opname' : 'Spreek-in'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={function () { setTranscript(''); setResult(null); }}
                                    style={{
                                        padding: '10px 14px', borderRadius: 8, minHeight: 44,
                                        background: 'transparent', color: 'var(--muted)',
                                        border: '1px solid var(--border)',
                                        fontSize: 12, fontWeight: 600,
                                    }}
                                >
                                    Wis
                                </button>
                            </div>

                            <textarea
                                value={transcript}
                                onChange={function (e) { setTranscript(e.target.value); }}
                                rows={10}
                                placeholder="Plak hier het gesprek, of typ: 'Klant Mariel Velema 0612345678. BBQ voor 80 mensen op 12 juli in Drenthe. Budget €40 per persoon. 4 vega, 1 noten-allergie...'"
                                style={{
                                    width: '100%', padding: '12px 14px', borderRadius: 8,
                                    background: 'var(--bg, #0a0a0d)', color: 'var(--text)',
                                    border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.5,
                                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                                }}
                            />

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                                <span>{transcript.length} tekens</span>
                                {result?.confidence != null && (
                                    <span style={{
                                        color: result.confidence >= 0.7 ? 'var(--green)' : result.confidence >= 0.4 ? '#f59e0b' : 'var(--red)',
                                        fontWeight: 700,
                                    }}>
                                        Vertrouwen {Math.round((result.confidence || 0) * 100)}%
                                    </span>
                                )}
                            </div>

                            {result && (
                                <div style={{
                                    padding: 14, borderRadius: 10,
                                    background: 'rgba(196,163,90,.05)',
                                    border: '1px solid rgba(196,163,90,.25)',
                                }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 10 }}>
                                        Geëxtraheerd
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                                        <Row label="Klant" value={result.klant_naam} />
                                        <Row label="Email" value={result.klant_email} />
                                        <Row label="Telefoon" value={result.klant_telefoon} />
                                        <Row label="Datum" value={result.event_datum} />
                                        <Row label="Locatie" value={result.event_locatie} />
                                        <Row label="Gasten" value={result.aantal_gasten ? String(result.aantal_gasten) : undefined} />
                                        <Row label="Vega" value={result.aantal_vega ? String(result.aantal_vega) : undefined} />
                                        <Row label="Budget/p" value={result.budget_pp_eur ? '€ ' + result.budget_pp_eur : undefined} />
                                        <Row label="Allergenen" value={result.allergenen?.join(', ')} wide />
                                        <Row label="Dieet" value={result.dieet_wensen?.join(', ')} wide />
                                        <Row label="Menu" value={result.menu_wensen} wide />
                                        <Row label="Notities" value={result.notities} wide />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: 16, borderTop: '1px solid var(--border, #2a2a30)',
                            display: 'flex', gap: 8, justifyContent: 'flex-end',
                        }}>
                            <button
                                type="button"
                                onClick={function () { setOpen(false); }}
                                style={{
                                    padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                    background: 'transparent', color: 'var(--text)',
                                    border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
                                }}
                            >
                                Annuleren
                            </button>
                            {result ? (
                                <button
                                    type="button"
                                    onClick={apply}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                        background: GOLD, color: '#000', border: 'none',
                                        fontSize: 12, fontWeight: 700,
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    <Wand2 size={14} /> Vul wizard in
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={runExtract}
                                    disabled={extracting || transcript.trim().length < 10}
                                    style={{
                                        padding: '10px 16px', borderRadius: 8, minHeight: 44,
                                        background: GOLD, color: '#000', border: 'none',
                                        fontSize: 12, fontWeight: 700,
                                        opacity: extracting || transcript.trim().length < 10 ? 0.5 : 1,
                                        cursor: extracting || transcript.trim().length < 10 ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                    }}
                                >
                                    {extracting ? <><Loader2 size={14} className="spin" /> Extraheert...</> : <><Sparkles size={14} /> Extract velden</>}
                                </button>
                            )}
                        </div>

                        <style>{`
                            .spin { animation: spin 1s linear infinite; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                            @keyframes pulse { 50% { opacity: .55; } }
                        `}</style>
                    </div>
                </div>
            )}
        </>
    );
}

function Row({ label, value, wide }: { label: string; value?: string | null; wide?: boolean }) {
    return (
        <div style={{
            gridColumn: wide ? '1 / -1' : undefined,
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,.02)',
            display: 'flex', flexDirection: wide ? 'column' : 'row',
            gap: wide ? 2 : 8, alignItems: wide ? 'flex-start' : 'center',
        }}>
            <span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em' }}>{label}</span>
            <span style={{ color: 'var(--text)', flex: 1, fontFamily: 'inherit', wordBreak: 'break-word' }}>
                {value || <em style={{ color: 'var(--muted)', opacity: 0.5 }}>—</em>}
            </span>
        </div>
    );
}
