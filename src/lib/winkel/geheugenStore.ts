/**
 * De kassa-opslag in het geheugen — voor de route-tests.
 *
 * Doet hetzelfde als de databasefuncties, zonder vergrendeling (tests zijn
 * niet gelijktijdig). Wat hier klopt, bewijst de service en de routes; wat de
 * database onder vergrendeling doet staat in de migratie en is apart getest
 * in de end-to-end-doorloop.
 */
import type { Artikel, Instellingen, MomentRij, Product, Slot } from './rekenen';
import { vandaagISO } from './rekenen';
import type { Bronnen, ComponentRij, EventTotalen, NieuweOrder, OpslagUitkomst, OrderRegelRij, OrderRij, Tenant, WinkelStore } from './store';

/** Een event zoals de plaatsing hem aanmaakt en bijtelt (de kolommen die de keuken leest). */
export interface EventGeheugen extends EventTotalen {
    id: number;
    organization_id: string;
    winkel_moment_id: string;
    name: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    status: string;
    type: string;
}

interface Geheugen {
    tenant: Tenant;
    artikelen: Artikel[];
    momenten: Omit<MomentRij, 'bezet'>[];
    /** Producten en slots (templates); ontbreekt = geen templates. */
    producten?: Omit<Product, 'voorraad_bezet'>[];
    slots?: Slot[];
    instellingen: Instellingen & { site_url: string | null; qr_basis_url?: string | null };
    nu: () => Date;
}

export interface GeheugenStore extends WinkelStore {
    orders: (OrderRij & { regels: OrderRegelRij[] })[];
    /** De componenten per regel, zoals vastgelegd bij het plaatsen. */
    componenten: ComponentRij[];
    berichten: { referentie: string; uitkomst: string | null }[];
    /** De events die de plaatsing heeft aangemaakt. */
    events: EventGeheugen[];
    /** Verzet de klok (voor 'verlopen'). */
    zetNu(d: Date): void;
}

