import KoppelrondeClient from './_components/KoppelrondeClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Koppelronde · Gerechten',
    description: 'Koppel al je ingrediënten in één keer aan producten uit je kostprijs-catalogus.',
};

/* Alles gebeurt client-side achter de API-routes (withTenantAuth). */
export default function KoppelrondePage() {
    return <KoppelrondeClient />;
}
