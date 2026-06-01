'use client';

/**
 * Client-only trigger button that opens SubstitutionDrawer for one ingredient.
 * Kept minimal so the parent (server-rendered) breakdown stays static.
 */

import { useState } from 'react';
import { Search } from 'lucide-react';
import SubstitutionDrawer from './SubstitutionDrawer';

interface Props {
    masterProductId: number | null;
    ingredientName: string;
    currentSupplier: string | null;
    currentPrice: number | null;
}

export default function SubstitutionTrigger(props: Props) {
    const [open, setOpen] = useState(false);

    if (!props.masterProductId) {
        return (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }} title="Geen master_product gekoppeld">
                geen match
            </span>
        );
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'transparent',
                    border: '1px solid var(--color-border, #374151)',
                    borderRadius: 4,
                    color: 'var(--color-accent-gold, #d97706)',
                    cursor: 'pointer',
                }}
            >
                <Search size={11} />
                Goedkoper?
            </button>
            <SubstitutionDrawer
                open={open}
                onOpenChange={setOpen}
                masterProductId={props.masterProductId}
                ingredientName={props.ingredientName}
                currentSupplier={props.currentSupplier}
                currentPrice={props.currentPrice}
            />
        </>
    );
}
