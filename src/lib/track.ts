'use client';

import { supabase } from './supabase';

/**
 * Activation-events tracking voor Pro-tier launch KPI's.
 *
 * Fire-and-forget — faalt stilletjes als Supabase niet beschikbaar of RLS blokt.
 * Niet awaiten in render-paths (geeft race-conditions met SSR).
 *
 * Event-types: zie supabase/migrations/011_activation_events.sql
 */
export type ActivationEventType =
    | 'signup_completed'
    | 'quiz_completed'
    | 'first_hub_visit'
    | 'first_klant_created'
    | 'first_gerecht_created'
    | 'first_offerte_concept'
    | 'first_offerte_sent'
    | 'ai_wizard_used'
    | 'ai_allergen_detect'
    | 'checklist_item_done';

/**
 * Track een activation-event. Fire-and-forget.
 *
 * @example
 *   track('first_offerte_concept', { ai_wizard_used: true });
 *   track('checklist_item_done', { item: 'logo' });
 *   track('first_hub_visit', { hub: 'Plannen & Events' });
 */
export function track(eventType: ActivationEventType, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    if (!supabase) return;

    /* organization_id wordt automatisch ingevuld door de RLS-policy
       — zolang de user lid is van een org, is INSERT toegestaan en de FK
       wordt server-side gevalideerd. */
    void supabase
        .from('activation_events')
        .insert({ event_type: eventType, metadata: metadata || {} })
        .then((res) => {
            if (res.error) {
                /* Track-fouten zijn nooit fataal — alleen log voor debugging. */
                if (process.env.NODE_ENV === 'development') {
                    console.warn('[track] insert failed:', res.error.message);
                }
            }
        });
}

/**
 * Track-once: voeg event toe alleen als de localStorage-flag nog niet bestaat.
 * Voorkomt dubbele "first_*" events bij refresh of dubbele triggers.
 *
 * @example
 *   trackOnce('first_offerte_concept', 'first_offerte_concept');
 */
export function trackOnce(eventType: ActivationEventType, dedupeKey: string, metadata?: Record<string, unknown>): void {
    if (typeof window === 'undefined') return;
    const flagKey = `bbq_track_once_${dedupeKey}`;
    try {
        if (localStorage.getItem(flagKey)) return;
        localStorage.setItem(flagKey, '1');
    } catch {
        /* localStorage geblokkeerd — log toch om te voorkomen dat we events missen */
    }
    track(eventType, metadata);
}
