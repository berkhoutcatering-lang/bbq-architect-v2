import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Gedeelde server-renderbare helpers voor de Inzichten-tabs.
 * KpiTile + Row zaten in de oude /gerechten/insights/page.tsx; nu gedeeld door
 * de OverzichtTab / AiStatusTab / AllergenenTab zonder duplicatie.
 */

interface KpiTileProps {
    label: string;
    value: string;
    icon: ReactNode;
    sub?: string;
    accentColor?: string;
    ctaHref?: string;
}

export function KpiTile({ label, value, icon, sub, accentColor, ctaHref }: KpiTileProps) {
    const content = (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: 'var(--muted)' }}>
                {icon}
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: accentColor ?? 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && (
                <div style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 4 }}>
                    {sub}
                </div>
            )}
        </>
    );

    const baseStyle: React.CSSProperties = {
        padding: 'var(--space-4)',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'block',
        color: 'inherit',
        textDecoration: 'none',
    };

    return ctaHref ? (
        <Link href={ctaHref} style={baseStyle}>
            {content}
        </Link>
    ) : (
        <div style={baseStyle}>{content}</div>
    );
}

interface RowProps {
    label: string;
    value: number;
    accent: string;
}

export function Row({ label, value, accent }: RowProps) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{label}</span>
            <span style={{ fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        </div>
    );
}
