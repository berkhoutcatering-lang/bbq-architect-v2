import PriceIntelligenceClient from '@/app/price-intelligence/_components/PriceIntelligenceClient';

export const dynamic = 'force-dynamic';

/* Hernoemde route — content komt uit de bestaande PriceIntelligenceClient
   (in /price-intelligence/_components/). Geen verhuizing van de client-laag
   nodig: import-path blijft werken en /price-intelligence URL gaat via
   middleware-redirect naar hier. */
export default function InkoopCheckerPage() {
    return <PriceIntelligenceClient />;
}
