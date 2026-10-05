-- ════════════════════════════════════════════════════════════════════════════
--  Winkelvoorraad W2b — prijzen incl. of excl. btw op de bon
--  Plan: docs/voorraad-bouwplan.md §3 W2b
-- ════════════════════════════════════════════════════════════════════════════
--
--  Een kassabon (Makro, AH) noemt prijzen incl. btw, een factuur (Bidfood,
--  Sligro) excl. De voorraad rekent met inkoop excl. btw. Het controlescherm
--  laat het zien en Mathijs zet het; bij boeken gaat de btw er dan af.

ALTER TABLE public.voorraad_invoer
    ADD COLUMN IF NOT EXISTS prijzen_incl_btw BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.voorraad_invoer.prijzen_incl_btw IS
    'true = de regelprijzen op het papier zijn incl. btw (kassabon); bij boeken wordt per regel btw_pct eraf gehaald.';

CREATE OR REPLACE FUNCTION public.voorraad_invoer_boeken(p_org UUID, p_invoer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_invoer  public.voorraad_invoer%ROWTYPE;
    r         public.voorraad_invoer_regels%ROWTYPE;
    v_prod    public.winkel_producten%ROWTYPE;
    v_inkoop  INTEGER;
    v_prijs   NUMERIC;
    v_winkel  INTEGER := 0;
    v_keuken  INTEGER := 0;
    v_sleutel TEXT;
BEGIN
    IF v_uid IS NOT NULL AND p_org NOT IN (SELECT private.user_org_ids()) THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_invoer FROM public.voorraad_invoer WHERE id = p_invoer_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ontvangst niet gevonden' USING ERRCODE = 'P0002';
    END IF;
    IF v_invoer.status <> 'concept' THEN
        RAISE EXCEPTION 'deze ontvangst is al %', v_invoer.status USING ERRCODE = 'WV008';
    END IF;

    FOR r IN SELECT * FROM public.voorraad_invoer_regels WHERE invoer_id = p_invoer_id AND NOT overslaan ORDER BY volgorde, created_at
    LOOP
        IF r.plek IS NULL OR r.aantal IS NULL OR r.aantal <= 0
           OR (r.plek = 'winkel' AND r.winkel_product_id IS NULL)
           OR (r.plek = 'makerij' AND r.inventory_id IS NULL) THEN
            RAISE EXCEPTION 'regel "%" heeft nog geen product of aantal', r.bron_naam USING ERRCODE = 'WV009';
        END IF;

        -- Inkoopprijs excl. btw per voorraad-eenheid: factuurprijs (zo nodig
        -- zonder btw) ÷ omrekening. Btw onbekend bij een incl.-bon = geen prijs.
        v_prijs := CASE
            WHEN r.bron_prijs_cents IS NULL OR COALESCE(r.omrekening, 0) <= 0 THEN NULL
            WHEN v_invoer.prijzen_incl_btw AND r.btw_pct IS NULL THEN NULL
            WHEN v_invoer.prijzen_incl_btw THEN r.bron_prijs_cents::NUMERIC / (1 + r.btw_pct / 100.0) / r.omrekening
            ELSE r.bron_prijs_cents::NUMERIC / r.omrekening END;

        IF r.plek = 'winkel' THEN
            SELECT * INTO v_prod FROM public.winkel_producten WHERE id = r.winkel_product_id AND organization_id = p_org;
            v_inkoop := CASE WHEN v_prijs IS NULL THEN NULL ELSE round(v_prijs * v_prod.prijs_per)::INTEGER END;
            IF v_prod.voorraad IS NULL THEN
                -- Nog nooit geteld: de ontvangst start de telling vanaf 0.
                PERFORM public.winkel_muteer_voorraad(p_org, r.winkel_product_id, 'telling', 0,
                    p_notitie => 'Start bij eerste ontvangst — tel om te bevestigen', p_door_user_id => v_uid);
            END IF;
            PERFORM public.winkel_muteer_voorraad(p_org, r.winkel_product_id, 'ontvangst', r.aantal,
                p_tht => r.tht, p_inkoop_excl_cents => v_inkoop, p_inkoop_order_id => v_invoer.inkoop_order_id,
                p_notitie => COALESCE(v_invoer.leverancier_naam || ' · ', '') || r.bron_naam,
                p_idempotency_key => 'invoer:' || r.id, p_door_user_id => v_uid);
            v_winkel := v_winkel + 1;
        ELSE
            PERFORM public.increment_inventory_stock(
                p_org => p_org, p_inventory_id => r.inventory_id, p_delta => r.aantal, p_type => 'receive',
                p_unit_price => CASE WHEN v_prijs IS NULL THEN NULL ELSE round(v_prijs) / 100.0 END,
                p_note => COALESCE(v_invoer.leverancier_naam || ' · ', '') || r.bron_naam,
                p_bon_id => v_invoer.bon_id);
            IF v_prijs IS NOT NULL THEN
                UPDATE public.inventory SET last_price_eur = round(v_prijs) / 100.0 WHERE id = r.inventory_id AND organization_id = p_org;
            END IF;
            IF r.tht IS NOT NULL THEN
                UPDATE public.inventory SET tht = LEAST(COALESCE(tht, r.tht), r.tht) WHERE id = r.inventory_id AND organization_id = p_org;
            END IF;
            v_keuken := v_keuken + 1;
        END IF;

        v_sleutel := CASE WHEN r.ean IS NOT NULL AND r.ean <> '' THEN 'ean:' || r.ean
                          ELSE 'lev:' || COALESCE(v_invoer.leverancier_id::TEXT, '-') || ':' || lower(regexp_replace(btrim(r.bron_naam), '\s+', ' ', 'g')) END;
        INSERT INTO public.voorraad_invoer_koppelingen AS k
            (organization_id, sleutel, leverancier_id, bron_naam, bron_eenheid, plek, winkel_product_id, inventory_id, omrekening)
        VALUES (p_org, v_sleutel, v_invoer.leverancier_id, r.bron_naam, r.bron_eenheid, r.plek,
                CASE WHEN r.plek = 'winkel' THEN r.winkel_product_id END,
                CASE WHEN r.plek = 'makerij' THEN r.inventory_id END,
                COALESCE(r.omrekening, 1))
        ON CONFLICT (organization_id, sleutel) DO UPDATE
           SET plek = EXCLUDED.plek, winkel_product_id = EXCLUDED.winkel_product_id, inventory_id = EXCLUDED.inventory_id,
               omrekening = EXCLUDED.omrekening, bron_eenheid = EXCLUDED.bron_eenheid,
               keer_gebruikt = k.keer_gebruikt + 1, updated_at = now();
        IF r.ean IS NOT NULL AND r.ean <> '' AND r.plek = 'winkel' THEN
            UPDATE public.winkel_producten SET ean = r.ean WHERE id = r.winkel_product_id AND ean IS NULL;
        END IF;
    END LOOP;

    IF v_winkel + v_keuken = 0 THEN
        RAISE EXCEPTION 'er staat niets te boeken' USING ERRCODE = 'WV009';
    END IF;

    PERFORM set_config('app.invoer_boeken', 'aan', true);
    UPDATE public.voorraad_invoer SET status = 'geboekt', geboekt_at = now(), geboekt_door = v_uid WHERE id = p_invoer_id;
    PERFORM set_config('app.invoer_boeken', '', true);

    RETURN jsonb_build_object('winkel', v_winkel, 'makerij', v_keuken);
END $$;
