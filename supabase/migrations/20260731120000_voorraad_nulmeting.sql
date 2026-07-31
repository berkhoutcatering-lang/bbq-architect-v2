-- ════════════════════════════════════════════════════════════════════════
-- Voorraad-nulmeting — met de telefoon door de keuken lopen
-- ════════════════════════════════════════════════════════════════════════
-- Doel: één keer je hele keuken tellen als startpunt. Per product leg je vast
-- WAT het is (uit de leverancier-catalogus), HOEVEEL je ervan hebt (aantal
-- pakken × inhoud) en WAAR het ligt (koeling / vriezer / droog). De foto is het
-- bewijs: "dit pak bedoelde ik".
--
-- Wat deze migratie toevoegt:
--   1. inventory.foto_url  — pad naar de productfoto in de private bucket
--   2. storage-bucket `voorraad-fotos` + policies (per-tenant afgeschermd)
--
-- storage_type ('vers' | 'vries' | 'houdbaar') bestaat al sinds
-- 20260720130000_voorraad_besteloptimalisatie.sql en is de loop-volgorde van de
-- telling — die hoeft hier niet opnieuw aangemaakt te worden.

-- ─── 1. Foto-bewijs per voorraad-item ──────────────────────────────────
-- Bewust het PAD, niet een publieke URL: de bucket is privaat, de UI haalt
-- per telling een kortlopende signed URL op. Zo lekt een gekopieerde link niet
-- de rest van je keuken.
alter table public.inventory
  add column if not exists foto_url text;

comment on column public.inventory.foto_url is
  'Pad in de private bucket voorraad-fotos (org-id/bestand.jpg). Geen publieke URL — UI tekent met een signed URL.';

-- ─── 2. Bucket voor de telfoto's ───────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voorraad-fotos',
  'voorraad-fotos',
  false,                                          -- privaat: interne keukenfoto's
  5242880,                                        -- 5 MB (client verkleint al naar ~1200px)
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Defensief opruimen, zodat de migratie herhaalbaar is.
drop policy if exists voorraad_fotos_tenant_read   on storage.objects;
drop policy if exists voorraad_fotos_tenant_write  on storage.objects;
drop policy if exists voorraad_fotos_tenant_update on storage.objects;
drop policy if exists voorraad_fotos_tenant_delete on storage.objects;

-- Tenant-scope: de eerste map in het pad is de organization_id. Een ingelogde
-- gebruiker komt alleen bij de mappen van de organisaties waar hij actief lid
-- van is — niet bij die van een andere cateraar.
create policy voorraad_fotos_tenant_read on storage.objects
  for select using (
    bucket_id = 'voorraad-fotos'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );

create policy voorraad_fotos_tenant_write on storage.objects
  for insert with check (
    bucket_id = 'voorraad-fotos'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );

create policy voorraad_fotos_tenant_update on storage.objects
  for update using (
    bucket_id = 'voorraad-fotos'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );

create policy voorraad_fotos_tenant_delete on storage.objects
  for delete using (
    bucket_id = 'voorraad-fotos'
    and (storage.foldername(name))[1] in (
      select om.organization_id::text
      from public.organization_members om
      where om.user_id = (select auth.uid()) and om.status = 'active'
    )
  );

-- ─── 3. Index op de loop-volgorde ──────────────────────────────────────
-- De telling laadt per zone; zonder index is dat een seq-scan over de hele
-- voorraad van de tenant.
create index if not exists ix_inventory_org_storage_type
  on public.inventory (organization_id, storage_type);
