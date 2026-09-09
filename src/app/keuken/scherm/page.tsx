/**
 * /keuken/scherm — het wandscherm in de keuken.
 *
 * Kioskmodus, 1920 × 1080 liggend, altijd aan, read-only. Vanaf dit scherm
 * kan niets verstuurd of gewijzigd worden; alle echte acties gebeuren op
 * /keuken/tablet of op de laptop.
 *
 * Niet op /keuken zelf: die route is sinds mei een redirect naar /gerechten
 * voor oude bookmarks, en die blijft staan.
 */

import SchermClient from './_components/SchermClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Keukenscherm',
};

export default function KeukenschermPage() {
    return <SchermClient />;
}
