-- ════════════════════════════════════════════════════════════════════════
-- P0.3 — Storage bucket 'bonnen' wordt PRIVATE.
--
-- Tot nu toe was bucket 'bonnen' public-read (zie 003_branding_and_buckets.sql).
-- Dat is een gat: elke URL was door iedereen te openen.
--
-- Na deze migratie:
--   - public = false
--   - oude public-read policies weg
--   - alleen leden van de juiste org kunnen files lezen/inserten/deleten
--   - folder-conventie: {organization_uuid}/{yyyy-mm}/{uuid}.{ext}
--
-- Lezen gebeurt voortaan via getSignedUrl() server-side (1h TTL).
-- Hergebruik auth.user_org_ids() helper uit 001_multi_tenant.sql.
-- ════════════════════════════════════════════════════════════════════════

-- 0. Defensive: zorg dat auth.user_org_ids() bestaat (zou uit 001 komen, maar
--    kan in sommige DB-historien ontbreken). Idempotent CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION auth.user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT organization_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND status = 'active';
$$;

GRANT EXECUTE ON FUNCTION auth.user_org_ids() TO authenticated, service_role, anon;

-- 1. Maak de bucket private.
UPDATE storage.buckets
SET public = false
WHERE id = 'bonnen';

-- 2. Verwijder de oude public-read policies (verschillende namen mogelijk uit history).
DROP POLICY IF EXISTS bonnen_public_read           ON storage.objects;
DROP POLICY IF EXISTS "Bonnen public read"         ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read bonnen"     ON storage.objects;
DROP POLICY IF EXISTS "Public read access bonnen"  ON storage.objects;

-- 3. Nieuwe storage policies — strict org-scoped.
--    De folder-conventie is {organization_uuid}/{yyyy-mm}/{uuid}.{ext},
--    dus het eerste path-segment is de org-id als text.
--    Cast via ::uuid omdat user_org_ids() SETOF UUID returnt.

CREATE POLICY bonnen_storage_select_own_org ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_insert_own_org ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_update_own_org ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    )
    WITH CHECK (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

CREATE POLICY bonnen_storage_delete_own_org ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'bonnen'
        AND (storage.foldername(name))[1]::uuid IN (SELECT auth.user_org_ids())
    );

-- 4. Service-role bypass werkt automatisch (postgres-role omzeilt RLS),
--    dus bon-commit-route en bulk-export-route blijven werken zonder
--    extra policies — die draaien als service_role.
