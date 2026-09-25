/**
 * Plaatsing — een betaald bonnetje op de dag dat het klaar moet zijn.
 * Plan: docs/webshop-beheer-bouwplan.md §4.
 *
 * Elke regel krijgt een klaar-op-dag: het afhaalmoment (plank), de afhaaldag
 * (Kerst-Box) of, zonder moment, vandaag. Een regel mét moment landt in het
 * event van dat moment — één event per moment, aangemaakt als het er nog niet
 * is. Regels zónder moment gaan in de vaste bak (geen event).
 *
 * Twee regels lopen overal doorheen:
 *   • Idempotent. Een regel die al in een event ligt wordt niet verplaatst,
 *     en de totalen van een event worden elke keer opnieuw geteld uit álle
 *     betaalde regels erop. Twee keer draaien = één keer draaien.
 *   • Nooit gokken. Geen gekoppeld gerecht → het event bestaat wél, met
 *     aantallen en notitie, maar zonder menu-regel voor dat artikel. Het
 *     scherm zegt dat.
 *
 * Wat hier zuiver is (eventNaam, wensenSamenvatting, telTotalen) is apart
 * getest; wat de opslag raakt loopt via de WinkelStore, zodat de kassa-tests
 * met de geheugen-opslag dit hele pad meenemen.
 */
import type { Artikel, MomentRij } from './rekenen';
import { vandaagISO } from './rekenen';
import type { EventTotalen, EventVakje, OrderRegelRij, OrderRij, PlaatsingStatus, RegelOpEvent, Tenant, Wensen, WinkelStore } from './store';

/* ── Zuiver ────────────────────────────────────────────────────────────────── */

function groepNaam(groep: string): string {
    if (groep === 'agenda') return 'Webshop';
    return groep.charAt(0).toUpperCase() + groep.slice(1);
}

/** "Kerst-Box · afhalen", "Borrel Journey + Hop & Bites plank · afhalen"; bij meer dan twee de groep. */
export function eventNaam(regelNamen: string[], groep: string): string {
    const uniek = [...new Set(regelNamen.map((n) => n.trim()).filter(Boolean))];
    const kop = uniek.length > 0 && uniek.length <= 2 ? uniek.join(' + ') : groepNaam(groep);
    return `${kop} · afhalen`;
}

/** "1 vegetarisch · allergie: noten" — leeg als er niets in staat. */
export function wensenSamenvatting(w: Wensen | null | undefined): string | null {
    if (!w) return null;
    const delen: string[] = [];
    if (w.vegetarisch > 0) delen.push(`${w.vegetarisch} vegetarisch`);
    if (w.veganistisch > 0) delen.push(`${w.veganistisch} veganistisch`);
    if (w.glutenvrij > 0) delen.push(`${w.glutenvrij} glutenvrij`);
    if (w.allergenen.length) delen.push(`allergie: ${w.allergenen.join(', ')}`);
    delen.push(...w.overig.map((s) => s.trim()).filter(Boolean));
    return delen.length ? delen.join(' · ') : null;
}

/**
 * De totalen van een event uit alle betaalde regels erop.
 *
 * Vegetarisch telt op uit twee bronnen: het dieet van het artikel (de
 * vegetarische Kerst-Box) en wat uit de opmerking gelezen is ("waarvan 1
 * vega"). Een order die al een vegetarisch artikel heeft telt zijn gelezen
 * wens niet nog eens — anders telt dezelfde persoon dubbel.
 */
export function telTotalen(rijen: RegelOpEvent[], artikelen: Map<string, Artikel>): EventTotalen {
    let guests = 0;
    let veg = 0;
    let vegan = 0;
    let gf = 0;
    const menu: string[] = [];
    const menuGasten: Record<string, number> = {};
    const perOrder = new Map<number, { order: RegelOpEvent['order']; regels: OrderRegelRij[]; dieet: Set<string> }>();

    for (const { regel, order } of rijen) {
        const a = artikelen.get(regel.artikel_id);
        guests += regel.aantal;
        if (a?.dieet === 'vegetarisch') veg += regel.aantal;
        if (a?.dieet === 'veganistisch') vegan += regel.aantal;
        if (a?.gerecht_id) {
            if (!menu.includes(a.gerecht_id)) menu.push(a.gerecht_id);
            menuGasten[a.gerecht_id] = (menuGasten[a.gerecht_id] ?? 0) + regel.aantal;
        }
        let po = perOrder.get(order.id);
        if (!po) {
            po = { order, regels: [], dieet: new Set() };
            perOrder.set(order.id, po);
        }
        po.regels.push(regel);
        if (a?.dieet) po.dieet.add(a.dieet);
    }

    const notities: string[] = [];
    for (const { order, regels, dieet } of perOrder.values()) {
        const w = order.wensen;
        if (w) {
            if (!dieet.has('vegetarisch')) veg += w.vegetarisch;
            if (!dieet.has('veganistisch')) vegan += w.veganistisch;
            gf += w.glutenvrij;
        }
        const wat = regels.map((r) => `${r.aantal}× ${r.naam}`).join(', ');
        const uit = wensenSamenvatting(w);
        let regel = `${order.nummer} · ${order.contact_naam} · ${wat}`;
        if (uit) regel += ` · uit opmerking: ${uit}`;
        else if (order.opmerking?.trim()) regel += ` · opmerking: "${order.opmerking.trim()}"`;
        notities.push(regel);
    }
    notities.sort();

    return { guests, veg_guests: veg, vegan_guests: vegan, gluten_free_guests: gf, menu, menu_gasten: menuGasten, notitie: notities.join('\n') };
}

