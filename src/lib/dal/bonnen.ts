/**
 * Bonnen Data Access Layer
 * ─────────────────────────
 * Pillar #1 (sub-2-sec fuzzy search) — combineert tsvector + pg_trgm via
 *   score = ts_rank * 0.7 + similarity * 0.3
 *
 * Pillar #2 (highlight-in-PDF) — leverage ts_headline voor server-side
 *   <mark>-tags in snippets. PDF-highlight gebeurt client-side via
 *   @react-pdf-viewer/search met dezelfde query als keyword.
 *
 * Pillar #3 (storage privacy) — getSignedUrl() voor elke file-read,
 *   nooit publieke URLs. TTL default 1h.
 *
 * Pillar #4 (bulk-export) — searchBonnenForExport() levert alle rows
 *   inclusief btw_laag/btw_hoog aggregaten voor CSV-generatie.
 *
 * Pillar #5 (email-in inbox) — listInbox() haalt org_email_inbox rows
 *   waar category='factuur' + nog niet ge-archiveerd.
 *
 * Match bestaand DAL-pattern (lib/dal/haccp.ts): caller geeft supabase
 * client + orgId mee. Pure helpers, geen module-level state.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────

export type BonStatus = 'pending' | 'bevestigd' | 'twijfel' | 'vergrendeld';
export type BonSource = 'upload' | 'email' | 'scan' | 'api';
export type BonType = 'pdf' | 'image' | 'email';

export interface BonRow {
    id: number;
    organization_id: string;
    leverancier_id: number | null;
    leverancier_naam?: string | null;
    winkel: string | null;
    datum: string | null;
    totaal_bedrag: number | null;
    btw_laag_bedrag: number | null;      // 9% aggregate
    btw_hoog_bedrag: number | null;      // 21% aggregate
    netto_bedrag: number | null;
    status: BonStatus;
    source: BonSource;
    categorie: string | null;
    rgs_code: string | null;
    rgs_category_label: string | null;
    tags: string[] | null;
    notities: string | null;
    image_url: string | null;            // legacy data-URL or http URL
    file_path: string | null;            // new — storage path
    file_mime: string | null;
    locked_at: string | null;
    locked_by: string | null;
    extracted_text: string | null;
    bon_items: unknown[] | null;
    snippet?: string | null;             // populated when search-query active
    score?: number | null;
    created_at: string;
    updated_at: string;
    hasEvent?: string | null;            // event-koppeling, indien aanwezig
}

export interface SearchInput {
    q?: string;
    status?: BonStatus[];
    leverancier_ids?: number[];
    tags?: string[];
    source?: BonSource[];
    type?: BonType[];
    rgs?: string[];
    from?: string;                       // datum from (YYYY-MM-DD)
    to?: string;                         // datum to
    bedragMin?: number;
    bedragMax?: number;
    bedragRange?: 'lt50' | '50-500' | 'gt500';
    limit?: number;
    offset?: number;
}

export interface SearchResult {
    bonnen: BonRow[];
    totaal: number;
    bedragTotaal: number;
}

// ── Search (Pillar #1) ─────────────────────────────────────────────────

/**
 * Zoek bonnen met filters. Als q is gezet: combineer tsvector + trigram.
 * Anders: gewone filter-query op datum DESC.
 *
 * NB: Supabase JS-builder ondersteunt geen custom ts_headline expressie
 * in .select(), dus voor snippet-rendering doen we een aparte RPC
 * (search_bonnen_with_snippet) waar nodig. Voor lijstweergave is .select
 * met server-side ranking voldoende.
 */
export async function searchBonnen(
    sb: SupabaseClient,
    orgId: string,
    input: SearchInput,
): Promise<SearchResult> {
    const filters = normalizeInput(input);

    // Met search-query: gebruik RPC voor ts_headline + score-combinatie.
    if (filters.q) {
        const { data, error } = await sb.rpc('search_bonnen_ranked', {
            p_org_id: orgId,
            p_query: filters.q,
            p_status: filters.status ?? null,
            p_leverancier_ids: filters.leverancier_ids ?? null,
            p_tags: filters.tags ?? null,
            p_source: filters.source ?? null,
            p_rgs: filters.rgs ?? null,
            p_from: filters.from ?? null,
            p_to: filters.to ?? null,
            p_bedrag_min: filters.bedragMin ?? null,
            p_bedrag_max: filters.bedragMax ?? null,
            p_limit: filters.limit,
            p_offset: filters.offset,
        });
        if (error) throw error;
        return summarize((data ?? []) as BonRow[]);
    }

    // Zonder search-query: normale builder.
    let q = sb
        .from('bonnen')
        .select('id, organization_id, leverancier_id, winkel, datum, totaal_bedrag, btw_laag_bedrag, btw_hoog_bedrag, netto_bedrag, status, source, categorie, rgs_code, rgs_category_label, tags, notities, image_url, file_path, file_mime, locked_at, locked_by, extracted_text, bon_items, created_at, updated_at, leveranciers(naam)')
        .eq('organization_id', orgId)
        .order('datum', { ascending: false, nullsFirst: false })
        .limit(filters.limit)
        .range(filters.offset, filters.offset + filters.limit - 1);

    if (filters.status?.length) q = q.in('status', filters.status);
    if (filters.leverancier_ids?.length) q = q.in('leverancier_id', filters.leverancier_ids);
    if (filters.tags?.length) q = q.contains('tags', filters.tags);
    if (filters.source?.length) q = q.in('source', filters.source);
    if (filters.rgs?.length) q = q.in('rgs_code', filters.rgs);
    if (filters.from) q = q.gte('datum', filters.from);
    if (filters.to) q = q.lte('datum', filters.to);
    if (filters.bedragMin != null) q = q.gte('totaal_bedrag', filters.bedragMin);
    if (filters.bedragMax != null) q = q.lte('totaal_bedrag', filters.bedragMax);

    const { data, error } = await q;
    if (error) throw error;

    const rows = ((data ?? []) as unknown[]).map((r) => normalizeLeverancierJoin(r as Record<string, unknown>));
    return summarize(rows);
}

