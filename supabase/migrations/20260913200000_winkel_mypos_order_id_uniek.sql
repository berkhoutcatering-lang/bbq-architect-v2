-- De OrderID richting myPOS moet uniek zijn over omgevingen en tellerresets
-- heen: preview en productie delen dezelfde myPOS-testwinkel, en myPOS
-- weigert een OrderID die hij al kent ("E_INVALID_PARAMS: order_id:
-- Duplicate value", 13 september 2026, na het terugzetten van de teller).
-- Daarom: "<nummer>-<poging>-<6 tekens van het token>". Het token is
-- 256-bit random, dus zes hex-tekens erbij maakt een botsing praktisch
-- onmogelijk; het nummer blijft leesbaar vooraan. `nummerUitOrderId` in
-- src/lib/winkel/kassa.ts haalt het nummer er weer uit.

CREATE OR REPLACE FUNCTION public.winkel_start_betaalpoging(p_order_id BIGINT)
RETURNS public.winkel_orders
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_order  public.winkel_orders%ROWTYPE;
    v_inst   public.winkel_instellingen%ROWTYPE;
    v_regels JSONB;
BEGIN
    SELECT * INTO v_order FROM public.winkel_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order onbekend' USING ERRCODE = 'WK006';
    END IF;
    IF v_order.status = 'betaald' THEN
        RAISE EXCEPTION 'al betaald' USING ERRCODE = 'WK007';
    END IF;

    SELECT * INTO v_inst FROM public.winkel_instellingen WHERE organization_id = v_order.organization_id;

    -- Loopt de reservering nog en is er al een poging? Dan dezelfde poging
    -- hergebruiken: een herlaad van de betaalpagina is geen nieuwe poging.
    IF v_order.status = 'wacht' AND v_order.reservering_tot > now() AND v_order.betaalpoging > 0 THEN
        RETURN v_order;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'artikel_id', artikel_id, 'moment_id', moment_id,
        'eenheden', eenheden, 'voorraad_eenheden', voorraad_eenheden)), '[]'::jsonb)
      INTO v_regels
      FROM public.winkel_order_regels WHERE order_id = p_order_id;

    -- Past het nog? Onze eigen (verlopen) regels tellen we niet mee.
    PERFORM public.winkel_controleer_capaciteit(v_order.organization_id, v_regels, p_order_id);

    UPDATE public.winkel_orders
       SET status = 'wacht',
           status_reden = NULL,
           reservering_tot = now() + make_interval(mins => COALESCE(v_inst.reservering_minuten, 30)),
           betaalpoging = betaalpoging + 1,
           mypos_order_id = nummer || '-' || (betaalpoging + 1) || '-' || substr(token, 1, 6)
     WHERE id = p_order_id
    RETURNING * INTO v_order;

    RETURN v_order;
END $$;
