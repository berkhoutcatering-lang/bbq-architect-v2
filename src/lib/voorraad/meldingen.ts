/**
 * Voorraadmeldingen (W4): de bel, direct mail bij "op" en "artikel dicht",
 * en het overzicht van 8:00.
 *
 *   1. meldingRegels.ts rekent uit welke meldingen er nu aan horen te staan.
 *   2. Hier wordt dat vergeleken met voorraad_melding_staat. Alleen een
 *      nieuwe rij wordt een melding (notifications); wat weer boven de grens
 *      zit, verdwijnt uit de staat. Zo komt er één melding per keer dat iets
 *      onder de grens zakt, hoe vaak er ook gemuteerd wordt.
 *   3. De insert gebeurt met ON CONFLICT DO NOTHING: bij twee gelijktijdige
 *      evaluaties maakt alleen de winnaar een melding.
 *
 * Wordt aangeroepen na elke winkelmutatie, na een bevestigde betaling en door
 * de cron van 8:00. Een fout hier mag een mutatie nooit laten mislukken: de
 * voorraad is dan al goed geboekt, de melding komt bij de volgende evaluatie.
 */
import 'server-only';
import { createServiceSupabase } from '@/lib/supabase-server';
import { sendServerMail } from '@/lib/serverMail';
import type { Slot } from '@/lib/winkel/rekenen';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import {
    DIRECT_MAILEN, artikelDichtMeldingen, keukenMeldingen, tekortVooruitMeldingen, verschil, winkelProductMeldingen,
    type ArtikelKort, type KeukenItem, type Melding, type Vraag, type WinkelProduct,
} from './meldingRegels';

type Sb = ReturnType<typeof createServiceSupabase>;
type Staat = Pick<Melding, 'bron' | 'item_id' | 'soort'>;

const PRODUCT_KOLOMMEN = 'id, naam, eenheid, voorraad, drempel, actief, par_niveau, bestel_hoeveelheid, bestel_eenheid_naam';
const SLOT_KOLOMMEN = 'id, artikel_id, volgorde, slot_type, naam, hoeveelheid, eenheid, per, standaard_product_id, wisselbaar, alternatieven';

async function laadWinkel(sb: Sb, orgId: string) {
    /* Gereserveerd voor alle producten in één aanroep (winkel_vrij_producten),
       in plaats van winkel_bezetting_product per product. Dezelfde regel. */
    const [{ data: producten }, { data: slots }, { data: artikelen }, vrij] = await Promise.all([
        sb.from('winkel_producten').select(PRODUCT_KOLOMMEN).eq('organization_id', orgId),
        sb.from('winkel_artikel_slots').select(SLOT_KOLOMMEN).eq('organization_id', orgId),
        sb.from('winkel_artikelen').select('id, naam, actief').eq('organization_id', orgId),
        maakSupabaseStore(sb).laadVrij(orgId),
    ]);
    const bijgehouden = (producten ?? []).filter((p) => p.voorraad != null);
    const bezet = new Map<string, number>(vrij.map((v) => [v.product_id, v.gereserveerd]));

    /* Vooruitkijken: betaald, nog niet ingepakt, per ophaaldag. */
    let vraag: Vraag[] = [];
    if (bijgehouden.length) {
        const { data: comps } = await sb
            .from('winkel_order_regel_componenten')
            .select('product_id, hoeveelheid, winkel_order_regels!inner(klaar_op, aantal, klaargezet_at, winkel_orders!inner(status))')
            .eq('organization_id', orgId)
            .in('product_id', bijgehouden.map((p) => p.id as string))
            .is('winkel_order_regels.klaargezet_at', null)
            .eq('winkel_order_regels.winkel_orders.status', 'betaald');
        vraag = ((comps ?? []) as unknown as { product_id: string; hoeveelheid: number; winkel_order_regels: { klaar_op: string; aantal: number } }[])
            .map((c) => ({ product_id: c.product_id, klaar_op: c.winkel_order_regels.klaar_op, hoeveelheid: Number(c.hoeveelheid), pakketten: c.winkel_order_regels.aantal }));
    }

    const prods: WinkelProduct[] = (producten ?? []).map((p) => ({
        id: p.id as string, naam: p.naam as string, eenheid: p.eenheid as 'stuk' | 'gram', actief: !!p.actief,
        voorraad: p.voorraad == null ? null : Number(p.voorraad),
        voorraad_bezet: p.voorraad == null ? undefined : bezet.get(p.id as string) ?? 0,
        drempel: p.drempel == null ? null : Number(p.drempel),
        par_niveau: p.par_niveau == null ? null : Number(p.par_niveau),
        bestel_hoeveelheid: p.bestel_hoeveelheid == null ? null : Number(p.bestel_hoeveelheid),
        bestel_eenheid_naam: (p.bestel_eenheid_naam as string | null) ?? null,
    }));
    const sl = (slots ?? []).map((s) => ({ ...s, hoeveelheid: Number(s.hoeveelheid), alternatieven: s.alternatieven ?? [] })) as Slot[];
    return { producten: prods, slots: sl, artikelen: (artikelen ?? []) as ArtikelKort[], vraag };
}

