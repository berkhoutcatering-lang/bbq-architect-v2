'use client';

/**
 * Notice die toont op event-detail als de gekoppelde offerte nog geen
 * menukaart heeft (template_id IS NULL).
 *
 * Dismiss-state houdt het banner 7 dagen weg via localStorage zodat de
 * caterende ondernemer hem niet elke pagina-load opnieuw ziet als hij
 * brand-default OK vindt.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Palette, X, ArrowRight } from 'lucide-react';

type Props = {
    eventName: string;
    offerteId: string | number;
    /** localStorage-key om per-event dismiss te onthouden. */
    storageKey?: string;
};

const DISMISS_DAYS = 7;

export default function MenukaartMissingNotice({ eventName, offerteId, storageKey }: Props) {
    const key = storageKey ?? `menukaart-notice-dismissed:${offerteId}`;
    const [dismissed, setDismissed] = useState(true); // start verborgen tot localStorage gecheckt
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        let stillDismissed = false;
        try {
            const raw = localStorage.getItem(key);
            if (raw) {
                const until = new Date(raw);
                if (Number.isFinite(until.getTime()) && until.getTime() > Date.now()) {
                    stillDismissed = true;
                } else {
                    localStorage.removeItem(key);
                }
            }
        } catch { /* private mode / SSR */ }
        // localStorage is client-only; mount-aware init is the canonical pattern.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDismissed(stillDismissed);
        setMounted(true);
    }, [key]);

    function onDismiss() {
        const until = new Date(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000);
        try { localStorage.setItem(key, until.toISOString()); } catch { /* ignore */ }
        setDismissed(true);
    }

    if (!mounted || dismissed) return null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '14px 18px',
            marginBottom: 20,
            background: 'linear-gradient(135deg, rgba(158,120,28,.08), rgba(196,163,90,.04))',
            border: '1px solid rgba(158,120,28,.25)',
            borderRadius: 12,
            position: 'relative',
        }}>
            <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(158,120,28,.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#c4a35a', flexShrink: 0,
            }}>
                <Palette size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                    Geen menukaart voor {eventName}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Klopt dat? Of wil je er een opmaken — kleur, lettertype, logo aanpassen aan dit event.
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <Link
                    href={`/offertes/${offerteId}/menukaart-editor`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '7px 14px', borderRadius: 6,
                        background: '#9e781c', color: '#fff',
                        fontSize: 12, fontWeight: 600,
                        border: '1px solid rgba(158,120,28,.5)',
                        boxShadow: '0 2px 8px rgba(158,120,28,.25)',
                        textDecoration: 'none',
                    }}
                >
                    Menukaart maken <ArrowRight size={13} />
                </Link>
                <button
                    onClick={onDismiss}
                    title="Niet meer tonen voor dit event (7 dagen)"
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--muted)', padding: 4, display: 'flex',
                    }}
                    type="button"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    );
}
