-- Sprint 2-deel-3 C8 — KvK lookup result cache per tenant.
--
-- Per-tenant cache van KvK Search resultaten om kost te beperken (officiële API
-- ~€0.30/lookup). 30 dagen retention. Cleanup gebeurt automatisch via TTL-check
-- bij read — geen aparte cron-job nodig.
--
-- RLS: tenant-isolation via organization_id. Index op organization_id voor
-- policy-performance.

create table if not exists org_kvk_cache (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    -- Query-key = wat de gebruiker tikte (lowercased, trimmed). Niet de KvK-nummer
    -- per se, want zoek op naam moet ook cachen.
    query_key text not null,
    data jsonb not null,
    source text not null check (source in ('kvk_official', 'openkvk')),
    fetched_at timestamptz not null default now(),
    unique (organization_id, query_key)
);

-- RLS policy-column index. Cruciaal voor performance op multi-tenant tabellen.
create index if not exists org_kvk_cache_org_idx on org_kvk_cache (organization_id);

-- TTL-cleanup helper. Roept de cache-invalidation per query trigger niet aan;
-- code in lookupKvk doet de TTL-check zelf (date-range filter bij read).
create index if not exists org_kvk_cache_fetched_idx on org_kvk_cache (fetched_at);

alter table org_kvk_cache enable row level security;

-- Pattern: tenant-isolation policy met (select auth.jwt() ->> 'org_id')::uuid wrapped
-- voor query-plan caching. Match bestaande policies elders in dit project.
create policy "org_kvk_cache_tenant_isolation" on org_kvk_cache
    for all using (
        organization_id in (
            select organization_id from organization_members
            where user_id = (select auth.uid()) and status = 'active'
        )
    );

comment on table org_kvk_cache is
    'Per-tenant cache van KvK Search lookups. 30 dagen TTL via code (geen DB-trigger).';
comment on column org_kvk_cache.query_key is
    'Lowercased + trimmed input van de zoekopdracht (kvk-nummer of bedrijfsnaam).';
comment on column org_kvk_cache.source is
    'kvk_official = api.kvk.nl (~€0.30/call) of openkvk = overheid.io/openkvk (gratis).';
