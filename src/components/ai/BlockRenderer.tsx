'use client';

import type { Block, ActionCardBlock as ActionCardBlockType } from '@/lib/ai/blocks';
import InfoBlock from './blocks/InfoBlock';
import MetricBlock from './blocks/MetricBlock';
import WarningBlock from './blocks/WarningBlock';
import SuccessBlock from './blocks/SuccessBlock';
import BulletsBlock from './blocks/BulletsBlock';
import ActionHintBlock from './blocks/ActionHintBlock';
import NavCardBlock from './blocks/NavCardBlock';
import ActionCardBlock from './blocks/ActionCardBlock';

interface Props {
    blocks: Block[];
    /** Optioneel: callback wanneer een nav_card geklikt wordt (bv om palette te sluiten). */
    onNavigate?: () => void;
    /** Optioneel: callback voor action_card uitvoer. Krijgt action.type + action.data. */
    onExecute?: (action: ActionCardBlockType['action']) => void | Promise<void>;
    /** Compact-mode (bv. in command palette) — minder verticale gap. */
    compact?: boolean;
}

export default function BlockRenderer({ blocks, onNavigate, onExecute, compact = false }: Props) {
    if (!blocks || blocks.length === 0) return null;

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: compact ? 'var(--space-2)' : 'var(--space-3)',
            }}
        >
            {blocks.map((block, i) => {
                switch (block.type) {
                    case 'info':
                        return <InfoBlock key={i} block={block} />;
                    case 'metric':
                        return <MetricBlock key={i} block={block} />;
                    case 'warning':
                        return <WarningBlock key={i} block={block} />;
                    case 'success':
                        return <SuccessBlock key={i} block={block} />;
                    case 'bullets':
                        return <BulletsBlock key={i} block={block} />;
                    case 'action_hint':
                        return <ActionHintBlock key={i} block={block} />;
                    case 'nav_card':
                        return <NavCardBlock key={i} block={block} onNavigate={onNavigate} />;
                    case 'action_card':
                        return <ActionCardBlock key={i} block={block} onExecute={onExecute} />;
                    default: {
                        // Exhaustiveness check — als TS hier klaagt, hebben we een
                        // nieuw type toegevoegd zonder render te updaten.
                        const _exhaustive: never = block;
                        return _exhaustive;
                    }
                }
            })}
        </div>
    );
}
