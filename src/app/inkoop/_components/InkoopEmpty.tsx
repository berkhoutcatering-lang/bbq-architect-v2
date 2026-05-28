/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * InkoopEmpty — drie lege-state varianten voor /inkoop (P0-8)
 * ─────────────────────────────────────────────────────────────
 * A) Geen bevestigde events binnen 14 dagen
 * B) Events maar geen menu-items gekoppeld
 * C) Voorraad dekt alle events (niets te bestellen)
 *
 * De DAL signaleert via summary-shape welke variant we tonen — geen aparte
 * fetch nodig. Kop + body + CTA volgen Sam's tone-of-voice (werkwoord-eerst,
 * sentence-case, max 4 woorden CTA).
 */
import Link from 'next/link';
import { CalendarX2, UtensilsCrossed, CheckCircle2 } from 'lucide-react';

interface BaseProps {
    eventsInWindow: number;
    hasMenuItems: boolean;
}

export default function InkoopEmpty({ eventsInWindow, hasMenuItems }: BaseProps) {
    // C: voorraad dekt alles → events + menu zijn er, alleen geen tekorten.
    if (eventsInWindow > 0 && hasMenuItems) return <EmptyAllCovered />;
    // B: events maar geen menu-koppeling.
    if (eventsInWindow > 0) return <EmptyNoMenu eventsCount={eventsInWindow} />;
    // A: geen events.
    return <EmptyNoEvents />;
}

function EmptyNoEvents() {
    return (
        <div
            style={{
                maxWidth: 440,
                margin: '64px auto',
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg, 14px)',
            }}
        >
            <div style={iconCircleStyle('rgba(196,163,90,.08)', 'rgba(196,163,90,.2)')}>
                <CalendarX2 size={32} color="var(--brand-gold, #c4a35a)" />
            </div>
            <h3 style={titleStyle}>Geen events gepland</h3>
            <p style={bodyStyle}>
                Er staan geen bevestigde events in de komende 14 dagen. Zodra je een event
                aanmaakt met menu-items, verschijnt hier automatisch je inkooplijst.
            </p>
            <Link href="/agenda" className="btn btn-brand" style={{ marginTop: 8 }}>
                Plan event
            </Link>
        </div>
    );
}

function EmptyNoMenu({ eventsCount }: { eventsCount: number }) {
    return (
        <div
            style={{
                maxWidth: 520,
                margin: '48px auto',
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg, 14px)',
            }}
        >
            <div style={iconCircleStyle('rgba(245,158,11,.08)', 'rgba(245,158,11,.2)')}>
                <UtensilsCrossed size={32} color="var(--amber, #f59e0b)" />
            </div>
            <h3 style={titleStyle}>
                {eventsCount} event{eventsCount === 1 ? '' : 's'} zonder gerechten
            </h3>
            <p style={bodyStyle}>
                We kunnen pas een inkooplijst genereren als je gerechten koppelt aan je events.
                Open de offerte-wizard om menu&apos;s toe te wijzen.
            </p>
            <Link href="/offertes" className="btn btn-brand" style={{ marginTop: 8 }}>
                Open offertes
            </Link>
        </div>
    );
}

function EmptyAllCovered() {
    return (
        <div
            style={{
                maxWidth: 440,
                margin: '48px auto',
                padding: '40px 24px',
                textAlign: 'center',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg, 14px)',
            }}
        >
            <div style={iconCircleStyle('rgba(34,197,94,.08)', 'rgba(34,197,94,.22)')}>
                <CheckCircle2 size={32} color="var(--green, #22c55e)" />
            </div>
            <h3 style={titleStyle}>Voorraad dekt alle events</h3>
            <p style={bodyStyle}>
                Er zijn geen tekorten voor de komende 14 dagen. Mooi — even achterover.
            </p>
            <Link href="/voorraad" className="btn btn-ghost" style={{ marginTop: 8 }}>
                Open voorraad
            </Link>
        </div>
    );
}

const titleStyle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 600,
    margin: '0 0 8px',
    color: 'var(--text, #fff)',
};

const bodyStyle: React.CSSProperties = {
    fontSize: 14,
    color: 'var(--muted)',
    lineHeight: 1.6,
    margin: '0 0 20px',
};

function iconCircleStyle(bg: string, border: string): React.CSSProperties {
    return {
        width: 72,
        height: 72,
        margin: '0 auto 20px',
        borderRadius: 18,
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };
}
