'use client';

/**
 * /dev/bestellen — de vier schermen van de bestelstroom naast elkaar leggen.
 * Zelfde speeltuinpatroon als /dev/ai-blocks en /dev/sticker: alleen in dev.
 *
 * Waarom dit bestaat: het doostype staat op `actief = false` en gaat pas om als
 * de koppeling met de Experience-app er is. Zonder deze pagina zou het
 * bestelformulier tot die tijd niet te bekijken zijn, en dan zou de eerste
 * telefoontest op 22 december vallen.
 *
 * **Het is geen kopie.** "Open" rendert exact dezelfde component als de echte
 * route, met echte afhaalmomenten uit de database — alleen met `dev`, wat de
 * API toestaat een niet-actief doostype terug te geven (server-side aan
 * NODE_ENV gehangen). De drie gesloten schermen worden hier wél met een
 * verzonnen toestand getekend, want die zijn puur tekst: de echte toestand
 * hangt aan capaciteit die er nu niet is.
 */

import { useState } from 'react';
import { notFound } from 'next/navigation';
import BestelFormulier, { GeslotenScherm, type Config } from '../../bestellen/[slug]/BestelFormulier';

const SLUG = 'hop-en-bites';

type Scherm = 'open' | 'momenten_vol' | 'uitverkocht' | 'gesloten';

const SCHERMEN: Array<{ id: Scherm; label: string }> = [
    { id: 'open', label: '1 · Formulier (echte data)' },
    { id: 'momenten_vol', label: '2 · Alle momenten bezet' },
    { id: 'uitverkocht', label: '3 · Uitverkocht + wachtlijst' },
    { id: 'gesloten', label: '4 · Niets open' },
];

export default function BestellenSpeeltuin() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <Speeltuin />;
}

function Speeltuin() {
    const [scherm, setScherm] = useState<Scherm>('open');

    /* Genoeg om de gesloten schermen te tekenen; de echte waarden komen daar
       uit de API. doostype is alleen nodig voor de wachtlijst-post. */
    const nep: Config = {
        bedrijfsnaam: 'Hop & Bites',
        telefoon: '06 - 137 34 453',
        email: 'berkhout.catering@gmail.com',
        toestand: scherm === 'open' ? 'open' : scherm,
        doostype: {
            id: '00000000-0000-0000-0000-000000000000',
            slug: 'de-eettocht',
            prijs_cents: 2350,
            personen_min: 2,
            personen_max: 24,
            personen_per_doos: 8,
            titel: 'De Eettocht',
            onderdelen: null,
        },
    };

    return (
        <div>
            <div style={balk}>
                {SCHERMEN.map((s) => (
                    <button key={s.id} onClick={() => setScherm(s.id)}
                        style={{ ...knop, ...(scherm === s.id ? actief : null) }}>
                        {s.label}
                    </button>
                ))}
                <a href={`/bestellen/${SLUG}/gelukt`} style={{ ...knop, textDecoration: 'none' }}>
                    5 · Bevestigingsscherm ↗
                </a>
            </div>

            {scherm === 'open'
                ? <BestelFormulier slug={SLUG} dev />
                : <GeslotenScherm config={nep} slug={SLUG} />}
        </div>
    );
}

const balk: React.CSSProperties = {
    display: 'flex', gap: 6, flexWrap: 'wrap', padding: 10,
    background: '#0d0c0b', borderBottom: '1px solid #2a2621', position: 'sticky', top: 0, zIndex: 50,
};
const knop: React.CSSProperties = {
    padding: '7px 11px', borderRadius: 8, border: '1px solid #3a352c',
    background: 'transparent', color: '#EDE7D8', font: 'inherit', fontSize: 12, cursor: 'pointer',
};
/* Zelfde vorm als `knop` hierboven: shorthand naast non-shorthand in één
   stijlobject (border + borderColor) laat React klagen én geeft bij een
   rerender de verkeerde rand. */
const actief: React.CSSProperties = { border: '1px solid #A88338', color: '#A88338' };
