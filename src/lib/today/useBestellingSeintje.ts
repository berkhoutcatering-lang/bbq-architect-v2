'use client';

/**
 * De zelf ingevoerde bestellingen van de komende week, voor het seintje op
 * Vandaag (bestelling-taken.ts). Een gerichte vraag — alleen deze orders, met
 * hun regels in het venster — in plaats van alle orders te laden. Ontbreekt de
 * kolom nog (migratie niet gedraaid), dan blijft de lijst leeg.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BRONNEN } from '@/lib/winkel/handmatig';
import { seintjeVenster, type ZelfIngevoerdeRij } from './bestelling-taken';

export function useBestellingSeintje(nu: Date): ZelfIngevoerdeRij[] {
    const [rijen, setRijen] = useState<ZelfIngevoerdeRij[]>([]);
    const { van, tot } = seintjeVenster(nu);

    useEffect(() => {
        let levend = true;
        void supabase
            .from('winkel_orders')
            .select('id, nummer, contact_naam, bron, wensen, winkel_order_regels!inner(naam, aantal, klaar_op, prijs_volgt)')
            .in('bron', [...BRONNEN])
            .eq('status', 'betaald')
            .gte('winkel_order_regels.klaar_op', van)
            .lte('winkel_order_regels.klaar_op', tot)
            .limit(200)
            .then(({ data, error }) => {
                if (levend) setRijen(error ? [] : ((data ?? []) as unknown as ZelfIngevoerdeRij[]));
            });
        return () => { levend = false; };
    }, [van, tot]);

    return rijen;
}
