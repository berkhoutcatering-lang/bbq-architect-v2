'use client';

/* ═══════════════════════════════════════════════════════════════
   CitationsChip — Pillar #1 (Provenance-first AI)
   ─────────────────────────────────────────────────────────────
   Toont [Pulled from: X, Y] per AI-output zodat de user altijd
   ziet WAAR de suggestie vandaan komt. Compact bij 1-2 sources,
   collapsed bij 3+ (klik voor expand).
   ─────────────────────────────────────────────────────────────── */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export interface Citation {
    source_title: string;
    cited_text: string;
}

interface Props {
    citations: Citation[];
    /** Optional: maximum titels die direct getoond worden voor expand. Default 2. */
    inlineLimit?: number;
}

export default function CitationsChip({ citations, inlineLimit = 2 }: Props) {
    const [expanded, setExpanded] = useState(false);

    if (!citations || citations.length === 0) return null;

    // Unieke source-titels (één recipe kan meerdere keren geciteerd zijn)
    const uniqueTitles = Array.from(new Set(citations.map((c) => c.source_title)));
    const inlineTitles = expanded ? uniqueTitles : uniqueTitles.slice(0, inlineLimit);
    const remaining = uniqueTitles.length - inlineLimit;

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'rgba(139,139,240,.08)',
                border: '1px solid rgba(139,139,240,.25)',
                color: '#a5a5f0',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1.3,
                cursor: uniqueTitles.length > inlineLimit ? 'pointer' : 'default',
                maxWidth: '100%',
            }}
            onClick={() => uniqueTitles.length > inlineLimit && setExpanded(!expanded)}
            role={uniqueTitles.length > inlineLimit ? 'button' : undefined}
            aria-expanded={uniqueTitles.length > inlineLimit ? expanded : undefined}
            aria-label={`AI-suggestie gebaseerd op ${uniqueTitles.length} bron${uniqueTitles.length === 1 ? '' : 'nen'}`}
            title={citations.map((c) => `${c.source_title}: "${c.cited_text}"`).join('\n')}
        >
            <Sparkles size={10} aria-hidden />
            <span style={{ opacity: 0.75 }}>Pulled from:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {inlineTitles.join(', ')}
            </span>
            {!expanded && remaining > 0 && (
                <span style={{ opacity: 0.7 }}>+{remaining}</span>
            )}
        </div>
    );
}
