/**
 * BA-10 — ophalen vanaf de Toonbank. Contract §1.2 (ophalen, doos_ophalen),
 * §3.2 en §3.3 (POST orders/{order_id}/ophalen, POST dozen/{code}/ophalen).
 *
 * Een vraag, alleen online, niet via de verzendbak. Elke uitkomst van
 * winkel_order_ophalen (BA-2) of winkel_doos_ophalen is een 200 met
 * `uitkomst`: onbekend, niet_betaald, al_opgehaald, rest_nodig,
 * leeftijd_nodig, geweigerd, te_weinig_voorraad of opgehaald. Alleen bij
 * "opgehaald" is er iets meegegeven. Het restbedrag van de tablet wordt in de
 * database vóór de aanroep vergeleken met de open rest (review M7).
 * Idempotent op gebeurtenis_id: een herhaling geeft hetzelfde antwoord; een
 * gebeurtenis_id dat al voor iets anders gebruikt is, is 400.
 */
import { iso } from './vragen';
import { OPHAAL_UITKOMSTEN, type DoosOphalenAntwoord, type OphaalUitkomst, type OphalenVerzoek, type OrderOphalenAntwoord } from './contract';
import type { ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

export interface OphaalContext {
    orgId: string;
    apparaatId: string;
    medewerkerId: string;
    contract: string | null;
}

export type OphaalDoel = { soort: 'order'; orderId: number } | { soort: 'doos'; code: string };

function uitkomstVan(v: unknown): OphaalUitkomst {
    const s = String(v ?? '');
    if (!(OPHAAL_UITKOMSTEN as readonly string[]).includes(s)) throw new Error(`onverwachte ophaaluitkomst ${s || 'leeg'}`);
    return s as OphaalUitkomst;
}

/** De uitkomst van de database in de vorm van het contract. */
export function ophaalAntwoord(doel: OphaalDoel, r: Record<string, unknown>): OrderOphalenAntwoord | DoosOphalenAntwoord {
    const uitkomst = uitkomstVan(r.uitkomst);
    const orderId = Number(r.order_id);
    const basis: OrderOphalenAntwoord = {
        uitkomst,
        order_id: Number.isInteger(orderId) && orderId > 0 ? orderId : null,
        nummer: typeof r.nummer === 'string' && r.nummer ? r.nummer : null,
        /* Na "opgehaald" staat er niets meer open; anders wat er nog betaald moet worden. */
        rest_cents: uitkomst === 'opgehaald' ? 0 : Math.max(0, Math.round(Number(r.rest_cents ?? 0)) || 0),
        opgehaald_at: uitkomst === 'opgehaald' || uitkomst === 'al_opgehaald' ? iso(r.opgehaald_at) : null,
    };
    if (doel.soort === 'order') return basis;
    return { ...basis, code: String(r.code || doel.code), nog_open: Math.max(0, Math.round(Number(r.nog_open ?? 0)) || 0) };
}

export async function ophaalVraag(
    store: ToonbankStore,
    ctx: OphaalContext,
    doel: OphaalDoel,
    verzoek: OphalenVerzoek,
): Promise<{ uitkomst: Uitkomst<OrderOphalenAntwoord | DoosOphalenAntwoord>; productIds: string[] }> {
    const ruw = await store.ophaalVraag({
        orgId: ctx.orgId, apparaatId: ctx.apparaatId, soort: doel.soort,
        orderId: doel.soort === 'order' ? doel.orderId : null, code: doel.soort === 'doos' ? doel.code : null,
        gebeurtenisId: verzoek.gebeurtenis_id, moment: verzoek.moment, medewerkerId: ctx.medewerkerId,
        bonId: verzoek.bon_id, restMethode: verzoek.rest?.methode ?? null, restBedragCents: verzoek.rest?.bedrag_cents ?? null,
        leeftijd: verzoek.leeftijd?.uitkomst ?? null, contractVersie: ctx.contract?.slice(0, 20) ?? null,
    });

    const verwachtSoort = doel.soort === 'order' ? 'ophalen' : 'doos_ophalen';
    if (ruw.journaal === 'bestond') {
        const p = ruw.payload ?? {};
        const zelfde = ruw.soort === verwachtSoort
            && (doel.soort === 'order' ? Number(p.order_id) === doel.orderId : String(p.code ?? '').toLowerCase() === doel.code.toLowerCase());
        if (!zelfde) {
            return { uitkomst: mislukt('ongeldig_verzoek', 'Dit gebeurtenis_id is al gebruikt voor een andere melding of vraag.', { gebeurtenis_id: verzoek.gebeurtenis_id }), productIds: [] };
        }
    }
    const r = ruw.resultaat ?? {};
    const productIds = ruw.journaal === 'nieuw'
        ? [...new Set(((r.boekingen as { product_id?: unknown }[] | null) ?? []).map((b) => String(b.product_id ?? '')).filter(Boolean))]
        : [];
    return { uitkomst: gelukt(ophaalAntwoord(doel, r)), productIds };
}
