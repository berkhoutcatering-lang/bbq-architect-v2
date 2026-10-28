/**
 * Pinnen via de koppeling met de myPOS (contract toonbank/v1 1.3, besluit Mathijs 28 oktober 2026).
 *
 * De Toonbank vraagt, BBQ Architect beslist en praat met myPOS:
 *   POST pinbetalingen                     → start (per poging_id hooguit één betaling bij myPOS)
 *   GET  pinbetalingen/{poging_id}         → de stand; vraagt myPOS zolang hij wacht
 *   POST pinbetalingen/{poging_id}/annuleren → afbreken op de terminal
 *
 * De ePOS API van myPOS weigert zelf geen dubbele betaling (geen idempotentie in de Swagger).
 * Daarom legt BBQ Architect eerst de pinbetaling vast (uniek op organisatie + poging_id) en
 * stuurt hij pas daarna naar myPOS. Een tweede verzoek met hetzelfde poging_id krijgt de stand
 * van de eerste, nooit een tweede betaling op de terminal.
 *
 * Gaat er iets mis vóór myPOS de betaling aannam, dan antwoordt BBQ Architect met een fout
 * (pin_koppeling_uit, terminal_bezet of mypos_onbereikbaar) en pint de medewerker met de hand,
 * zoals altijd. Het geld zelf boekt BBQ Architect hier niet: dat gebeurt pas als de bon via
 * POST bonnen binnenkomt (journaal eerst).
 */
import type { PinbetalingAntwoord, PinbetalingVerzoek } from './contract';
import { type MyposBetaling, type MyposClient, type MyposConfig, MyposFout, maakMyposClient, myposConfig } from './mypos';
import type { Pinbetaling, PinStand, ToonbankStore } from './store';
import { gelukt, mislukt, type Uitkomst } from './uitkomst';

export interface PinContext {
    orgId: string;
    apparaatId: string;
}

export interface PinAfhankelijk {
    config: MyposConfig | null;
    client: MyposClient | null;
}

let gedeeld: { config: MyposConfig; client: MyposClient } | null = null;

/** De myPOS-instellingen en een client, één per serverinstantie (token en sessie worden bewaard). */
export function standaardMypos(): PinAfhankelijk {
    const config = myposConfig();
    if (!config) return { config: null, client: null };
    if (!gedeeld || gedeeld.config.basis !== config.basis || gedeeld.config.merchantClientId !== config.merchantClientId) {
        gedeeld = { config, client: maakMyposClient(config) };
    }
    return gedeeld;
}

/** De terminal van deze tablet als de koppeling kan: sleutels aanwezig, juiste organisatie en een terminal-ID. */
export async function koppelTerminal(store: ToonbankStore, ctx: PinContext, dep: PinAfhankelijk): Promise<{ terminal_id: string; naam: string } | null> {
    if (!dep.config || !dep.client || dep.config.organisatieId !== ctx.orgId) return null;
    return store.myposTerminal(ctx.orgId, ctx.apparaatId);
}

/** Van myPOS naar het contract. */
export function standVan(status: string): PinStand {
    switch (status) {
        case 'Success': return 'gelukt';
        case 'Rejected':
        case 'Failed': return 'mislukt';
        case 'Canceled':
        case 'Reversed': return 'geannuleerd';
        default: return 'wacht';
    }
}

function meldingVan(b: MyposBetaling): string | null {
    switch (b.status) {
        case 'Rejected': return 'De betaling is geweigerd door de bank of de kaart.';
        case 'Failed': return 'De myPOS kon de betaling niet verwerken.';
        case 'Canceled': return 'Afgebroken op de myPOS.';
        case 'Reversed': return 'myPOS heeft de betaling teruggedraaid.';
        default: return null;
    }
}

function antwoord(p: Pinbetaling): PinbetalingAntwoord {
    return {
        poging_id: p.poging_id,
        stand: p.stand,
        bedrag_cents: p.bedrag_cents,
        melding: p.melding,
        mypos_referentie: p.stand === 'gelukt' ? (p.mypos_referentie ?? p.mypos_payment_id) : p.mypos_referentie,
        terminal: `myPOS ${p.mypos_terminal_id.slice(-4)}`,
    };
}

/** Wat myPOS zei in de rij zetten; geeft de bijgewerkte rij. */
async function legVast(store: ToonbankStore, ctx: PinContext, p: Pinbetaling, b: MyposBetaling): Promise<Pinbetaling> {
    const stand = standVan(b.status);
    const wijziging = {
        mypos_payment_id: b.payment_id || p.mypos_payment_id,
        mypos_status: b.status,
        stand,
        mypos_referentie: b.rrn ?? b.auth_code ?? p.mypos_referentie,
        melding: meldingVan(b),
    };
    if (p.stand === stand && p.mypos_status === b.status && p.mypos_payment_id === wijziging.mypos_payment_id) return p;
    return (await store.werkPinbetalingBij(ctx.orgId, p.poging_id, wijziging)) ?? { ...p, ...wijziging };
}

