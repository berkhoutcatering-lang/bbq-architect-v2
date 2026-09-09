/**
 * Test-only render-page voor de bestelstroom.
 *
 * Bestaat om één ding te bewaken dat geen enkele unit-test kan zien: de
 * BEREKENDE kleuren van de bestelknop. De knop was een dag onzichtbaar doordat
 * de reset `.hb button { background: none }` zwaarder woog dan `.hb-knop` —
 * alle tests stonden groen, `tsc` was schoon, en toch had de klant een
 * onzichtbare knop. Alleen een browser die de cascade echt uitrekent vangt dat.
 *
 * Rendert het uitverkocht-scherm, want dat is het enige scherm met een echte
 * `.hb-knop` dat GEEN database nodig heeft. Geen auth, geen fetch, geen data.
 *
 * Gated achter NEXT_PUBLIC_E2E=1: zonder die env een 404, dus nooit in
 * productie blootgesteld. Zelfde patroon als /e2e-test/menukaart.
 */

import { notFound } from 'next/navigation';
import { GeslotenScherm, type Config } from '@/app/bestellen/[slug]/BestelFormulier';

export const dynamic = 'force-dynamic';

const CONFIG: Config = {
    bedrijfsnaam: 'Hop & Bites',
    telefoon: '06 - 000 00 000',
    email: 'test@example.invalid',
    toestand: 'uitverkocht',
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

export default function BestelstroomTestPagina() {
    if (process.env.NEXT_PUBLIC_E2E !== '1') notFound();
    return <GeslotenScherm config={CONFIG} slug="test" />;
}
