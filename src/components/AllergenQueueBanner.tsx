import Link from 'next/link';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';

/* ═══════════════════════════════════════════════════════════════
   AllergenQueueBanner — Pillar #2 zichtbaarheid in elke /gerechten/* page
   ─────────────────────────────────────────────────────────────
   Server component. Counts unconfirmed AI-suggested rows per org en
   toont alleen iets als count > 0. Geen banner = no noise.
   ─────────────────────────────────────────────────────────────── */

interface QueueCounts {
    components: number;
    ingredients: number;
    total: number;
}

async function getPendingCounts(): Promise<QueueCounts> {
    const empty: QueueCounts = { components: 0, ingredients: 0, total: 0 };
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return empty;

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return empty;

        /* Twee parallelle queries: component-level + ingredient-level.
           Distinct ipv raw rows zodat de banner-tekst leesbaar blijft
           (1 component met 3 suggesties telt als 1, niet 3). */
        const [compRes, ingrRes] = await Promise.all([
            sb.from('component_allergens')
                .select('component_id')
                .eq('organization_id', mem.organization_id)
                .eq('ai_suggested', true)
                .is('confirmed_at', null),
            sb.from('ingredient_allergens')
                .select('inventory_id')
                .eq('organization_id', mem.organization_id)
                .eq('ai_suggested', true)
                .is('confirmed_at', null),
        ]);

        const components = compRes.data ? new Set(compRes.data.map((r) => r.component_id)).size : 0;
        const ingredients = ingrRes.data ? new Set(ingrRes.data.map((r) => r.inventory_id)).size : 0;
        return { components, ingredients, total: components + ingredients };
    } catch {
        return empty;
    }
}

export default async function AllergenQueueBanner() {
    const counts = await getPendingCounts();
    if (counts.total === 0) return null;

    /* Lees-vriendelijke titel afhankelijk van waar de queue zit. */
    const title = (() => {
        if (counts.ingredients > 0 && counts.components > 0) {
            return `${counts.total} items wachten op allergen-bevestiging`;
        }
        if (counts.ingredients > 0) {
            return `${counts.ingredients} ingrediënt${counts.ingredients === 1 ? '' : 'en'} wacht${counts.ingredients === 1 ? '' : 'en'} op allergen-bevestiging`;
        }
        return `${counts.components} component${counts.components === 1 ? '' : 'en'} wacht${counts.components === 1 ? '' : 'en'} op allergen-bevestiging`;
    })();

    return (
        <Link
            href="/gerechten/inzichten?tab=allergenen"
            aria-label={`${title} — open queue`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                marginBottom: 'var(--space-3, 12px)',
                background: 'linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.03))',
                border: '1px solid rgba(245,158,11,.25)',
                borderRadius: 10,
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'border-color .15s, background .15s',
            }}
            className="allergen-queue-banner"
        >
            <div
                aria-hidden
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(245,158,11,.12)',
                    border: '1px solid rgba(245,158,11,.3)',
                    color: '#f59e0b',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <ShieldCheck size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                    {title}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted-light, #a1a1aa)', marginTop: 2 }}>
                    AI heeft suggesties gedaan — bevestig of verwerp voor EU 1169/2011 audit-evidence.
                </div>
            </div>
            <ChevronRight size={16} aria-hidden style={{ color: 'var(--muted, #71717a)', flexShrink: 0 }} />
        </Link>
    );
}