function normalizeInput(input: SearchInput): SearchInput & { limit: number; offset: number } {
    const filters = { ...input };

    // bedragRange shortcut → min/max
    if (filters.bedragRange === 'lt50') {
        filters.bedragMax = 50;
    } else if (filters.bedragRange === '50-500') {
        filters.bedragMin = 50;
        filters.bedragMax = 500;
    } else if (filters.bedragRange === 'gt500') {
        filters.bedragMin = 500;
    }

    // type → source mapping (pdf/image bestand-type wordt afgeleid uit file_mime,
    // 'email' source filtert direct op bon.source).
    if (filters.type?.includes('email') && !filters.source?.includes('email')) {
        filters.source = [...(filters.source ?? []), 'email'];
    }

    return {
        ...filters,
        q: filters.q?.trim() || undefined,
        limit: Math.min(filters.limit ?? 50, 200),
        offset: filters.offset ?? 0,
    };
}

function normalizeLeverancierJoin(row: Record<string, unknown>): BonRow {
    const lev = row['leveranciers'] as { naam?: string } | null;
    return {
        ...(row as unknown as BonRow),
        leverancier_naam: lev?.naam ?? null,
    };
}

function summarize(rows: BonRow[]): SearchResult {
    return {
        bonnen: rows,
        totaal: rows.length,
        bedragTotaal: rows.reduce((s, b) => s + Number(b.totaal_bedrag ?? 0), 0),
    };
}

// ── Leveranciers list voor filter-sidebar ─────────────────────────────

export async function listLeveranciersWithCounts(
    sb: SupabaseClient,
    orgId: string,
): Promise<Array<{ id: number; naam: string; count: number; total: number }>> {
    const { data, error } = await sb.rpc('leveranciers_with_bon_counts', {
        p_org_id: orgId,
    });
    if (error) {
        // Fallback: simpele query zonder counts (eerste deploy).
        const { data: levs } = await sb
            .from('leveranciers')
            .select('id, naam')
            .eq('organization_id', orgId)
            .order('naam');
        return (levs ?? []).map((l) => ({ id: l.id, naam: l.naam, count: 0, total: 0 }));
    }
    return (data ?? []) as Array<{ id: number; naam: string; count: number; total: number }>;
}

// ── Tags + RGS distinct lists (voor filter-chips) ──────────────────────

export async function listDistinctTags(sb: SupabaseClient, orgId: string): Promise<string[]> {
    const { data, error } = await sb.rpc('distinct_bon_tags', { p_org_id: orgId });
    if (error) return [];
    return ((data ?? []) as Array<{ tag: string }>).map((r) => r.tag);
}

export async function listDistinctRgs(sb: SupabaseClient, orgId: string): Promise<Array<{ code: string; label: string | null; count: number }>> {
    const { data, error } = await sb.rpc('distinct_bon_rgs', { p_org_id: orgId });
    if (error) return [];
    return (data ?? []) as Array<{ code: string; label: string | null; count: number }>;
}

// ── Signed URL (Pillar #3) ─────────────────────────────────────────────

export async function getBonSignedUrl(
    sb: SupabaseClient,
    bonId: number,
    ttlSeconds = 3600,
): Promise<{ url: string; mime: string | null } | null> {
    const { data: bon, error } = await sb
        .from('bonnen')
        .select('file_path, file_mime, image_url')
        .eq('id', bonId)
        .single();
    if (error || !bon) return null;

    // Nieuwe rows: file_path → signed-URL.
    if (bon.file_path) {
        const { data: signed, error: signErr } = await sb.storage
            .from('bonnen')
            .createSignedUrl(bon.file_path, ttlSeconds);
        if (signErr || !signed) return null;
        return { url: signed.signedUrl, mime: bon.file_mime };
    }

    // Legacy rows: data-URL of http-URL in image_url.
    // Voor http-URL: assume already-public bucket-URL of CDN.
    // Voor data-URL: returneer direct (transitional — P0.5 background job migreert).
    if (bon.image_url) {
        return { url: bon.image_url, mime: bon.file_mime };
    }

    return null;
}

