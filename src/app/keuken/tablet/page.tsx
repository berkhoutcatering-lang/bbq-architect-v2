/**
 * /keuken/tablet — dezelfde taak in de hand, met drie knoppen.
 *
 * Dit is de enige plek waar iets verstuurd kan worden. Het wandscherm op
 * /keuken/scherm is read-only; wie iets wil doen pakt dit ding.
 */

import TabletClient from './_components/TabletClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Keuken — tablet',
};

export default function KeukenTabletPage() {
    return <TabletClient />;
}
