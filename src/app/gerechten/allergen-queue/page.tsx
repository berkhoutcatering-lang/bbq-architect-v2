import { ShieldCheck } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';
import PageHeader from '@/components/PageHeader';
import AllergenQueueList, { type QueueItem } from './_components/AllergenQueueList';

export const metadata = {
    title: 'Allergenen-bevestiging — Menu',
    description: 'Bevestig AI-voorgestelde allergens voor EU 1169/2011 audit-evidence',
};

async function loadQueue(): Promise<{ items: QueueItem[]; loadError: string | null }> {
    try {
        const sb = await createServerSupabase();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return { items: [], loadError: 'Niet ingelogd' };

        const { data: mem } = await sb
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
        if (!mem) return { items: [], loadError: 'Geen actieve organisatie' };
        const orgId = mem.organization_id as string;

        /* Twee losse queries i.p.v. PostgREST-embed omdat component_allergens
           geen DECLARED FK naar allergens.code heeft (legacy uit migration
           20260510130000). De FK wordt in 20260516190000 toegevoegd, maar
           deze fallback laat ons werken met of zonder die FK. */
        const [allergensRes, rowsRes] = await Promise.all([
            sb.from('allergens').select('code, nl_label'),
            sb
                .from('component_allergens')
                .select(`
                    component_id,
                    allergen_code,
                    ai_suggested,
                    confirmed_at,
                    components!inner ( id, name, type, organization_id )
                `)
                .eq('organization_id', orgId)
                .eq('ai_suggested', true)
                .is('confirmed_at', null)
                .order('component_id', { ascending: true }),
        ]);

        if (allergensRes.error) return { items: [], loadError: allergensRes.error.message };
        if (rowsRes.error)     return { items: [], loadError: rowsRes.error.message };

        // Lookup-map: allergen-code → NL-label
        const labelMap = new Map<string, string>(
            (allergensRes.data ?? []).map((a) => [a.code, a.nl_label]),
        );

        /* Group by component zodat we per component één card tonen
           met daarbinnen alle wachtende allergen-chips. */
        const grouped = new Map<number, QueueItem>();
        for (const r of rowsRes.data ?? []) {
            // De components-join komt als object terug (echte FK bestaat hier wél).
            const comp = (r as any).components as { id: number; name: string; type: string } | null;
            if (!comp) continue;

            const code = r.allergen_code as string;
            const label = labelMap.get(code) ?? code; // fallback op code als master-row mist
            const allergenEntry = { code, label };

            const existing = grouped.get(comp.id);
            if (existing) {
                existing.allergens.push(allergenEntry);
            } else {
                grouped.set(comp.id, {
                    componentId: comp.id,
                    componentName: comp.name,
                    componentType: comp.type as 'prepared' | 'bought_in',
                    allergens: [allergenEntry],
                });
            }
        }

        return { items: Array.from(grouped.values()), loadError: null };
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Onbekende fout';
        return { items: [], loadError: msg };
    }
}

export default async function AllergenQueuePage() {
    const { items, loadError } = await loadQueue();

    return (
        <div style={{ padding: 'var(--space-6) 0' }}>
            <PageHeader
                title="Allergenen-bevestiging"
                description="AI heeft mogelijke allergens herkend per component. Bevestig of verwerp ze — EU 1169/2011 vereist mens-controle vóór publicatie."
            />

            {loadError ? (
                <div className="card" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-4)', borderLeft: '3px solid #ef4444' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 6 }}>
                        Kon de queue niet laden
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{loadError}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted-light)', marginTop: 8 }}>
                        Mogelijk is de unify-migration nog niet gedraaid.
                        Run <code>supabase/migrations/20260516180000_unify_gerechten_componenten.sql</code> in Supabase Studio.
                    </div>
                </div>
            ) : items.length === 0 ? (
                <div className="card" style={{ padding: 'var(--space-6)', marginTop: 'var(--space-4)', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#00d4a1', marginBottom: 8 }}>
                        <ShieldCheck size={20} aria-hidden />
                        <span style={{ fontWeight: 600 }}>Alles up-to-date</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted-light)' }}>
                        Geen AI-suggesties die wachten op je bevestiging.
                        Wanneer je een nieuw component aanmaakt of <code>/api/detect-allergens</code>
                        nieuwe matches vindt, verschijnen ze hier.
                    </div>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, margin: 'var(--space-4) 0 var(--space-3)' }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>
                            {items.length}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                            {items.length === 1 ? 'component wacht' : 'componenten wachten'} op bevestiging
                        </div>
                    </div>
                    <AllergenQueueList items={items} />
                </>
            )}
        </div>
    );
}
