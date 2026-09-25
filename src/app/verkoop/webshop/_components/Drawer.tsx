'use client';

/**
 * De rechter-lade van het webshop-scherm — detail én bewerken, nooit een
 * modal in het midden. Gebruikt het bestaande mr-drawer-systeem
 * (src/styles/menu-hub.css). Esc sluit.
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
            <div className="mr-drawer" role="dialog" aria-modal="true" style={{ width, maxWidth: '100vw' }}>
                <div className="mr-drawer-header">
                    <div className="mr-drawer-header-info">
                        {eyebrow && <div className="ws-eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
                        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 24, lineHeight: 1.15, margin: 0, paddingRight: 40 }}>{title}</h2>
                        {subtitle && <div className="ws-onderschrift" style={{ marginTop: 4 }}>{subtitle}</div>}
                    </div>
                    <button type="button" className="mr-drawer-close" onClick={onClose} aria-label="Sluiten"><X size={16} /></button>
                </div>
                <div className="mr-drawer-edit-body">{children}</div>
                {footer && <div className="mr-drawer-footer">{footer}</div>}
            </div>
        </>
    );
}
