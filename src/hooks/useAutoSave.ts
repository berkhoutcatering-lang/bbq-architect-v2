'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface UseAutoSaveOptions {
    /** localStorage key for this draft */
    key: string;
    /** Form data to save */
    data: Record<string, unknown> | null;
    /** Save interval in ms (default 30000 = 30s) */
    interval?: number;
    /** Whether auto-save is enabled */
    enabled?: boolean;
}

interface UseAutoSaveReturn {
    /** Whether a draft exists in localStorage */
    hasDraft: boolean;
    /** The saved draft data */
    draft: Record<string, unknown> | null;
    /** Restore the draft (returns the data) */
    restoreDraft: () => Record<string, unknown> | null;
    /** Discard the draft */
    discardDraft: () => void;
    /** Manually save the current data as draft */
    saveDraft: () => void;
    /** Timestamp of last save */
    lastSaved: Date | null;
}

export function useAutoSave({ key, data, interval = 30000, enabled = true }: UseAutoSaveOptions): UseAutoSaveReturn {
    const [hasDraft, setHasDraft] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const dataRef = useRef(data);
    dataRef.current = data;

    // Check for existing draft on mount
    useEffect(function () {
        try {
            const saved = localStorage.getItem(key);
            setHasDraft(!!saved);
        } catch {
            setHasDraft(false);
        }
    }, [key]);

    const saveDraft = useCallback(function () {
        if (!dataRef.current) return;
        try {
            const payload = JSON.stringify({
                data: dataRef.current,
                timestamp: new Date().toISOString(),
            });
            localStorage.setItem(key, payload);
            setLastSaved(new Date());
        } catch {
            // localStorage full or unavailable — silently fail
        }
    }, [key]);

    const discardDraft = useCallback(function () {
        try {
            localStorage.removeItem(key);
        } catch {
            // ignore
        }
        setHasDraft(false);
    }, [key]);

    const restoreDraft = useCallback(function (): Record<string, unknown> | null {
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return null;
            const parsed = JSON.parse(saved);
            return parsed.data || null;
        } catch {
            return null;
        }
    }, [key]);

    // Auto-save on interval when enabled and data exists
    useEffect(function () {
        if (!enabled || !data) return;

        const timer = setInterval(function () {
            saveDraft();
        }, interval);

        return function () { clearInterval(timer); };
    }, [enabled, data, interval, saveDraft]);

    // Save on unmount (component teardown / navigation away)
    useEffect(function () {
        return function () {
            if (enabled && dataRef.current) {
                saveDraft();
            }
        };
    }, [enabled, saveDraft]);

    // Build the draft object for reading (without triggering re-renders on every read)
    const getDraft = useCallback(function (): Record<string, unknown> | null {
        try {
            const saved = localStorage.getItem(key);
            if (!saved) return null;
            const parsed = JSON.parse(saved);
            return parsed.data || null;
        } catch {
            return null;
        }
    }, [key]);

    return {
        hasDraft,
        draft: hasDraft ? getDraft() : null,
        restoreDraft,
        discardDraft,
        saveDraft,
        lastSaved,
    };
}
