-- ════════════════════════════════════════════════════════════════════════
-- Bucket J: Finance Copilot — 3 tabellen + RLS + indexes
--
-- Tabellen:
--   1. finance_copilot_threads          — één thread per (org, fiscaal jaar)
--   2. finance_copilot_messages         — chat-history binnen een thread
--   3. finance_copilot_daily_summary    — cron-gegenereerde dag-snapshot
--
-- Pillars-anchoring:
--   #1 Server-truth: kia-bedragen + btw worden NIET hier opgeslagen,
--      alleen denk-output. Bron-truth blijft bonnen + facturen.
--   #2 Source-refs: messages.source_refs JSONB bevat verplicht
--      bon-IDs / factuur-IDs / event-IDs die de claim onderbouwen.
--      Schema-validatie afgedwongen in app-laag (Zod), niet hier
--      (vermijdt JSONB-CHECK rigiditeit; query-laag valideert).
--   #4 Page-contract: alles tenant-isolated via organization_id-RLS.
--
-- Dependent op:
--   - organizations (bestaat sinds project-start)
--   - boekhouder_pakketten (sinds 20260511130000_boekhouder_pakket.sql)
--
-- Pre-flight check: defensive — als boekhouder_pakketten geen `source`
-- kolom heeft, voeg toe. P0.13 Server Action zal die zetten op
-- 'finance_copilot' voor het pakket-onderscheid.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. finance_copilot_threads ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_copilot_threads (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year                INTEGER NOT NULL CHECK (year BETWEEN 2020 AND 2099),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, year)
);

COMMENT ON TABLE finance_copilot_threads IS
    'Finance Copilot — één thread per (org, fiscaal jaar). Lifelong gesprek met de AI over dat jaar.';

CREATE INDEX IF NOT EXISTS finance_copilot_threads_org_year_idx
    ON finance_copilot_threads (organization_id, year DESC);

-- ── 2. finance_copilot_messages ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_copilot_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES finance_copilot_threads(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content_md      TEXT,
    blocks_json     JSONB,
    -- status alleen relevant voor assistant-messages die een idea bevatten:
    --   idee = vers (nog niet opgeslagen of weggeklikt)
    --   opgeslagen = user klikte "Sla op voor boekhouder"
    --   weggeklikt = user klikte "Negeer"
    status          TEXT CHECK (status IS NULL OR status IN ('idee', 'opgeslagen', 'weggeklikt')),
    -- Pillar #2 — source_refs = array van { kind: 'bon'|'factuur'|'event'|'margelek', id: ... }
    -- Niet enforced via JSONB-schema (PG kan dat niet zuiver) — app-laag valideert via Zod.
    source_refs     JSONB DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finance_copilot_messages IS
    'Chat-history per thread. status NULL voor user-messages; assistant-messages kunnen idee/opgeslagen/weggeklikt zijn.';
COMMENT ON COLUMN finance_copilot_messages.source_refs IS
    'Pillar #2 — verplichte bron-verwijzingen voor elke fiscale claim. App-laag (Zod) weigert lege array op claims.';

CREATE INDEX IF NOT EXISTS finance_copilot_messages_thread_idx
    ON finance_copilot_messages (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_copilot_messages_org_idx
    ON finance_copilot_messages (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS finance_copilot_messages_status_idx
    ON finance_copilot_messages (organization_id, status) WHERE status IS NOT NULL;

-- ── 3. finance_copilot_daily_summary ────────────────────────────────────
-- Cron 06:00 vult deze per dag per org. Dashboard leest de meest recente row.
CREATE TABLE IF NOT EXISTS finance_copilot_daily_summary (
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date                DATE NOT NULL,
    summary_md          TEXT,
    chips_json          JSONB DEFAULT '[]'::jsonb,
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, date)
);

COMMENT ON TABLE finance_copilot_daily_summary IS
    'Daily AI-snapshot per org. Cron 06:00 vult; SummaryStrip leest. Geen TTL — keep history voor trend-analyse later.';

CREATE INDEX IF NOT EXISTS finance_copilot_daily_summary_recent_idx
    ON finance_copilot_daily_summary (organization_id, date DESC);

-- ── 4. boekhouder_pakketten — voeg `source` kolom toe ────────────────────
-- Defensive — andere callers (boekhouder-page, maandelijkse cron) zetten dit
-- impliciet op NULL; finance_copilot zet 'finance_copilot' zodat we kunnen
-- filteren in de boekhouder-page UI ("Van Finance Copilot").
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'boekhouder_pakketten' AND column_name = 'source'
    ) THEN
        ALTER TABLE boekhouder_pakketten ADD COLUMN source TEXT;
    END IF;
END $$;

COMMENT ON COLUMN boekhouder_pakketten.source IS
    'Optionele bron-tag: NULL = handmatig of cron, finance_copilot = ontstaan uit een AI-idee.';

CREATE INDEX IF NOT EXISTS boekhouder_pakketten_source_idx
    ON boekhouder_pakketten (organization_id, source) WHERE source IS NOT NULL;

-- ── 5. RLS ──────────────────────────────────────────────────────────────
-- Pillar #4 — alle tabellen tenant-isolated. Wrap `auth.uid()` in (select ...)
-- per Postgres best-practice (prevent re-eval per row) + indexes op policy-col
-- voor performance.

-- threads
ALTER TABLE finance_copilot_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_copilot_threads_select ON finance_copilot_threads;
CREATE POLICY finance_copilot_threads_select ON finance_copilot_threads
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_threads_insert ON finance_copilot_threads;
CREATE POLICY finance_copilot_threads_insert ON finance_copilot_threads
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_threads_update ON finance_copilot_threads;
CREATE POLICY finance_copilot_threads_update ON finance_copilot_threads
    FOR UPDATE
    USING (organization_id IN (SELECT public.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_threads_delete ON finance_copilot_threads;
CREATE POLICY finance_copilot_threads_delete ON finance_copilot_threads
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));

-- messages
ALTER TABLE finance_copilot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_copilot_messages_select ON finance_copilot_messages;
CREATE POLICY finance_copilot_messages_select ON finance_copilot_messages
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_messages_insert ON finance_copilot_messages;
CREATE POLICY finance_copilot_messages_insert ON finance_copilot_messages
    FOR INSERT WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_messages_update ON finance_copilot_messages;
CREATE POLICY finance_copilot_messages_update ON finance_copilot_messages
    FOR UPDATE
    USING (organization_id IN (SELECT public.user_org_ids()))
    WITH CHECK (organization_id IN (SELECT public.user_org_ids()));

DROP POLICY IF EXISTS finance_copilot_messages_delete ON finance_copilot_messages;
CREATE POLICY finance_copilot_messages_delete ON finance_copilot_messages
    FOR DELETE USING (organization_id IN (SELECT public.user_org_ids()));

-- daily_summary — read voor iedereen in de org, insert/update alleen via service-role (cron)
ALTER TABLE finance_copilot_daily_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_copilot_daily_summary_select ON finance_copilot_daily_summary;
CREATE POLICY finance_copilot_daily_summary_select ON finance_copilot_daily_summary
    FOR SELECT USING (organization_id IN (SELECT public.user_org_ids()));

-- Insert/update bewust geen end-user policy — alleen service-role (cron) schrijft.
-- Als we later UI-trigger willen ("regenerate now"), voegen we expliciet toe.
