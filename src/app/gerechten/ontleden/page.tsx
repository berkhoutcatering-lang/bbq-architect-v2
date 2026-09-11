import OntledenClient from './_components/OntledenClient';

export const metadata = { title: 'Recept uit een boek · Hop & Bites' };

/* Alles gebeurt client-side en achter de API-routes, dus deze pagina hoeft
   niets voor te laden. De routes zelf zitten achter `withTenantAuth`. */
export default function OntledenPage() {
    return <OntledenClient />;
}
