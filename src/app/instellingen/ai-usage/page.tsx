import dynamic from 'next/dynamic';

/**
 * /instellingen/ai-usage — server-component wrapper.
 *
 * Recharts is een grote client-side library die de Next.js 16 webpack
 * production-build laat hangen wanneer hij top-level in een 'use client'
 * page-bestand wordt geïmporteerd. We lossen dat op door deze page een
 * thin server-component te maken die de echte client-implementatie
 * (incl. recharts) lazy laadt via next/dynamic + ssr:false. Recharts komt
 * dan in een eigen client-chunk en blokkeert de initial bundle niet.
 */

const AiUsageClient = dynamic(() => import('./_client'), {
    ssr: false,
    loading: () => (
        <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="h-8 w-48 mb-6 animate-pulse rounded bg-[var(--card-solid)]/60" />
            <div className="h-32 animate-pulse rounded-2xl bg-[var(--card-solid)]/40" />
        </div>
    ),
});

export default function Page() {
    return <AiUsageClient />;
}
