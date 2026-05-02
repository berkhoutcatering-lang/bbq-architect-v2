'use client';

// ============================================================
// ActionDispatcher — voert action_card.action uit via Supabase
// ------------------------------------------------------------
// De BlockRenderer roept onExecute(action) aan zodra de gebruiker
// op "Maak aan" / "Verwijder" klikt. Deze hook levert de uitvoerder
// terug die executeAction (uit ai-actions.ts) aanroept met de juiste
// context (Supabase client + orgId). Errors worden niet stilletjes
// gegeten — ChatPanel toont ze via ActionCardBlock.
//
// Bewust een hook in plaats van standalone util, zodat de orgId
// altijd vers is (komt uit React context — Supabase auth flips).
// ============================================================

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/lib/OrgContext';
import { executeAction, type ParsedAction } from '@/lib/ai-actions';
import type { ActionCardBlock } from '@/lib/ai/blocks';

export type ActionExecutor = (action: ActionCardBlock['action']) => Promise<Record<string, unknown> | undefined>;

export function useActionDispatcher(): ActionExecutor {
    const { org } = useOrg();
    const orgId = org?.id ?? null;

    return useCallback(
        async function (action: ActionCardBlock['action']): Promise<Record<string, unknown> | undefined> {
            if (!supabase) {
                throw new Error('Supabase client niet beschikbaar — log in en probeer opnieuw.');
            }
            // executeAction verwacht ParsedAction-vorm met optionele description.
            // Onze block-input heeft alleen { type, data } — voldoende voor de
            // standaard action-handlers in ai-actions.ts.
            const parsed: ParsedAction = {
                type: action.type,
                description: action.type,
                data: (action.data || {}) as Record<string, unknown>,
            };
            const result = await executeAction(parsed, supabase, orgId);
            return result;
        },
        [orgId]
    );
}
