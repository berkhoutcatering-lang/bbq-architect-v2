/**
 * BA-10 — de dagstaat. Contract §1.5, §3.3 (GET dagstaat, POST dagstaten), §6.6.
 *
 * POST dagstaten: eerst opslaan in het journaal (met de soepele envelop),
 * dan streng (DagstaatMelding), dan verwerken: toonbank_dagstaten krijgt de
 * rij en BBQ Architect rekent na uit de bonnen (de btw van de dag is de som
 * van de bon-btw per tarief, nooit opnieuw afgerond). Weigert nooit om een
 * inhoudelijke reden; een verschil wordt "Te controleren".
 * Antwoord {dagstaat_id, journaal, status, verschillen}.
 *
 * GET dagstaat?datum: wat BBQ Architect van die dag van deze tablet kent.
 */
import { CONTRACT_HUIDIG, CONTRACT_MINIMAAL, DAGSTAAT_STATUSSEN, DagstaatMelding, MeldingEnvelop, type DagstaatOverzicht, type DagstatenAntwoord } from './contract';
import { schemaFouten, slaMeldingenOp, verwerkWachtrij, type MeldingContext, type Ontvangst } from './bonnen';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

export async function ontvangDagstaat(store: ToonbankStore, ctx: MeldingContext, body: unknown): Promise<Ontvangst<DagstatenAntwoord>> {
    const env = MeldingEnvelop.safeParse(body);
    if (!env.success) {
        const punten = env.error.issues.slice(0, 5).map((i) => ({ pad: i.path.join('.'), melding: i.message }));
        return { uitkomst: mislukt('ongeldig_verzoek', 'De envelop van de dagstaat klopt niet (gebeurtenis_id, volgnummer, soort, moment).', { punten }), productIds: [] };
    }
    /* Ongewijzigd opslaan: de body zoals de tablet hem stuurde. Streng (DagstaatMelding) al vóór het
       opslaan: voldoet hij niet, dan komt hij meteen als fout (schema) in het journaal (review M2, klein 12). */
    const opslag = await slaMeldingenOp(store, ctx, [body], schemaFouten([body], DagstaatMelding));
    if (!('body' in opslag)) return { uitkomst: opslag as Uitkomst<DagstatenAntwoord>, productIds: [] };
    if (ctx.verouderd) {
        return {
            uitkomst: mislukt('contract_verouderd', 'Deze Toonbank-app is te oud voor BBQ Architect. De dagstaat is bewaard; werk de app bij en verstuur hem opnieuw.', {
                minimaal: CONTRACT_MINIMAAL, huidig: CONTRACT_HUIDIG, ontvangen: ctx.contract,
            }),
            productIds: [],
        };
    }
    const { productIds } = await verwerkWachtrij(store, ctx);
    const r = opslag.body.resultaten[0]!;
    const stand = await store.dagstaatStand(ctx.orgId, env.data.gebeurtenis_id);
    const status = stand && (DAGSTAAT_STATUSSEN as readonly string[]).includes(stand.status) ? stand.status as DagstatenAntwoord['status'] : 'voorlopig';
    return {
        uitkomst: gelukt({
            dagstaat_id: env.data.gebeurtenis_id,
            journaal: r.journaal,
            status,
            verschillen: (stand?.verschillen ?? []).map((v) => ({ veld: v.veld, tablet_cents: Math.round(v.tablet_cents), ba_cents: Math.round(v.ba_cents) })),
        }),
        productIds,
    };
}

export function dagstaatOverzichtAntwoord(r: Record<string, unknown>): DagstaatOverzicht {
    const n = (v: unknown) => Math.round(Number(v ?? 0)) || 0;
    return {
        datum: String(r.datum),
        apparaat_code: String(r.apparaat_code),
        aantal_bonnen: n(r.aantal_bonnen),
        hoogste_bonnummer: typeof r.hoogste_bonnummer === 'string' && r.hoogste_bonnummer ? r.hoogste_bonnummer : null,
        omzet: ((r.omzet as Record<string, unknown>[] | null) ?? []).map((o) => ({ pct: n(o.pct), incl_cents: n(o.incl_cents), btw_cents: n(o.btw_cents) })),
        pin_cents: n(r.pin_cents),
        contant_cents: n(r.contant_cents),
    };
}
