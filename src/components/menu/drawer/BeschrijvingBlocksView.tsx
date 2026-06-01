/* BlockNote read-only viewer voor gerecht.beschrijving_blocks.
 *
 * Migration 014 voegt de JSONB-kolom toe; legacy-gerechten hebben NULL en
 * vallen terug op de plain-text `beschrijving`. BlockNote is browser-only,
 * dus we laden hem via next/dynamic met ssr:false. De daadwerkelijke
 * editor-bundel (~150kB) staat in BlockNoteReader.tsx en wordt pas
 * opgehaald wanneer een gerecht met blocks geopend wordt.
 *
 * Edit-flow zit (nog) niet in de drawer — Aanpassen-knop roept onEdit-
 * callback aan en de parent-form regelt save. Vervolgstap post-launch:
 * edit-modus inline + onSaveBlocks callback voor inline save.
 */

'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Pencil } from 'lucide-react';

const BlockNoteReader = dynamic(() => import('./BlockNoteReader'), {
    ssr: false,
    loading: () => <div style={{ color: 'var(--muted)' }}>Editor wordt geladen…</div>,
});

interface Props {
    blocks?: unknown[] | null;
    fallback?: string | null;
}

export default function BeschrijvingBlocksView({ blocks, fallback }: Props) {
    const hasBlocks = useMemo(() => Array.isArray(blocks) && blocks.length > 0, [blocks]);

    return (
        <div style={{
            padding: 14, background: 'var(--bg-subtle)',
            border: '1px solid var(--border)', borderRadius: 10,
            fontSize: 13, lineHeight: 1.7, minHeight: 120,
            color: hasBlocks ? 'var(--text)' : 'var(--muted)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--muted)', fontSize: 11 }}>
                <Pencil size={12} /> Klik Aanpassen om te bewerken
            </div>
            {hasBlocks ? (
                <BlockNoteReader blocks={blocks as unknown[]} />
            ) : (
                fallback || <em>Geen bereidingswijze ingevuld. Open Pitmaster AI om receptuur te genereren.</em>
            )}
        </div>
    );
}
