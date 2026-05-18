import GerechtenClient from './_client';

// /gerechten server-component wrapper. _client.tsx draagt 'use client' op
// regel 2, dus Next.js 16 splitst die automatisch in een client-bundle.
// Geen next/dynamic + ssr:false nodig (Turbopack verbiedt dat in Server
// Components sinds 16.x).

export default function Page() {
    return <GerechtenClient />;
}
