'use client';

/**
 * De verversing van het wandscherm.
 *
 * Drie dingen, in volgorde van belang:
 *
 *   1. **Weten wanneer het beeld oud is.** Een keukenscherm dat stilletjes
 *      oude taken toont is erger dan een zwart scherm. Daarom loopt er een
 *      klok mee die elke seconde de leeftijd van de data bijhoudt, los van
 *      of er een verzoek onderweg is.
 *   2. **Realtime als het kan, polling als het moet.** Supabase-realtime
 *      duwt een verversing zodra er een taak verandert; elke dertig seconden
 *      halen we sowieso op, want een gemiste realtime-boodschap mag niet
 *      betekenen dat het scherm een uur achterloopt.
 *   3. **Om 04:00 de dag omzetten.** Dan is het een nieuwe productiedag en
 *      herlaadt het scherm zichzelf.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Keukenscherm } from '@/lib/keukenplanner/types';

/** Boven deze leeftijd klopt het beeld niet meer en zegt het scherm dat. */
export const OUD_NA_SECONDEN = 90;
const POLL_MS = 30_000;

export interface SchermStand {
    data: Keukenscherm | null;
    /** Hoe oud het beeld is, in seconden. Loopt door als het ophalen faalt. */
    leeftijdSec: number;
    verbindingKwijt: boolean;
    laatsteContact: Date | null;
    fout: string | null;
}

export function useKeukenscherm(): SchermStand {
    const [data, setData] = useState<Keukenscherm | null>(null);
    const [laatsteContact, setLaatsteContact] = useState<Date | null>(null);
    const [fout, setFout] = useState<string | null>(null);
    const [leeftijdSec, setLeeftijdSec] = useState(0);
    const laatsteRef = useRef<Date | null>(null);

    const haal = useCallback(async () => {
        try {
            const res = await fetch('/api/keukenscherm/vandaag', { cache: 'no-store' });
            if (!res.ok) {
                setFout(`Server gaf ${res.status}`);
                return;
            }
            const json = (await res.json()) as Keukenscherm;
            setData(json);
            const nu = new Date();
            laatsteRef.current = nu;
            setLaatsteContact(nu);
            setLeeftijdSec(0);
            setFout(null);
        } catch (e) {
            setFout(e instanceof Error ? e.message : 'geen verbinding');
        }
    }, []);

    /* Ophalen: meteen, elke dertig seconden, en bij elke wijziging die
       realtime doorgeeft. */
    useEffect(() => {
        /* De lint-regel ziet een setState in een effect en waarschuwt voor
           cascaderende renders. Dat gaat hier niet op: `haal` is async, dus
           elke setState valt ná een await in een netwerkantwoord — precies
           het "abonneren op een extern systeem" waar de regel een uitzondering
           voor maakt. Omschrijven zou de code alleen omslachtiger maken. */
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void haal();
        const timer = setInterval(() => void haal(), POLL_MS);

        const kanaal = supabase
            .channel('keukenscherm')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'prep_tasks' }, () => void haal())
            .subscribe();

        return () => {
            clearInterval(timer);
            void supabase.removeChannel(kanaal);
        };
    }, [haal]);

    /* De leeftijdsklok staat bewust los van het ophalen. Zou hij eraan
       vastzitten, dan bleef hij op nul staan zodra de verbinding wegviel —
       precies het geval waarvoor hij bedoeld is. */
    useEffect(() => {
        const timer = setInterval(() => {
            const laatste = laatsteRef.current;
            setLeeftijdSec(laatste == null ? Number.POSITIVE_INFINITY : Math.floor((Date.now() - laatste.getTime()) / 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    /* Om 04:00 begint de nieuwe productiedag. */
    useEffect(() => {
        const timer = setInterval(() => {
            const nu = new Date();
            if (nu.getHours() === 4 && nu.getMinutes() === 0 && nu.getSeconds() < 30) {
                window.location.reload();
            }
        }, 20_000);
        return () => clearInterval(timer);
    }, []);

    return {
        data,
        leeftijdSec,
        verbindingKwijt: leeftijdSec > OUD_NA_SECONDEN,
        laatsteContact,
        fout,
    };
}