export function maakGeheugenStore(g: Omit<Geheugen, 'nu'> & { nu?: Date }): GeheugenStore {
    let nu = g.nu ?? new Date();
    const orders: GeheugenStore['orders'] = [];
    const componenten: ComponentRij[] = [];
    const berichten: GeheugenStore['berichten'] = [];
    const events: EventGeheugen[] = [];
    let teller = 0;
    let regelTeller = 0;
    let eventTeller = 0;
    let componentTeller = 0;

    const telt = (o: OrderRij) => o.status === 'betaald' || (o.status === 'wacht' && new Date(o.reservering_tot).getTime() > nu.getTime());
    const bezetMoment = (id: string, zonder: number | null) =>
        orders.filter((o) => o.id !== zonder && telt(o)).flatMap((o) => o.regels).filter((r) => r.moment_id === id).reduce((s, r) => s + r.eenheden, 0);
    const bezetVoorraad = (artikelId: string, zonder: number | null) =>
        orders.filter((o) => o.id !== zonder && telt(o)).flatMap((o) => o.regels.map((r) => ({ r, o }))).filter(({ r }) => g.artikelen.find((a) => a.slug === r.slug)?.id === artikelId).reduce((s, { r }) => s + r.voorraad_eenheden, 0);
    /* Productvoorraad: de componenten van betaalde en lopende orders. */
    const bezetProduct = (productId: string, zonder: number | null) => {
        const regelIds = new Set(orders.filter((o) => o.id !== zonder && telt(o)).flatMap((o) => o.regels.map((r) => r.id)));
        return componenten.filter((c) => c.product_id === productId && regelIds.has(c.order_regel_id)).reduce((s, c) => s + c.hoeveelheid, 0);
    };

    function controleer(regels: OrderRegelRij[], nieuweComponenten: { product_id: string | null; hoeveelheid: number }[], zonder: number | null): OpslagUitkomst<true> {
        const perMoment = new Map<string, number>();
        for (const r of regels) if (r.moment_id) perMoment.set(r.moment_id, (perMoment.get(r.moment_id) ?? 0) + r.eenheden);
        for (const [id, nodig] of perMoment) {
            const m = g.momenten.find((x) => x.id === id);
            if (!m || !m.actief) return { ok: false, code: 'WK003' };
            if (m.capaciteit != null && bezetMoment(id, zonder) + nodig > m.capaciteit) return { ok: false, code: 'WK001' };
        }
        const perProduct = new Map<string, number>();
        for (const c of nieuweComponenten) if (c.product_id) perProduct.set(c.product_id, (perProduct.get(c.product_id) ?? 0) + c.hoeveelheid);
        for (const [id, nodig] of perProduct) {
            const p = (g.producten ?? []).find((x) => x.id === id);
            if (p && p.voorraad != null && bezetProduct(id, zonder) + nodig > p.voorraad) return { ok: false, code: 'WK009', detail: p.naam };
        }
        const perArtikel = new Map<string, number>();
        for (const r of regels) {
            const a = g.artikelen.find((x) => x.slug === r.slug);
            if (!a || !a.actief) return { ok: false, code: 'WK004' };
            perArtikel.set(a.id, (perArtikel.get(a.id) ?? 0) + r.voorraad_eenheden);
        }
        for (const [id, nodig] of perArtikel) {
            const a = g.artikelen.find((x) => x.id === id)!;
            if (a.voorraad != null && bezetVoorraad(id, zonder) + nodig > a.voorraad) return { ok: false, code: 'WK002' };
        }
        return { ok: true, waarde: true };
    }

    const eigenComponenten = (o: { regels: OrderRegelRij[] }) => {
        const ids = new Set(o.regels.map((r) => r.id));
        return componenten.filter((c) => ids.has(c.order_regel_id));
    };

    const zonderRegels = (o: OrderRij & { regels: OrderRegelRij[] }): OrderRij => {
        const { regels: _r, ...rest } = o;
        return { ...rest };
    };

    return {
        orders,
        componenten,
        berichten,
        events,
        zetNu(d) { nu = d; },

        async laadTenant(slug) { return slug === g.tenant.slug ? g.tenant : null; },
        async laadBronnen(orgId): Promise<Bronnen | null> {
            if (orgId !== g.tenant.orgId) return null;
            return {
                artikelen: g.artikelen.map((a) => (a.voorraad == null ? a : { ...a, voorraad_bezet: bezetVoorraad(a.id, null) })),
                momenten: g.momenten.map((m) => ({ ...m, bezet: bezetMoment(m.id, null) })),
                producten: (g.producten ?? []).map((p) => (p.voorraad == null ? p : { ...p, voorraad_bezet: bezetProduct(p.id, null) })),
                slots: g.slots ?? [],
                instellingen: g.instellingen,
            };
        },
        async laadMoment(id) {
            const m = g.momenten.find((x) => x.id === id);
            return m ? { ...m, bezet: bezetMoment(id, null) } : null;
        },
        async vindOrderOpSleutel(orgId, sleutel) {
            const o = orders.find((x) => x.organization_id === orgId && x.sleutel === sleutel && x.status !== 'verlopen');
            return o ? zonderRegels(o) : null;
        },
        async vindOrderOpToken(orgId, token) {
            const o = orders.find((x) => x.organization_id === orgId && x.token === token);
            return o ? zonderRegels(o) : null;
        },
        async vindOrderOpNummer(orgId, nummer) {
            const o = orders.find((x) => x.organization_id === orgId && x.nummer === nummer);
            return o ? zonderRegels(o) : null;
        },
        async laadRegels(orderId) { return orders.find((x) => x.id === orderId)?.regels ?? []; },
        async laadComponenten(orderId) {
            const ids = new Set((orders.find((x) => x.id === orderId)?.regels ?? []).map((r) => r.id));
            return componenten.filter((c) => ids.has(c.order_regel_id));
        },
        async boekRest(orderId, methode) {
            const o = orders.find((x) => x.id === orderId);
            if (!o) return 'onbekend';
            if (o.status !== 'betaald') return 'niet_betaald';
            if (o.rest_betaald_at) return 'al_geboekt';
            if (o.rest_cents === 0) return 'geen_rest';
            o.rest_betaald_at = nu.toISOString();
            o.rest_betaalmethode = methode;
            return 'geboekt';
        },

        async plaatsOrder(n) {
            /* Zonder await tussen zoeken en schrijven: zo is dit, net als de
               databasefunctie onder vergrendeling, één ondeelbare stap. */
            const bestaand = orders.find((x) => x.organization_id === n.orgId && x.sleutel === n.sleutel && x.status !== 'verlopen');
            if (bestaand) return { ok: true, waarde: zonderRegels(bestaand) };
            /* klaar_op zoals de databasetrigger: het moment op de regel, anders
               het moment van de order, anders vandaag. */
            const datumVan = (id: string | null) => (id ? g.momenten.find((m) => m.id === id)?.datum ?? null : null);
            const regels: OrderRegelRij[] = n.regels.map((r) => ({
                id: ++regelTeller, artikel_id: r.artikel_id,
                slug: r.slug, naam: r.naam, aantal: r.aantal, eenheid: r.eenheid, stuk_cents: r.stukCenten, bedrag_cents: r.bedragCenten,
                btw_pct: r.btw_pct, moment_id: r.moment_id, eenheden: r.eenheden, voorraad_eenheden: r.voorraad_eenheden, afhaalmoment_tekst: r.afhaalmoment,
                klaar_op: datumVan(r.moment_id) ?? datumVan(n.momentId) ?? vandaagISO(nu), event_id: null, klaargezet_at: null,
                btw_cents: r.btw_cents, alcohol: r.alcohol,
            }));
            const nieuweComponenten: ComponentRij[] = n.regels.flatMap((r, i) => (r.componenten ?? []).map((c) => ({ ...c, id: ++componentTeller, order_regel_id: regels[i]!.id })));
            const c = controleer(regels, nieuweComponenten, null);
            if (c.ok === false) return { ok: false, code: c.code, detail: c.detail };
            teller += 1;
            const o: OrderRij & { regels: OrderRegelRij[] } = {
                id: teller,
                organization_id: n.orgId,
                nummer: `HB-${nu.getFullYear()}-${String(teller).padStart(4, '0')}`,
                token: n.token,
                sleutel: n.sleutel,
                status: 'wacht',
                status_reden: null,
                leverwijze: n.leverwijze,
                moment_id: n.momentId,
                contact_naam: n.contact.naam,
                contact_email: n.contact.email,
                contact_telefoon: n.contact.telefoon || null,
                adres: n.adres,
                opmerking: n.opmerking || null,
                subtotaal_cents: n.subtotaalCenten,
                leverkosten_cents: n.leverkostenCenten,
                totaal_cents: n.totaalCenten,
                btw_cents: n.btwCenten,
                reservering_tot: new Date(nu.getTime() + g.instellingen.reservering_minuten * 60_000).toISOString(),
                terug_url: n.terugUrl,
                betaalpoging: 0,
                mypos_order_id: null,
                mypos_trnref: null,
                betaald_cents: null,
                betaald_at: null,
                betaalmethode: null,
                refund_status: null,
                refund_fout: null,
                mail_status: 'niet_verstuurd',
                mail_fout: null,
                created_at: nu.toISOString(),
                wensen: null, wensen_bron: null, plaatsing_status: null, plaatsing_fout: null, plaatsing_at: null,
                betaalwijze: n.betaalwijze, nu_te_betalen_cents: n.nuTeBetalenCenten, rest_cents: n.restCenten, rest_betaald_at: null, rest_betaalmethode: null,
                regels,
            };
            orders.push(o);
            componenten.push(...nieuweComponenten);
            return { ok: true, waarde: zonderRegels(o) };
        },

        async startBetaalpoging(orderId) {
            const o = orders.find((x) => x.id === orderId);
            if (!o) return { ok: false, code: 'WK006' };
            if (o.status === 'betaald') return { ok: false, code: 'WK007' };
            if (o.status === 'wacht' && new Date(o.reservering_tot).getTime() > nu.getTime() && o.betaalpoging > 0) return { ok: true, waarde: zonderRegels(o) };
            const c = controleer(o.regels, eigenComponenten(o), o.id);
            if (c.ok === false) return { ok: false, code: c.code };
            o.status = 'wacht';
            o.status_reden = null;
            o.reservering_tot = new Date(nu.getTime() + g.instellingen.reservering_minuten * 60_000).toISOString();
            o.betaalpoging += 1;
            o.mypos_order_id = `${o.nummer}-${o.betaalpoging}-${o.token.slice(0, 6)}`;
            return { ok: true, waarde: zonderRegels(o) };
        },

        async bevestigBetaling(orderId, b) {
            const o = orders.find((x) => x.id === orderId);
            if (!o) return 'onbekend';
            if (o.status === 'betaald') return 'al_betaald';
            if (o.status !== 'wacht' || new Date(o.reservering_tot).getTime() <= nu.getTime()) {
                const c = controleer(o.regels, eigenComponenten(o), o.id);
                if (!c.ok) {
                    Object.assign(o, { status: 'mislukt', status_reden: 'verlopen-en-vol', mypos_trnref: b.trnref, betaald_cents: b.centen, betaalmethode: b.methode, refund_status: 'nodig' });
                    return 'vol';
                }
            }
            Object.assign(o, { status: 'betaald', status_reden: null, mypos_trnref: b.trnref, betaald_cents: b.centen, betaald_at: nu.toISOString(), betaalmethode: b.methode });
            return 'betaald';
        },

        async zetStatus(orderId, status, reden = null) {
            const o = orders.find((x) => x.id === orderId);
            if (o) { o.status = status; o.status_reden = reden; }
        },

        async registreerBetaalbericht(_orgId, referentie) {
            if (berichten.some((b) => b.referentie === referentie)) return false;
            berichten.push({ referentie, uitkomst: null });
            return true;
        },
        async noteerBetaalberichtUitkomst(_orgId, referentie, uitkomst) {
            const b = berichten.find((x) => x.referentie === referentie);
            if (b) b.uitkomst = uitkomst;
        },
        async noteerRefund(orderId, status, fout = null) {
            const o = orders.find((x) => x.id === orderId);
            if (o) { o.refund_status = status; o.refund_fout = fout; }
        },
        async noteerMail(orderId, status, fout = null) {
            const o = orders.find((x) => x.id === orderId);
            if (o) { o.mail_status = status; o.mail_fout = fout; }
        },

        /* ── Vakjes ── */
        async laadArtikelen(orgId) { return orgId === g.tenant.orgId ? g.artikelen : []; },
        async vindOfMaakEvent(e) {
            const bestaand = events.find((x) => x.winkel_moment_id === e.momentId);
            if (bestaand) return { id: bestaand.id, winkel_moment_id: bestaand.winkel_moment_id, name: bestaand.name };
            const ev: EventGeheugen = {
                id: ++eventTeller, organization_id: e.orgId, winkel_moment_id: e.momentId, name: e.naam,
                date: e.datum, start_time: e.van, end_time: e.tot, status: 'confirmed', type: 'Webshop',
                guests: 0, veg_guests: 0, vegan_guests: 0, gluten_free_guests: 0, menu: [], menu_gasten: {}, notitie: '',
            };
            events.push(ev);
            return { id: ev.id, winkel_moment_id: ev.winkel_moment_id, name: ev.name };
        },
        async werkRegelsBij(orderId, wijzigingen) {
            const o = orders.find((x) => x.id === orderId);
            if (!o) return;
            for (const w of wijzigingen) {
                const r = o.regels.find((x) => x.id === w.id);
                if (r) { r.klaar_op = w.klaar_op; r.event_id = w.event_id; }
            }
        },
        async laadBetaaldeRegelsOpEvent(eventId) {
            return orders
                .filter((o) => o.status === 'betaald')
                .flatMap((o) => o.regels.filter((r) => r.event_id === eventId).map((regel) => ({
                    regel, order: { id: o.id, nummer: o.nummer, contact_naam: o.contact_naam, opmerking: o.opmerking, wensen: o.wensen },
                })));
        },
        async werkEventTotalenBij(eventId, t) {
            const ev = events.find((x) => x.id === eventId);
            if (ev) Object.assign(ev, t);
        },
        async noteerPlaatsing(orderId, status, fout = null) {
            const o = orders.find((x) => x.id === orderId);
            if (o) { o.plaatsing_status = status; o.plaatsing_fout = fout; o.plaatsing_at = nu.toISOString(); }
        },
    };
}
