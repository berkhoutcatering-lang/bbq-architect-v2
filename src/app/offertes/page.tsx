import { laadBeginGegevens } from '@/lib/server/beginGegevens';
import Offertes from './_client';

export const dynamic = 'force-dynamic';

/* Hier, niet in _client.tsx: een waarde uit een 'use client'-bestand is op
   de server alleen een verwijzing, geen lijst. Moet gelijk blijven aan de
   useSupabase-aanroepen bovenin _client.tsx. */
const OFFERTES_TABELLEN = ['offertes', 'facturen', 'gerechten', 'gangen', 'menu_templates', 'inventory'] as const;

/* Server-schil voor /offertes: haalt de zes tabellen van de pagina alvast op
   en geeft ze mee, zodat de lijst er bij het openen meteen staat in plaats
   van na drie wachtrondes in de browser (meting 2026-10-20: 0,3 s nadat de
   pagina al op het scherm stond). Lukt het niet, dan haalt de browser zelf op.
   De pagina zelf staat in _client.tsx. */
export default async function OffertesPage() {
    const begin = await laadBeginGegevens(OFFERTES_TABELLEN);
    return <Offertes begin={begin} />;
}
