/**
 * /share/[token] — Public read-only boekhouder-toegang (P0.12).
 *
 * Geen auth — token in URL = capability.
 * Token resolved via service-role client (omzeilt RLS want anon).
 *
 * Wat boekhouder ziet:
 *   - Filter-snapshot (datum-range + leveranciers) bevroren bij creation
 *   - Lijst bonnen + bedrag-totaal + BTW-aggregaten
 *   - Klik op bon → PDF preview (signed URL, ook via service-role)
 *   - Download ZIP-pakket (zelfde /api/archief/bulk-export call met token-auth)
 *
 * Wat boekhouder NIET kan:
 *   - Editen, taggen, status wijzigen, deellinks maken
 *   - Filters wijzigen (bevroren snapshot)
 *   - Andere orgs zien (token bindt aan één org)
 *
 * Security:
 *   - Token = 64-char hex (32 random bytes) — onmogelijk te bruteforcen
 *   - expires_at strict gecheckt
 *   - revoked_at strict gecheckt
 *   - IP-logging in last_accessed_ip (audit-trail bij abuse)
 *   - Geen CDN-cache (Cache-Control no-store header op signed URLs)
 */
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceSupabase } from '@/lib/supabase-server';
import {
    resolveShareToken,
    recordShareAccess,
    type ShareToken,
} from '@/lib/archief/shareTokens';
import { searchBonnen, type SearchInput } from '@/lib/dal/bonnen';
import { fmtEur, fmtDate } from '@/app/archief/_components/format';
import { Archive, FileText, ShieldCheck } from 'lucide-react';

export const metadata = {
    title: 'Boekhouder-pakket — BBQ Architect',
    description: 'Read-only deellink voor boekhouder.',
    robots: { index: false, follow: false },  // niet in search-engines
};

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function SharePage({ params }: PageProps) {
    const { token } = await params;
    const serviceSb = createServiceSupabase();

    // 1. Resolve token (returnt null bij ongeldig/verlopen/ingetrokken)
    const share = await resolveShareToken(serviceSb, token);
    if (!share) notFound();

    // 2. Record access (async, niet-blokkerend voor render)
    const headersList = await headers();
    const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? headersList.get('x-real-ip')
        ?? null;
    void recordShareAccess(serviceSb, share.id, ip);

    // 3. Haal bonnen op met bevroren filter-snapshot
    const filters = (share.filter_json as unknown as SearchInput) ?? {};
    const result = await searchBonnen(serviceSb, share.organization_id, {
        ...filters,
        limit: 500,
    });

    // 4. Org-info voor header
    const { data: org } = await serviceSb
        .from('organizations')
        .select('name, slug, logo_url')
        .eq('id', share.organization_id)
        .single();

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
            {/* Header */}
            <header
                className="border-b px-6 py-5"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
            >
                <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        {org?.logo_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={org.logo_url} alt={org.name ?? ''} className="h-10 w-10 rounded-md object-contain" />
                        )}
                        <div>
                            <div
                                className="text-[18px] font-light"
                                style={{ fontFamily: 'var(--font-display)' }}
                            >
                                {org?.name ?? 'Organisatie'}
                            </div>
                            <div className="text-[12px] text-[var(--muted)]">
                                Boekhouder-pakket {share.label ? `· ${share.label}` : ''}
                            </div>
                        </div>
                    </div>
                    <div className="text-right text-[11px] text-[var(--muted)]">
                        <div className="flex items-center justify-end gap-1">
                            <ShieldCheck size={11} style={{ color: 'var(--brand-gold)' }} />
                            <span>Read-only · Geldig tot {fmtDate(share.expires_at)}</span>
                        </div>
                        {share.recipient_name && (
                            <div className="mt-0.5">Voor: {share.recipient_name}</div>
                        )}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1100px] px-6 py-8">
                {/* Title + summary */}
                <div className="mb-6">
                    <h1
                        className="flex items-center gap-3 text-[28px] font-extralight"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        <Archive size={26} style={{ color: 'var(--brand-gold)' }} />
                        Bonnenkistje · {result.bonnen.length} {result.bonnen.length === 1 ? 'bon' : 'bonnen'}
                    </h1>
                    <p className="mt-1 text-[13px] text-[var(--muted)]">
                        Totaal:{' '}
                        <span className="font-mono font-semibold tabular-nums text-[var(--text)]">
                            {fmtEur(result.bedragTotaal)}
                        </span>
                    </p>
                </div>

                {/* Bonnen lijst */}
                <ShareList bonnen={result.bonnen} share={share} />

                {/* Footer */}
                <footer className="mt-10 border-t pt-5 text-center text-[11px] text-[var(--muted)]" style={{ borderColor: 'var(--border)' }}>
                    Aangemaakt op {fmtDate(share.created_at)} via BBQ Architect.
                    {' '}Geldig tot {fmtDate(share.expires_at)} ({share.access_count + 1} keer geopend).
                </footer>
            </main>
        </div>
    );
}

interface ListProps {
    bonnen: Awaited<ReturnType<typeof searchBonnen>>['bonnen'];
    share: ShareToken;
}

function ShareList({ bonnen }: ListProps) {
    if (bonnen.length === 0) {
        return (
            <div className="rounded-[14px] border py-12 text-center text-[13px] text-[var(--muted)]" style={{ borderColor: 'var(--border)' }}>
                Geen bonnen in deze deellink.
            </div>
        );
    }

    return (
        <div
            className="rounded-[14px] border"
            style={{ borderColor: 'var(--border)', background: 'var(--card)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
            <table className="w-full border-collapse text-[12px]" style={{ minWidth: 560 }}>
                <thead>
                    <tr>
                        {['Datum', 'Leverancier', 'Categorie', 'Bedrag', 'BTW 9%', 'BTW 21%'].map((h, i) => (
                            <th
                                key={h}
                                className="border-b px-3.5 py-3 text-left text-[10px] font-bold uppercase tracking-[.12em] text-[var(--muted)]"
                                style={{
                                    background: 'var(--bg-elevated)',
                                    borderColor: 'var(--border)',
                                    textAlign: i >= 3 ? 'right' : 'left',
                                }}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {bonnen.map((b) => (
                        <tr
                            key={b.id}
                            className="transition-colors hover:bg-white/[0.02]"
                        >
                            <td className="border-b px-3.5 py-3 text-[var(--muted)] tabular-nums" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                {fmtDate(b.datum)}
                            </td>
                            <td className="border-b px-3.5 py-3 font-semibold" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                <div className="flex items-center gap-2">
                                    <FileText size={11} className="text-[var(--muted)]" />
                                    {b.leverancier_naam ?? b.winkel ?? '—'}
                                </div>
                            </td>
                            <td className="border-b px-3.5 py-3 text-[var(--muted)]" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                {b.categorie ?? '—'}
                                {b.rgs_code && (
                                    <span className="ml-2 font-mono text-[10px] text-[var(--muted-light)]">{b.rgs_code}</span>
                                )}
                            </td>
                            <td className="border-b px-3.5 py-3 text-right font-mono font-medium tabular-nums" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                {fmtEur(Number(b.totaal_bedrag ?? 0))}
                            </td>
                            <td className="border-b px-3.5 py-3 text-right font-mono tabular-nums text-[var(--muted)]" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                {fmtEur(Number(b.btw_laag_bedrag ?? 0))}
                            </td>
                            <td className="border-b px-3.5 py-3 text-right font-mono tabular-nums text-[var(--muted)]" style={{ borderColor: 'rgba(130,130,130,.06)' }}>
                                {fmtEur(Number(b.btw_hoog_bedrag ?? 0))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
