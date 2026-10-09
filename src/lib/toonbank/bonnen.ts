/**
 * BA-9 — POST bonnen: wat al gebeurd is. Contract §1.2, §3.2, §3.3, §6.6.
 *
 * Eerst opslaan, dan verwerken:
 *   1. hooguit 50 meldingen (anders 413 te_groot); de envelop van elke melding
 *      (gebeurtenis_id, volgnummer, soort, moment) moet kloppen, anders 400
 *      ongeldig_verzoek en is er niets opgeslagen;
 *   2. elke melding streng tegen het contract (Melding), vóór het opslaan
 *      (review M2, klein 12): wat niet klopt gaat mee naar de database en komt
 *      daar meteen als 'fout' (code schema, Te controleren) in het journaal.
 *      Er is dus geen moment waarop een gelijktijdig verzoek hem verwerkt;
 *   3. toonbank_journaal_opslaan: elke melding ongewijzigd in het journaal,
 *      'nieuw' of 'bestond';
 *   4. toonbank_verwerk_wachtrij: alles op wacht van deze tablet, elk apart;
 *   5. antwoord {resultaten: [{gebeurtenis_id, journaal, verwerking}],
 *      bevestigd_tot_volgnummer}.
 * Weigert nooit om een inhoudelijke reden. Lukt het verwerken niet (een
 * storing), dan is het toch opgeslagen: het antwoord meldt 'wacht', en de
 * volgende POST bonnen of GET status (elke 30 seconden) verwerkt het alsnog
 * (verwerkWachtendeMeldingen, review M2 klein 1).
 *
 * Een te oude app (contract §6.6): eerst opslaan als fout contract_verouderd,
 * dan 426. Na de update stuurt de tablet ze opnieuw ('bestond', weer op wacht).
 */
import type { z } from 'zod';
import { BonnenEnvelop, CONTRACT_HUIDIG, CONTRACT_MINIMAAL, MAX_MELDINGEN_PER_VERZOEK, Melding, type BonnenAntwoord } from './contract';
import { OngeldigeMelding, type JournaalOpslagRuw, type ToonbankStore, type VerwerktRij } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

export interface MeldingContext {
    orgId: string;
    apparaatId: string;
    contract: string | null;
    verouderd: boolean;
}

export interface Ontvangst<T> {
    uitkomst: Uitkomst<T>;
    /** Producten waarvan de voorraad veranderde: daarna meldingen bijwerken en de website verversen. */
    productIds: string[];
}

/** De eerste paar punten van een zod-fout, kort, voor fout_melding. */
export function zodSamenvatting(e: z.ZodError, max = 5): string {
    return e.issues.slice(0, max).map((i) => `${i.path.join('.') || '(melding)'}: ${i.message}`).join('; ').slice(0, 900);
}

/**
 * De strenge controle vóór het opslaan: per melding die niet aan het schema
 * voldoet, gebeurtenis_id (kleine letters) → een korte samenvatting.
 */
export function schemaFouten(meldingen: unknown[], schema: z.ZodType): Record<string, string> {
    const uit: Record<string, string> = {};
    for (const m of meldingen) {
        const gid = String((m as { gebeurtenis_id?: unknown } | null)?.gebeurtenis_id ?? '').toLowerCase();
        if (!gid) continue;
        const s = schema.safeParse(m);
        if (!s.success) uit[gid] = zodSamenvatting(s.error);
    }
    return uit;
}

/** Opslaan met de envelop; 400 als het verzoek zelf niet klopt. */
export async function slaMeldingenOp(
    store: ToonbankStore,
    ctx: MeldingContext,
    meldingen: unknown[],
    fouten: Record<string, string> = {},
): Promise<Uitkomst<JournaalOpslagRuw>> {
    try {
        return gelukt(await store.journaalOpslaan({
            orgId: ctx.orgId, apparaatId: ctx.apparaatId, meldingen, contractVersie: ctx.contract?.slice(0, 20) ?? null, verouderd: ctx.verouderd,
            schemaFouten: fouten,
        }));
    } catch (e) {
        if (e instanceof OngeldigeMelding) {
            return mislukt('ongeldig_verzoek', 'De envelop van een melding klopt niet (gebeurtenis_id, volgnummer, soort, moment).', { index: e.index });
        }
        throw e;
    }
}

/**
 * De wachtrij van deze tablet (stap 4). Geeft per journaal_id de status na
 * afloop en de geraakte producten. Een storing hier is geen fout voor de
 * tablet: opgeslagen is opgeslagen.
 */
