/**
 * De echte opslag van de kassa: Supabase met de service-role client.
 *
 * Geen anon-policy op de winkel_-tabellen; de publieke routes lopen hier
 * doorheen, net als /api/public-bestelling. Alles wat atomair moet zijn gaat
 * via de databasefuncties uit de migratie (winkel_plaats_order,
 * winkel_start_betaalpoging, winkel_bevestig_betaling); deze module vertaalt
 * alleen hun SQLSTATE-codes naar OpslagUitkomst.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceSupabase } from '@/lib/supabase-server';
import type { Artikel, MomentRij, Product, Slot } from './rekenen';
import { vandaagISO } from './rekenen';
import type { Bronnen, ComponentRij, EventVakje, NieuweOrder, OpslagCode, OpslagUitkomst, OrderRegelRij, OrderRij, RegelOpEvent, Tenant, WinkelStore } from './store';

const ORDER_KOLOMMEN = 'id, organization_id, nummer, token, sleutel, status, status_reden, leverwijze, moment_id, contact_naam, contact_email, contact_telefoon, adres, opmerking, subtotaal_cents, leverkosten_cents, totaal_cents, btw_cents, reservering_tot, terug_url, betaalpoging, mypos_order_id, mypos_trnref, betaald_cents, betaald_at, betaalmethode, refund_status, refund_fout, mail_status, mail_fout, created_at, wensen, wensen_bron, plaatsing_status, plaatsing_fout, plaatsing_at, betaalwijze, nu_te_betalen_cents, rest_cents, rest_betaald_at, rest_betaalmethode';
const ARTIKEL_KOLOMMEN = 'id, slug, naam, eenheid, telt, prijs_cents, btw_pct, minimum, maximum, verzendbaar, gekoeld, moment_soort, moment_groep, afhaalmoment_tekst, capaciteit_soort, doos_klein_max, doos_groot, voorraad, actief, publiek, gerecht_id, inventory_id, inkoop_per_stuk, dieet, segment, vast, alcohol, schaal_verdeling, btw_verdeling, verpakking_klein_cents, verpakking_groot_cents';
const REGEL_KOLOMMEN = 'id, artikel_id, slug, naam, aantal, eenheid, stuk_cents, bedrag_cents, btw_pct, moment_id, eenheden, voorraad_eenheden, afhaalmoment_tekst, klaar_op, event_id, klaargezet_at, btw_cents, alcohol';
const PRODUCT_KOLOMMEN = 'id, naam, type, eenheid, prijs_per, winkelprijs_incl_cents, inkoop_excl_cents, btw_pct, alcohol, voorraad, actief';
const SLOT_KOLOMMEN = 'id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id, wisselbaar, alternatieven';
const MOMENT_KOLOMMEN = 'id, groep, datum, van, tot, capaciteit, bestellen_tot, sluit_op, actief';

function code(e: { code?: string | null; message?: string } | null): OpslagCode {
    const c = e?.code ?? '';
    return /^WK00[1-9]$/.test(c) ? (c as OpslagCode) : 'onbekend';
}

function eenRij<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T) ?? null;
    return (data as T) ?? null;
}

export function maakSupabaseStore(client?: SupabaseClient): WinkelStore {
    const sb = client ?? createServiceSupabase();

    return {
        async laadTenant(slug) {
            const { data: org } = await sb.from('organizations').select('id, slug').eq('slug', slug).maybeSingle();
            if (!org) return null;
            const { data: s } = await sb
                .from('settings')
                .select('bedrijfsnaam, ondertitel, email, telefoon, brand_primary')
                .eq('organization_id', org.id)
                .maybeSingle();
            return {
                orgId: org.id,
                slug: org.slug,
                bedrijfsnaam: s?.bedrijfsnaam || 'Hop & Bites',
                email: s?.email || null,
                telefoon: s?.telefoon || null,
                brandColor: s?.brand_primary || null,
                ondertitel: s?.ondertitel || null,
            };
        },

        async laadBronnen(orgId) {
            const { data: inst } = await sb
                .from('winkel_instellingen')
                .select('verzendkosten_cents, gratis_verzenden_vanaf_cents, verzendkosten_btw_pct, reservering_minuten, offerte_geldig_minuten, kassa_open, site_url, reservering_bedrag_cents, qr_basis_url')
                .eq('organization_id', orgId)
                .maybeSingle();
            if (!inst) return null;

            const { data: artikelen } = await sb
                .from('winkel_artikelen')
                .select(ARTIKEL_KOLOMMEN)
                .eq('organization_id', orgId);

            /* Momenten vanaf vandaag, met de bezetting erbij geteld: betaald plus
               lopende reserveringen. Eén query per moment is te veel; daarom de
               regels in één keer ophalen en hier optellen. */
            const { data: momenten } = await sb
                .from('winkel_momenten')
                .select(MOMENT_KOLOMMEN)
                .eq('organization_id', orgId)
                .gte('datum', vandaagISO())
                .order('datum', { ascending: true })
                .order('van', { ascending: true, nullsFirst: true });

            const ids = (momenten ?? []).map((m) => m.id);
            const bezet = new Map<string, number>();
            if (ids.length) {
                const { data: regels } = await sb
                    .from('winkel_order_regels')
                    .select('moment_id, eenheden, winkel_orders!inner(status, reservering_tot)')
                    .in('moment_id', ids);
                const nu = Date.now();
                for (const r of (regels ?? []) as unknown as { moment_id: string; eenheden: number; winkel_orders: { status: string; reservering_tot: string } }[]) {
                    const o = r.winkel_orders;
                    const telt = o.status === 'betaald' || (o.status === 'wacht' && new Date(o.reservering_tot).getTime() > nu);
                    if (telt) bezet.set(r.moment_id, (bezet.get(r.moment_id) ?? 0) + r.eenheden);
                }
            }

            /* Voorraad: alleen voor artikelen met een voorraadgetal. */
            const metVoorraad = (artikelen ?? []).filter((a) => a.voorraad != null).map((a) => a.id);
            const voorraadBezet = new Map<string, number>();
            if (metVoorraad.length) {
                const { data: regels } = await sb
                    .from('winkel_order_regels')
                    .select('artikel_id, voorraad_eenheden, winkel_orders!inner(status, reservering_tot)')
                    .in('artikel_id', metVoorraad)
                    .gt('voorraad_eenheden', 0);
                const nu = Date.now();
                for (const r of (regels ?? []) as unknown as { artikel_id: string; voorraad_eenheden: number; winkel_orders: { status: string; reservering_tot: string } }[]) {
                    const o = r.winkel_orders;
                    const telt = o.status === 'betaald' || (o.status === 'wacht' && new Date(o.reservering_tot).getTime() > nu);
                    if (telt) voorraadBezet.set(r.artikel_id, (voorraadBezet.get(r.artikel_id) ?? 0) + r.voorraad_eenheden);
                }
            }

            /* Templates: producten (met bezetting waar er een voorraadgetal is) en slots. */
            const [{ data: producten }, { data: slots }] = await Promise.all([
                sb.from('winkel_producten').select(PRODUCT_KOLOMMEN).eq('organization_id', orgId),
                sb.from('winkel_artikel_slots').select(SLOT_KOLOMMEN).eq('organization_id', orgId).order('volgorde', { ascending: true }),
            ]);
            const productBezet = new Map<string, number>();
            for (const p of producten ?? []) {
                if (p.voorraad == null) continue;
                const { data: n } = await sb.rpc('winkel_bezetting_product', { p_product_id: p.id, p_zonder_order: null });
                productBezet.set(p.id, Number(n ?? 0));
            }

            return {
                artikelen: (artikelen ?? []).map((a) => (a.voorraad == null ? a : { ...a, voorraad_bezet: voorraadBezet.get(a.id) ?? 0 })) as Artikel[],
                momenten: (momenten ?? []).map((m) => ({ ...m, bezet: bezet.get(m.id) ?? 0 })) as MomentRij[],
                producten: (producten ?? []).map((p) => ({ ...p, prijs_per: Number(p.prijs_per), voorraad: p.voorraad == null ? null : Number(p.voorraad), voorraad_bezet: p.voorraad == null ? undefined : productBezet.get(p.id) ?? 0 })) as Product[],
                slots: (slots ?? []).map((s) => ({ ...s, hoeveelheid: Number(s.hoeveelheid), alternatieven: s.alternatieven ?? [] })) as Slot[],
                instellingen: inst,
            };
        },

        async laadMoment(id) {
            const { data: m } = await sb
                .from('winkel_momenten')
                .select(MOMENT_KOLOMMEN)
                .eq('id', id)
                .maybeSingle();
            if (!m) return null;
            const { data: bezet } = await sb.rpc('winkel_bezetting_moment', { p_moment_id: id, p_zonder_order: null });
            return { ...m, bezet: Number(bezet ?? 0) } as MomentRij;
        },

        async vindOrderOpSleutel(orgId, sleutel) {
            const { data } = await sb.from('winkel_orders').select(ORDER_KOLOMMEN).eq('organization_id', orgId).eq('sleutel', sleutel).neq('status', 'verlopen').maybeSingle();
            return (data as OrderRij | null) ?? null;
        },
        async vindOrderOpToken(orgId, token) {
            const { data } = await sb.from('winkel_orders').select(ORDER_KOLOMMEN).eq('organization_id', orgId).eq('token', token).maybeSingle();
            return (data as OrderRij | null) ?? null;
        },
        async vindOrderOpNummer(orgId, nummer) {
            const { data } = await sb.from('winkel_orders').select(ORDER_KOLOMMEN).eq('organization_id', orgId).eq('nummer', nummer).maybeSingle();
            return (data as OrderRij | null) ?? null;
        },
        async laadRegels(orderId) {
            const { data } = await sb
                .from('winkel_order_regels')
                .select(REGEL_KOLOMMEN)
                .eq('order_id', orderId)
                .order('id', { ascending: true });
            return (data ?? []) as OrderRegelRij[];
        },

        async laadComponenten(orderId) {
            const { data } = await sb
                .from('winkel_order_regel_componenten')
                .select('id, order_regel_id, product_id, slot_type, naam, hoeveelheid, eenheid, winkel_order_regels!inner(order_id)')
                .eq('winkel_order_regels.order_id', orderId)
                .order('id', { ascending: true });
            return ((data ?? []) as unknown as (ComponentRij & { winkel_order_regels: unknown })[]).map(({ winkel_order_regels: _r, ...c }) => ({ ...c, hoeveelheid: Number(c.hoeveelheid) }));
        },
        async boekRest(orderId, methode) {
            const { data, error } = await sb.rpc('winkel_boek_rest', { p_order_id: orderId, p_methode: methode });
            if (error) { console.error('[winkel] winkel_boek_rest faalde:', error.code, error.message); return 'onbekend'; }
            const u = String(data);
            return u === 'geboekt' || u === 'al_geboekt' || u === 'geen_rest' || u === 'niet_betaald' ? u : 'onbekend';
        },

        /* ── Vakjes (plan §4) ── */
        async laadArtikelen(orgId) {
            const { data } = await sb.from('winkel_artikelen').select(ARTIKEL_KOLOMMEN).eq('organization_id', orgId);
            return (data ?? []) as Artikel[];
        },
        async vindOfMaakEvent(e): Promise<EventVakje> {
            const zoek = async () => {
                const { data } = await sb.from('events').select('id, winkel_moment_id, name').eq('winkel_moment_id', e.momentId).maybeSingle();
                return (data as EventVakje | null) ?? null;
            };
            const bestaand = await zoek();
            if (bestaand) return bestaand;
            /* organization_id altijd expliciet; de service-role client heeft geen default. */
            const { data, error } = await sb
                .from('events')
                .insert({
                    organization_id: e.orgId, winkel_moment_id: e.momentId, name: e.naam,
                    date: e.datum, start_time: e.van, end_time: e.tot,
                    status: 'confirmed', type: 'Webshop', guests: 0, menu: [], menu_gasten: {},
                })
                .select('id, winkel_moment_id, name')
                .single();
            if (!error && data) return data as EventVakje;
            /* Unieke index: een andere webhook was ons net voor. Dan lezen we die. */
            if (error?.code === '23505') {
                const alsnog = await zoek();
                if (alsnog) return alsnog;
            }
            throw new Error(`Event aanmaken mislukt: ${error?.message ?? 'onbekend'}`);
        },
        async werkRegelsBij(orderId, wijzigingen) {
            for (const w of wijzigingen) {
                const { error } = await sb.from('winkel_order_regels').update({ klaar_op: w.klaar_op, event_id: w.event_id }).eq('id', w.id).eq('order_id', orderId);
                if (error) throw new Error(`Regel bijwerken mislukt: ${error.message}`);
            }
        },
        async laadBetaaldeRegelsOpEvent(eventId) {
            const { data, error } = await sb
                .from('winkel_order_regels')
                .select(`${REGEL_KOLOMMEN}, winkel_orders!inner(id, nummer, contact_naam, opmerking, wensen, status)`)
                .eq('event_id', eventId)
                .eq('winkel_orders.status', 'betaald')
                .order('id', { ascending: true });
            if (error) throw new Error(`Regels op event laden mislukt: ${error.message}`);
            return ((data ?? []) as unknown as (OrderRegelRij & { winkel_orders: RegelOpEvent['order'] })[]).map(({ winkel_orders, ...regel }) => ({ regel, order: winkel_orders }));
        },
        async werkEventTotalenBij(eventId, t) {
            const { error } = await sb.from('events').update({
                guests: t.guests, veg_guests: t.veg_guests, vegan_guests: t.vegan_guests, gluten_free_guests: t.gluten_free_guests,
                menu: t.menu, menu_gasten: t.menu_gasten, notitie: t.notitie,
            }).eq('id', eventId);
            if (error) throw new Error(`Event bijtellen mislukt: ${error.message}`);
        },
        async noteerPlaatsing(orderId, status, fout = null) {
            await sb.from('winkel_orders').update({ plaatsing_status: status, plaatsing_fout: fout, plaatsing_at: new Date().toISOString() }).eq('id', orderId);
        },

        async plaatsOrder(o): Promise<OpslagUitkomst<OrderRij>> {
            const { data, error } = await sb.rpc('winkel_plaats_order', {
                p_organization_id: o.orgId,
                p_sleutel: o.sleutel,
                p_token: o.token,
                p_leverwijze: o.leverwijze,
                p_moment_id: o.momentId,
                p_contact_naam: o.contact.naam,
                p_contact_email: o.contact.email,
                p_contact_telefoon: o.contact.telefoon || null,
                p_adres: o.adres,
                p_opmerking: o.opmerking || null,
                p_subtotaal_cents: o.subtotaalCenten,
                p_leverkosten_cents: o.leverkostenCenten,
                p_totaal_cents: o.totaalCenten,
                p_btw_cents: o.btwCenten,
                p_terug_url: o.terugUrl,
                p_regels: o.regels.map((r) => ({
                    artikel_id: r.artikel_id, slug: r.slug, naam: r.naam, aantal: r.aantal, eenheid: r.eenheid,
                    stuk_cents: r.stukCenten, bedrag_cents: r.bedragCenten, btw_pct: r.btw_pct, btw_cents: r.btw_cents, alcohol: r.alcohol, moment_id: r.moment_id,
                    eenheden: r.eenheden, voorraad_eenheden: r.voorraad_eenheden, afhaalmoment_tekst: r.afhaalmoment,
                    componenten: r.componenten.map((c) => ({ product_id: c.product_id, slot_type: c.slot_type, naam: c.naam, hoeveelheid: c.hoeveelheid, eenheid: c.eenheid })),
                })),
                p_betaalwijze: o.betaalwijze,
                p_nu_te_betalen_cents: o.nuTeBetalenCenten,
                p_rest_cents: o.restCenten,
            });
            if (error) {
                if (code(error) === 'onbekend') console.error('[winkel] winkel_plaats_order faalde:', error.code, error.message);
                return { ok: false, code: code(error), detail: error.message };
            }
            const rij = eenRij<OrderRij>(data);
            return rij ? { ok: true, waarde: rij } : { ok: false, code: 'onbekend' };
        },

        async startBetaalpoging(orderId) {
            const { data, error } = await sb.rpc('winkel_start_betaalpoging', { p_order_id: orderId });
            if (error) {
                if (code(error) === 'onbekend') console.error('[winkel] winkel_start_betaalpoging faalde:', error.code, error.message);
                return { ok: false, code: code(error), detail: error.message };
            }
            const rij = eenRij<OrderRij>(data);
            return rij ? { ok: true, waarde: rij } : { ok: false, code: 'onbekend' };
        },

        async bevestigBetaling(orderId, b) {
            const { data, error } = await sb.rpc('winkel_bevestig_betaling', {
                p_order_id: orderId, p_trnref: b.trnref, p_bedrag_cents: b.centen, p_methode: b.methode,
            });
            if (error) {
                console.error('[winkel] winkel_bevestig_betaling faalde:', error.code, error.message);
                return 'onbekend';
            }
            const u = String(data);
            return u === 'betaald' || u === 'al_betaald' || u === 'vol' ? u : 'onbekend';
        },

        async zetStatus(orderId, status, reden = null) {
            await sb.from('winkel_orders').update({ status, status_reden: reden }).eq('id', orderId);
        },

        async registreerBetaalbericht(orgId, referentie, methode, payload, orderId) {
            const { error } = await sb.from('winkel_betaalberichten').insert({
                organization_id: orgId, referentie, methode, payload, order_id: orderId,
            });
            if (!error) return true;
            if (error.code === '23505') return false;
            console.error('[winkel] betaalbericht registreren faalde:', error.code, error.message);
            throw new Error(error.message);
        },
        async noteerBetaalberichtUitkomst(orgId, referentie, uitkomst) {
            await sb.from('winkel_betaalberichten').update({ uitkomst }).eq('organization_id', orgId).eq('referentie', referentie);
        },
        async noteerRefund(orderId, status, fout = null) {
            await sb.from('winkel_orders').update({ refund_status: status, refund_fout: fout }).eq('id', orderId);
        },
        async noteerMail(orderId, status, fout = null) {
            await sb.from('winkel_orders').update({
                mail_status: status, mail_fout: fout, mail_verstuurd_at: status === 'verstuurd' ? new Date().toISOString() : null,
            }).eq('id', orderId);
        },
    };
}
