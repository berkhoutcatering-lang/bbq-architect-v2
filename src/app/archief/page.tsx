/**
 * /archief = Bonnenkistje hoofdpagina.
 *
 * Server Component:
 *   1. Auth + tenant resolve
 *   2. URL searchParams → SearchInput (filters)
 *   3. DAL: searchBonnen + listLeveranciersWithCounts + tags + rgs + inbox
 *   4. Loader-actions voor lazy-loaded tab content (audit, stock per bon)
 *   5. ArchiefClient orchestrator
 *
 * Server-action loaders worden inline gebruikt voor BonPreview-tabs
 * zodat audit/stock-data alleen geladen wordt als de tab wordt geopend.
 */
import { createServerSupabase } from '@/lib/supabase-server';
import {
    searchBonnen,
    listLeveranciersWithCounts,
    listDistinctTags,
    listDistinctRgs,
    listInboxFacturen,
    listBonAuditLog,
    listStockMovementsForBon,
    type SearchInput,
    type BonStatus,
} from '@/lib/dal/bonnen';
import { ArchiefClient } from './_client';
import { expandFilterStatus, type DisplayStatus } from './_lib/statusMap';

export const metadata = {
    title: 'Bonnenkistje — BBQ Architect',
    description: 'Doorzoekbaar boekhoud-archief. Typ baktotaal, vind elke bon over 7 jaar heen, tot op het woord.',
};

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{
        q?: string;
        view?: string;
        tab?: string;
        datum?: string;
        dateFrom?: string;
        dateTo?: string;
        leverancier?: string;
        status?: string;
        type?: string;
        tags?: string;
        rgs?: string;
        bedrag?: string;
        bedragMin?: string;
        bedragMax?: string;
    }>;
}

function parseList(v?: string): string[] | undefined {
    if (!v) return undefined;
    const arr = v.split(',').filter(Boolean);
    return arr.length ? arr : undefined;
}

function parseDateRange(
    datum?: string,
    dateFrom?: string,
    dateTo?: string,
): { from?: string; to?: string } {
    if (dateFrom || dateTo) return { from: dateFrom, to: dateTo };
    if (!datum) return {};

    const now = new Date();
    switch (datum) {
        case 'month': {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from: start.toISOString().slice(0, 10) };
        }
        case 'quarter': {
            const q = Math.floor(now.getMonth() / 3);
            const start = new Date(now.getFullYear(), (q - 1) * 3, 1);
            const end = new Date(now.getFullYear(), q * 3, 0);
            return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
        }
        case '2025': {
            return { from: '2025-01-01', to: '2025-12-31' };
        }
        case 'all':
        default:
            return {};
    }
}

export default async function ArchiefPage({ searchParams }: PageProps) {
    const sp = await searchParams;
    const sb = await createServerSupabase();

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-[13px] text-[var(--muted)]">Niet ingelogd</p>
            </div>
        );
    }

    const { data: member } = await sb
        .from('organization_members')
        .select('organization_id, organizations(slug)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();

    if (!member) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center">
                <p className="text-[13px] text-[var(--muted)]">Geen actieve organisatie</p>
            </div>
        );
    }

    const orgId = member.organization_id as string;
    const orgSlug =
        (member as unknown as { organizations?: { slug?: string } }).organizations?.slug ?? 'tenant';
    const orgEmail = `bonnen@${orgSlug}.bbq-architect.nl`;

    // Parse filters uit URL
    const { from, to } = parseDateRange(sp.datum, sp.dateFrom, sp.dateTo);

    // Status: display-level → DB-aliases (review/processed compat)
    const statusList = parseList(sp.status) as DisplayStatus[] | undefined;
    const expandedStatus = statusList ? statusList.flatMap((s) => expandFilterStatus(s)) : undefined;

    // Leverancier-filter: name → id resolve
    const leveranciersAll = await listLeveranciersWithCounts(sb, orgId);
    const leverancierNamesFilter = parseList(sp.leverancier);
    const leverancierIds = leverancierNamesFilter
        ? leveranciersAll
              .filter((l) => leverancierNamesFilter.includes(l.naam))
              .map((l) => l.id)
        : undefined;

    const filters: SearchInput = {
        q: sp.q,
        status: expandedStatus as BonStatus[] | undefined,
        leverancier_ids: leverancierIds,
        tags: parseList(sp.tags),
        rgs: parseList(sp.rgs),
        source: parseList(sp.type)?.filter((t) => t === 'email') as 'email'[] | undefined,
        from,
        to,
        bedragMin: sp.bedragMin ? parseInt(sp.bedragMin, 10) : undefined,
        bedragMax: sp.bedragMax ? parseInt(sp.bedragMax, 10) : undefined,
        bedragRange: sp.bedrag as 'lt50' | '50-500' | 'gt500' | undefined,
        limit: 200,
    };

    const [searchResult, tags, rgs, inboxItems, totalCount] = await Promise.all([
        searchBonnen(sb, orgId, filters),
        listDistinctTags(sb, orgId),
        listDistinctRgs(sb, orgId),
        listInboxFacturen(sb, orgId, { onlyNew: false }),
        sb.from('bonnen').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    ]);

    const isEmpty = (totalCount.count ?? 0) === 0;

    // Inline server-action loaders voor lazy tab-content in BonPreview.
    const loadAudit = async (bonId: number) => {
        'use server';
        const sb2 = await createServerSupabase();
        return listBonAuditLog(sb2, bonId);
    };
    const loadStock = async (bonId: number) => {
        'use server';
        const sb2 = await createServerSupabase();
        return listStockMovementsForBon(sb2, bonId);
    };

    return (
        <ArchiefClient
            bonnen={searchResult.bonnen}
            bedragTotaal={searchResult.bedragTotaal}
            leveranciers={leveranciersAll}
            tags={tags}
            rgs={rgs}
            inboxItems={inboxItems}
            orgSlug={orgSlug}
            orgEmail={orgEmail}
            isEmpty={isEmpty}
            loadAudit={loadAudit}
            loadStock={loadStock}
        />
    );
}