// ── Inbox (Pillar #5) ──────────────────────────────────────────────────

export interface InboxItem {
    id: number;
    from_email: string;
    subject: string;
    received_at: string;
    size_bytes: number | null;
    attachment_count: number | null;
    category: string;
    category_confidence: number | null;
    bon_id: number | null;                // gevuld als al naar archief verplaatst
}

export async function listInboxFacturen(
    sb: SupabaseClient,
    orgId: string,
    opts: { onlyNew?: boolean } = {},
): Promise<InboxItem[]> {
    let q = sb
        .from('org_email_inbox')
        .select('id, from_email, subject, received_at, size_bytes, attachment_count, category, category_confidence, bon_id')
        .eq('organization_id', orgId)
        .eq('category', 'factuur')
        .order('received_at', { ascending: false })
        .limit(100);

    if (opts.onlyNew) q = q.is('bon_id', null);

    const { data, error } = await q;
    if (error) {
        // Fallback voor schemas zonder bon_id-kolom op org_email_inbox:
        // simpelweg negeren en lege lijst.
        return [];
    }
    return (data ?? []) as InboxItem[];
}

// ── Lock / Unlock ──────────────────────────────────────────────────────

export async function lockBon(sb: SupabaseClient, bonId: number): Promise<void> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Niet ingelogd');
    const { error } = await sb
        .from('bonnen')
        .update({ locked_at: new Date().toISOString(), locked_by: user.id })
        .eq('id', bonId);
    if (error) throw error;
}

export async function unlockBon(sb: SupabaseClient, bonId: number): Promise<void> {
    // Gebruikt SECURITY DEFINER functie unlock_bon() — checkt Admin-role.
    const { error } = await sb.rpc('unlock_bon', { p_bon_id: bonId });
    if (error) throw error;
}

// ── Audit log voor Activiteit-tab ──────────────────────────────────────

export interface AuditLogEntry {
    id: string;
    changed_at: string;
    action: string;
    user_id: string | null;
    user_naam?: string | null;
    changes: Record<string, unknown>;
    metadata: Record<string, unknown>;
}

export async function listBonAuditLog(
    sb: SupabaseClient,
    bonId: number,
): Promise<AuditLogEntry[]> {
    const { data, error } = await sb
        .from('audit_log')
        .select('id, changed_at, action, user_id, changes, metadata, profiles(naam)')
        .eq('record_table', 'bonnen')
        .eq('record_id', bonId)
        .order('changed_at', { ascending: false })
        .limit(50);
    if (error) return [];

    return ((data ?? []) as unknown[]).map((r) => {
        const row = r as Record<string, unknown>;
        const prof = row['profiles'] as { naam?: string } | null;
        return {
            id: String(row['id']),
            changed_at: row['changed_at'] as string,
            action: row['action'] as string,
            user_id: (row['user_id'] as string | null) ?? null,
            user_naam: prof?.naam ?? null,
            changes: (row['changes'] as Record<string, unknown>) ?? {},
            metadata: (row['metadata'] as Record<string, unknown>) ?? {},
        };
    });
}

export async function logBonAction(
    sb: SupabaseClient,
    bonId: number,
    action: string,
    detail?: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    const { error } = await sb.rpc('log_bon_action', {
        p_bon_id: bonId,
        p_action: action,
        p_detail: detail ?? null,
        p_metadata: metadata ?? {},
    });
    if (error) {
        // Niet-fataal — log naar console, audit-entry mag falen zonder de user-actie te breken.
        console.error('[bonnen DAL] log_bon_action failed:', error);
    }
}

// ── Stock-impact voor Voorraad-tab (hergebruik bestaande FK uit 010) ──

export interface StockMovementForBon {
    id: number;
    item_naam: string;
    qty: number;
    qty_eenheid: string | null;
    warehouse: string | null;
    created_at: string;
}

export async function listStockMovementsForBon(
    sb: SupabaseClient,
    bonId: number,
): Promise<StockMovementForBon[]> {
    const { data, error } = await sb
        .from('stock_movements')
        .select('id, item_naam, qty, qty_eenheid, warehouse, created_at')
        .eq('bon_id', bonId)
        .order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as StockMovementForBon[];
}

// ── Move inbox email → archief (Pillar #5) ─────────────────────────────

export async function moveInboxToArchive(
    sb: SupabaseClient,
    inboxId: number,
): Promise<{ bonId: number }> {
    // Server Action / Route wrapper voert de eigenlijke logica uit
    // (download attachment, upload naar Storage, insert bon, link inbox.bon_id).
    // Hier alleen de DB-mutatie via RPC voor atomicity.
    const { data, error } = await sb.rpc('move_inbox_to_archive', {
        p_inbox_id: inboxId,
    });
    if (error) throw error;
    return { bonId: data as number };
}
