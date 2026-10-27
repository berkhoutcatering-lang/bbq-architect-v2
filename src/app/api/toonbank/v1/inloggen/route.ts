/**
 * POST /api/toonbank/v1/inloggen (BA-7b, contract §3.3).
 * Body {medewerker_id, inlogcode (4–6 cijfers), doel}:
 *   - doel 'sessie' (of 'dienst'): {sessie, geldig_tot, medewerker_id, naam, rechten}, 12 uur;
 *   - doel 'vrij_overschrijden': {eigenaar_token, geldig_tot, medewerker_id,
 *     goedkeuring_id}, 60 seconden, alleen voor rol eigenaar.
 * Fouten zijn 403, nooit 401: inlogcode_onjuist / eigenaarcode_onjuist (met
 * pogingen_over), medewerker_geblokkeerd (na 5 fouten, 5 minuten),
 * geen_recht. De inlogcode wordt nergens bewaard of gelogd.
 */
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { InlogVerzoek } from '@/lib/toonbank/contract';
import { inloggen } from '@/lib/toonbank/sessie';
import { foutAntwoord, optionsRoute, toonbankRoute, valideer } from '../_lib/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsRoute;

export const POST = toonbankRoute({ naam: 'inloggen', maxBody: 2048 }, async ({ store, body, apparaat, nu }) => {
    const v = valideer(InlogVerzoek, body);
    if ('antwoord' in v) return v.antwoord;
    /* Bovenop de blokkade per persoon (database): hooguit 30 pogingen per minuut per tablet. */
    const rl = checkRateLimit(`toonbank:inloggen:${apparaat!.id}`, 30);
    if (!rl.allowed) return foutAntwoord('te_snel', 'Te veel pogingen achter elkaar. Even wachten.', { retry_after: rl.resetInSeconds }, { 'Retry-After': String(rl.resetInSeconds) });

    const u = await inloggen(store, { orgId: apparaat!.organization_id, apparaatId: apparaat!.id }, v.data, nu);
    if ('code' in u) return foutAntwoord(u.code, u.melding, u.details);
    return NextResponse.json(u.antwoord);
});