async function laadInstellingen(sb: Sb, orgId: string) {
    const { data } = await sb.from('winkel_instellingen').select('melding_email').eq('organization_id', orgId).maybeSingle();
    return { email: (data?.melding_email as string | null) ?? null };
}

/** Vergelijk met de staat, maak nieuwe meldingen, ruim de rest op. */
async function verwerk(sb: Sb, orgId: string, gewenst: Melding[], bekeken: (m: Staat) => boolean): Promise<Melding[]> {
    const { data: aanRaw } = await sb.from('voorraad_melding_staat').select('bron, item_id, soort').eq('organization_id', orgId);
    const { nieuw, weg } = verschil((aanRaw ?? []) as Staat[], gewenst, bekeken);

    for (const w of weg) {
        await sb.from('voorraad_melding_staat').delete()
            .eq('organization_id', orgId).eq('bron', w.bron).eq('item_id', w.item_id).eq('soort', w.soort);
    }
    if (!nieuw.length) return [];

    /* Alleen wat echt nieuw in de staat komt, wordt een melding. */
    const { data: ingevoegd, error } = await sb
        .from('voorraad_melding_staat')
        .upsert(nieuw.map((m) => ({ organization_id: orgId, bron: m.bron, item_id: m.item_id, soort: m.soort })), {
            onConflict: 'organization_id,bron,item_id,soort', ignoreDuplicates: true,
        })
        .select('bron, item_id, soort');
    if (error) { console.error('[voorraad-meldingen] staat', error.message); return []; }
    const echtNieuw = new Set(((ingevoegd ?? []) as Staat[]).map((s) => `${s.bron}:${s.item_id}:${s.soort}`));
    const maken = nieuw.filter((m) => echtNieuw.has(`${m.bron}:${m.item_id}:${m.soort}`));

    for (const m of maken) {
        const { data: n, error: e } = await sb.from('notifications').insert({
            organization_id: orgId, user_id: null, type: m.soort, title: m.titel, body: m.tekst, link: m.link,
            metadata: { ...m.metadata, bron: m.bron, item_id: m.item_id },
        }).select('id').single();
        if (e) { console.error('[voorraad-meldingen] notification', e.message); continue; }
        await sb.from('voorraad_melding_staat').update({ notification_id: n.id })
            .eq('organization_id', orgId).eq('bron', m.bron).eq('item_id', m.item_id).eq('soort', m.soort);
    }

    /* "Op" en "artikel dicht" direct mailen. */
    const direct = maken.filter((m) => DIRECT_MAILEN.includes(m.soort));
    if (direct.length) {
        const { email } = await laadInstellingen(sb, orgId);
        if (email) {
            const r = await sendServerMail({
                to: email,
                subject: direct.length === 1 ? direct[0].titel : `${direct.length} producten op of pakketten dicht`,
                html: mailHtml('Direct aandacht', direct),
            });
            if (r.success) {
                for (const m of direct) {
                    await sb.from('voorraad_melding_staat').update({ gemaild_at: new Date().toISOString() })
                        .eq('organization_id', orgId).eq('bron', m.bron).eq('item_id', m.item_id).eq('soort', m.soort);
                }
            } else {
                console.error('[voorraad-meldingen] mail', r.error);
            }
        }
    }
    return maken;
}

/**
 * Na een winkelmutatie. productIds = de producten die veranderd zijn; de
 * artikelen en het vooruitkijken worden altijd helemaal bekeken (goedkoop).
 */
