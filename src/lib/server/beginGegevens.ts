import 'server-only';
import { createServerSupabase } from '@/lib/supabase-server';

/**
 * Begingegevens voor een pagina, al op de server opgehaald.
 *
 * Een browser-pagina die zelf ophaalt, wacht drie keer op elkaar: eerst wie
 * je bent, dan bij welk bedrijf je hoort, dan pas de gegevens (op /offertes
 * gemeten: 0,3 s nadat de pagina al stond, meting 2026-10-20). Hier doet de
 * server dat in één keer en gaan de rijen mee met de HTML.
 *
 * Exact dezelfde vraag als useSupabase (`select *`, eigen bedrijf, op id) —
 * zo sluit een latere verversing in de browser er naadloos op aan.
 *
 * Het bedrijf: de browser kan een ander actief bedrijf kiezen (localStorage)
 * dan de server weet. Daarom gaat `orgId` mee; de pagina gebruikt de rijen
 * alleen als dat hetzelfde bedrijf is, en haalt anders zelf op.
 *
 * Mislukt er iets, dan `null`: de pagina valt terug op ophalen in de browser,
 * nooit op een lege lijst die doet alsof er niets is.
 */
export interface BeginGegevens {
    orgId: string;
    rijen: Record<string, unknown[]>;
}

export async function laadBeginGegevens(tabellen: readonly string[]): Promise<BeginGegevens | null> {
    try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: leden } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active');
        /* Meerdere bedrijven: welk bedrijf actief is weet alleen de browser.
           Gok niet — laat de browser ophalen. */
        if (!leden || leden.length !== 1) return null;
        const orgId = leden[0].organization_id as string;

        const antwoorden = await Promise.all(tabellen.map(function (t) {
            return supabase.from(t).select('*').eq('organization_id', orgId).order('id', { ascending: true });
        }));
        const rijen: Record<string, unknown[]> = {};
        for (let i = 0; i < tabellen.length; i++) {
            const a = antwoorden[i];
            if (a.error || !a.data) return null;
            rijen[tabellen[i]] = a.data as unknown[];
        }
        return { orgId, rijen };
    } catch {
        return null;
    }
}
