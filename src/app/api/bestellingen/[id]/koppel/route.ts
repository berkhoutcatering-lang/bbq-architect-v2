/**
 * Handmatig koppelen vanuit de hub — de knop "Opnieuw koppelen".
 * Plan: docs/bestelstroom-bouwplan.md §3.
 *
 * Niet publiek: dit draait op de sessie van de operator, dus RLS scope't naar
 * zijn organisatie en er hoeft hier geen organization_id uit de client te komen.
 *
 * Het echte werk staat in lib/koppelBestelling.ts — de enige plek die een
 * experience_token mag wegschrijven.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { koppelBestelling } from '@/lib/koppelBestelling';
import { verstuurBestelMail } from '@/lib/verstuurBestelMail';

export const runtime = 'nodejs';
/* Drie pogingen van tien seconden plus wachttijd past hierbinnen. Knijpt het
   platform dit korter af, dan faalt de aanroep netjes naar 'mislukt' en pakt
   de dagelijkse cron hem alsnog op — dat is het ontwerp, geen ongeluk. */
export const maxDuration = 60;

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const bestellingId = Number(id);
    if (!Number.isInteger(bestellingId)) {
        return NextResponse.json({ error: 'Ongeldig bestelnummer' }, { status: 400 });
    }

    /* Re-auth binnen de route: de proxy alleen is niet genoeg. */
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const uit = await koppelBestelling(supabase, bestellingId);

    /* Lukt de koppeling, dan mag de mail alsnog: hij lag vast omdat de
       persoonlijke link er niet was, en die is er nu wel. Een mislukte mail
       laat de koppeling staan — die twee zijn los van elkaar. */
    if (uit.ok) {
        const mail = await verstuurBestelMail(supabase, bestellingId);
        return NextResponse.json({
            success: true,
            alGekoppeld: uit.alGekoppeld ?? false,
            mail: mail.ok ? 'verstuurd' : (mail.tegengehouden ? 'wacht' : 'mislukt'),
            mailReden: mail.ok ? undefined : mail.reden,
        });
    }

    if (!uit.ok) {
        return NextResponse.json(
            { error: uit.bericht ?? 'Koppelen is niet gelukt.', code: uit.code, herstelbaar: uit.herstelbaar },
            { status: uit.herstelbaar === false ? 409 : 502 },
        );
    }

    return NextResponse.json({ success: true, alGekoppeld: uit.alGekoppeld ?? false });
}