function foutVan<T>(e: unknown): Uitkomst<T> {
    const melding = e instanceof Error ? e.message : String(e);
    return mislukt('mypos_onbereikbaar', 'myPOS is nu niet bereikbaar. Tik het bedrag met de hand in op de myPOS.', { oorzaak: melding.slice(0, 200) });
}

export async function startPinbetaling(store: ToonbankStore, ctx: PinContext, v: PinbetalingVerzoek, dep: PinAfhankelijk = standaardMypos()): Promise<Uitkomst<PinbetalingAntwoord>> {
    const terminal = await koppelTerminal(store, ctx, dep);
    if (!terminal || !dep.client) return mislukt('pin_koppeling_uit', 'De koppeling met de myPOS staat uit voor deze kassa. Tik het bedrag met de hand in.');

    const { rij, nieuw } = await store.maakPinbetaling({
        organization_id: ctx.orgId,
        apparaat_id: ctx.apparaatId,
        poging_id: v.poging_id,
        bon_id: v.bon_id,
        bonnummer: v.bonnummer,
        bedrag_cents: v.bedrag_cents,
        mypos_terminal_id: terminal.terminal_id,
        mypos_payment_id: null,
        stand: 'wacht',
        mypos_status: null,
        mypos_referentie: null,
        melding: null,
    });
    // Bestond hij al: nooit een tweede betaling, alleen de stand.
    if (!nieuw) return pinbetalingStand(store, ctx, v.poging_id, dep);

    try {
        const b = await dep.client.betaling({ terminal_id: terminal.terminal_id, bedrag_cents: v.bedrag_cents, referentie: v.bonnummer, omschrijving: `Hop & Bites ${v.bonnummer}` });
        return gelukt(antwoord(await legVast(store, ctx, rij, b)));
    } catch (e) {
        // myPOS weigerde de betaling vooraf (4xx): er staat niets op de terminal.
        if (e instanceof MyposFout && e.status >= 400 && e.status < 500) {
            await store.werkPinbetalingBij(ctx.orgId, v.poging_id, { stand: 'mislukt', melding: 'myPOS nam de betaling niet aan.' });
            return mislukt('terminal_bezet', 'De myPOS nam de betaling niet aan (staat hij aan, en is hij niet met iets anders bezig?). Tik het bedrag met de hand in.', { oorzaak: e.message.slice(0, 200) });
        }
        // Geen antwoord: misschien kwam hij wel aan. De rij blijft op wacht zonder payment_id; afbreken
        // zet hem op geannuleerd. De kassa zegt de medewerker eerst op de myPOS te kijken.
        return foutVan(e);
    }
}

export async function pinbetalingStand(store: ToonbankStore, ctx: PinContext, pogingId: string, dep: PinAfhankelijk = standaardMypos()): Promise<Uitkomst<PinbetalingAntwoord>> {
    const p = await store.pinbetaling(ctx.orgId, pogingId);
    if (!p || p.apparaat_id !== ctx.apparaatId) return mislukt('niet_gevonden', 'Deze pinbetaling kent BBQ Architect niet.', { poging_id: pogingId });
    if (p.stand !== 'wacht' || !p.mypos_payment_id || !dep.client) return gelukt(antwoord(p));
    try {
        return gelukt(antwoord(await legVast(store, ctx, p, await dep.client.stand(p.mypos_payment_id))));
    } catch {
        // Even geen antwoord van myPOS: de stand blijft wacht; de tablet vraagt het opnieuw.
        return gelukt(antwoord(p));
    }
}

export async function annuleerPinbetaling(store: ToonbankStore, ctx: PinContext, pogingId: string, dep: PinAfhankelijk = standaardMypos()): Promise<Uitkomst<PinbetalingAntwoord>> {
    const p = await store.pinbetaling(ctx.orgId, pogingId);
    if (!p || p.apparaat_id !== ctx.apparaatId) return mislukt('niet_gevonden', 'Deze pinbetaling kent BBQ Architect niet.', { poging_id: pogingId });
    if (p.stand !== 'wacht') return gelukt(antwoord(p));
    if (!p.mypos_payment_id || !dep.client) {
        const af = await store.werkPinbetalingBij(ctx.orgId, pogingId, { stand: 'geannuleerd', melding: 'Afgebroken voordat de myPOS de betaling had.' });
        return gelukt(antwoord(af ?? { ...p, stand: 'geannuleerd' }));
    }
    try {
        await dep.client.annuleer(p.mypos_payment_id);
        // Afbreken gaat bij myPOS op de achtergrond (202): meteen de stand opvragen. Nog InProgress? Dan blijft het wacht.
        return gelukt(antwoord(await legVast(store, ctx, p, await dep.client.stand(p.mypos_payment_id))));
    } catch (e) {
        return foutVan(e);
    }
}