export async function verwerkWachtrij(store: ToonbankStore, ctx: Pick<MeldingContext, 'orgId' | 'apparaatId'>): Promise<{ status: Map<number, string>; productIds: string[] }> {
    const status = new Map<number, string>();
    let verwerkt: VerwerktRij[] = [];
    try {
        verwerkt = await store.verwerkWachtrij(ctx.orgId, ctx.apparaatId);
    } catch (e) {
        /* Opgeslagen is opgeslagen: de volgende verzending of de volgende statusvraag verwerkt het. */
        console.error('[toonbank bonnen] verwerken mislukt, blijft op wacht:', e instanceof Error ? e.message : String(e));
    }
    for (const v of verwerkt) status.set(v.journaal_id, v.status);
    return { status, productIds: [...new Set(verwerkt.flatMap((v) => v.product_ids))] };
}

/**
 * GET status (review M2, klein 1): staat er van deze tablet nog iets op wacht
 * dat nooit verwerkt is (een storing bij POST bonnen) of alleen een tijdelijke
 * fout had, dan nu de wachtrij. Zo blijft een bon na een storing niet liggen
 * tot de volgende verkoop. Gooit nooit; geeft de geraakte producten.
 */
export async function verwerkWachtendeMeldingen(store: ToonbankStore, ctx: Pick<MeldingContext, 'orgId' | 'apparaatId'>): Promise<string[]> {
    try {
        if (!(await store.wachtrijTeVerwerken(ctx.orgId, ctx.apparaatId))) return [];
    } catch (e) {
        console.error('[toonbank status] wachtrij nakijken mislukt:', e instanceof Error ? e.message : String(e));
        return [];
    }
    return (await verwerkWachtrij(store, ctx)).productIds;
}

export async function ontvangBonnen(store: ToonbankStore, ctx: MeldingContext, body: unknown): Promise<Ontvangst<BonnenAntwoord>> {
    const lijst = (body as { meldingen?: unknown } | null)?.meldingen;
    if (Array.isArray(lijst) && lijst.length > MAX_MELDINGEN_PER_VERZOEK) {
        return { uitkomst: mislukt('te_groot', `Hooguit ${MAX_MELDINGEN_PER_VERZOEK} meldingen per keer; stuur ze in delen.`, { max: MAX_MELDINGEN_PER_VERZOEK, aantal: lijst.length }), productIds: [] };
    }
    const env = BonnenEnvelop.safeParse(body);
    if (!env.success) {
        const punten = env.error.issues.slice(0, 5).map((i) => ({ pad: i.path.join('.'), melding: i.message }));
        const index = env.error.issues.map((i) => (i.path[0] === 'meldingen' && typeof i.path[1] === 'number' ? i.path[1] : null)).find((x) => x !== null) ?? null;
        return { uitkomst: mislukt('ongeldig_verzoek', 'De envelop van een melding klopt niet (gebeurtenis_id, volgnummer, soort, moment).', { punten, index }), productIds: [] };
    }
    const meldingen = env.data.meldingen as unknown[];
    const opslag = await slaMeldingenOp(store, ctx, meldingen, schemaFouten(meldingen, Melding));
    if (!('body' in opslag)) return { uitkomst: opslag as Uitkomst<BonnenAntwoord>, productIds: [] };

    if (ctx.verouderd) {
        return {
            uitkomst: mislukt('contract_verouderd', 'Deze Toonbank-app is te oud voor BBQ Architect. De meldingen zijn bewaard; werk de app bij en verstuur ze opnieuw.', {
                minimaal: CONTRACT_MINIMAAL, huidig: CONTRACT_HUIDIG, ontvangen: ctx.contract, opgeslagen: opslag.body.resultaten.length,
            }),
            productIds: [],
        };
    }

    const { status, productIds } = await verwerkWachtrij(store, ctx);
    /* In de volgorde van het verzoek (de database werkt op volgnummer). */
    const opId = new Map(opslag.body.resultaten.map((r) => [r.gebeurtenis_id.toLowerCase(), r]));
    const resultaten = env.data.meldingen
        .map((m) => opId.get(m.gebeurtenis_id.toLowerCase()))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ gebeurtenis_id: r.gebeurtenis_id, journaal: r.journaal, verwerking: status.get(r.journaal_id) ?? r.verwerking }));
    return { uitkomst: gelukt({ resultaten, bevestigd_tot_volgnummer: opslag.body.bevestigd_tot_volgnummer }), productIds };
}
