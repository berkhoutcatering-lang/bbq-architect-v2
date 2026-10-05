-- ═══════════════════════════════════════════════════════════════════════════
--  Supabase nabootsen in een kale Postgres 17 (tools/testdb).
--
--  Draait één keer, vóór voorgeschiedenis.sql en de migraties, als de
--  superuser postgres. Alleen wat de migraties en de SQL-tests nodig hebben,
--  zo dicht mogelijk bij hoe Supabase het zelf opzet (supabase/postgres,
--  init-scripts): dezelfde rollen, dezelfde auth.uid()/auth.role()/auth.jwt()
--  die request.jwt.claims lezen, dezelfde standaardrechten in public.
--
--  Verschil met Supabase: postgres is hier superuser (op Supabase niet). De
--  tests zetten zelf role en request.jwt.claims, net als PostgREST; rechten
--  van anon/authenticated/service_role worden dus echt gecontroleerd.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Rollen ───────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
    -- PostgREST logt in als authenticator en doet SET ROLE; hier zonder wachtwoord (niet te gebruiken).
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
        CREATE ROLE authenticator NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
        CREATE ROLE supabase_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
        CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
        CREATE ROLE supabase_storage_admin NOLOGIN NOINHERIT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN
        CREATE ROLE dashboard_user NOLOGIN;
    END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;

ALTER ROLE anon          SET statement_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '8s';

-- ── 2. Schema's ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS realtime;

-- Bestaan op Supabase als extensie; hier niet. Lege schema's zodat een
-- verwijzing naar het schema niet breekt (geen migratie gebruikt ze nu).
CREATE SCHEMA IF NOT EXISTS graphql;    -- pg_graphql
CREATE SCHEMA IF NOT EXISTS net;        -- pg_net
CREATE SCHEMA IF NOT EXISTS cron;       -- pg_cron
CREATE SCHEMA IF NOT EXISTS vault;      -- supabase_vault
CREATE SCHEMA IF NOT EXISTS pgsodium;   -- pgsodium

GRANT USAGE ON SCHEMA public, extensions, graphql_public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;

-- Zoekpad zoals Supabase voor postgres: "$user", public, extensions.
ALTER DATABASE postgres SET search_path = "$user", public, extensions;
ALTER ROLE postgres SET search_path = "$user", public, extensions;
SET search_path = "$user", public, extensions;

-- ── 3. Extensies (Supabase zet ze in extensions) ────────────────────────────
-- pg_trgm niet: die maakt migratie 20260525134000 zelf aan (in public, zoals op live).
CREATE EXTENSION IF NOT EXISTS pgcrypto     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"  WITH SCHEMA extensions;

-- ── 4. auth ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.users (
    instance_id                 uuid,
    id                          uuid PRIMARY KEY,
    aud                         varchar(255),
    role                        varchar(255),
    email                       varchar(255),
    encrypted_password          varchar(255),
    email_confirmed_at          timestamptz,
    invited_at                  timestamptz,
    confirmation_token          varchar(255),
    confirmation_sent_at        timestamptz,
    recovery_token              varchar(255),
    recovery_sent_at            timestamptz,
    email_change_token_new      varchar(255),
    email_change                varchar(255),
    email_change_sent_at        timestamptz,
    last_sign_in_at             timestamptz,
    raw_app_meta_data           jsonb,
    raw_user_meta_data          jsonb,
    is_super_admin              boolean,
    created_at                  timestamptz DEFAULT now(),
    updated_at                  timestamptz DEFAULT now(),
    phone                       text UNIQUE DEFAULT NULL,
    phone_confirmed_at          timestamptz,
    phone_change                text DEFAULT '',
    phone_change_token          varchar(255) DEFAULT '',
    phone_change_sent_at        timestamptz,
    confirmed_at                timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current  varchar(255) DEFAULT '',
    email_change_confirm_status smallint DEFAULT 0,
    banned_until                timestamptz,
    reauthentication_token      varchar(255) DEFAULT '',
    reauthentication_sent_at    timestamptz,
    is_sso_user                 boolean NOT NULL DEFAULT false,
    deleted_at                  timestamptz,
    is_anonymous                boolean NOT NULL DEFAULT false
);
ALTER TABLE auth.users OWNER TO supabase_auth_admin;
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Precies zoals Supabase (GoTrue): eerst de losse claim, dan request.jwt.claims.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim.email', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
    )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
    SELECT coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

ALTER FUNCTION auth.uid()   OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role()  OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.jwt()   OWNER TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt() TO anon, authenticated, service_role, dashboard_user;

-- ── 5. storage ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS storage.buckets (
    id                  text PRIMARY KEY,
    name                text NOT NULL,
    owner               uuid,
    owner_id            text,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    public              boolean DEFAULT false,
    avif_autodetection  boolean DEFAULT false,
    file_size_limit     bigint,
    allowed_mime_types  text[],
    type                text NOT NULL DEFAULT 'STANDARD'
);
CREATE UNIQUE INDEX IF NOT EXISTS bname ON storage.buckets (name);

CREATE TABLE IF NOT EXISTS storage.objects (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id         text REFERENCES storage.buckets (id),
    name              text,
    owner             uuid,
    owner_id          text,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now(),
    last_accessed_at  timestamptz DEFAULT now(),
    metadata          jsonb,
    path_tokens       text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
    version           text,
    user_metadata     jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects (bucket_id, name);

ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON storage.buckets, storage.objects TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[1 : array_length(_parts, 1) - 1];
END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    _parts text[];
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    RETURN _parts[array_length(_parts, 1)];
END
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    _parts    text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;

ALTER FUNCTION storage.foldername(text) OWNER TO supabase_storage_admin;
ALTER FUNCTION storage.filename(text)   OWNER TO supabase_storage_admin;
ALTER FUNCTION storage.extension(text)  OWNER TO supabase_storage_admin;

-- ── 6. Realtime-publicatie (migraties doen ALTER PUBLICATION … ADD TABLE) ──
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- ── 7. Standaardrechten in public, zoals Supabase ───────────────────────────
-- Wat postgres (en supabase_admin) in public aanmaakt, krijgen anon,
-- authenticated en service_role vanzelf. BA-S (20261003150000) haalt
-- EXECUTE voor anon er weer af; de rechten-test controleert dat.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
