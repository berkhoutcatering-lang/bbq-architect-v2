/**
 * Test-only render-page voor het keukenscherm.
 *
 * Bestaat om wat geen unit-test kan zien: of het scherm er in zijn zes
 * toestanden ook echt uitziet zoals bedoeld, met echte fonts, echte
 * kleurcontrasten en tekst die niet over de rand valt bij een lange
 * gerechtnaam. `bouwScherm` is uitgebreid getest, maar een browser die de
 * cascade uitrekent is de enige die ziet dat 128 px niet past.
 *
 * Geen auth, geen fetch, geen database — alleen vaste toestanden.
 *
 * Gated achter NEXT_PUBLIC_E2E=1: zonder die env een 404, dus nooit in
 * productie blootgesteld. Zelfde patroon als /e2e-test/bestelstroom.
 */

import { notFound } from 'next/navigation';
import { Wandscherm } from '@/app/keuken/scherm/_components/SchermClient';
import { KlaarPreview, UitloopPreview } from './TabletPreview';
import type { Keukenscherm } from '@/lib/keukenplanner/types';

export const dynamic = 'force-dynamic';

/** Welke toestand er getoond wordt: ?stand=actief|vrij|gebonden|herplant|kwijt|leeg */
type Stand = 'actief' | 'vrij' | 'gebonden' | 'herplant' | 'kwijt' | 'leeg' | 'tablet-klaar' | 'tablet-uitloop';

const STATUS = { tijd: '11:04', takenOpen: 9, haccpOpen: 2, gegenereerdOp: '2026-09-12T11:04:00.000Z' };

const STRAKS: Keukenscherm['straks'] = [
    { taakId: 2, tijd: '11:30', tijdIsVast: true, titel: 'Yoder 1500 aan', waar: 'Yoder 1500 · 110 °C', aandacht: 'actief', duurBron: 'geschat' },
    { taakId: 3, tijd: '12:05', tijdIsVast: true, titel: 'Pulled pork opleggen', waar: 'Smoker', aandacht: 'actief', duurBron: 'monitor' },
    { taakId: 4, tijd: '~ 20m', tijdIsVast: false, titel: 'Sriracha mayo mengen', waar: 'Sauzen', aandacht: 'actief', duurBron: 'gemeten' },
    { taakId: 5, tijd: '~ 6m', tijdIsVast: false, titel: 'Bosui flinterdun snijden', waar: 'Koud', aandacht: 'actief', duurBron: 'geschat' },
    { taakId: 6, tijd: '~ 8m', tijdIsVast: false, titel: 'Robot Coupe schoonmaken', waar: null, aandacht: 'actief', duurBron: 'gemeten' },
];

function scherm(stand: Stand): Keukenscherm {
    const basis: Keukenscherm = {
        stand: 'actief',
        nu: {
            taakId: 1, kop: 'Bavette trimmen', regel: '8 kg · Gerookte bavette',
            toelichting: 'Vet tot 5 mm, zilvervlies eraf', station: 'Koud',
            aandacht: 'actief', duurBron: 'gemeten', resterend: '11:48',
            bezigSinds: '06:12', vanMin: 18, tempDoelC: null, wachtOp: null, wachtNog: null,
        },
        straks: STRAKS,
        meldingen: [{ id: 'm1', ernst: 'info', kop: 'Combisteamer staat uit — moet om 12:40 op 180 °C zijn.' }],
        status: STATUS,
    };

    switch (stand) {
        case 'vrij':
            return {
                ...basis, stand: 'vrij',
                nu: {
                    ...basis.nu, taakId: 4, kop: 'Sriracha mayo mengen',
                    regel: 'past in de 5 uur wachttijd', toelichting: null, station: 'Sauzen',
                    aandacht: 'passief_vrij', duurBron: 'geschat', resterend: '20:00',
                    bezigSinds: null, vanMin: 20, tempDoelC: 90,
                    wachtOp: 'Doorgaren tot kern 90 °C', wachtNog: '4u20',
                },
            };
        case 'gebonden':
            return {
                ...basis, stand: 'vrij',
                nu: {
                    ...basis.nu, taakId: 7, kop: 'Smoker aanvegen',
                    regel: 'past in de 29 min tussen twee spuitbeurten, en staat op hetzelfde station',
                    toelichting: null, station: 'Smoker', aandacht: 'passief_gebonden',
                    duurBron: 'monitor', resterend: '10:00', bezigSinds: null, vanMin: 10,
                    tempDoelC: 120, wachtOp: 'Oerham garen — elk half uur natspuiten', wachtNog: '2u10',
                },
            };
        case 'herplant':
            return {
                ...basis,
                meldingen: [
                    {
                        id: 'h1', ernst: 'waarschuwing',
                        kop: 'Kern loopt achter — brisket zit op 68 °C, verwacht 40 minuten later',
                        uitleg: '3 taken verschoven.', verwacht: 'Uitlevering 16:00 blijft haalbaar — 22m speling.',
                    },
                    {
                        id: 'h2', ernst: 'waarschuwing',
                        kop: 'Twee ladingen in Yoder 1500',
                        uitleg: 'De eerste komt eerder klaar en moet terugkoelen en weggezet worden.',
                        verwacht: 'Zorg dat er koelruimte vrij is voor de eerste lading.',
                    },
                    {
                        id: 'h3', ernst: 'alarm',
                        kop: 'Past niet in Yoder 1500',
                        uitleg: 'Rundernek (25 kg) past niet — die houdt 20 kg.',
                    },
                ],
            };
        case 'leeg':
            return {
                ...basis, stand: 'leeg',
                nu: {
                    taakId: null, kop: 'Niets meer voor vandaag', regel: null, toelichting: null,
                    station: null, aandacht: 'actief', duurBron: 'geschat', resterend: null,
                    bezigSinds: null, vanMin: null, tempDoelC: null, wachtOp: null, wachtNog: null,
                },
                straks: [],
                meldingen: [],
                status: { ...STATUS, tijd: '21:04', takenOpen: 0, haccpOpen: 0 },
            };
        default:
            return basis;
    }
}

export default async function KeukenschermTestPagina({
    searchParams,
}: { searchParams: Promise<{ stand?: string }> }) {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();

    const { stand: gevraagd } = await searchParams;
    const stand = (gevraagd as Stand) ?? 'actief';
    const kwijt = stand === 'kwijt';

    /* De twee tabletschermen met de grootste layout-risico's: de tellers en de
       twee keuzevlakken moeten met een knokkel te raken zijn en op 800 × 1280
       passen zonder te scrollen. */
    if (stand === 'tablet-klaar') return <KlaarPreview />;
    if (stand === 'tablet-uitloop') return <UitloopPreview />;

    return (
        <Wandscherm
            data={scherm(kwijt ? 'actief' : stand)}
            leeftijdSec={kwijt ? 134 : 2}
            verbindingKwijt={kwijt}
            laatsteContact={new Date('2026-09-12T14:12:07')}
        />
    );
}
