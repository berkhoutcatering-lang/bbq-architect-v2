/**
 * De woordregels van de website, gevraagd aan de website zelf (blok C3/C6).
 * Hop & Bites bewaakt zijn eigen woorden (geen "lokaal", geen "passie", niets
 * over wat wel of niet zelf gemaakt is, geen uitroeptekens …) in de
 * website-repo; die lijsten worden hier niet gekopieerd. Vóór een voorstel
 * van de AI getoond wordt en vóór "zet live" vragen we de site:
 * POST {site_url}/api/tekstcontrole met { velden: { naam: tekst } }.
 */
import { createServiceSupabase } from '@/lib/supabase-server';

export interface Tekstfout {
    veld: string;
    woord: string;
}

export type TekstcontroleUitkomst = { status: 'goed' } | { status: 'fout'; fouten: Tekstfout[] } | { status: 'onbekend'; reden: string };

export async function siteUrl(orgId: string): Promise<string | null> {
    const sb = createServiceSupabase();
    const { data } = await sb.from('winkel_instellingen').select('site_url').eq('organization_id', orgId).maybeSingle();
    return (data?.site_url as string | null)?.replace(/\/$/, '') || null;
}

export async function controleerTekst(site: string | null, velden: Record<string, string>, fetcher: typeof fetch = fetch): Promise<TekstcontroleUitkomst> {
    if (!Object.keys(velden).length) return { status: 'goed' };
    if (!site) return { status: 'onbekend', reden: 'geen site_url in de instellingen' };
    try {
        const r = await fetcher(`${site}/api/tekstcontrole`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ velden }),
            signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return { status: 'onbekend', reden: `de website antwoordde ${r.status}` };
        const d = (await r.json()) as { fouten?: Tekstfout[] };
        const fouten = Array.isArray(d.fouten) ? d.fouten.filter((f) => typeof f?.veld === 'string' && typeof f?.woord === 'string') : [];
        return fouten.length ? { status: 'fout', fouten } : { status: 'goed' };
    } catch (e) {
        return { status: 'onbekend', reden: e instanceof Error ? e.message : 'niet bereikbaar' };
    }
}
