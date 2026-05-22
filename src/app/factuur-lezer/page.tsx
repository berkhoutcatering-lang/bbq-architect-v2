import { redirect } from 'next/navigation';

/**
 * /factuur-lezer is gekilled — was een hub-shell die naar 3 plekken linkte
 * waarvan 1 broken (/foto-archief bestaat niet). De scan-functie zit op
 * /inkoop, de archief-functie op /archief, en prijslijsten staan onder
 * /leveranciers. Deze redirect is alleen voor backward-compat van oude
 * bookmarks. Volgt naar /archief — de nieuwe boekhoud-bonnenkistje
 * surface (B3 in de IA-restructure).
 *
 * Honoreer een `?bon=` query-param (b.v. uit /geld/boekhouder).
 */
export default async function FactuurLezerRedirect({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const bon = typeof params.bon === 'string' ? params.bon : null;
    redirect(bon ? `/archief?bon=${encodeURIComponent(bon)}` : '/archief');
}
