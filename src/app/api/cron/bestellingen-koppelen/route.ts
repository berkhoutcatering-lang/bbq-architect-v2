/**
 * Dagelijkse cron: bestellingen die nog geen token hebben alsnog koppelen, en
 * de doostype-cache verversen.
 * Plan: docs/bestelstroom-bouwplan.md §3.
 *
 * Dit is het vangnet onder de koppelstap. Was de Experience-app even weg toen
 * iemand bestelde, dan staat die bestelling op 'mislukt' en probeert deze cron
 * het morgen opnieuw. De teller in de hub is het andere vangnet — voor als
 * "morgen" te laat is.
 *
 * Vercel Hobby staat alleen DAGELIJKSE crons toe; een fijnmaziger schema laat
 * élke deploy stilletjes falen. Vandaar één keer per nacht.
 *
 * Beveiliging: CRON_SECRET via de Authorization-header, zoals de andere crons.
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { koppelBestelling, ververseDoosTypeCache } from '@/lib/koppelBestelling';
import { verstuurBestelMail } from '@/lib/verstuurBestelMail';
import { datumMinMaanden } from '@/lib/bestelstroom';

export const runtime = 'nodejs';
export const maxDuration = 300;

/* Ruim onder de looptijd blijven: bij honderd wachtende bestellingen is één
   nacht niet genoeg, maar drie nachten wel — en de hub schreeuwt intussen. */
const MAX_PER_NACHT = 40;

function isAuthorized(req: Request): boolean {
    const auth = req.headers.get('authorization') ?? '';
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sb = createServiceSupabase();

    /* 1 · De doostype-cache verversen. Zonder personen_per_doos neemt het
       bestelformulier geen bestellingen aan, dus dit is niet vrijblijvend. */
    let caches = 0;
    const { data: typen } = await sb
        .from('doos_types')
        .select('id, slug')
        .eq('actief', true);

    for (const t of typen ?? []) {
        const nieuw = await ververseDoosTypeCache(sb, t.id, t.slug);
        if (nieuw) caches++;
    }

    /* 2 · Wachtende bestellingen alsnog koppelen. Oudste eerst: die staan het
       dichtst bij hun afhaalmoment. */
    const { data: wachtenden } = await sb
        .from('bestellingen')
        .select('id')
        .is('experience_token', null)
        .neq('status', 'geannuleerd')
        .order('created_at', { ascending: true })
        .limit(MAX_PER_NACHT);

    let gelukt = 0;
    const mislukt: Array<{ id: number; code?: string }> = [];

    let gemaild = 0;
    for (const b of wachtenden ?? []) {
        const uit = await koppelBestelling(sb, b.id);
        if (!uit.ok) { mislukt.push({ id: b.id, code: uit.code }); continue; }
        gelukt++;
        /* De mail lag vast op de ontbrekende link; die is er nu. */
        const mail = await verstuurBestelMail(sb, b.id);
        if (mail.ok) gemaild++;
    }

    /* 3 · Bestellingen die wél een token hebben maar waarvan de mail eerder
       strandde (Resend eruit, adres gecorrigeerd). De poort laat ze nu door. */
    const { data: mailWachtenden } = await sb
        .from('bestellingen')
        .select('id')
        .not('experience_token', 'is', null)
        .neq('status', 'geannuleerd')
        .neq('mail_status', 'verstuurd')
        .order('created_at', { ascending: true })
        .limit(MAX_PER_NACHT);

    for (const b of mailWachtenden ?? []) {
        const mail = await verstuurBestelMail(sb, b.id);
        if (mail.ok) gemaild++;
    }

    /* 4 · Opruimen. Drie regels, en ze zijn geen van alle cosmetisch.
       De allergienotitie is een gezondheidsgegeven (AVG art. 9); dat blijft
       niet staan omdat niemand het weggooit. En het wachtlijstadres kreeg één
       bericht beloofd — daarna heeft het hier niets meer te zoeken. */
    const vandaag = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' });
    const opruim = { notities: 0, wachtlijst: 0 };

    const grensNotitie = datumMinMaanden(vandaag, 6);
    if (grensNotitie) {
        /* Via de afhaalmomenten, want de termijn loopt vanaf het AFHALEN en
           niet vanaf het bestellen. */
        const { data: oudeMomenten } = await sb
            .from('afhaalmomenten').select('id').lt('datum', grensNotitie);
        const ids = (oudeMomenten ?? []).map((m) => m.id);
        if (ids.length) {
            const { data: gewist } = await sb
                .from('bestellingen')
                .update({ allergie_notitie: null })
                .in('afhaalmoment_id', ids)
                .not('allergie_notitie', 'is', null)
                .select('id');
            opruim.notities = gewist?.length ?? 0;
        }
    }

    /* Bericht verstuurd = deze rij is op. Er is geen tweede. */
    const { data: op } = await sb
        .from('bestel_wachtlijst').delete().not('bericht_verstuurd_at', 'is', null).select('id');
    opruim.wachtlijst += op?.length ?? 0;

    /* Achttien maanden niets gehoord: dan is die ene belofte niet waargemaakt
       en houden we het adres niet langer vast. */
    const grensWachtlijst = datumMinMaanden(vandaag, 18);
    if (grensWachtlijst) {
        const { data: verlopen } = await sb
            .from('bestel_wachtlijst').delete()
            .is('bericht_verstuurd_at', null)
            .lt('created_at', `${grensWachtlijst}T00:00:00Z`)
            .select('id');
        opruim.wachtlijst += verlopen?.length ?? 0;
    }

    /* Loggen met het bestelnummer als koppelnummer, zodat één bestelling door
       twee apps heen te volgen is. */
    if (mislukt.length) {
        console.warn('[cron bestellingen-koppelen] niet gelukt:',
            mislukt.map((m) => `#${m.id} (${m.code ?? 'onbekend'})`).join(', '));
    }

    return NextResponse.json({
        caches_ververst: caches,
        bekeken: wachtenden?.length ?? 0,
        gekoppeld: gelukt,
        gemaild,
        mislukt: mislukt.length,
        notities_gewist: opruim.notities,
        wachtlijst_opgeruimd: opruim.wachtlijst,
    });
}
