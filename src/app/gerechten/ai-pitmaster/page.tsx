import PageHeader from '@/components/PageHeader';

export const metadata = {
    title: 'AI Pitmaster — Menu & Recepten',
    description: 'AI-coach voor BBQ-events: directives, kerntemp-alerts, allergie-cross-refs',
};

export default function AiPitmasterPage() {
    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="AI Pitmaster"
                description="Live coach in de keuken — directives op basis van gang-status, smoker-temperaturen en allergie-cross-refs."
            />

            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand-gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                    Binnenkort
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Chef-coach Rook Maart</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', maxWidth: 640 }}>
                    De Haiku-gebaseerde chef-coach draait al tijdens events (/api/chef-coach). In een volgende slice
                    krijgt hij een dedicated tab binnen Menu &amp; Recepten met chat-history, directives-log en
                    recipe-context op basis van het actieve event.
                </p>
            </div>
        </div>
    );
}
