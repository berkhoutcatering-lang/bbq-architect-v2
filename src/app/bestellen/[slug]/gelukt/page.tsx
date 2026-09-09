'use client';

/**
 * Het scherm ná de knop.
 * Plan: docs/bestelstroom-bouwplan.md §6.
 *
 * Kort: wat er besteld is, wanneer ophalen, dat de bevestigingsmail onderweg is
 * en dat er een betaalverzoek volgt. Bewust GEEN link naar de doospagina — die
 * komt in de mail, en op dit moment bestaat hij meestal nog niet: de koppeling
 * met de Experience-app loopt pas na het bestellen.
 *
 * De gegevens komen uit sessionStorage en niet uit de URL. Een naam of een
 * afhaalmoment in een adresbalk komt in geschiedenis, in logs en in de
 * verwijzende site terecht; daar hoort het niet. Is er niets bewaard — directe
 * link, andere tab, privémodus — dan staat er de neutrale versie. Dat is
 * eerlijker dan een lege regel waar iets had moeten staan.
 */

import { useEffect, useState } from 'react';
import '../bestellen.css';

interface Bevestiging {
    personen: number;
    dozen: number;
    moment: string | null;
    titel: string | null;
}

export default function GeluktPagina() {
    const [b, setB] = useState<Bevestiging | null>(null);

    useEffect(() => {
        try {
            const rauw = sessionStorage.getItem('hb-bestelling');
            if (rauw) setB(JSON.parse(rauw));
        } catch { /* privémodus of rommel: dan de neutrale versie */ }
    }, []);

    return (
        <div className="hb">
            <div className="hb-wrap">
                <span className="hb-label">Gelukt</span>
                <h1 className="hb-kop hb-kop-groot">Je bestelling staat genoteerd</h1>

                {b && (
                    <>
                        <hr className="hb-streep" />
                        <div className="hb-blok">
                            <span className="hb-label">Wat je krijgt</span>
                            <p className="hb-kop hb-kop-klein">{b.titel || 'De Eettocht'}</p>
                            <p className="hb-uitleg" style={{ marginTop: 0 }}>
                                {b.personen} personen · {b.dozen === 1 ? 'één doos' : `${b.dozen} dozen`}
                            </p>
                        </div>

                        {b.moment && (
                            <div className="hb-blok">
                                <span className="hb-label">Ophalen</span>
                                <p className="hb-kop hb-kop-klein">{b.moment}</p>
                            </div>
                        )}
                        <hr className="hb-streep" />
                    </>
                )}

                <p className="hb-uitleg">
                    De bevestiging komt per mail. Daarin staat het adres, wat er in de doos zit en je
                    eigen link voor de avond zelf. Bewaar die mail.
                </p>
                <p className="hb-uitleg">
                    Het betaalverzoek sturen we los; je hoeft nu niets te doen.
                </p>
                <p className="hb-klein" style={{ marginTop: 18 }}>
                    Geen mail gekregen? Kijk even in je spam, en bel ons anders even.
                </p>
            </div>
        </div>
    );
}
