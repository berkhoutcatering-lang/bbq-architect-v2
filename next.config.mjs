/** @type {import('next').NextConfig} */
const nextConfig = {
    async redirects() {
        return [
            /* Sprint 3 A7: Engelse /insights → Nederlandse /inzichten (default Overzicht-tab).
               Query-strings worden door Next.js zelf doorgegeven; alleen geen tab-override. */
            {
                source: '/gerechten/insights',
                destination: '/gerechten/inzichten?tab=overzicht',
                permanent: true,
            },
            /* Sprint 3 A7: menu-analyse smelt in inzichten?tab=marge — BCG-matrix-logic blijft. */
            {
                source: '/gerechten/menu-analyse',
                destination: '/gerechten/inzichten?tab=marge',
                permanent: true,
            },
            /* Sprint 3 A8: allergen-queue page killed — verhuist naar Allergenen-tab. */
            {
                source: '/gerechten/allergen-queue',
                destination: '/gerechten/inzichten?tab=allergenen',
                permanent: true,
            },
        ];
    },
};

export default nextConfig;
