-- ═══════════════════════════════════════════════════════════════════════════
--  Ophaallek — regels die opgehaald zijn maar nooit ingepakt
--  Plan v5, stap 0.2 en BA-2 · Draaiboek: docs/ecosysteem/stap-0-supabase.md
--
--  ALLEEN LEZEN (één SELECT). Veilig op live.
--
--  Het lek: zetOpgehaald (src/app/verkoop/webshop/actions.ts) zet
--  opgehaald_at zonder in te pakken. Zo'n regel is nooit afgeboekt
--  (verkoop_online ontbreekt) en blijft, als de order betaald is, voor altijd
--  als gereserveerd meetellen in winkel_bezetting_product.
--
--  Eén rij per regel per product. Per regel beslist Mathijs:
--    a. alsnog afboeken (winkel_zet_klaargezet → verkoop_online), of
--    b. alleen als ingepakt markeren, zonder boeking (de telling klopt al).
--  De kolom "hint" is alleen een hulpmiddel: is het product ná het ophalen
--  geteld, dan zit het ophalen al in het getal en is (b) waarschijnlijk.
--  Geen klantnaam of contactgegevens in de uitvoer: het ordernummer volstaat.
-- ═══════════════════════════════════════════════════════════════════════════

WITH lek AS (
    SELECT r.id                AS regel_id,
           r.organization_id,
           o.id                AS order_id,
           o.nummer            AS order_nummer,
           o.status            AS order_status,
           o.betaalwijze,
           (o.rest_cents > 0 AND o.rest_betaald_at IS NULL) AS rest_open,
           r.slug              AS artikel_slug,
           r.naam              AS artikel,
           r.aantal,
           r.klaar_op,
           r.opgehaald_at,
           (o.status = 'betaald' OR (o.status = 'wacht' AND o.reservering_tot > now())) AS telt_als_gereserveerd
      FROM public.winkel_order_regels r
      JOIN public.winkel_orders o ON o.id = r.order_id
     WHERE r.opgehaald_at IS NOT NULL
       AND r.klaargezet_at IS NULL
),
per_product AS (
    SELECT l.*,
           c.product_id,
           COALESCE(p.naam, c.naam || ' (geen product gekoppeld)') AS product,
           c.hoeveelheid,
           c.eenheid,
           p.voorraad          AS voorraad_nu,
           (SELECT count(*) FROM public.winkel_voorraad_mutaties m
             WHERE m.order_regel_id = l.regel_id AND m.type IN ('verkoop_online', 'retour')) AS boekingen_op_regel
      FROM lek l
      LEFT JOIN public.winkel_order_regel_componenten c ON c.order_regel_id = l.regel_id
      LEFT JOIN public.winkel_producten p ON p.id = c.product_id
),
laatste_telling AS (
    SELECT DISTINCT ON (m.winkel_product_id)
           m.winkel_product_id AS product_id,
           m.created_at        AS geteld_at,
           m.resultaat         AS geteld,
           m.hoeveelheid       AS verschil
      FROM public.winkel_voorraad_mutaties m
     WHERE m.type = 'telling'
       AND m.winkel_product_id IN (SELECT product_id FROM per_product WHERE product_id IS NOT NULL)
     ORDER BY m.winkel_product_id, m.created_at DESC, m.id DESC
)
SELECT pp.order_nummer,
       pp.order_status,
       pp.betaalwijze,
       pp.rest_open,
       pp.regel_id,
       pp.artikel,
       pp.artikel_slug,
       pp.aantal,
       pp.klaar_op,
       pp.opgehaald_at,
       pp.telt_als_gereserveerd,
       pp.product,
       pp.hoeveelheid,
       pp.eenheid,
       pp.voorraad_nu,
       lt.geteld_at        AS laatste_telling_at,
       lt.geteld           AS laatste_telling_getal,
       lt.verschil         AS laatste_telling_verschil,
       pp.boekingen_op_regel,
       CASE
           WHEN pp.product_id IS NULL        THEN 'geen product: niets te boeken'
           WHEN pp.voorraad_nu IS NULL       THEN 'product niet bijgehouden: niets te boeken'
           WHEN pp.boekingen_op_regel > 0    THEN 'al boekingen op deze regel: eerst bekijken'
           WHEN lt.geteld_at IS NULL         THEN 'nooit geteld: waarschijnlijk (a) alsnog afboeken'
           WHEN lt.geteld_at > pp.opgehaald_at THEN 'geteld na ophalen: waarschijnlijk (b) alleen als ingepakt markeren'
           ELSE 'geteld vóór ophalen: waarschijnlijk (a) alsnog afboeken'
       END                 AS hint
  FROM per_product pp
  LEFT JOIN laatste_telling lt ON lt.product_id = pp.product_id
 ORDER BY pp.opgehaald_at, pp.order_nummer, pp.regel_id, pp.product;
