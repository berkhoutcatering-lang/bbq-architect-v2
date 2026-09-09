'use client';

/**
 * Client-wrapper om de tabletschermen los te kunnen bekijken.
 *
 * Nodig omdat de testpagina een Server Component is en callbacks niet over de
 * server/client-grens mogen. Hier worden ze aan deze kant gemaakt, zodat de
 * knoppen ook echt indrukbaar zijn in de preview.
 */

import { useState } from 'react';
import { KlaarBevestigen, LooptUit } from '@/app/keuken/tablet/_components/TabletClient';

export function KlaarPreview() {
    const [hoeveelheid, setHoeveelheid] = useState<number | null>(7.6);
    return (
        <KlaarBevestigen
            titel="Bavette trimmen"
            gewerkt="18:04"
            ingepland={18}
            hoeveelheid={hoeveelheid}
            zetHoeveelheid={setHoeveelheid}
            bezig={false}
            bericht={null}
            terug={() => {}}
            bevestig={() => {}}
        />
    );
}

export function UitloopPreview() {
    return (
        <LooptUit
            titel="Doorgaren tot kern 90 °C"
            geplandMin={300}
            bezig={false}
            bericht={null}
            terug={() => {}}
            meld={() => {}}
        />
    );
}
