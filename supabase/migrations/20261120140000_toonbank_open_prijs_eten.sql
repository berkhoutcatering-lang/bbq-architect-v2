-- ════════════════════════════════════════════════════════════════════════════
--  Kassa: een open prijs voor eten (bijvoorbeeld een kadopakket met alleen eten)
--  Contract toonbank/v1 (1.4, additief) · Test: supabase/tests/toonbank_open_prijs_eten.sql
-- ════════════════════════════════════════════════════════════════════════════
--
--  Mathijs (20 november 2026): aan de kassa een open prijs kunnen invullen.
--  De Toonbank kan dat al (Verkopen → "Open prijs", vel Handmatig artikel),
--  maar toont de knop alleen bij een groep met open_prijs: true, alcohol: false
--  en een btw_pct. toonbank_catalogus gaf alle groepen open_prijs false.
--
--  Wat erbij komt: achteraan in de groepen één vaste groep
--    {groep_id: "open-eten", naam: "Open prijs eten", open_prijs: true,
--     btw_pct: 9, alcohol: false}, zonder artikelen.
--  Geen groep voor alcohol: de kassa blokkeert een open prijs met alcohol bewust.
--  toonbank_boek_bon boekt zo'n regel al (prijs_bron open_prijs, btw uit de
--  regel, geen artikel dus geen voorraad); dat verandert niet.
--  De catalogusversie gaat één omhoog, zodat elke kassa de groep ophaalt.
--
--  Toepassen: met de hand, één keer, in BEGIN/COMMIT; nooit db push. Eerst een
--  kopie die eindigt op ROLLBACK.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.vervang(p_functie TEXT, p_oud TEXT, p_nieuw TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_def TEXT := pg_get_functiondef(p_functie::REGPROCEDURE);
    v_n   INTEGER := (length(v_def) - length(replace(v_def, p_oud, ''))) / length(p_oud);
BEGIN
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'toonbank_open_prijs_eten: % is anders dan verwacht (anker % keer gevonden): %', p_functie, v_n, left(p_oud, 80);
    END IF;
    EXECUTE replace(v_def, p_oud, p_nieuw);
END $$;

DO $$
BEGIN
    IF position('open-eten' IN pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE)) > 0 THEN
        RAISE EXCEPTION 'toonbank_open_prijs_eten: deze migratie is al gedraaid';
    END IF;
END $$;

SELECT pg_temp.vervang('public.toonbank_catalogus(uuid)',
    $q$'groepen',   COALESCE((SELECT lijst FROM groepen), '[]'::JSONB))$q$,
    $q$'groepen',   COALESCE((SELECT lijst FROM groepen), '[]'::JSONB)
                            -- 20261120140000: een open prijs voor eten, achteraan, zonder artikelen.
                            || jsonb_build_array(jsonb_build_object(
                                   'groep_id',   'open-eten',
                                   'naam',       'Open prijs eten',
                                   'volgorde',   COALESCE((SELECT jsonb_array_length(lijst) FROM groepen), 0) + 1,
                                   'open_prijs', true,
                                   'btw_pct',    9,
                                   'alcohol',    false)))$q$);

-- Elke kassa haalt de catalogus opnieuw op.
UPDATE public.winkel_catalogus_versie
   SET versie = versie + 1, gewijzigd_at = now();

DO $$
BEGIN
    IF position('open-eten' IN pg_get_functiondef('public.toonbank_catalogus(uuid)'::REGPROCEDURE)) = 0 THEN
        RAISE EXCEPTION 'toonbank_open_prijs_eten: de groep staat niet in toonbank_catalogus';
    END IF;
END $$;

COMMIT;
