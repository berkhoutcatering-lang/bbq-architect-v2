/**
 * Publiek bestelformulier — /bestellen/[slug].
 *
 * De route is een dun laagje: het formulier zelf staat in BestelFormulier.tsx,
 * zodat /dev/bestellen exact dezelfde component kan tonen in plaats van een
 * kopie die stilletjes uit de pas gaat lopen.
 *
 * `?dev=1` laat het formulier ook zien als het doostype nog niet actief staat.
 * Dat is bewust op de ECHTE route mogelijk en niet alleen in de speeltuin:
 * alleen hier zie je hem zonder app-chrome, precies zoals een klant hem krijgt.
 * De API hangt die parameter aan NODE_ENV, dus in productie doet hij niets.
 */

import BestelFormulier from './BestelFormulier';

export default async function BestelPagina({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { slug } = await params;
    const q = await searchParams;
    const dev = process.env.NODE_ENV !== 'production' && q.dev === '1';
    return <BestelFormulier slug={slug} dev={dev} />;
}
