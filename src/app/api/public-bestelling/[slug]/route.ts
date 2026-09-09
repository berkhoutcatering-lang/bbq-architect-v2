/**
 * Publiek bestel-endpoint voor de gourmetbox — tenant via organizations.slug.
 * Plan: docs/bestelstroom-bouwplan.md
 *
 * Geen auth-gate: iemand die op de bank op zijn telefoon een doos bestelt heeft
 * geen account. Daarom hetzelfde patroon als /api/public-lead-form en
 * /api/public-offerte:
 *   - tenant-resolve via organizations.slug (UNIQUE)
 *   - lezen/schrijven met de SERVICE-ROLE client (geen anon-policy; die zijn in
 *     deze repo een anti-patroon)
 *   - Zod + honeypot (`website`) + rate-limit per IP + AVG-akkoord
 *
 * GET  → wat het formulier moet tonen: het doostype, de afhaalmomenten met hoe
 *        veel dozen er nog vrij zijn, en welk van de vier schermen aan de beurt
 *        is.
 * POST → plaatst de bestelling via de databasefunctie plaats_bestelling(), die
 *        telt en schrijft in één transactie met de rijen vergrendeld. De
 *        capaciteitscontrole staat dus NIET hier: twee mensen die tegelijk de
 *        laatste doos pakken zouden hier allebei "nog 1 vrij" lezen.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServiceSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { afleidVoornaam, type DoosSamenstelling } from '@/lib/bestelstroom';
import { cacheIsOud, ververseDoosTypeCache } from '@/lib/koppelBestelling';

/* Vandaag als YYYY-MM-DD in Nederlandse tijd. Een moment van vanochtend hoort
   vanmiddag niet meer in de lijst te staan — en niet doorgestreept, gewoon weg:
   doorstrepen is voor VOL, niet voor voorbij. */
function vandaagISO(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
}

