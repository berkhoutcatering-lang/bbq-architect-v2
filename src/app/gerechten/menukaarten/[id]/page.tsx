/**
 * /gerechten/menukaarten/[id] — composer-route.
 *
 * `id === 'nieuw'`  → create-mode (initial = null)
 * `id === number`   → edit-mode  (laad bestaande template via DAL)
 *
 * Server-component prefetcht gangen + gerechten + (optional) template in
 * parallel zodat first paint geen waterfall toont. MenuComposer is een
 * 'use client' component die de interactie afhandelt.
 */

import { notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase-server';
import MenuComposer from '@/components/menu/MenuComposer';
import { getMenuTemplate } from '@/lib/dal/menuTemplates';
/* GerechtenTabs wordt al door src/app/gerechten/layout.tsx gerendered. */

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MenukaartComposerPage({ params }: PageProps) {
    const { id: rawId } = await params;
    const supabase = await createServerSupabase();

    const isNew = rawId === 'nieuw';
    const numericId = isNew ? null : Number(rawId);
    if (!isNew && (Number.isNaN(numericId) || numericId === null || numericId < 1)) {
        notFound();
    }

    const [gangenRes, gerechtenRes] = await Promise.all([
        supabase.from('gangen').select('*').order('volgorde').limit(50),
        supabase.from('gerechten').select('*').order('naam').limit(2000),
    ]);

    const gangen = gangenRes.data ?? [];
    const gerechten = gerechtenRes.data ?? [];

    let initial = null;
    if (!isNew && numericId !== null) {
        initial = await getMenuTemplate(supabase, numericId);
        if (!initial) notFound();
    }

    return (
        <MenuComposer
            initial={initial}
            gerechten={gerechten}
            gangen={gangen}
        />
    );
}
