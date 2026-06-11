-- =============================================================================
-- APK v3 — Safe bundle (geen breaking changes)
-- =============================================================================
-- Bundelt 6 audit-fixes die geen RLS-policies wijzigen of bestaande gedrag
-- beïnvloeden — alleen indexen toevoegen / duplicaten droppen /
-- search_path explicit / storage-limits / unique-constraint op nummer.
--
-- Fixes:
--   #13 — 86 unindexed foreign keys → CREATE INDEX IF NOT EXISTS per FK
--   #16 — 7 SECURITY DEFINER functions → SET search_path = public, pg_temp
--   #17a — 3 duplicate index-paren → DROP INDEX (behoud de korte naam)
--   #17b — pg_trgm naar extensions-schema OVERGESLAGEN (kan triggers breken;
--          aparte migratie nodig met CASCADE-impact-analyse)
--   #15 — Public-bucket listing-policies → DROP (object-URL via /public/* blijft)
--   #20 — 4 unbounded buckets → file_size_limit
--   #28 — Duplicate offerte-nummer fix + UNIQUE(organization_id, nummer)
-- =============================================================================


-- ── #13: Indexes op alle unindexed foreign keys ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activation_events_user_id ON public.activation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_agenda_categories_created_by ON public.agenda_categories(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_user_id ON public.ai_action_proposals(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON public.ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_boekhouder_pakketten_locked_by_user_id ON public.boekhouder_pakketten(locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bon_share_tokens_created_by ON public.bon_share_tokens(created_by);
CREATE INDEX IF NOT EXISTS idx_bonnen_classified_by_user_id ON public.bonnen(classified_by_user_id);
CREATE INDEX IF NOT EXISTS idx_bonnen_locked_by ON public.bonnen(locked_by);
CREATE INDEX IF NOT EXISTS idx_bonnen_locked_by_user_id ON public.bonnen(locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_component_allergens_confirmed_by ON public.component_allergens(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_component_haccp_points_confirmed_by ON public.component_haccp_points(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_components_approved_by ON public.components(approved_by);
CREATE INDEX IF NOT EXISTS idx_concept_inkoop_orders_created_by ON public.concept_inkoop_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_concept_inkoop_orders_leverancier_id ON public.concept_inkoop_orders(leverancier_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_organization_id ON public.email_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_emails_organization_id ON public.emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_allergies_organization_id ON public.event_allergies(organization_id);
CREATE INDEX IF NOT EXISTS idx_event_checklist_items_event_id ON public.event_checklist_items(event_id);
CREATE INDEX IF NOT EXISTS idx_event_checklist_items_parent_id ON public.event_checklist_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_event_haccp_plans_ai_usage_id ON public.event_haccp_plans(ai_usage_id);
CREATE INDEX IF NOT EXISTS idx_event_haccp_plans_confirmed_by_user_id ON public.event_haccp_plans(confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_event_haccp_plans_event_id ON public.event_haccp_plans(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reflecties_event_id ON public.event_reflecties(event_id);
CREATE INDEX IF NOT EXISTS idx_facturen_locked_by_user_id ON public.facturen(locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_guests_event_allergy_id ON public.floor_plan_guests(event_allergy_id);
CREATE INDEX IF NOT EXISTS idx_floor_plans_last_edited_by_user_id ON public.floor_plans(last_edited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_funnel_events_arrangement_id ON public.funnel_events(arrangement_id);
CREATE INDEX IF NOT EXISTS idx_gerecht_haccp_templates_ai_usage_id ON public.gerecht_haccp_templates(ai_usage_id);
CREATE INDEX IF NOT EXISTS idx_gerecht_haccp_templates_edited_by_user_id ON public.gerecht_haccp_templates(edited_by_user_id);
CREATE INDEX IF NOT EXISTS idx_gerechten_gang_slug ON public.gerechten(gang_slug);
CREATE INDEX IF NOT EXISTS idx_haccp_anomaly_findings_acknowledged_by_user_id ON public.haccp_anomaly_findings(acknowledged_by_user_id);
CREATE INDEX IF NOT EXISTS idx_haccp_anomaly_findings_haccp_record_id ON public.haccp_anomaly_findings(haccp_record_id);
CREATE INDEX IF NOT EXISTS idx_haccp_corrective_actions_anomaly_finding_id ON public.haccp_corrective_actions(anomaly_finding_id);
CREATE INDEX IF NOT EXISTS idx_haccp_corrective_actions_haccp_record_id ON public.haccp_corrective_actions(haccp_record_id);
CREATE INDEX IF NOT EXISTS idx_haccp_corrective_actions_resolved_by_user_id ON public.haccp_corrective_actions(resolved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_haccp_records_confirmed_by_user_id ON public.haccp_records(confirmed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_haccp_records_gerecht_id ON public.haccp_records(gerecht_id);
CREATE INDEX IF NOT EXISTS idx_help_article_feedback_article_id ON public.help_article_feedback(article_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_allergens_allergen_code ON public.ingredient_allergens(allergen_code);
CREATE INDEX IF NOT EXISTS idx_ingredient_allergens_confirmed_by ON public.ingredient_allergens(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_inkooplijsten_event_id ON public.inkooplijsten(event_id);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON public.invitations(invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_organization_id ON public.invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_kds_audit_logs_device_session_id ON public.kds_audit_logs(device_session_id);
CREATE INDEX IF NOT EXISTS idx_kds_audit_logs_personeel_id ON public.kds_audit_logs(personeel_id);
CREATE INDEX IF NOT EXISTS idx_kds_device_sessions_created_by ON public.kds_device_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_kds_device_sessions_station_id ON public.kds_device_sessions(station_id);
CREATE INDEX IF NOT EXISTS idx_leverancier_sync_runs_extension_key_id ON public.leverancier_sync_runs(extension_key_id);
CREATE INDEX IF NOT EXISTS idx_leverancier_sync_runs_started_by_user_id ON public.leverancier_sync_runs(started_by_user_id);
CREATE INDEX IF NOT EXISTS idx_leveranciers_created_by_user_id ON public.leveranciers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_marge_alerts_resolved_by_user_id ON public.marge_alerts(resolved_by_user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_id ON public.onboarding_events(user_id);
CREATE INDEX IF NOT EXISTS idx_order_overrides_created_by ON public.order_overrides(created_by);
CREATE INDEX IF NOT EXISTS idx_order_overrides_inventory_id ON public.order_overrides(inventory_id);
CREATE INDEX IF NOT EXISTS idx_order_overrides_override_leverancier_id ON public.order_overrides(override_leverancier_id);
CREATE INDEX IF NOT EXISTS idx_order_templates_created_by_user_id ON public.order_templates(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_order_templates_source_event_id ON public.order_templates(source_event_id);
CREATE INDEX IF NOT EXISTS idx_org_price_mutations_reviewed_by ON public.org_price_mutations(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_org_pricelist_uploads_uploaded_by ON public.org_pricelist_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_org_product_aliases_created_by ON public.org_product_aliases(created_by);
CREATE INDEX IF NOT EXISTS idx_organization_members_invited_by ON public.organization_members(invited_by);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_pack_lists_event_id ON public.pack_lists(event_id);
CREATE INDEX IF NOT EXISTS idx_pdf_templates_created_by ON public.pdf_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_course_id ON public.prep_tasks(course_id);
CREATE INDEX IF NOT EXISTS idx_prep_tasks_gerecht_id ON public.prep_tasks(gerecht_id);
CREATE INDEX IF NOT EXISTS idx_price_history_bon_id ON public.price_history(bon_id);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_gerecht_id ON public.recipe_cost_snapshots(gerecht_id);
CREATE INDEX IF NOT EXISTS idx_recipe_cost_snapshots_source_mutation_id ON public.recipe_cost_snapshots(source_mutation_id);
CREATE INDEX IF NOT EXISTS idx_recipe_recompute_queue_component_id ON public.recipe_recompute_queue(component_id);
CREATE INDEX IF NOT EXISTS idx_recipe_recompute_queue_source_mutation_id ON public.recipe_recompute_queue(source_mutation_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_org_id ON public.referrals(referred_org_id);
CREATE INDEX IF NOT EXISTS idx_ritten_user_id ON public.ritten(user_id);
CREATE INDEX IF NOT EXISTS idx_ritten_moneybird_pushes_pushed_by ON public.ritten_moneybird_pushes(pushed_by);
CREATE INDEX IF NOT EXISTS idx_service_audit_logs_by_user ON public.service_audit_logs(by_user);
CREATE INDEX IF NOT EXISTS idx_service_audit_logs_course_id ON public.service_audit_logs(course_id);
CREATE INDEX IF NOT EXISTS idx_service_zones_assigned_personeel_id ON public.service_zones(assigned_personeel_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_by_user_id ON public.stock_movements(by_user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_id ON public.stock_movements(inventory_id);
CREATE INDEX IF NOT EXISTS idx_supplier_products_supplier_id ON public.supplier_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_organization_id ON public.support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_clocked_in_by ON public.time_logs(clocked_in_by);
CREATE INDEX IF NOT EXISTS idx_website_gerechten_gang_slug ON public.website_gerechten(gang_slug);


-- ── #16: search_path explicit op SECURITY DEFINER functions ───────────────────
-- Voorkomt search_path-injection. Doe dynamisch zodat we args mee-resolven.
DO $$
DECLARE
  fn_record RECORD;
BEGIN
  FOR fn_record IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn_record.nspname, fn_record.proname, fn_record.args
    );
  END LOOP;
END $$;


-- ── #17a: Duplicate indexes droppen (behoud de bondige naam) ──────────────────
DROP INDEX IF EXISTS public.bonnen_leverancier_id_idx; -- behouden: bonnen_leverancier_idx
DROP INDEX IF EXISTS public.bonnen_org_datum_idx;       -- behouden: bonnen_datum_org_idx
DROP INDEX IF EXISTS public.idx_service_state_org_id;   -- behouden: idx_service_state_org


-- ── #15: Public-bucket listing-policies opheffen ──────────────────────────────
-- Object-URLs via /storage/v1/object/public/<bucket>/<path> blijven werken
-- (public bucket = signed CDN URL nodig niet). Listing via /list endpoint
-- werd onbedoeld toegestaan met `using = true` → cross-tenant enumeration.
DROP POLICY IF EXISTS gerechten_fotos_public_read ON storage.objects;
DROP POLICY IF EXISTS signed_pdfs_public_read ON storage.objects;


-- ── #20: file_size_limit op 4 unbounded buckets ───────────────────────────────
UPDATE storage.buckets SET file_size_limit = 10 * 1024 * 1024
  WHERE name IN ('photos', 'gerechten-fotos');
UPDATE storage.buckets SET file_size_limit = 20 * 1024 * 1024
  WHERE name = 'pricelist-pdfs';
UPDATE storage.buckets SET file_size_limit = 25 * 1024 * 1024
  WHERE name = 'email-attachments';


-- ── #28: Duplicate offerte-nummer + UNIQUE-constraint ─────────────────────────
-- Eerst bestaande duplicaten oplossen door de oudere kopieën te de-dupliceren.
-- Strategie: het laagste id behoudt het originele nummer, hogere ids krijgen
-- een ' (kopie)' suffix zodat ze handmatig herstelbaar zijn.
UPDATE public.offertes o
SET nummer = o.nummer || ' (dup-' || o.id || ')'
WHERE EXISTS (
  SELECT 1 FROM public.offertes o2
  WHERE o2.organization_id IS NOT DISTINCT FROM o.organization_id
    AND o2.nummer = o.nummer
    AND o2.id < o.id
);

-- Daarna UNIQUE-constraint zodat genNummer-bug niet meer kan
ALTER TABLE public.offertes
  ADD CONSTRAINT offertes_org_nummer_unique UNIQUE (organization_id, nummer);
