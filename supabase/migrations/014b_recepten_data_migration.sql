-- OPTIONELE data-migratie: kopieer recepten-data naar gerechten
--
-- Draai deze SQL handmatig (Supabase Studio → SQL Editor) wanneer je klaar bent
-- om recepten samen te smelten met gerechten. Deze file is bewust geen reguliere
-- migratie zodat 014 (schema-changes) los kan draaien zonder data te raken.
--
-- Wat dit doet:
--   1) Voor elk recept dat naam-match heeft met een bestaand gerecht:
--      vul ontbrekende velden aan op het gerecht (overschrijft NIET).
--   2) Voor elk recept zonder naam-match:
--      maak een nieuw gerecht aan in een passende gang (op basis van categorie),
--      gemarkeerd als `actief = false` zodat je 't eerst kan reviewen voordat
--      het in de wizard verschijnt.

-- ── Stap 1: vul matching gerechten aan ──
UPDATE gerechten g
SET
    bereidingswijze = COALESCE(NULLIF(g.bereidingswijze, ''), r.instructies),
    porties = COALESCE(g.porties, r.porties),
    target_prep_time = COALESCE(g.target_prep_time, r.preptime * 60),  /* preptime is minuten, target_prep_time is seconden */
    allergenen = CASE
        WHEN g.allergenen IS NULL OR array_length(g.allergenen, 1) IS NULL THEN r.allergenen
        ELSE g.allergenen
    END,
    tags = CASE
        WHEN g.tags IS NULL OR array_length(g.tags, 1) IS NULL THEN r.tags
        ELSE g.tags
    END,
    wijn_suggestie = COALESCE(g.wijn_suggestie, r.wijn_suggestie),
    service_tip = COALESCE(g.service_tip, r.service_tip)
FROM recepten r
WHERE LOWER(TRIM(g.naam)) = LOWER(TRIM(r.naam))
    AND (g.organization_id = r.organization_id OR (g.organization_id IS NULL AND r.organization_id IS NULL));

-- ── Stap 2: insert non-matching recepten als inactieve gerechten ──
INSERT INTO gerechten (
    naam, beschrijving, bereidingswijze, gang_slug, porties,
    target_prep_time, allergenen, tags, wijn_suggestie, service_tip,
    organization_id, actief, volgorde
)
SELECT
    r.naam,
    r.beschrijving,
    r.instructies,
    CASE
        WHEN r.categorie ILIKE 'vlees' THEN 'hoofdgerechten'
        WHEN r.categorie ILIKE 'vis' THEN 'hoofdgerechten'
        WHEN r.categorie ILIKE 'bijgerecht' THEN 'bijgerechten'
        WHEN r.categorie ILIKE 'dessert' THEN 'dessert'
        WHEN r.categorie ILIKE 'saus' THEN 'bijgerechten'
        WHEN r.categorie ILIKE 'drank' THEN 'bites'
        ELSE 'hoofdgerechten'
    END,
    r.porties,
    r.preptime * 60,
    r.allergenen,
    r.tags,
    r.wijn_suggestie,
    r.service_tip,
    r.organization_id,
    false,  /* inactief — review eerst voordat je 't aanzet */
    9999    /* eind van lijst — sorteer handmatig */
FROM recepten r
WHERE NOT EXISTS (
    SELECT 1 FROM gerechten g
    WHERE LOWER(TRIM(g.naam)) = LOWER(TRIM(r.naam))
        AND (g.organization_id = r.organization_id OR (g.organization_id IS NULL AND r.organization_id IS NULL))
);

-- ── Verificatie (optioneel — alleen lezen) ──
-- SELECT COUNT(*) FROM gerechten WHERE actief = false AND volgorde = 9999;
-- SELECT g.naam, g.gang_slug, g.actief FROM gerechten g WHERE g.bereidingswijze IS NOT NULL ORDER BY g.naam;
