/**
 * /gerechten/[id] — Gerecht detail page met Live Cost (Pillar #1)
 *                   en Substitutie-suggesties (Pillar #3).
 *
 * Server Component shell. Prefetcht gerecht + roept LiveCostHeader (eigen
 * Server Component met RPC-call) + IngredientCostBreakdown (Server Component)
 * aan. SubstitutionDrawer is client-only en wordt per-rij geladen via
 * <SubstitutionTrigger>.
 *
 * Tenant-isolatie: gerechten heeft RLS-policy op organization_id — we
 * vertrouwen op .single() faal-als-niet-gevonden.
 */

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import LiveCostHeader from '../_components/LiveCostHeader';
import IngredientCostBreakdown from '../_components/IngredientCostBreakdown';
import GerechtComponentenEditor from '../_components/GerechtComponentenEditor';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function GerechtDetailPage({ params }: PageProps) {
    const { id } = await params;

    const sb = await createServerSupabase();

    /* Re-auth */
    const {
        data: { user },
    } = await sb.auth.getUser();
    if (!user) redirect('/auth/login?next=/gerechten/' + id);

    /* Org-resolve */
    const { data: member } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
    if (!member) redirect('/onboarding');
    const orgId = member.organization_id as string;

    /* Gerecht ophalen (RLS doet tenant-check, .single() faalt als niet gevonden) */
    const { data: gerecht, error } = await sb
        .from('gerechten')
        .select('id, naam, beschrijving, foto_url, kostprijs_pp, total_cost_cents, verkoopprijs, porties, marge_pct, allergenen, tags, gang_slug')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();

    if (error || !gerecht) notFound();

    return (
        <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
            <nav style={{ marginBottom: 20, fontSize: 13 }}>
                <Link
                    href="/gerechten"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--color-text-muted)',
                        textDecoration: 'none',
                    }}
                >
                    <ChevronLeft size={14} />
                    Terug naar Gerechten
                </Link>
            </nav>

            <header style={{ marginBottom: 24 }}>
                <h1 className="chassis-titel">{gerecht.naam}</h1>
                {gerecht.beschrijving && (
                    <p
                        style={{
                            fontSize: 15,
                            color: 'var(--color-text-secondary, #cbd5e1)',
                            marginTop: 8,
                            maxWidth: 720,
                            lineHeight: 1.5,
                        }}
                    >
                        {gerecht.beschrijving}
                    </p>
                )}
            </header>

            <LiveCostHeader
                gerechtId={String(gerecht.id)}
                organizationId={orgId}
                fallbackKostprijsCents={Number(gerecht.total_cost_cents ?? 0)}
                porties={Number(gerecht.porties ?? 10)}
                verkoopprijs={Number(gerecht.verkoopprijs ?? 0)}
            />

            <IngredientCostBreakdown
                gerechtId={String(gerecht.id)}
                organizationId={orgId}
            />

            <GerechtComponentenEditor gerechtId={String(gerecht.id)} />

            <section style={{ marginTop: 32, fontSize: 13, color: 'var(--color-text-muted)' }}>
                <p>
                    Kostprijs wordt automatisch bijgewerkt zodra een leverancier-mutation in
                    /price-intelligence is goedgekeurd. De cascade verloopt via{' '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>
                        components.base_cost_cents
                    </code>
                    {' → '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>
                        gerecht_components.cost_at_use_cents
                    </code>
                    {' → '}
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>
                        gerechten.total_cost_cents
                    </code>
                    .
                </p>
            </section>
        </main>
    );
}