/* ── Met opslag ────────────────────────────────────────────────────────────── */

export interface PlaatsingUitkomst {
    status: PlaatsingStatus;
    eventIds: number[];
    fout?: string;
}

/** Telt een event opnieuw uit alle betaalde regels erop. */
export async function hertelEvent(store: WinkelStore, orgId: string, eventId: number, artikelen?: Map<string, Artikel>): Promise<EventTotalen> {
    const art = artikelen ?? new Map((await store.laadArtikelen(orgId)).map((a) => [a.id, a]));
    const rijen = await store.laadBetaaldeRegelsOpEvent(eventId);
    const t = telTotalen(rijen, art);
    await store.werkEventTotalenBij(eventId, t);
    return t;
}

/**
 * Plaatst een betaalde order. Gooit nooit: een fout komt in plaatsing_status
 * 'mislukt' met de reden, en de betaling en de mail blijven wat ze zijn.
 */
export async function plaatsBestelling(store: WinkelStore, tenant: Tenant, order: OrderRij, nu: Date = new Date()): Promise<PlaatsingUitkomst> {
    try {
        if (order.status !== 'betaald') throw new Error(`Order ${order.nummer} is niet betaald (${order.status})`);
        const regels = await store.laadRegels(order.id);
        const artikelen = new Map((await store.laadArtikelen(tenant.orgId)).map((a) => [a.id, a]));
        const vandaag = vandaagISO(nu);
        const momenten = new Map<string, MomentRij>();
        const events = new Map<string, EventVakje>();
        const wijzigingen: { id: number; klaar_op: string; event_id: number | null }[] = [];
        const geraakt = new Set<number>();

        for (const r of regels) {
            const momentId = r.moment_id ?? order.moment_id;
            if (!momentId) {
                /* Vaste bak: vandaag, tenzij de regel al een dag had. */
                wijzigingen.push({ id: r.id, klaar_op: r.klaar_op || vandaag, event_id: r.event_id });
                if (r.event_id != null) geraakt.add(r.event_id);
                continue;
            }
            let moment = momenten.get(momentId);
            if (!moment) {
                const m = await store.laadMoment(momentId);
                if (!m) throw new Error(`Afhaalmoment van ${r.naam} bestaat niet meer`);
                momenten.set(momentId, m);
                moment = m;
            }
            let ev = events.get(momentId);
            if (!ev) {
                const namen = regels.filter((x) => (x.moment_id ?? order.moment_id) === momentId).map((x) => x.naam);
                ev = await store.vindOfMaakEvent({ orgId: tenant.orgId, momentId, naam: eventNaam(namen, moment.groep), datum: moment.datum, van: moment.van, tot: moment.tot });
                events.set(momentId, ev);
            }
            /* Al geplaatst → daar laten. */
            const eventId = r.event_id ?? ev.id;
            wijzigingen.push({ id: r.id, klaar_op: moment.datum, event_id: eventId });
            geraakt.add(eventId);
        }

        await store.werkRegelsBij(order.id, wijzigingen);
        for (const id of geraakt) await hertelEvent(store, tenant.orgId, id, artikelen);

        const status: PlaatsingStatus = geraakt.size > 0 ? 'geplaatst' : 'vaste_bak';
        await store.noteerPlaatsing(order.id, status, null);
        return { status, eventIds: [...geraakt] };
    } catch (e) {
        const fout = e instanceof Error ? e.message : 'onbekend';
        console.error('[winkel] plaatsing mislukt:', order.nummer, fout);
        await store.noteerPlaatsing(order.id, 'mislukt', fout).catch(() => undefined);
        return { status: 'mislukt', eventIds: [], fout };
    }
}
