'use client';

/* ═══════════════════════════════════════════════════════════════
   useVoiceSearch — Pillar #5 (Lars-friendly mobile assembly)
   ─────────────────────────────────────────────────────────────
   Web Speech API wrapper voor voice-input op /m/gerechten.
   Graceful fallback wanneer browser geen SpeechRecognition heeft
   (Firefox, oudere Safari). Lars zit met handschoenen en zon —
   spraak is sneller dan typen.
   ─────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceSearchState {
    /** True wanneer browser SpeechRecognition ondersteunt. */
    supported: boolean;
    /** True tijdens actieve recording. */
    listening: boolean;
    /** Laatste herkende transcript (partial of final). */
    transcript: string;
    /** Error-message wanneer iets misgaat. */
    error: string | null;
}

interface UseVoiceSearchResult extends VoiceSearchState {
    start: () => void;
    stop: () => void;
    reset: () => void;
}

/* SpeechRecognition is vendor-prefixed in oudere browsers — vang beide.
   TypeScript heeft geen built-in types voor de Web Speech API in alle envs,
   dus we typen het minimaal en gebruiken any voor de instance. */
function getSpeechRecognition(): (new () => any) | null {
    if (typeof window === 'undefined') return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useVoiceSearch(lang = 'nl-NL'): UseVoiceSearchResult {
    const [state, setState] = useState<VoiceSearchState>({
        supported: false,
        listening: false,
        transcript: '',
        error: null,
    });
    const recognitionRef = useRef<any>(null);

    /* Detect support after mount (SSR-safe). */
    useEffect(() => {
        const SR = getSpeechRecognition();
        setState((s) => ({ ...s, supported: SR !== null }));
    }, []);

    const start = useCallback(() => {
        const SR = getSpeechRecognition();
        if (!SR) {
            setState((s) => ({ ...s, error: 'Spraakherkenning niet ondersteund in deze browser' }));
            return;
        }
        try {
            const rec = new SR();
            rec.lang = lang;
            rec.continuous = false;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            rec.onstart = () => setState((s) => ({ ...s, listening: true, error: null, transcript: '' }));
            rec.onresult = (event: any) => {
                let txt = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    txt += event.results[i][0].transcript;
                }
                setState((s) => ({ ...s, transcript: txt }));
            };
            rec.onerror = (event: any) => {
                const errMap: Record<string, string> = {
                    'no-speech': 'Geen spraak gehoord — probeer opnieuw',
                    'not-allowed': 'Microfoon-toegang geweigerd',
                    'service-not-allowed': 'Microfoon-toegang geweigerd',
                    'audio-capture': 'Geen microfoon gevonden',
                    'network': 'Netwerkfout bij spraakherkenning',
                };
                setState((s) => ({ ...s, listening: false, error: errMap[event.error] ?? `Fout: ${event.error}` }));
            };
            rec.onend = () => setState((s) => ({ ...s, listening: false }));

            recognitionRef.current = rec;
            rec.start();
        } catch (e) {
            setState((s) => ({ ...s, error: e instanceof Error ? e.message : 'Onbekende fout' }));
        }
    }, [lang]);

    const stop = useCallback(() => {
        try { recognitionRef.current?.stop(); } catch { /* noop */ }
        setState((s) => ({ ...s, listening: false }));
    }, []);

    const reset = useCallback(() => {
        setState((s) => ({ ...s, transcript: '', error: null }));
    }, []);

    /* Cleanup on unmount */
    useEffect(() => {
        return () => {
            try { recognitionRef.current?.abort(); } catch { /* noop */ }
        };
    }, []);

    return { ...state, start, stop, reset };
}