async function resolveTenant(slug: string) {
    const supabase = createServiceSupabase();
    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug')
        .eq('slug', slug)
        .single();
    if (!org) return null;

    const { data: settings } = await supabase
        .from('settings')
        .select('bedrijfsnaam, ondertitel, email, telefoon')
        .eq('organization_id', org.id)
        .single();

    return { org, settings: settings ?? null, supabase };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

    /* ?dev=1 toont ook een doostype dat nog niet actief staat, zodat /dev/bestellen
       het formulier kan laten zien vóórdat de knop echt om gaat. Server-side aan
       NODE_ENV gehangen: in productie doet deze parameter niets, ook niet als
       iemand hem raadt. */
    const devModus = process.env.NODE_ENV !== 'production'
        && req.nextUrl.searchParams.get('dev') === '1';

    const t = await resolveTenant(slug);
    if (!t) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

    const basis = {
        bedrijfsnaam: t.settings?.bedrijfsnaam || 'Hop & Bites',
        telefoon: t.settings?.telefoon || null,
        email: t.settings?.email || null,
    };

    /* Eén actief doostype tegelijk. Zijn het er ooit meer, dan wordt dit een
       keuze op het scherm; nu is de oudste actieve de juiste. */
    let vraag = t.supabase
        .from('doos_types')
        .select('id, slug, prijs_cents, personen_min, personen_max, max_dozen_totaal, experience_cache, experience_cache_at')
        .eq('organization_id', t.org.id);
    if (!devModus) vraag = vraag.eq('actief', true);

    const { data: doostype } = await vraag
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!doostype) {
        return NextResponse.json({ ...basis, toestand: 'gesloten', reden: 'geen_doostype' });
    }

    /* Aanroep A, maar alleen als de cache oud is. Twee seconden, en dan door:
       dit blokkeert een pagina die een klant openhoudt. Lukt het niet, dan
       werken we met wat er al stond. */
    let cache = (doostype.experience_cache ?? null) as DoosSamenstelling | null;
    if (cacheIsOud(doostype.experience_cache_at)) {
        const vers = await ververseDoosTypeCache(t.supabase, doostype.id, doostype.slug);
        if (vers) cache = vers as DoosSamenstelling;
    }

    const personenPerDoos = Number(cache?.personen_per_doos) || null;

    /* Geen doosmaat = geen bestelling. Zonder dat getal kunnen we het aantal
       dozen niet berekenen en klopt de capaciteit niet meer. Liever dicht dan
       een doosmaat raden. */
    if (!personenPerDoos) {
        return NextResponse.json({ ...basis, toestand: 'gesloten', reden: 'geen_doosmaat' });
    }

    /* Onbekend totaal is dicht, niet onbeperkt. Een vergeten veld mag geen open
       kraan worden. Zelfde regel als hierboven: liever dicht dan raden. */
    if (doostype.max_dozen_totaal == null) {
        return NextResponse.json({ ...basis, toestand: 'gesloten', reden: 'geen_capaciteit' });
    }

    const { data: momenten } = await t.supabase
        .from('afhaalmomenten')
        .select('id, datum, start_tijd, eind_tijd, max_dozen')
        .eq('organization_id', t.org.id)
        .eq('doos_type_id', doostype.id)
        .eq('actief', true)
        .gte('datum', vandaagISO())
        .order('datum', { ascending: true })
        .order('start_tijd', { ascending: true });

    /* Bezetting wordt geteld, nooit opgeslagen — een aantal_gebruikt-kolom
       loopt vroeg of laat uit de pas en dan verkoop je een doos die er niet is. */
    const { data: bezet } = await t.supabase
        .from('bestellingen')
        .select('afhaalmoment_id, dozen')
        .eq('organization_id', t.org.id)
        .eq('doos_type_id', doostype.id)
        .neq('status', 'geannuleerd');

    const perMoment = new Map<string, number>();
    let bezetTotaal = 0;
    for (const r of bezet ?? []) {
        perMoment.set(r.afhaalmoment_id, (perMoment.get(r.afhaalmoment_id) ?? 0) + (r.dozen ?? 0));
        bezetTotaal += r.dozen ?? 0;
    }

    const dozenOver = Math.max(0, doostype.max_dozen_totaal - bezetTotaal);

    const lijst = (momenten ?? []).map((m) => {
        const vrij = Math.max(0, m.max_dozen - (perMoment.get(m.id) ?? 0));
        return {
            id: m.id,
            datum: m.datum,
            start_tijd: m.start_tijd,
            eind_tijd: m.eind_tijd,
            vrij: Math.min(vrij, dozenOver),
        };
    });

    /* Drie manieren waarop het dicht kan zijn, en ze vragen om drie
       verschillende schermen — zie het plan §2.3. */
    let toestand: 'open' | 'momenten_vol' | 'uitverkocht' | 'gesloten' = 'open';
    if (dozenOver === 0) toestand = 'uitverkocht';
    else if (!lijst.length) toestand = 'gesloten';
    else if (lijst.every((m) => m.vrij <= 0)) toestand = 'momenten_vol';

    return NextResponse.json({
        ...basis,
        toestand,
        doostype: {
            id: doostype.id,
            slug: doostype.slug,
            prijs_cents: doostype.prijs_cents,
            personen_min: doostype.personen_min,
            personen_max: doostype.personen_max,
            personen_per_doos: personenPerDoos,
            titel: cache?.titel ?? null,
            onderdelen: cache?.onderdelen ?? null,
        },
        momenten: lijst,
        dozen_over: dozenOver,
    });
}

