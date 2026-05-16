import dynamic from 'next/dynamic';

/**
 * /financien — server-component wrapper.
 *
 * Recharts (top-level imports BarChart/Bar/XAxis/.../PieChart/...) zit
 * top-level in deze page, wat de Next.js 16 webpack production-build
 * laat hangen. We isoleren recharts in een aparte client-chunk door
 * de daadwerkelijke implementatie via next/dynamic + ssr:false te laden.
 */

const FinancienClient = dynamic(() => import('./_client'), {
    ssr: false,
    loading: () => (
        <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="h-8 w-48 mb-6 animate-pulse rounded bg-[var(--card-solid)]/60" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--card-solid)]/40" />
        </div>
    ),
});

export default function Page() {
    return <FinancienClient />;
}
