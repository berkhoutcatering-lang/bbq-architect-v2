'use client';
import { useEffect, useRef, useCallback } from 'react';

/**
 * Form-autosave hook — geëxtraheerd uit het klantgesprek-patroon zodat
 * elke long-form pagina dezelfde "concept blijft bewaard"-UX krijgt
 * zonder copy-paste.
 *
 * Gebruik:
 * ```tsx
 * const [form, setForm] = useState({ naam: '', email: '' });
 * const { loadDraft, clearDraft } = useFormAutosave('bbq_klanten_draft', form, {
 *   enabled: isEditing,
 *   ttlMs: 7 * 24 * 60 * 60 * 1000,
 *   onRestore: (saved) => setForm(saved),
 * });
 *
 * // Bij succesvol save:
 * await upsertKlant(form);
 * clearDraft();
 *
 * // Bij mount (b.v. user opent "nieuw klant"):
 * useEffect(() => { if (isNewMode) loadDraft(); }, [isNewMode]);
 * ```
 *
 * Conventies:
 *   - `enabled` schakelt de save-loop in/uit (b.v. alleen wanneer
 *     editing/new actief is, niet bij list-view)
 *   - Debounce 500ms (zelfde als klantgesprek-blueprint)
 *   - TTL default 7 dagen — stale drafts worden niet hersteld + wel
 *     automatisch verwijderd bij volgende load-poging
 *   - `onRestore` wordt alléén gecalled vanuit `loadDraft()` — niet
 *     automatisch on-mount zodat consumer kan kiezen "alleen herstellen
 *     wanneer in new-mode"
 *   - Server-side safe: lukt niet (window undefined) → silent no-op
 */

interface AutosaveOptions<T> {
    /** Save-loop alleen actief als true. Default: true. */
    enabled?: boolean;
    /** TTL in ms — drafts ouder dan dit worden verwijderd. Default 7d. */
    ttlMs?: number;
    /** Debounce voor save-writes. Default 500ms. */
    debounceMs?: number;
    /** Callback bij `loadDraft()` als er een vers concept is. */
    onRestore?: (saved: T) => void;
}

interface SavedDraft<T> {
    data: T;
    savedAt: number;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DEBOUNCE_MS = 500;

export function useFormAutosave<T>(
    key: string,
    state: T,
    options: AutosaveOptions<T> = {},
): {
    loadDraft: () => boolean;
    clearDraft: () => void;
    hasDraft: () => boolean;
} {
    const enabled = options.enabled ?? true;
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    const onRestoreRef = useRef(options.onRestore);
    onRestoreRef.current = options.onRestore;

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMountedRef = useRef(false);

    /* Debounced write — alleen als enabled. */
    useEffect(() => {
        if (!enabled) return;
        if (typeof window === 'undefined') return;

        /* Skip eerste run — anders schrijft de hook direct na mount,
           voordat consumer `loadDraft()` heeft kunnen aanroepen. Dat
           zou een net-geladen draft kunnen overschrijven met initial
           state. */
        if (!isMountedRef.current) {
            isMountedRef.current = true;
            return;
        }

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            try {
                const payload: SavedDraft<T> = { data: state, savedAt: Date.now() };
                localStorage.setItem(key, JSON.stringify(payload));
            } catch {
                /* localStorage onbereikbaar (private-mode, quota, full
                   disk) — silent fallback. */
            }
        }, debounceMs);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [enabled, key, state, debounceMs]);

    /* Load draft on-demand — consumer roept dit aan wanneer hij wil
       herstellen (b.v. bij "nieuw klant"-knop). Returnt true als er
       een vers concept gevonden is. */
    const loadDraft = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const parsed = JSON.parse(raw) as SavedDraft<T>;
            const age = Date.now() - (parsed.savedAt || 0);
            if (age > ttlMs) {
                /* Stale draft → verwijder en doe niets. */
                localStorage.removeItem(key);
                return false;
            }
            if (onRestoreRef.current) onRestoreRef.current(parsed.data);
            return true;
        } catch {
            return false;
        }
    }, [key, ttlMs]);

    const clearDraft = useCallback((): void => {
        if (typeof window === 'undefined') return;
        try { localStorage.removeItem(key); } catch { /* ignore */ }
    }, [key]);

    const hasDraft = useCallback((): boolean => {
        if (typeof window === 'undefined') return false;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const parsed = JSON.parse(raw) as SavedDraft<T>;
            const age = Date.now() - (parsed.savedAt || 0);
            return age <= ttlMs;
        } catch {
            return false;
        }
    }, [key, ttlMs]);

    return { loadDraft, clearDraft, hasDraft };
}