const BestellingSchema = z.object({
    doos_type_id: z.string().uuid(),
    afhaalmoment_id: z.string().uuid(),
    personen: z.coerce.number().int().min(1).max(500),
    naam: z.string().trim().min(1, 'Vul je naam in').max(200),
    email: z.string().trim().email('Dit e-mailadres klopt niet').max(200),
    telefoon: z.string().trim().max(50).optional().or(z.literal('')),
    allergie_notitie: z.string().trim().max(2000).optional().or(z.literal('')),
    /* AVG — uitdrukkelijke opt-in, net als het aanvraagformulier. Het
       allergievak is een gezondheidsgegeven (art. 9), dus dit is geen formaliteit. */
    gdpr_consent: z.literal(true, { message: 'Ga akkoord met de privacyvoorwaarden' }),
    /* Eén bestelling, één token: door de client gemaakt, per formulier-sessie. */
    idempotency_key: z.string().uuid(),
    /* Honeypot — een bot vult dit, een mens niet (CSS-verborgen). */
    website: z.string().max(0).optional(),
});

/* De databasefunctie geeft haar oordeel als SQLSTATE terug, niet als tekst, zodat
   deze route uit de CODE kan afleiden wat er aan de hand is en nooit een
   foutmelding hoeft te ontleden. Zie de commentaarkop van de migratie. */
const FOUTEN: Record<string, { status: number; bericht: string }> = {
    BB001: { status: 409, bericht: 'Dit afhaalmoment is net volgeboekt. Kies een ander moment.' },
    BB002: { status: 404, bericht: 'Dit afhaalmoment bestaat niet meer. Ververs de pagina.' },
    BB003: { status: 409, bericht: 'De dozen zijn net op.' },
    BB004: { status: 409, bericht: 'Je bestelling is tussentijds gewijzigd. Ververs de pagina en probeer het opnieuw.' },
    BB005: { status: 503, bericht: 'We kunnen op dit moment geen bestellingen aannemen. Probeer het later, of bel ons.' },
    BB006: { status: 400, bericht: 'Dit aantal personen kunnen we niet aannemen.' },
    BB007: { status: 503, bericht: 'We kunnen op dit moment geen bestellingen aannemen. Probeer het later, of bel ons.' },
};

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'Geen slug' }, { status: 400 });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown';
    const rl = checkRateLimit(`public-bestelling:${ip}`, 5);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Te veel pogingen. Probeer het over een minuut opnieuw.' },
            { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } },
        );
    }

    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 }); }

    const parsed = BestellingSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'validation', fields: parsed.error.flatten().fieldErrors },
            { status: 400 },
        );
    }

    /* Honeypot: 200 OK zodat de bot denkt dat het gelukt is, maar niets doen. */
    if (parsed.data.website && parsed.data.website.length > 0) {
        return NextResponse.json({ success: true });
    }

    const t = await resolveTenant(slug);
    if (!t) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });

    const d = parsed.data;
    const { data, error } = await t.supabase.rpc('plaats_bestelling', {
        p_organization_id: t.org.id,
        p_doos_type_id: d.doos_type_id,
        p_afhaalmoment_id: d.afhaalmoment_id,
        p_personen: d.personen,
        p_naam: d.naam,
        /* Een voorstel, geen conclusie: "Fam. Berkhout" wordt hier "Fam." en
           daarom is dit veld in de hub corrigeerbaar vóórdat er gekoppeld wordt. */
        p_voornaam: afleidVoornaam(d.naam),
        p_email: d.email,
        p_telefoon: d.telefoon || null,
        p_allergie_notitie: d.allergie_notitie || null,
        p_idempotency_key: d.idempotency_key,
    });

    if (error) {
        const bekend = FOUTEN[error.code ?? ''];
        if (bekend) {
            return NextResponse.json({ error: bekend.bericht, code: error.code }, { status: bekend.status });
        }
        console.error('[public-bestelling] plaats_bestelling faalde:', error.code, error.message);
        return NextResponse.json(
            { error: 'Je bestelling is niet opgeslagen. Probeer het nog een keer, of bel ons.' },
            { status: 500 },
        );
    }

    /* RETURNS public.bestellingen geeft één rij; afhankelijk van de client komt
       die als object of als array van één binnen. */
    const rij = (Array.isArray(data) ? data[0] : data) as { id: number; dozen: number } | null;

    return NextResponse.json({
        success: true,
        bestelling: rij ? { id: rij.id, dozen: rij.dozen } : null,
    });
}
