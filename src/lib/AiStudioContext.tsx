'use client';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ThinkingMode } from '@/lib/ai-modes';

export interface AiStudioInitialState {
    messages?: Array<{ role: string; content: string; actions?: unknown[] }>;
    thinkingMode?: ThinkingMode;
    mode?: 'brainstorm' | 'qa';
}

interface AiStudioContextValue {
    isOpen: boolean;
    initial: AiStudioInitialState | null;
    open: (state?: AiStudioInitialState) => void;
    close: () => void;
}

const AiStudioContext = createContext<AiStudioContextValue | null>(null);

export function AiStudioProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [initial, setInitial] = useState<AiStudioInitialState | null>(null);

    const open = useCallback(function (state?: AiStudioInitialState) {
        setInitial(state ?? null);
        setIsOpen(true);
    }, []);

    const close = useCallback(function () {
        setIsOpen(false);
    }, []);

    const value = useMemo(function () {
        return { isOpen, initial, open, close };
    }, [isOpen, initial, open, close]);

    return <AiStudioContext.Provider value={value}>{children}</AiStudioContext.Provider>;
}

export function useAiStudio(): AiStudioContextValue {
    const ctx = useContext(AiStudioContext);
    if (!ctx) {
        // Fallback no-op zodat componenten die buiten een Provider draaien (storybook,
        // tests, sub-trees waar de provider nog niet bestaat) niet crashen.
        return {
            isOpen: false,
            initial: null,
            open: function () { /* noop */ },
            close: function () { /* noop */ },
        };
    }
    return ctx;
}
