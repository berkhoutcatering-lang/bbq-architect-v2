import Link from 'next/link';
import { SearchX, Home } from 'lucide-react';

export const metadata = {
    title: 'Niet gevonden · BBQ Architect',
};

/**
 * Sitewide 404. Vervangt Next's default "404 - This page could not be found"
 * (Engels, zwart) — geeft NL-copy, brand-bg en een werkende terug-CTA.
 * Wordt rendered binnen AppShell zodat ingelogde users de gewone chrome zien
 * en niet-ingelogde users alleen de message + sign-in option.
 */
export default function NotFound() {
    return (
        <div style={{
            minHeight: 'calc(100dvh - 60px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '32px 24px', textAlign: 'center', gap: 16,
            background: 'var(--bg)', color: 'var(--text)',
        }}>
            <div style={{
                width: 72, height: 72, borderRadius: 18,
                background: 'rgba(196,163,90,.12)',
                border: '1px solid rgba(196,163,90,.3)',
                color: 'var(--brand, #c4a35a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <SearchX size={32} />
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                Deze pagina bestaat niet (meer)
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)', maxWidth: 320, lineHeight: 1.5 }}>
                Misschien is de link verlopen of onvolledig gekopieerd. Ga terug naar je startpagina
                of kijk in de zijbalk waar je naartoe wilt.
            </p>
            <Link href="/" style={{
                marginTop: 8, padding: '10px 18px', borderRadius: 10,
                background: 'var(--brand, #c4a35a)', color: '#1a1a1e',
                fontWeight: 600, fontSize: 14, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
                <Home size={16} /> Naar startpagina
            </Link>
        </div>
    );
}