export async function evalueerWinkelMeldingen(orgId: string, productIds?: string[]): Promise<Melding[]> {
    try {
        const sb = createServiceSupabase();
        const w = await laadWinkel(sb, orgId);
        const actief = new Set(w.artikelen.filter((a) => a.actief).map((a) => a.id));
        const gewenst = [
            ...winkelProductMeldingen(w.producten, w.slots, actief),
            ...artikelDichtMeldingen(w.artikelen, w.producten, w.slots),
            ...tekortVooruitMeldingen(w.producten, w.vraag),
        ];
        const scope = productIds ? new Set(productIds) : null;
        return await verwerk(sb, orgId, gewenst, (m) =>
            m.bron === 'artikel' || m.soort === 'voorraad_tekort_vooruit' || (m.bron === 'winkel' && (!scope || scope.has(m.item_id))));
    } catch (e) {
        console.error('[voorraad-meldingen] winkel', e instanceof Error ? e.message : e);
        return [];
    }
}

/** De keuken, in dezelfde vorm (min_stock). */
export async function evalueerKeukenMeldingen(orgId: string, inventoryIds?: number[]): Promise<Melding[]> {
    try {
        const sb = createServiceSupabase();
        let q = sb.from('inventory').select('id, naam, unit, current_stock, min_stock').eq('organization_id', orgId);
        if (inventoryIds?.length) q = q.in('id', inventoryIds);
        const { data } = await q;
        const items: KeukenItem[] = (data ?? []).map((i) => ({
            id: Number(i.id), naam: i.naam as string, unit: (i.unit as string | null) ?? null,
            current_stock: i.current_stock == null ? null : Number(i.current_stock),
            min_stock: i.min_stock == null ? null : Number(i.min_stock),
        }));
        const scope = inventoryIds?.length ? new Set(inventoryIds.map(String)) : null;
        return await verwerk(sb, orgId, keukenMeldingen(items), (m) => m.bron === 'keuken' && (!scope || scope.has(m.item_id)));
    } catch (e) {
        console.error('[voorraad-meldingen] keuken', e instanceof Error ? e.message : e);
        return [];
    }
}

/**
 * Het overzicht van 8:00: alles wat nu aan staat, bijna op en vooruit-tekort
 * voorop. Leeg = geen mail.
 */
export async function stuurDagoverzicht(orgId: string): Promise<{ verstuurd: boolean; aantal: number; fout?: string }> {
    const sb = createServiceSupabase();
    const { email } = await laadInstellingen(sb, orgId);
    const { data: staat } = await sb
        .from('voorraad_melding_staat')
        .select('soort, notification_id, sinds')
        .eq('organization_id', orgId);
    const ids = (staat ?? []).map((s) => s.notification_id).filter((x): x is string => !!x);
    if (!ids.length) return { verstuurd: false, aantal: 0 };
    const { data: notes } = await sb.from('notifications').select('id, type, title, body, link').in('id', ids);
    const volgorde: Record<string, number> = { voorraad_tekort_vooruit: 0, voorraad_op: 1, artikel_dicht: 2, voorraad_laag: 3 };
    const lijst = ((notes ?? []) as { type: string; title: string; body: string | null; link: string | null }[])
        .sort((a, b) => (volgorde[a.type] ?? 9) - (volgorde[b.type] ?? 9))
        .map((n) => ({ titel: n.title, tekst: n.body ?? '', link: n.link ?? '' }));
    if (!email) return { verstuurd: false, aantal: lijst.length, fout: 'geen melding_email ingesteld' };
    const r = await sendServerMail({
        to: email,
        subject: `Voorraad vandaag: ${lijst.length} ${lijst.length === 1 ? 'punt' : 'punten'}`,
        html: mailHtml('Voorraad vandaag', lijst),
    });
    return { verstuurd: r.success, aantal: lijst.length, fout: r.error };
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function mailHtml(kop: string, regels: { titel: string; tekst: string; link: string }[]): string {
    const basis = (process.env.NEXT_PUBLIC_APP_URL || 'https://bbq-architect-v2.vercel.app').replace(/\/$/, '');
    return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222">`
        + `<h2 style="font-weight:500;margin:0 0 16px">${esc(kop)}</h2>`
        + regels.map((r) => `<div style="border-left:3px solid #6B7A3F;padding:6px 12px;margin:0 0 12px">`
            + `<div style="font-weight:600">${esc(r.titel)}</div>`
            + (r.tekst ? `<div style="color:#555;font-size:14px;margin-top:2px">${esc(r.tekst)}</div>` : '')
            + (r.link ? `<a href="${basis}${esc(r.link)}" style="font-size:13px;color:#6B7A3F">Open in BBQ Architect</a>` : '')
            + `</div>`).join('')
        + `<p style="color:#999;font-size:12px;margin-top:24px">Voorraadmelding van BBQ Architect. Het adres wijzig je in Webshop → Instellingen.</p>`
        + `</body></html>`;
}
