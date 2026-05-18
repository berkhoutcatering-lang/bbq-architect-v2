import Link from 'next/link';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';

/* ═══════════════════════════════════════════════════════════════
   AllergenQueueBanner — Pillar #2 zichtbaarheid in elke /gerechten/* page
   ─────────────────────────────────────────────────────────────
   Server component. Counts unconfirmed AI-suggested rows per org en
   toont alleen iets als count > 0. Geen banner = no noise.
   ─────────────────────────────────────────────────────────────── */

async function getPendingCount(): Promise<number> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return 0;

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return 0;

        // Distinct components, not raw rows — banner-message reads better
        const { data } = await sb
            .from('component_allergens')
            .select('component_id')
            .eq('organization_id', mem.organization_id)
            .eq('ai_suggested', true)
            .is('confirmed_at', null);

        if (!data) return 0;
        return new Set(data.map((r) => r.component_id)).size;
    } catch {
        return 0;
    }
}

export default async function AllergenQueueBanner() {
    const count = await getPendingCount();
    if (count === 0) return null;

    return (
        <Link
            href="/gerechten/allergen-queue"
            aria-label={`${count} component${count === 1 ? '' : 'en'} wachten op allergen-bevestiging — open queue`}
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
                    {count} {count === 1 ? 'component' : 'componenten'} wacht{count === 1 ? '' : 'en'} op allergen-bevestiging
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted-light, #a1a1aa)', marginTop: 2 }}>
                    AI heeft suggesties gedaan — bevestig of verwerp voor EU 1169/2011 audit-evidence.
                </div>
            </div>
            <ChevronRight size={16} aria-hidden style={{ color: 'var(--muted, #71717a)', flexShrink: 0 }} />
        </Link>
    );
}
