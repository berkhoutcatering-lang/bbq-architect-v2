-- Live geregistreerd op 3 oktober 2026 als aparte migratie, direct na
-- 20261003153616_winkel_catalogus: de triggerfunctie van de catalogus krijgt
-- een vast zoekpad (advies van de Supabase-advisor).
ALTER FUNCTION public.winkel_catalogus_poort() SET search_path = public, pg_temp;

-- Live is deze functie op 3 oktober vóór 20261003150000 (BA-S) gemaakt, en
-- haalde BA-S daar EXECUTE voor anon weg. In de repo-volgorde komt hij na
-- BA-S; daarom hier hetzelfde, zodat een nieuwe database gelijk is aan live.
REVOKE ALL ON FUNCTION public.winkel_catalogus_poort() FROM PUBLIC, anon;
