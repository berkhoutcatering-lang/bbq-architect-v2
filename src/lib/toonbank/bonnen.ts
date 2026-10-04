/**
 * BA-9 — POST bonnen: wat al gebeurd is. Contract §1.2, §3.2, §3.3, §6.6.
 *
 * Eerst opslaan, dan verwerken:
 *   1. hooguit 50 meldingen (anders 413 te_groot); de envelop van elke melding
 *      (gebeurtenis_id, volgnummer, soort, moment) moet kloppen, anders 400
 *      ongeldig_verzoek en is er niets opgeslagen;
 *   2. toonbank_journaal_opslaan: elke melding ongewijzigd in het journaal,
 *      'nieuw' of 'bestond';
 *   3. elke nieuwe melding streng tegen het contract (Melding); klopt hij niet,
 *      dan alleen die melding op 'fout' (Te controleren);
 *   4. toonbank_verwerk_wachtrij: alles op wacht van deze tablet, elk apart;
 *   5. antwoord {resultaten: [{gebeurtenis_id, journaal, verwerking}],
 *      bevestigd_tot_volgnummer}.
 * Weigert nooit om een inhoudelijke reden. Lukt het verwerken niet (een
 * storing), dan is het toch opgeslagen: het antwoord meldt 'wacht'.
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

/** Opslaan met de envelop; 400 of 413 als het verzoek zelf niet klopt. */
export async function slaMeldingenOp(store: ToonbankStore, ctx: MeldingContext, meldingen: unknown[]): Promise<Uitkomst<JournaalOpslagRuw>> {
    try {
        return gelukt(await store.journaalOpslaan({
            orgId: ctx.orgId, apparaatId: ctx.apparaatId, meldingen, contractVersie: ctx.contract?.slice(0, 20) ?? null, verouderd: ctx.verouderd,
        }));
    } catch (e) {
        if (e instanceof OngeldigeMelding) {
            return mislukt('ongeldig_verzoek', 'De envelop van een melding klopt niet (gebeurtenis_id, volgnummer, soort, moment).', { index: e.index });
        }
        throw e;
    }
}

/**
 * Streng per nieuwe melding (stap 3) en daarna de wachtrij (stap 4). Geeft per
 * journaal_id de status na afloop en de geraakte producten.
 */
export async function verwerkNieuwe(
    store: ToonbankStore,
    ctx: MeldingContext,
    meldingen: unknown[],
    opslag: JournaalOpslagRuw,
    schema: z.ZodType,
): Promise<{ status: Map<number, string>; productIds: string[] }> {
    const status = new Map<number, string>();
    const opId = new Map(meldingen.map((m) => [String((m as { gebeurtenis_id?: unknown }).gebeurtenis_id ?? '').toLowerCase(), m]));
    for (const r of opslag.resultaten) {
        if (r.journaal !== 'nieuw' || r.verwerking !== 'wacht') continue;
        const s = schema.safeParse(opId.get(r.gebeurtenis_id.toLowerCase()));
        if (!s.success) status.set(r.journaal_id, await store.journaalMarkeer(ctx.orgId, r.journaal_id, 'schema', zodSamenvatting(s.error)));
    }
    let verwerkt: VerwerktRij[] = [];
    try {
        verwerkt = await store.verwerkWachtrij(ctx.orgId, ctx.apparaatId);
    } catch (e) {
        /* Opgeslagen is opgeslagen: de volgende verzending (of de volgende statusvraag) verwerkt het. */
        console.error('[toonbank bonnen] verwerken mislukt, blijft op wacht:', e instanceof Error ? e.message : String(e));
    }
    for (const v of verwerkt) status.set(v.journaal_id, v.status);
    return { status, productIds: [...new Set(verwerkt.flatMap((v) => v.product_ids))] };
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
    const opslag = await slaMeldingenOp(store, ctx, meldingen);
    if (!('body' in opslag)) return { uitkomst: opslag as Uitkomst<BonnenAntwoord>, productIds: [] };

    if (ctx.verouderd) {
        return {
            uitkomst: mislukt('contract_verouderd', 'Deze Toonbank-app is te oud voor BBQ Architect. De meldingen zijn bewaard; werk de app bij en verstuur ze opnieuw.', {
                minimaal: CONTRACT_MINIMAAL, huidig: CONTRACT_HUIDIG, ontvangen: ctx.contract, opgeslagen: opslag.body.resultaten.length,
            }),
            productIds: [],
        };
    }

    const { status, productIds } = await verwerkNieuwe(store, ctx, meldingen, opslag.body, Melding);
    /* In de volgorde van het verzoek (de database werkt op volgnummer). */
    const opId = new Map(opslag.body.resultaten.map((r) => [r.gebeurtenis_id.toLowerCase(), r]));
    const resultaten = env.data.meldingen
        .map((m) => opId.get(m.gebeurtenis_id.toLowerCase()))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({ gebeurtenis_id: r.gebeurtenis_id, journaal: r.journaal, verwerking: status.get(r.journaal_id) ?? r.verwerking }));
    return { uitkomst: gelukt({ resultaten, bevestigd_tot_volgnummer: opslag.body.bevestigd_tot_volgnummer }), productIds };
}
