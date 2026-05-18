import Link from 'next/link';
import { ArrowRight, ShieldCheck, AlertCircle, Package } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import PageHeader from '@/components/PageHeader';

export const metadata = {
    title: 'Ingrediënten — Menu & Recepten',
    description: 'Master-lijst van ingrediënten, gekoppeld aan voorraad en allergenen-cascade',
};

async function loadIngredientStats() {
    try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: membership } = await supabase
            .from('organization_members').select('organization_id')
            .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
        if (!membership) return null;
        const orgId = membership.organization_id as string;

        const [invRes, allergenRes, unconfirmedRes] = await Promise.all([
            supabase.from('inventory').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('ingredient_allergens').select('inventory_id', { count: 'exact', head: true }).eq('organization_id', orgId),
            supabase.from('ingredient_allergens').select('inventory_id', { count: 'exact', head: true })
                .eq('organization_id', orgId).eq('ai_suggested', true).is('confirmed_at', null),
        ]);

        return {
            inventoryCount: invRes.count ?? 0,
            allergensLinked: allergenRes.count ?? 0,
            unconfirmedAi: unconfirmedRes.count ?? 0,
        };
    } catch {
        return null;
    }
}

export default async function IngredientenLandingPage() {
    const stats = await loadIngredientStats();

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Ingrediënten"
                description="Master-lijst per organisatie, gekoppeld aan voorraad. Bron-van-waarheid voor de allergenen-cascade ingrediënt → component → gerecht."
            />

            {/* Stat tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <Package size={16} aria-hidden />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Totaal ingrediënten</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{stats?.inventoryCount ?? '—'}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <ShieldCheck size={16} aria-hidden />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Met allergenen-link</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{stats?.allergensLinked ?? '—'}</div>
                </div>
                <div className="card" style={{ padding: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <AlertCircle size={16} aria-hidden style={{ color: (stats?.unconfirmedAi ?? 0) > 0 ? '#f59e0b' : undefined }} />
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>AI-suggesties wachten op bevestiging</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: (stats?.unconfirmedAi ?? 0) > 0 ? '#f59e0b' : 'var(--text)' }}>
                        {stats?.unconfirmedAi ?? '—'}
                    </div>
                </div>
            </div>

            {/* CTA naar Voorraad waar de daadwerkelijke edit-flow leeft */}
            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-5)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Beheer ingrediënten</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', marginBottom: 16, maxWidth: 640 }}>
                    Ingrediënten zijn onderdeel van je voorraad. Voeg nieuwe items toe, beheer prijzen en leveranciers
                    in de Voorraad-hub. Allergenen-koppeling kan hier of bij elk component.
                </p>
                <Link
                    href="/voorraad"
                    className="btn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                >
                    Open Voorraad <ArrowRight size={14} />
                </Link>
            </div>

            <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Allergenen-cascade</h2>
                <p style={{ fontSize: 13, color: 'var(--muted-light)', marginBottom: 12, maxWidth: 640 }}>
                    Per ingrediënt kun je vastleggen welke EU-allergenen het bevat. Die info propageert automatisch
                    naar elk component dat het ingrediënt gebruikt, en naar elk gerecht waarin het component zit.
                    AI mag voorstellen doen — jij bevestigt.
                </p>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Bron: EU 1169/2011 Annex II — 14 verplichte allergenen voor foodservice.
                </div>
            </div>
        </div>
    );
}
