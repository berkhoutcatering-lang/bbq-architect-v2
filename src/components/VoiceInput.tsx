'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, X, Check, AlertCircle } from 'lucide-react';

interface VoiceInputProps {
    onResult: (transcript: string) => void;
    onParsed?: (data: { product?: string; temp?: string; type?: string }) => void;
    products?: string[];
    isOpen: boolean;
    onClose: () => void;
}

const MEASUREMENT_TYPES: Record<string, string[]> = {
    kern: ['kern', 'kerntemperatuur', 'bereiding', 'bereid'],
    koeling: ['koeling', 'koel', 'koelkast', 'koelcel'],
    bewaring: ['bewaring', 'bewaar', 'opslag'],
    uitgifte: ['uitgifte', 'uitgave', 'serveer', 'serveren'],
};

export default function VoiceInput({ onResult, onParsed, products, isOpen, onClose }: VoiceInputProps) {
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState('');
    const [supported, setSupported] = useState(true);
    const [parsed, setParsed] = useState<{ product?: string; temp?: string; type?: string }>({});
    const recognitionRef = useRef<any>(null);

    useEffect(function () {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setSupported(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'nl-NL';
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;

        recognition.onresult = function (event: any) {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            const currentTranscript = finalTranscript || interimTranscript;
            setTranscript(currentTranscript);

            if (finalTranscript) {
                const parsedData = parseHACCPInput(finalTranscript, products || []);
                setParsed(parsedData);
                if (onParsed) onParsed(parsedData);
                onResult(finalTranscript);
            }
        };

        recognition.onerror = function (event: any) {
            if (event.error === 'no-speech') {
                setError('Geen spraak gedetecteerd. Probeer opnieuw.');
            } else if (event.error === 'audio-capture') {
                setError('Microfoon niet beschikbaar. Controleer toestemming.');
            } else {
                setError('Spraakherkenning fout: ' + event.error);
            }
            setListening(false);
        };

        recognition.onend = function () {
            setListening(false);
        };

        recognitionRef.current = recognition;

        return function () {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch (e) { /* ignore */ }
            }
        };
    }, [products]);

    const startListening = useCallback(function () {
        if (!recognitionRef.current) return;
        setError('');
        setTranscript('');
        setParsed({});
        setListening(true);
        try {
            recognitionRef.current.start();
        } catch (e) {
            setError('Kon spraakherkenning niet starten.');
            setListening(false);
        }
    }, []);

    function stopListening() {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
        }
        setListening(false);
    }

    function handleConfirm() {
        if (parsed.product || parsed.temp) {
            if (onParsed) onParsed(parsed);
        }
        onClose();
    }

    // Auto-start listening when opened
    useEffect(function () {
        if (isOpen && supported && recognitionRef.current) {
            const timer = setTimeout(startListening, 500);
            return function () { clearTimeout(timer); };
        }
    }, [isOpen, supported, startListening]);

    if (!isOpen) return null;

    if (!supported) {
        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 1100,
                background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 24,
            }}>
                <div style={{
                    background: '#1a1a1e', border: '1px solid var(--border)',
                    borderRadius: 20, padding: 32, maxWidth: 380, textAlign: 'center' as const,
                }}>
                    <AlertCircle size={48} style={{ color: '#f59e0b', margin: '0 auto 16px' }} />
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 8 }}>
                        Spraakherkenning niet beschikbaar
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 20 }}>
                        Deze browser ondersteunt geen spraakherkenning. Gebruik Chrome op Android of desktop voor de beste ervaring.
                    </p>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                            background: 'var(--card-solid)', border: '1px solid var(--border)',
                            color: 'white', cursor: 'pointer',
                        }}
                    >
                        Sluiten
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column' as const,
            alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }}>
            {/* Close button */}
            <button
                onClick={onClose}
                style={{
                    position: 'absolute', top: 20, right: 20,
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                    color: 'var(--muted)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <X size={20} />
            </button>

            {/* Title */}
            <h2 style={{
                fontSize: 20, fontWeight: 300, color: 'white', marginBottom: 8,
                letterSpacing: '0.05em',
            }}>
                🎤 Spraakherkenning
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 32, textAlign: 'center' as const }}>
                Spreek in: &quot;product, temperatuur, type&quot;
            </p>

            {/* Microphone button */}
            <button
                onClick={listening ? stopListening : startListening}
                style={{
                    width: 120, height: 120, borderRadius: '50%',
                    background: listening
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : 'linear-gradient(135deg, #c4a35a, #a8893e)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: listening
                        ? '0 0 0 8px rgba(239,68,68,0.15), 0 0 40px rgba(239,68,68,0.2)'
                        : '0 0 0 8px rgba(196,163,90,0.15), 0 0 40px rgba(196,163,90,0.2)',
                    transition: 'all 0.3s ease',
                    animation: listening ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }}
            >
                {listening ? <MicOff size={40} color="white" /> : <Mic size={40} color="#000" />}
            </button>

            <p style={{
                fontSize: 12, fontWeight: 600, color: listening ? '#ef4444' : '#c4a35a',
                marginTop: 16, textTransform: 'uppercase' as const,
                letterSpacing: '0.15em',
            }}>
                {listening ? 'Luisteren...' : 'Tik om te beginnen'}
            </p>

            {/* Transcript */}
            {transcript && (
                <div style={{
                    marginTop: 32, padding: '16px 24px', borderRadius: 16,
                    background: '#1a1a1e', border: '1px solid var(--border)',
                    maxWidth: 400, width: '100%',
                }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.1em' }}>
                        Herkend:
                    </div>
                    <div style={{ fontSize: 18, color: 'white', fontWeight: 300, marginBottom: 16 }}>
                        &quot;{transcript}&quot;
                    </div>

                    {/* Parsed results */}
                    {(parsed.product || parsed.temp || parsed.type) && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 16 }}>
                            {parsed.product && (
                                <span style={{
                                    padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    background: 'rgba(196,163,90,0.12)', color: '#c4a35a',
                                    border: '1px solid rgba(196,163,90,0.2)',
                                }}>
                                    {parsed.product}
                                </span>
                            )}
                            {parsed.temp && (
                                <span style={{
                                    padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    background: 'rgba(16,185,129,0.12)', color: '#10b981',
                                    border: '1px solid rgba(16,185,129,0.2)',
                                }}>
                                    {parsed.temp}°C
                                </span>
                            )}
                            {parsed.type && (
                                <span style={{
                                    padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                    background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                                    border: '1px solid rgba(59,130,246,0.2)',
                                }}>
                                    {parsed.type}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button
                            onClick={startListening}
                            style={{
                                flex: 1, height: 48, borderRadius: 12, fontSize: 14, fontWeight: 600,
                                background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                                color: 'var(--muted)', cursor: 'pointer',
                            }}
                        >
                            🔄 Opnieuw
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!parsed.product && !parsed.temp}
                            style={{
                                flex: 1, height: 48, borderRadius: 12, fontSize: 14, fontWeight: 600,
                                background: (parsed.product || parsed.temp)
                                    ? 'linear-gradient(135deg, #10b981, #059669)'
                                    : 'var(--card-solid)',
                                border: 'none',
                                color: (parsed.product || parsed.temp) ? 'white' : 'var(--muted)',
                                cursor: (parsed.product || parsed.temp) ? 'pointer' : 'not-allowed',
                            }}
                        >
                            ✅ Bevestig & Opslaan
                        </button>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{
                    marginTop: 20, padding: '10px 20px', borderRadius: 12,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                    fontSize: 13, color: '#ef4444', maxWidth: 400,
                }}>
                    {error}
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
            `}</style>
        </div>
    );
}

// Parse Dutch HACCP voice input
function parseHACCPInput(text: string, products: string[]): { product?: string; temp?: string; type?: string } {
    const lower = text.toLowerCase().trim();
    const result: { product?: string; temp?: string; type?: string } = {};

    // Find product match
    for (const product of products) {
        if (lower.includes(product.toLowerCase())) {
            result.product = product;
            break;
        }
    }

    // Find temperature — match patterns like "72 graden", "72°", "72.5"
    const tempMatch = lower.match(/(\d+[.,]?\d*)\s*(?:graden|°|graad|degrees)/);
    if (tempMatch) {
        result.temp = tempMatch[1].replace(',', '.');
    } else {
        // Try standalone numbers that look like temperatures (30-200 range)
        const numMatch = lower.match(/\b(\d{2,3}[.,]?\d?)\b/);
        if (numMatch) {
            const num = parseFloat(numMatch[1].replace(',', '.'));
            if (num >= 0 && num <= 200) {
                result.temp = num.toString();
            }
        }
    }

    // Find measurement type
    for (const [type, keywords] of Object.entries(MEASUREMENT_TYPES)) {
        for (const keyword of keywords) {
            if (lower.includes(keyword)) {
                result.type = type;
                break;
            }
        }
        if (result.type) break;
    }

    return result;
}
