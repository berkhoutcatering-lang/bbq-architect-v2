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
import type { Artikel, MomentRij } from './rekenen';
import { vandaagISO } from './rekenen';
import type { Bronnen, NieuweOrder, OpslagCode, OpslagUitkomst, OrderRegelRij, OrderRij, Tenant, WinkelStore } from './store';

const ORDER_KOLOMMEN = 'id, organization_id, nummer, token, sleutel, status, status_reden, leverwijze, moment_id, contact_naam, contact_email, contact_telefoon, adres, opmerking, subtotaal_cents, leverkosten_cents, totaal_cents, btw_cents, reservering_tot, terug_url, betaalpoging, mypos_order_id, mypos_trnref, betaald_cents, betaald_at, betaalmethode, refund_status, refund_fout, mail_status, mail_fout, created_at';

function code(e: { code?: string | null; message?: string } | null): OpslagCode {
    const c = e?.code ?? '';
    return /^WK00[1-7]$/.test(c) ? (c as OpslagCode) : 'onbekend';
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
                .select('verzendkosten_cents, gratis_verzenden_vanaf_cents, verzendkosten_btw_pct, reservering_minuten, offerte_geldig_minuten, kassa_open, site_url')
                .eq('organization_id', orgId)
                .maybeSingle();
            if (!inst) return null;

            const { data: artikelen } = await sb
                .from('winkel_artikelen')
                .select('id, slug, naam, eenheid, telt, prijs_cents, btw_pct, minimum, maximum, verzendbaar, gekoeld, moment_soort, moment_groep, afhaalmoment_tekst, capaciteit_soort, doos_klein_max, doos_groot, voorraad, actief, publiek')
                .eq('organization_id', orgId);

            /* Momenten vanaf vandaag, met de bezetting erbij geteld: betaald plus
               lopende reserveringen. Eén query per moment is te veel; daarom de
               regels in één keer ophalen en hier optellen. */
            const { data: momenten } = await sb
                .from('winkel_momenten')
                .select('id, groep, datum, van, tot, capaciteit, bestellen_tot, actief')
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

            return {
                artikelen: (artikelen ?? []).map((a) => (a.voorraad == null ? a : { ...a, voorraad_bezet: voorraadBezet.get(a.id) ?? 0 })) as Artikel[],
                momenten: (momenten ?? []).map((m) => ({ ...m, bezet: bezet.get(m.id) ?? 0 })) as MomentRij[],
                instellingen: inst,
            };
        },

        async laadMoment(id) {
            const { data: m } = await sb
                .from('winkel_momenten')
                .select('id, groep, datum, van, tot, capaciteit, bestellen_tot, actief')
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
                .select('slug, naam, aantal, eenheid, stuk_cents, bedrag_cents, btw_pct, moment_id, eenheden, voorraad_eenheden, afhaalmoment_tekst')
                .eq('order_id', orderId)
                .order('id', { ascending: true });
            return (data ?? []) as OrderRegelRij[];
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
                    stuk_cents: r.stukCenten, bedrag_cents: r.bedragCenten, btw_pct: r.btw_pct, moment_id: r.moment_id,
                    eenheden: r.eenheden, voorraad_eenheden: r.voorraad_eenheden, afhaalmoment_tekst: r.afhaalmoment,
                })),
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
