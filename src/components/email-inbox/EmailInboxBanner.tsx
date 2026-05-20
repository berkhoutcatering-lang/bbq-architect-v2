import Link from 'next/link';
import { Mail, ChevronRight } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase-server';

/* Banner-component: telt mails met status 'received' of 'parsing' van de
   laatste 7 dagen en linkt naar de inbox-instellingen.
   Toont null bij 0 of bij ontbrekende tabel — geen noise. */

async function getInboxPendingCount(): Promise<number> {
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

        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await sb
            .from('org_email_inbox')
            .select('id')
            .eq('organization_id', mem.organization_id)
            .in('status', ['received', 'parsing'])
            .gte('received_at', weekAgo);
        return (data ?? []).length;
    } catch {
        return 0;
    }
}

export default async function EmailInboxBanner() {
    const count = await getInboxPendingCount();
    if (count === 0) return null;

    return (
        <Link
            href="/instellingen#email-inbox"
            aria-label={`${count} mail${count === 1 ? '' : 's'} wacht${count === 1 ? '' : 'en'} op verwerking — open instellingen`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                marginBottom: 'var(--space-3, 12px)',
                background: 'linear-gradient(135deg, rgba(96,165,250,.08), rgba(96,165,250,.03))',
                border: '1px solid rgba(96,165,250,.25)',
                borderRadius: 10,
                textDecoration: 'none',
                color: 'var(--text)',
                transition: 'border-color .15s, background .15s',
            }}
        >
            <div
                aria-hidden
                style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: 'rgba(96,165,250,.12)',
                    border: '1px solid rgba(96,165,250,.3)',
                    color: '#60a5fa',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                }}
            >
                <Mail size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#60a5fa' }}>
                    {count} {count === 1 ? 'mail' : 'mails'} wacht{count === 1 ? '' : 'en'} in inbox
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted-light, #a1a1aa)', marginTop: 2 }}>
                    Bonnen via email worden binnenkort verwerkt — controleer status in instellingen.
                </div>
            </div>
            <ChevronRight size={16} aria-hidden style={{ color: 'var(--muted, #71717a)', flexShrink: 0 }} />
        </Link>
    );
}
