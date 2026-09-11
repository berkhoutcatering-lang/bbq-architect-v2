/**
 * De bevestigingsmail versturen of opnieuw versturen, vanuit de hub.
 * Plan: docs/bestelstroom-bouwplan.md §9.
 *
 * Normaal gaat deze mail vanzelf, direct na een geslaagde koppeling. Deze route
 * is voor de gevallen daarna: Resend lag eruit, of het adres klopte niet en is
 * gecorrigeerd.
 *
 * De poort zit in verstuurBestelMail: geen mail zonder token.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { verstuurBestelMail } from '@/lib/verstuurBestelMail';

export const runtime = 'nodejs';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const bestellingId = Number(id);
    if (!Number.isInteger(bestellingId)) {
        return NextResponse.json({ error: 'Ongeldig bestelnummer' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const uit = await verstuurBestelMail(supabase, bestellingId);

    if (!uit.ok) {
        /* Tegengehouden door de poort is geen storing maar een toestand: 409,
           zodat de hub het als uitleg toont en niet als fout. */
        return NextResponse.json(
            { error: uit.reden ?? 'De mail is niet verstuurd.', tegengehouden: uit.tegengehouden ?? false },
            { status: uit.tegengehouden ? 409 : 502 },
        );
    }

    return NextResponse.json({ success: true });
}
