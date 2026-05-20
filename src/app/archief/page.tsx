import { Suspense } from 'react';
import { createServerSupabase } from '@/lib/supabase-server';
import PageHeader from '@/components/PageHeader';
import ArchiefClient from './_components/ArchiefClient';
import type { ArchiefBon, ArchiefFilters } from './_lib/types';

export const metadata = {
    title: 'Archief — Boekhoud-bonnenkistje',
    description: 'Zoek door al je gescande bonnen en facturen — op woord, datum, leverancier of tag',
};

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{
        q?: string;
        from?: string;
        to?: string;
        leverancier?: string;
        status?: string;
        tags?: string;
    }>;
}

async function loadBonnen(filters: ArchiefFilters): Promise<{ bonnen: ArchiefBon[]; totaal: number; error?: string }> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { bonnen: [], totaal: 0, error: 'Niet ingelogd' };

        let query = sb
            .from('bonnen')
            .select('id, winkel, datum, totaal_bedrag, image_url, status, categorie, btw_pct, tags, leverancier_id, notities, created_at')
            .order('datum', { ascending: false, nullsFirst: false })
            .limit(200);

        /* tsvector-zoek via plainto-tsquery — accepteert woord-input,
           bouwt zelf de query (geen tsquery-syntax-validatie nodig). */
        if (filters.q && filters.q.trim().length >= 2) {
            const term = filters.q.trim().replace(/[!&|()'"\\]/g, ' ');
            query = query.textSearch('search_vec', term, { type: 'plain', config: 'dutch' });
        }
        if (filters.from) query = query.gte('datum', filters.from);
        if (filters.to) query = query.lte('datum', filters.to);
        if (filters.leverancier_id) query = query.eq('leverancier_id', filters.leverancier_id);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.tags && filters.tags.length > 0) query = query.contains('tags', filters.tags);

        const { data, error } = await query;
        if (error) return { bonnen: [], totaal: 0, error: error.message };

        const bonnen = (data ?? []) as ArchiefBon[];
        const totaal = bonnen.reduce((s, b) => s + Number(b.totaal_bedrag ?? 0), 0);
        return { bonnen, totaal };
    } catch (e) {
        return { bonnen: [], totaal: 0, error: e instanceof Error ? e.message : 'Onbekende fout' };
    }
}

async function loadLeveranciers(): Promise<Array<{ id: number; naam: string }>> {
    try {
        const sb = await createServerSupabase();
        const { data } = await sb.from('leveranciers').select('id, naam').order('naam');
        return (data ?? []) as Array<{ id: number; naam: string }>;
    } catch {
        return [];
    }
}

async function loadTagSuggestions(): Promise<string[]> {
    try {
        const sb = await createServerSupabase();
        const { data } = await sb.from('bonnen').select('tags').not('tags', 'is', null).limit(500);
        const set = new Set<string>();
        for (const row of data ?? []) {
            for (const t of (row.tags as string[] | null) ?? []) set.add(t);
        }
        return Array.from(set).sort();
    } catch {
        return [];
    }
}

export default async function ArchiefPage({ searchParams }: PageProps) {
    const sp = await searchParams;
    const filters: ArchiefFilters = {
        q: sp.q,
        from: sp.from,
        to: sp.to,
        leverancier_id: sp.leverancier ? Number(sp.leverancier) : undefined,
        status: sp.status,
        tags: sp.tags ? sp.tags.split(',').filter(Boolean) : undefined,
    };

    const [bonnenResult, leveranciers, tagSuggestions] = await Promise.all([
        loadBonnen(filters),
        loadLeveranciers(),
        loadTagSuggestions(),
    ]);

    return (
        <div style={{ padding: '24px var(--space-mobile-edge) 32px', maxWidth: 1600, margin: '0 auto' }}>
            <PageHeader
                title="Archief"
                description="Je digitale bonnen-kistje. Doorzoek elke gescande bon op woord, leverancier, datum of tag — terug te vinden voor de boekhouder of NVWA."
            />

            {bonnenResult.error && (
                <div role="alert" style={{
                    padding: '12px 16px', marginTop: 16, borderRadius: 10,
                    background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
                    color: '#ef4444', fontSize: 13,
                }}>
                    {bonnenResult.error.includes('search_vec') || bonnenResult.error.includes('extracted_text')
                        ? 'Archief-zoek nog niet beschikbaar — run de migration `supabase/migrations/20260520220000_bonnen_archief_search.sql` in Supabase Studio.'
                        : bonnenResult.error}
                </div>
            )}

            <Suspense fallback={<div style={{ padding: 24, color: 'var(--muted)' }}>Bonnen laden…</div>}>
                <ArchiefClient
                    initialBonnen={bonnenResult.bonnen}
                    initialTotaal={bonnenResult.totaal}
                    leveranciers={leveranciers}
                    tagSuggestions={tagSuggestions}
                    initialFilters={filters}
                />
            </Suspense>
        </div>
    );
}
