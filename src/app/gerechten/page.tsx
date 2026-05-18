import dynamic from 'next/dynamic';

/**
 * /gerechten — server-component wrapper.
 *
 * De volledige client-implementatie (1800+ regels JSX/state inclusief 4
 * dynamic-geloaded AI-componenten) zit in _client.tsx. Wrapper laadt die
 * via next/dynamic + ssr:false zodat Turbopack de page-bundle in een
 * aparte client-chunk plaatst en niet in de initial build-graph hoeft te
 * houden (eerdere builds met alles in 1 page.tsx hingen 45m+).
 */

const GerechtenClient = dynamic(() => import('./_client'), {
    ssr: false,
    loading: () => (
        <div className="max-w-[1400px] mx-auto px-6 py-10">
            <div className="h-8 w-48 mb-6 animate-pulse rounded bg-[var(--card-solid)]/60" />
            <div className="h-64 animate-pulse rounded-2xl bg-[var(--card-solid)]/40" />
        </div>
    ),
});

export default function Page() {
    return <GerechtenClient />;
}
