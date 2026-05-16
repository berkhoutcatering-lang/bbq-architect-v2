import dynamic from 'next/dynamic';

/**
 * /marges — server-component wrapper.
 *
 * Deze pagina importeert BCGMatrix (component + helpers) uit ./BCGMatrix.
 * Dat bestand heeft top-level `import { ScatterChart, ... } from 'recharts'`,
 * dus elke static import uit BCGMatrix trekt de hele recharts module-graph
 * de page-bundle in. Tree-shaking helpt niet door side-effect detectie.
 *
 * Door de hele page via next/dynamic + ssr:false te laden, blijft recharts
 * in een eigen client-chunk en blokkeert de Next.js 16 webpack production-
 * build niet meer.
 */

const MargesClient = dynamic(() => import('./_client'), {
    ssr: false,
    loading: () => (
        <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="h-8 w-48 mb-6 animate-pulse rounded bg-[var(--card-solid)]/60" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--card-solid)]/40" />
        </div>
    ),
});

export default function Page() {
    return <MargesClient />;
}
