import 'server-only';

/**
 * De bevestigingsmail versturen.
 * Plan: docs/bestelstroom-bouwplan.md §9.
 *
 * Eén plek, met de poort ervoor: **geen mail zonder token**. De mail bevat de
 * persoonlijke link, en die bestaat pas als de koppeling geslaagd is. Ging hij
 * eerder de deur uit, dan heeft de klant een dode link in de mail die hij juist
 * bewaart voor als het deksel wegraakt.
 *
 * Faalt Resend, dan blijft de bestelling gewoon bestaan met
 * `mail_status = 'mislukt'` en de reden erbij. Nooit stilzwijgend verdwijnen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { magMailVerstuurd } from './mailPoort';
import { bestelMailTekst, bestelMailHtml, ONDERWERP } from './bestelMail';
import { sendServerMail } from './serverMail';
import type { DoosOnderdeel } from './bestelstroom';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Client = SupabaseClient<any, any, any>;

export interface MailUitkomst {
    ok: boolean;
    /** De poort hield hem tegen — dat is geen fout, dat is de bedoeling. */
    tegengehouden?: boolean;
    reden?: string;
}

interface Rij {
    id: number;
    organization_id: string;
    voornaam: string;
    email: string | null;
    personen: number;
    status: string;
    koppel_status: string;
    experience_token: string | null;
    experience_url: string | null;
    mail_status: string;
    doos_snapshot: { onderdelen?: DoosOnderdeel[] | null } | null;
    doos_types: { slug: string; experience_cache: { titel?: string | null } | null } | null;
    afhaalmomenten: { datum: string; start_tijd: string } | null;
}

export async function verstuurBestelMail(supabase: Client, bestellingId: number): Promise<MailUitkomst> {
    const { data, error } = await supabase
        .from('bestellingen')
        .select(`id, organization_id, voornaam, email, personen, status, koppel_status,
                 experience_token, experience_url, mail_status, doos_snapshot,
                 doos_types(slug, experience_cache), afhaalmomenten(datum, start_tijd)`)
        .eq('id', bestellingId)
        .maybeSingle();

    if (error) return { ok: false, reden: error.message };
    if (!data) return { ok: false, reden: 'Bestelling niet gevonden.' };

    const b = data as unknown as Rij;

    /* De poort. Staat los van het versturen zodat de regel te bewijzen is
       zonder mail — zie mailPoort.test.ts. */
    const poort = magMailVerstuurd(b);
    if (!poort.mag) return { ok: false, tegengehouden: true, reden: poort.uitleg };

    if (!b.afhaalmomenten) {
        return { ok: false, reden: 'Deze bestelling heeft geen afhaalmoment.' };
    }

    const { data: settings } = await supabase
        .from('settings')
        .select('bedrijfsnaam, adres, email')
        .eq('organization_id', b.organization_id)
        .maybeSingle();

    const tekst = {
        voornaam: b.voornaam,
        titel: b.doos_types?.experience_cache?.titel || 'je gourmetbox',
        personen: b.personen,
        afhaaldatum: b.afhaalmomenten.datum,
        startTijd: b.afhaalmomenten.start_tijd,
        /* Geen adres bekend? Dan valt die regel weg. Nooit een plaatshouder in
           een mail die iemand meeneemt naar de deur. */
        adres: settings?.adres || null,
        url: b.experience_url!,
        onderdelen: b.doos_snapshot?.onderdelen ?? null,
        afzender: 'Mathijs',
        bedrijfsregel: settings?.bedrijfsnaam ? `${settings.bedrijfsnaam} · Schoonoord` : 'Hop & Bites · Schoonoord',
    };

    const uit = await sendServerMail({
        to: b.email!,
        subject: ONDERWERP(tekst.titel),
        html: bestelMailHtml(tekst),
        /* Handgeschreven, niet afgeleid uit de HTML. */
        text: bestelMailTekst(tekst),
        replyTo: settings?.email || undefined,
    });

    if (!uit.success) {
        await supabase.from('bestellingen').update({
            mail_status: 'mislukt',
            mail_fout: uit.error ?? 'Onbekende fout bij het versturen.',
        }).eq('id', bestellingId);
        return { ok: false, reden: uit.error ?? 'De mail is niet verstuurd.' };
    }

    await supabase.from('bestellingen').update({
        mail_status: 'verstuurd',
        mail_fout: null,
        mail_verstuurd_at: new Date().toISOString(),
    }).eq('id', bestellingId);

    return { ok: true };
}
