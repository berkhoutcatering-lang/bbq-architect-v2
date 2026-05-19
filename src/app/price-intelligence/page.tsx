import PriceIntelligenceClient from './_components/PriceIntelligenceClient';

export const dynamic = 'force-dynamic';

/* P0.25 (slice 1) — Price-Intelligence hub Server Component shell.
   ───────────────────────────────────────────────────────────────
   De top-level Client-body doet alleen folder-state-management; data komt
   pas binnen wanneer een specifieke sub-folder gemount wordt (FolderInvoices,
   FolderReceipts, etc.). Daarom: geen `Promise.all` prefetch hier — dat
   wordt slice 2 (refactor naar tab-files met eigen Server prefetch per tab).

   Wat slice 1 wel oplevert: `'use client'` zit niet meer op page-niveau,
   wat de Next.js routing-laag toestaat om eventuele server-only code
   (middleware, headers, auth-check) zonder client-hydration-overhead te doen. */
export default function PriceIntelligencePage() {
    return <PriceIntelligenceClient />;
}
