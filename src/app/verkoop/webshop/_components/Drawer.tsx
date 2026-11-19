'use client';

/**
 * De rechter-lade van het webshop-scherm — detail én bewerken, nooit een
 * modal in het midden. Gebruikt het bestaande mr-drawer-systeem
 * (src/styles/menu-hub.css). Esc sluit. Ook gebruikt op Winkel en Voorraad
 * (pakjes scannen, product toevoegen, afdelingen): de lade zet daarom zelf
 * de tekstkleur en de achtergrond uit het thema, los van de pagina eronder.
 */
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
    eyebrow?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    onClose: () => void;
    footer?: ReactNode;
    width?: number;
    children: ReactNode;
}

export default function Drawer({ eyebrow, title, subtitle, onClose, footer, width = 560, children }: Props) {
    useEffect(() => {
        const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', f);
        return () => window.removeEventListener('keydown', f);
    }, [onClose]);

    return (
        <>
            <div className="mr-drawer-scrim" onClick={onClose} role="presentation" />
            <div className="mr-drawer" role="dialog" aria-modal="true" style={{ width, maxWidth: '100vw', color: 'var(--text)', background: 'var(--color-bg-elevated, var(--bg-elevated, var(--bg)))' }}>
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info">
                        {/* Kleuren en maten hier zelf: ws-eyebrow en ws-onderschrift staan in webshop.css, en
                            die laadt niet op Winkel en Voorraad, waar deze lade ook gebruikt wordt. */}
                        {eyebrow && <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brand-gold)' }}>{eyebrow}</div>}
                        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 24, lineHeight: 1.15, margin: 0, paddingRight: 40, color: 'var(--text)' }}>{title}</h2>
                        {subtitle && <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.45, color: 'var(--muted)' }}>{subtitle}</div>}
                    </div>
                    <button type="button" className="mr-drawer-close" onClick={onClose} aria-label="Sluiten"><X size={16} /></button>
                </div>
                <div className="mr-drawer-edit-body">{children}</div>
                {footer && <div className="mr-drawer-footer" style={{ background: 'inherit' }}>{footer}</div>}
            </div>
        </>
    );
}
