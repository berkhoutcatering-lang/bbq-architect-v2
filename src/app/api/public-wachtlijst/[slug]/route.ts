/**
 * Wachtlijst voor als de dozen op zijn.
 * Plan: docs/bestelstroom-bouwplan.md §2.6
 *
 * Het uitverkocht-scherm belooft: "je krijgt één bericht zodra de bestelling
 * volgend jaar opengaat. Verder niets." Dat is een doelbinding en die moet
 * afdwingbaar zijn in plaats van opgeschreven. Vandaar:
 *
 *   • een EIGEN tabel, niet `leads`. Juist omdat zo'n rij bijna niet te
 *     onderscheiden is van een lead — precies zo belandt een adres per ongeluk
 *     in een campagne.
 *   • alleen een mailadres. Geen naam, geen telefoon, geen aantal personen.
 *     Wat je niet vraagt, kun je ook niet laten uitlekken.
 *   • geen bevestigingsmail. Dat zou het eerste bericht zijn, en er is er maar
 *     één beloofd.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';

const WachtlijstSchema = z.object({
    doos_type_id: z.string().uuid(),
    email: z.string().trim().email('Dit e-mailadres klopt niet').max(200),
    gdpr_consent: z.literal(true, { message: 'Ga akkoord met de privacyvoorwaarden' }),
    website: z.string().max(0).optional(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
    const rl = checkRateLimit(`public-wachtlijst:${ip}`, 5);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Te veel pogingen. Probeer het over een minuut opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } },
        );
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

    const parsed = WachtlijstSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'validation', fields: parsed.error.flatten().fieldErrors },
            { status: 400 },
        );
    }
    if (parsed.data.website && parsed.data.website.length > 0) {
        return NextResponse.json({ success: true });
    }

    const supabase = createServiceSupabase();
    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .single();
    if (!org) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

    /* Controleren dat dit doostype van deze organisatie is: zonder deze check
       kan iemand met een gegokt id een adres in de lijst van een andere tenant
       zetten. */
    const { data: doostype } = await supabase
        .from('doos_types')
        .select('id')
        .eq('id', parsed.data.doos_type_id)
        .eq('organization_id', org.id)
        .maybeSingle();
    if (!doostype) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

    /* Twee keer inschrijven levert geen tweede rij en geen foutmelding op: voor
       de bezoeker is het gewoon gelukt, want hij staat erop. */
    const { error } = await supabase
        .from('bestel_wachtlijst')
        .upsert(
            {
                organization_id: org.id,
                doos_type_id: doostype.id,
                email: parsed.data.email.toLowerCase(),
            },
            { onConflict: 'doos_type_id,email', ignoreDuplicates: true },
        );

    if (error) {
        console.error('[public-wachtlijst] insert faalde:', error.message);
        return NextResponse.json(
            { error: 'Je adres is niet opgeslagen. Probeer het nog een keer, of mail ons.' },
            { status: 500 },
        );
    }

    return NextResponse.json({ success: true });
}
