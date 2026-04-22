/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo } from 'react';
import { detectAllergensInRecipe, ALLERGEN_LABELS, type Allergen } from '@/lib/allergenDetect';

/**
 * Toont auto-gedetecteerde allergenen voor een recept.
 * - Combineert handmatig-gezette allergenen (recipe.allergenen) met
 *   auto-detectie op basis van ingrediënt-namen.
 * - Toont per badge welke bron (handmatig/auto) + welke ingrediënten triggeren.
 */
export default function AllergenBadges({
    ingredients = [],
    manualAllergens = [],
    showEmpty = false,
    compact = false,
}: {
    ingredients?: { naam?: string }[];
    manualAllergens?: string[];
    showEmpty?: boolean;
    compact?: boolean;
}) {
    const { all, perIngredient } = useMemo(
        () => detectAllergensInRecipe(ingredients),
        [ingredients]
    );

    /* Combineer: handmatig + auto */
    const manualSet = new Set((manualAllergens || []).map(a => a.toLowerCase()));
    const autoSet = new Set(all);
    const combined = new Set<Allergen>([...autoSet]);
    manualSet.forEach(m => combined.add(m as Allergen));

    const list = Array.from(combined).sort();

    if (list.length === 0 && !showEmpty) return null;
    if (list.length === 0) {
        return (
            <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
                Geen allergenen gedetecteerd
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {list.map(a => {
                const isAuto = autoSet.has(a);
                const isManual = manualSet.has(a);
                const triggers = perIngredient
                    .filter(p => p.allergens.includes(a))
                    .map(p => p.naam);
                const tooltip = triggers.length > 0
                    ? `Gedetecteerd in: ${triggers.join(', ')}`
                    : isManual ? 'Handmatig toegevoegd' : '';
                return (
                    <span
                        key={a}
                        title={tooltip}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: compact ? '2px 7px' : '4px 10px',
                            borderRadius: 100,
                            fontSize: compact ? 10 : 11,
                            fontWeight: 600,
                            background: isManual && !isAuto
                                ? 'color-mix(in srgb, var(--amber) 15%, transparent)'
                                : 'color-mix(in srgb, var(--brand-gold, #c4a35a) 14%, transparent)',
                            color: isManual && !isAuto ? 'var(--amber)' : 'var(--brand-gold, #c4a35a)',
                            border: `1px solid ${isManual && !isAuto
                                ? 'color-mix(in srgb, var(--amber) 30%, transparent)'
                                : 'color-mix(in srgb, var(--brand-gold, #c4a35a) 30%, transparent)'}`,
                            cursor: tooltip ? 'help' : 'default',
                        }}
                    >
                        {ALLERGEN_LABELS[a] || a}
                        {isAuto && !isManual && (
                            <span style={{ fontSize: 8, opacity: 0.6, marginLeft: 2 }}>auto</span>
                        )}
                    </span>
                );
            })}
        </div>
    );
}
