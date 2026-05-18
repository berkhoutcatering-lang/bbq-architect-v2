import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

export const metadata = {
    title: 'Menu-analyse — Menu & Recepten',
    description: 'Marge en populariteit per gerecht — BCG-kwadrant, runners en bleeders',
};

export default function MenuAnalysePage() {
    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Menu-analyse"
                description="Marge × populariteit per gerecht. Ontdek runners, puzzelstukjes en marge-lekken."
            />

            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Binnenkort
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>BCG-kwadrant & marge-tracker</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', maxWidth: 640, marginBottom: 16 }}>
                    Voor nu kun je marges per gerecht zien in de Marges-pagina. De geünificeerde menu-analyse
                    met BCG-kwadrant, runners-list en marge-lek-detector komt in een volgende slice.
                </p>
                <Link
                    href="/marges"
                    className="btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                    Open Marges <ArrowRight size={14} />
                </Link>
            </div>
        </div>
    );
}
