'use client';

/**
 * InkooplijstButton — deep-link naar de event-gedreven bestellijst op /inkoop.
 *
 * Voorheen genereerde dit per event losse concept_inkoop_orders (window =
 * eventdatum−3) die /inkoop nooit toonde — dat scherm herbouwt zijn eigen
 * window vanaf vandaag en aggregeert álle events in het 14-daagse venster.
 * Die per-event rijen waren dus orphans + een gebroken "Open in /inkoop"-
 * belofte, en spraken de single-source-of-truth (/inkoop, fix #2) tegen.
 * Nu puur een link zonder schrijvende side-effect.
 */

import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';

interface Props {
    eventId?: number;
    accentColor?: string;
}

export default function InkooplijstButton({ accentColor }: Props) {
    const color = accentColor ?? 'var(--color-accent-gold, #d97706)';
    return (
        <Link
            href="/inkoop"
            style={{
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 12,
                fontWeight: 600,
                padding: '10px 12px',
                background: `${color}10`,
                border: `1px solid ${color}40`,
                borderRadius: 8,
                color: 'var(--text, #fff)',
                textDecoration: 'none',
            }}
        >
            <ShoppingCart size={14} style={{ color }} />
            Bekijk bestellijst in Inkoop
        </Link>
    );
}
