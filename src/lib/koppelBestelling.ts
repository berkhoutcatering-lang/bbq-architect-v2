import 'server-only';

/**
 * De koppelstap: één bestelling een doos geven in de Experience-app.
 * Plan: docs/bestelstroom-bouwplan.md §3.
 *
 * Dit is het ENIGE bestand dat `experience_token` op een bestelling zet.
 * Bewaakt door src/lib/experienceKoppeling.test.ts — die faalt zodra er een
 * tweede schrijver bijkomt. De routes eromheen (de knop in de hub, de
 * dagelijkse cron) roepen alleen deze functie aan.
 *
 * Twee eigenschappen die niet mogen wegslijten:
 *
 *   1. **Idempotent.** Is er al een token, dan doet deze functie niets. Opnieuw
 *      koppelen levert dezelfde doos op, nooit een tweede.
 *
 *   2. **Faalt zichtbaar, niet stil.** Lukt het niet, dan blijft de bestelling
 *      gewoon bestaan met `koppel_status = 'mislukt'` en de reden erbij. De hub
 *      telt ze bovenaan in vuur, want een bestelling zonder token ontdek je
 *      anders pas als de doos op de balie staat.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { haalDoosType, maakBox, type ExperienceOnderdeel } from './experienceApi';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

export interface KoppelUitkomst {
    ok: boolean;
    /** Er was al een token; er is niets aangeroepen. */
    alGekoppeld?: boolean;
    bericht?: string;
    code?: string;
    /** Later nog eens proberen heeft zin (cron, of de knop in de hub). */
    herstelbaar?: boolean;
}

interface BestellingRij {
    id: number;
    personen: number;
    voornaam: string;
    experience_token: string | null;
    koppel_status: string;
    doos_types: { slug: string } | null;
    afhaalmomenten: { datum: string } | null;
}

/**
 * Koppelt één bestelling. De aanroeper levert de Supabase-client, zodat dit
 * werkt vanuit de hub (ingelogde operator, RLS) én vanuit de cron
 * (service-role, alle organisaties).
 */
export async function koppelBestelling(supabase: Client, bestellingId: number): Promise<KoppelUitkomst> {
    const { data, error } = await supabase
        .from('bestellingen')
        .select('id, personen, voornaam, experience_token, koppel_status, doos_types(slug), afhaalmomenten(datum)')
        .eq('id', bestellingId)
        .maybeSingle();

    if (error) return { ok: false, bericht: error.message, code: 'database', herstelbaar: true };
    if (!data) return { ok: false, bericht: 'Bestelling niet gevonden.', code: 'onbekend' };

    const b = data as unknown as BestellingRij;

    /* Al een token? Dan zijn we klaar. Dit is wat "idempotent" hier betekent. */
    if (b.experience_token) return { ok: true, alGekoppeld: true };

    const slug = b.doos_types?.slug;
    const afhaaldatum = b.afhaalmomenten?.datum;
    if (!slug || !afhaaldatum) {
        return await noteerMislukt(supabase, bestellingId, 'onvolledig',
            'Deze bestelling mist een doostype of een afhaalmoment.');
    }

    /* Hier gaat de grens over. Alleen deze drie velden — zie experienceApi.ts. */
    const uit = await maakBox({
        bestellingId: b.id,
        experienceSlug: slug,
        voornaam: b.voornaam,
        personen: b.personen,
        afhaaldatum,
    });

    if ('fout' in uit) {
        return await noteerMislukt(supabase, bestellingId, uit.fout.code, uit.fout.bericht, uit.fout.herstelbaar);
    }

    if (!uit.data?.token || !uit.data?.url) {
        return await noteerMislukt(supabase, bestellingId, 'onleesbaar_antwoord',
            'De Experience-app gaf geen token of geen url terug.');
    }

    /* De snapshot wordt HIER gevuld, bij het koppelen — niet bij het printen.
       Printen en herprinten lezen alleen dit en raken de API nooit aan: op
       22 december mag een haperende andere app niet betekenen dat er geen
       stickers uit de printer komen. */
    const snapshot = {
        gekoppeld_op: new Date().toISOString(),
        stops: uit.data.stops ?? null,
        onderdelen: (uit.data.onderdelen ?? null) as ExperienceOnderdeel[] | null,
    };

    const { error: schrijfFout } = await supabase
        .from('bestellingen')
        .update({
            experience_token: uit.data.token,
            /* Letterlijk wat de API teruggaf. Niet zelf samenstellen uit een
               basis-URL plus token — dan raakt dit stuk zodra die app verhuist. */
            experience_url: uit.data.url,
            doos_snapshot: snapshot,
            koppel_status: 'gekoppeld',
            koppel_fout: null,
            koppel_poging_at: new Date().toISOString(),
        })
        .eq('id', bestellingId)
        /* Alleen als er nog geen token staat: twee gelijktijdige koppelingen
           mogen elkaar niet overschrijven. */
        .is('experience_token', null);

    if (schrijfFout) {
        return { ok: false, bericht: schrijfFout.message, code: 'database', herstelbaar: true };
    }

    return { ok: true };
}

async function noteerMislukt(
    supabase: Client,
    id: number,
    code: string,
    bericht: string,
    herstelbaar = true,
): Promise<KoppelUitkomst> {
    await supabase
        .from('bestellingen')
        .update({
            koppel_status: 'mislukt',
            koppel_fout: `${code}: ${bericht}`,
            koppel_poging_at: new Date().toISOString(),
        })
        .eq('id', id);
    return { ok: false, code, bericht, herstelbaar };
}

/* ── Aanroep A · de cache van het doostype ────────────────────────────────── */

/** Tien minuten. Het doostype verandert bijna nooit; dit is er om te voorkomen
    dat elke bezoeker van het bestelformulier een netwerkverzoek veroorzaakt. */
const CACHE_MAX_MS = 10 * 60 * 1000;

export function cacheIsOud(cacheAt: string | null | undefined): boolean {
    if (!cacheAt) return true;
    const t = Date.parse(cacheAt);
    return Number.isNaN(t) || Date.now() - t > CACHE_MAX_MS;
}

/**
 * Ververst `doos_types.experience_cache` met aanroep A.
 *
 * Mag mislukken en doet dat stil: de aanroeper valt terug op wat er al in de
 * cache staat. Is die leeg, dan neemt het bestelformulier geen bestellingen aan
 * en zegt dat — liever dicht dan een doosmaat raden.
 */
export async function ververseDoosTypeCache(
    supabase: Client,
    doosTypeId: string,
    slug: string,
): Promise<Record<string, unknown> | null> {
    const uit = await haalDoosType(slug);
    if ('fout' in uit) return null;

    const { error } = await supabase
        .from('doos_types')
        .update({ experience_cache: uit.data, experience_cache_at: new Date().toISOString() })
        .eq('id', doosTypeId);
    if (error) {
        console.warn('[experience] cache niet opgeslagen:', error.message);
        return null;
    }
    return uit.data as unknown as Record<string, unknown>;
}
