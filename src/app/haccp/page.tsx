import HACCPClient from './_client';

/**
 * /haccp — server wrapper.
 *
 * Next 16 verbiedt `ssr: false` in Server Components, dus we gebruiken
 * directe import. _client.tsx is zelf een 'use client' module, Next.js
 * doet automatisch code-splitting per route.
 *
 * /haccp/field blijft een eigen route met eigen page.tsx.
 */
export default function Page() {
    return <HACCPClient />;
}
