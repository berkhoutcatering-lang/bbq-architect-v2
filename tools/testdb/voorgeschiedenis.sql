-- ═══════════════════════════════════════════════════════════════════════════
--  Voorgeschiedenis (tools/testdb) — wat op live buiten de migraties om is
--  ontstaan.
--
--  De eerste migratie (001_multi_tenant) gaat uit van tabellen die al
--  bestonden: het begin-schema uit supabase-schema.sql en schema-migration.sql
--  (die draaien vlak hiervoor) plus tabellen die ooit los in de SQL-editor
--  zijn aangemaakt. Die laatste staan hier, minimaal: de kolommen die de
--  migraties en de app aanraken, met de types uit src/types/database.types.ts
--  en uit de migraties zelf (FK-types). Geen data.
--
--  Dit is geen Supabase-nabootsing (dat is supabase-stub.sql) en geen
--  reparatie van een migratie: het is de stand van live vóór de migraties.
--  Niet op live draaien; daar bestaat dit allemaal al.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Gebruikers en klanten ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id          SERIAL PRIMARY KEY,
    naam        TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    rol         TEXT DEFAULT 'Medewerker',
    status      TEXT DEFAULT 'actief',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS klanten (
    id          SERIAL PRIMARY KEY,
    naam        TEXT DEFAULT '',
    bedrijf     TEXT DEFAULT '',
    adres       TEXT DEFAULT '',
    postcode    TEXT DEFAULT '',
    plaats      TEXT DEFAULT '',
    telefoon    TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    type        TEXT DEFAULT 'Particulier',
    notities    TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS berichten (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_templates (
    id          SERIAL PRIMARY KEY,
    naam        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Keuken ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gangen (
    id          SERIAL PRIMARY KEY,
    naam        TEXT NOT NULL DEFAULT '',
    slug        TEXT DEFAULT '',
    volgorde    INT DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- id is uuid op live (migraties verwijzen met UUID REFERENCES gerechten(id)).
CREATE TABLE IF NOT EXISTS gerechten (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    naam            TEXT NOT NULL DEFAULT '',
    gang_id         INT,
    gang_slug       TEXT,
    categorie       TEXT,
    beschrijving    TEXT,
    prijs           NUMERIC(10,2),
    verkoopprijs    NUMERIC(10,2),
    kostprijs_pp    NUMERIC(10,2),
    foto_url        TEXT,
    allergenen      TEXT[] DEFAULT '{}',
    is_in_wizard    BOOLEAN DEFAULT false,
    ingredient_costs JSONB DEFAULT '[]',
    bereidingswijze TEXT,
    target_prep_time INT,
    tags            TEXT[] DEFAULT '{}',
    actief          BOOLEAN DEFAULT true,
    volgorde        INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- recepten (uit supabase-schema.sql) kreeg op live later deze kolommen; 014b leest ze.
ALTER TABLE recepten ADD COLUMN IF NOT EXISTS beschrijving   TEXT;
ALTER TABLE recepten ADD COLUMN IF NOT EXISTS allergenen     TEXT[] DEFAULT '{}';
ALTER TABLE recepten ADD COLUMN IF NOT EXISTS tags           TEXT[] DEFAULT '{}';
ALTER TABLE recepten ADD COLUMN IF NOT EXISTS wijn_suggestie TEXT;
ALTER TABLE recepten ADD COLUMN IF NOT EXISTS service_tip    TEXT;

-- offertes kreeg op live bus_check (legacy logistiek-checklist); 20260527010000 leest hem.
ALTER TABLE offertes ADD COLUMN IF NOT EXISTS bus_check JSONB;

-- haccp_records (uit supabase-schema.sql) kreeg op live check_type, chef en
-- auto_logged; haccp_v2/v3 indexeren en controleren erop.
ALTER TABLE haccp_records ADD COLUMN IF NOT EXISTS check_type  TEXT;
ALTER TABLE haccp_records ADD COLUMN IF NOT EXISTS chef        TEXT;
ALTER TABLE haccp_records ADD COLUMN IF NOT EXISTS auto_logged BOOLEAN DEFAULT false;

-- technieken: 20260908120000 verwijst met recipe_steps.techniek_slug naar slug.
CREATE TABLE IF NOT EXISTS technieken (
    slug        TEXT PRIMARY KEY,
    naam        TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_reflecties (
    id              SERIAL PRIMARY KEY,
    event_id        INT,
    overschot       TEXT DEFAULT '',
    tekort          TEXT DEFAULT '',
    kwaliteit       TEXT DEFAULT '',
    verbeterpunten  TEXT DEFAULT '',
    score           INT,
    notities        TEXT DEFAULT '',
    fotos           TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo_logbook (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hardware_items (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_logs (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Voorraad: het logboek van de makerij ────────────────────────────────────
-- Heeft geen CREATE TABLE in de repo (zie 20260916130200). Kolommen volgens
-- 20260720130000: "op prod geverifieerd: resulting_stock/by_user_id/note/
-- unit_price/bon_id/type/qty"; unit_price en bon_id komen uit 010.
-- organization_id zonder FK: organizations bestaat pas na 001.
CREATE TABLE IF NOT EXISTS stock_movements (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID,
    inventory_id     INT REFERENCES inventory(id) ON DELETE CASCADE,
    type             TEXT NOT NULL,
    qty              NUMERIC(10,2) NOT NULL DEFAULT 0,
    resulting_stock  NUMERIC(10,2),
    by_user          TEXT,
    by_user_id       UUID,
    note             TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT stock_movements_type_check CHECK (type IN ('count', 'usage', 'receive', 'adjust', 'waste'))
);

-- ── Catalogus A: master_products + supplier_prices (CSV-import) ─────────────
-- Nooit via een repo-migratie aangemaakt; 024 noemt master_products.id
-- bigserial, 20260601100000 leest deze kolommen in SQL-functies.
CREATE TABLE IF NOT EXISTS master_products (
    id                BIGSERIAL PRIMARY KEY,
    organization_id   UUID,
    naam              TEXT NOT NULL DEFAULT '',
    naam_normalized   TEXT,
    categorie         TEXT,
    uit_assortiment   BOOLEAN DEFAULT false,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_prices (
    id                 BIGSERIAL PRIMARY KEY,
    organization_id    UUID,
    master_product_id  BIGINT REFERENCES master_products(id) ON DELETE CASCADE,
    leverancier        TEXT,
    product_naam       TEXT,
    eenheid            TEXT,
    prijs              NUMERIC(10,2),
    prijs_per_kg       NUMERIC(10,2),
    prijs_per_stuk     NUMERIC(10,2),
    actief             BOOLEAN DEFAULT true,
    datum              DATE,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- ── Kassa (oude POS) ────────────────────────────────────────────────────────
-- 005/006 repareren deze tabellen; aangemaakt vóór de repo-migraties.
CREATE TABLE IF NOT EXISTS pos_orders (
    id               BIGSERIAL PRIMARY KEY,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_order_items (
    id               BIGSERIAL PRIMARY KEY,
    order_id         BIGINT REFERENCES pos_orders(id) ON DELETE CASCADE,
    product_id       UUID NOT NULL REFERENCES gerechten(id) ON DELETE SET NULL,
    product_name     TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_inventory (
    id               BIGSERIAL PRIMARY KEY,
    product_id       UUID REFERENCES gerechten(id) ON DELETE SET NULL,
    ingredient_id    INT REFERENCES inventory(id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT inventory_target CHECK (product_id IS NOT NULL OR ingredient_id IS NOT NULL)
);

-- ── Activatie ───────────────────────────────────────────────────────────────
-- Live-only migratie "create_activation_events" (20260421141845); schema
-- volgens de kop van 011_activation_events.
CREATE TABLE IF NOT EXISTS activation_events (
    id               BIGSERIAL PRIMARY KEY,
    organization_id  UUID,
    user_id          UUID,
    event_type       TEXT NOT NULL,
    metadata         JSONB,
    created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Hulp, support, verwijzingen, pdf-sjablonen ──────────────────────────────
-- Live-only; 20260608140000 (apk_safe_bundle) zet indexen op deze kolommen.
CREATE TABLE IF NOT EXISTS help_article_feedback (
    id               BIGSERIAL PRIMARY KEY,
    article_id       UUID,
    user_id          UUID,
    nuttig           BOOLEAN,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID,
    user_id          UUID,
    onderwerp        TEXT,
    status           TEXT DEFAULT 'open',
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_org_id  UUID,
    referred_org_id  UUID,
    created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdf_templates (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID,
    created_by       UUID,
    naam             TEXT,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now()
);

-- ── Website ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS website_hero (
    id          SERIAL PRIMARY KEY,
    src         TEXT DEFAULT '',
    alt         TEXT DEFAULT '',
    volgorde    INT DEFAULT 0,
    actief      BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS website_faq (
    id          SERIAL PRIMARY KEY,
    vraag       TEXT DEFAULT '',
    antwoord    TEXT DEFAULT '',
    volgorde    INT DEFAULT 0,
    actief      BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS website_gallery (
    id          SERIAL PRIMARY KEY,
    src         TEXT DEFAULT '',
    label       TEXT DEFAULT '',
    categorie   TEXT DEFAULT '',
    volgorde    INT DEFAULT 0,
    actief      BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS website_gangen (
    id              SERIAL PRIMARY KEY,
    naam            TEXT DEFAULT '',
    slug            TEXT DEFAULT '',
    volgorde        INT DEFAULT 0,
    minimum         INT DEFAULT 0,
    extra_prijs_pp  NUMERIC(10,2) DEFAULT 0,
    actief          BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS website_gerechten (
    id           SERIAL PRIMARY KEY,
    naam         TEXT DEFAULT '',
    beschrijving TEXT DEFAULT '',
    gang_slug    TEXT DEFAULT '',
    volgorde     INT DEFAULT 0,
    actief       BOOLEAN DEFAULT true,
    foto         TEXT,
    extra_info   TEXT,
    allergenen   TEXT[] DEFAULT '{}'
);
