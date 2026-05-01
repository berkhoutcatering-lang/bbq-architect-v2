// src/lib/bbq-context.ts
// Laadt live Supabase-data per pagina en formatteert ze voor de AI systeem-prompt.

import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getSupabase(): SupabaseClient {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

function euro(n: number | null | undefined): string {
    return '\u20ac' + Number(n || 0).toFixed(2);
}

interface OfferteContext {
    items?: Array<{ qty?: number; unit_price?: number; btw_rate?: number }>;
    korting?: number | string;
    vaste_kosten?: Array<{ bedrag?: number | string }>;
    aantal_gasten?: number;
    basis_prijs_pp?: number;
}

function calcOfferteTotaal(o: OfferteContext): number {
    if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        const sub = o.items.reduce(function (s, item) {
            const line = (item.qty || 0) * (item.unit_price || 0);
            const btw = line * ((item.btw_rate || 0) / 100);
            return s + line + btw;
        }, 0);
        const korting = Number(o.korting || 0);
        const vaste = (o.vaste_kosten || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
        return sub - korting + vaste;
    }
    const gasten = o.aantal_gasten || 0;
    const ppp = o.basis_prijs_pp || 0;
    const korting = Number(o.korting || 0);
    const vaste = (o.vaste_kosten || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
    return gasten * ppp - korting + vaste;
}

// ── Page context loaders ──────────────────────────────────────────────────────

async function loadEventsContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const today = new Date().toISOString().slice(0, 10);
    const { data: events } = await sb.from('events').select('*').gte('date', today).order('date').limit(10);
    /* recepten samengevouwen onder gerechten 2026-05-01. */
    const { data: gerechten } = await sb.from('gerechten').select('id,naam,gang_slug,porties,target_prep_time').limit(50);
    return { events: events || [], gerechten: gerechten || [] };
}

async function loadAgendaContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: events } = await sb.from('events').select('id,name,date,guests,status,location').order('date').limit(20);
    const { data: tasks } = await sb.from('prep_tasks').select('*').order('created_at', { ascending: false }).limit(20);
    return { events: events || [], prep_tasks: tasks || [] };
}

async function loadOffortesContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data } = await sb.from('offertes').select('id,nummer,status,client_naam,datum,geldig_tot,aantal_gasten,basis_prijs_pp,items,korting,vaste_kosten,menu_selectie').order('datum', { ascending: false }).limit(30);
    const offertes = (data || []) as OfferteContext[];
    const totaal = offertes.reduce(function (s, o) { return s + calcOfferteTotaal(o); }, 0);
    const open = offertes.filter(function (o) { return (o as Record<string, unknown>).status === 'concept' || (o as Record<string, unknown>).status === 'verzonden'; });
    const openTotaal = open.reduce(function (s, o) { return s + calcOfferteTotaal(o); }, 0);
    return { offertes, totaal_omzet: totaal, open_offertes: open.length, open_totaal: openTotaal };
}

async function loadFacturenContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data } = await sb.from('facturen').select('id,nummer,client_naam,datum,vervaldatum,status,items,korting,vaste_kosten').order('datum', { ascending: false }).limit(30);
    const facturen = (data || []) as Record<string, unknown>[];
    const calcTotaal = function (f: Record<string, unknown>): number {
        const items = f.items as Array<{ qty?: number; unit_price?: number; btw_rate?: number }> | undefined;
        if (items && items.length > 0) {
            const sub = items.reduce(function (s, i) { return s + (i.qty || 0) * (i.unit_price || 0) * (1 + (i.btw_rate || 0) / 100); }, 0);
            return sub - Number(f.korting || 0) + ((f.vaste_kosten as Array<{ bedrag?: number | string }>) || []).reduce(function (s, k) { return s + Number(k.bedrag || 0); }, 0);
        }
        return 0;
    };
    const open = facturen.filter(function (f) { return f.status === 'verzonden' || f.status === 'concept'; });
    const betaald = facturen.filter(function (f) { return f.status === 'betaald'; });
    const today = new Date().toISOString().slice(0, 10);
    const vervallen = open.filter(function (f) { return f.vervaldatum && (f.vervaldatum as string) < today; });
    return {
        facturen,
        open_facturen: open.length,
        open_totaal: open.reduce(function (s, f) { return s + calcTotaal(f); }, 0),
        betaald_totaal: betaald.reduce(function (s, f) { return s + calcTotaal(f); }, 0),
        vervallen_facturen: vervallen.length
    };
}

async function loadGerechtenContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: gangen } = await sb.from('gangen').select('*').order('volgorde');
    const { data: gerechten } = await sb.from('gerechten').select('id,naam,gang_slug,beschrijving,tags,allergenen,kostprijs_pp,actief').order('volgorde');
    return { gangen: gangen || [], gerechten: gerechten || [], totaal: (gerechten || []).length };
}

async function loadReceptenContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    /* /recepten leeft nu onder /gerechten — receptuur (bereidingswijze, porties,
       wijn-suggestie) zit op de gerecht-rij. Alias-key 'recepten' behouden zodat
       AI-prompts die om recepten vragen niet breken. */
    const { data: gerechten } = await sb.from('gerechten').select('id,naam,gang_slug,porties,target_prep_time,bereidingswijze,ingredienten,allergenen,kostprijs_pp,wijn_suggestie,service_tip').order('naam');
    const { data: inventory } = await sb.from('inventory').select('id,naam,hoeveelheid,unit,min_par,purchase_price').order('naam');
    return { recepten: gerechten || [], inventory: inventory || [] };
}

async function loadVoorraadContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: inventory } = await sb.from('inventory').select('*').order('naam');
    const laag = (inventory || []).filter(function (i: Record<string, unknown>) { return (i.hoeveelheid as number) <= (i.min_par as number); });
    return { inventory: inventory || [], lage_voorraad: laag, laag_count: laag.length };
}

async function loadInkoopContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: inventory } = await sb.from('inventory').select('id,naam,hoeveelheid,min_par,unit,purchase_price,preferred_supplier').order('naam');
    const { data: gerechten } = await sb.from('gerechten').select('naam,ingredienten,ingredienten_winkels,ingredient_costs').limit(50);
    return { inventory: inventory || [], gerechten: gerechten || [] };
}

async function loadHaccpContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: logs } = await sb.from('haccp_logs').select('*').order('created_at', { ascending: false }).limit(50);
    const { data: events } = await sb.from('events').select('id,name,date').gte('date', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).order('date');
    return { haccp_logs: logs || [], recent_events: events || [] };
}

async function loadServiceContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const today2 = new Date().toISOString().slice(0, 10);
    const { data: events } = await sb.from('events').select('*').eq('date', today2).order('created_at');
    const { data: gerechten } = await sb.from('gerechten').select('naam,gang_slug,battle_plan_steps,target_prep_time,service_image').order('volgorde');
    return { vandaag_events: events || [], gerechten: gerechten || [] };
}

async function loadUrenContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const maandAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: logs } = await sb.from('time_logs').select('*').gte('date', maandAgo).order('date', { ascending: false });
    return { uren_logs: logs || [] };
}

async function loadMaterieelContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: items } = await sb.from('materieel').select('*').order('naam');
    return { materieel: items || [] };
}

async function loadLogistiekContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const today3 = new Date().toISOString().slice(0, 10);
    const { data: events } = await sb.from('events').select('*').gte('date', today3).order('date').limit(5);
    const { data: materieel } = await sb.from('materieel').select('id,naam,categorie,actief').order('naam');
    return { komende_events: events || [], materieel: materieel || [] };
}

async function loadBoekhoudingContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: offertes } = await sb.from('offertes').select('datum,status,items,korting,vaste_kosten,basis_prijs_pp,aantal_gasten').order('datum', { ascending: false }).limit(100);
    const { data: facturen } = await sb.from('facturen').select('datum,status,items,korting,vaste_kosten').order('datum', { ascending: false }).limit(100);
    const nu = new Date();
    const kwartaal = Math.floor(nu.getMonth() / 3) + 1;
    return { offertes: offertes || [], facturen: facturen || [], kwartaal, jaar: nu.getFullYear() };
}

async function loadDashboardContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const today4 = new Date().toISOString().slice(0, 10);
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const [evRes, invRes, offRes] = await Promise.all([
        sb.from('events').select('id,name,date,guests,status').gte('date', today4).lte('date', week).order('date'),
        sb.from('inventory').select('naam,hoeveelheid,min_par,unit').lte('hoeveelheid', sb.rpc ? 9999 : 9999).order('naam'),
        sb.from('offertes').select('status,items,korting,vaste_kosten,basis_prijs_pp,aantal_gasten').order('datum', { ascending: false }).limit(20),
    ]);
    const invLaag = ((invRes.data || []) as Record<string, unknown>[]).filter(function (i) { return (i.hoeveelheid as number) <= (i.min_par as number); });
    return {
        events_deze_week: evRes.data || [],
        lage_voorraad: invLaag,
        recente_offertes: offRes.data || []
    };
}

async function loadMenuEngineeringContext(sb: SupabaseClient): Promise<Record<string, unknown>> {
    const { data: gerechten } = await sb.from('gerechten').select('naam,gang_slug,kostprijs_pp,tags').order('volgorde');
    const { data: offertes } = await sb.from('offertes').select('menu_selectie,basis_prijs_pp').limit(50);
    return { gerechten: gerechten || [], offertes: offertes || [] };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function loadPageContext(pathname: string): Promise<Record<string, unknown>> {
    const sb = getSupabase();
    try {
        if (pathname === '/' || pathname === '') return await loadDashboardContext(sb);
        if (pathname.startsWith('/events')) return await loadEventsContext(sb);
        if (pathname.startsWith('/agenda')) return await loadAgendaContext(sb);
        if (pathname.startsWith('/offertes')) return await loadOffortesContext(sb);
        if (pathname.startsWith('/facturen')) return await loadFacturenContext(sb);
        if (pathname.startsWith('/gerechten')) return await loadGerechtenContext(sb);
        if (pathname.startsWith('/recepten')) return await loadReceptenContext(sb);
        if (pathname.startsWith('/voorraad')) return await loadVoorraadContext(sb);
        if (pathname.startsWith('/inkoop')) return await loadInkoopContext(sb);
        if (pathname.startsWith('/haccp')) return await loadHaccpContext(sb);
        if (pathname.startsWith('/events/') && pathname.endsWith('/service')) return await loadServiceContext(sb);
        if (pathname.startsWith('/uren')) return await loadUrenContext(sb);
        if (pathname.startsWith('/materieel')) return await loadMaterieelContext(sb);
        if (pathname.startsWith('/logistiek')) return await loadLogistiekContext(sb);
        if (pathname.startsWith('/boekhouding') || pathname.startsWith('/financien')) return await loadBoekhoudingContext(sb);
        if (pathname.startsWith('/menu-engineering')) return await loadMenuEngineeringContext(sb);
        return {};
    } catch (err) {
        console.error('[bbq-context] loadPageContext error:', err);
        return {};
    }
}

// ── Context → prompt text ─────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
export function formatContext(pathname: string, data: Record<string, any>): string {
    if (!data || Object.keys(data).length === 0) return '';

    const lines: string[] = ['\n\n--- LIVE DATA UIT HET SYSTEEM ---'];

    // Dashboard
    if (data.events_deze_week !== undefined) {
        lines.push('Events deze week: ' + (data.events_deze_week.length));
        (data.events_deze_week || []).forEach(function (e: any) {
            lines.push('  - ' + e.name + ' | ' + e.date + ' | ' + e.guests + ' gasten | status: ' + e.status);
        });
        lines.push('Lage voorraad: ' + (data.lage_voorraad || []).length + ' items');
        (data.lage_voorraad || []).forEach(function (i: any) {
            lines.push('  - ' + i.naam + ': ' + i.hoeveelheid + '/' + i.min_par + ' ' + i.unit + ' (TE LAAG)');
        });
    }

    // Events
    if (data.events && pathname && pathname.startsWith('/events')) {
        lines.push('Aankomende events (' + data.events.length + '):');
        (data.events || []).forEach(function (e: any) {
            lines.push('  - [' + e.id + '] ' + e.name + ' | ' + e.date + ' | ' + (e.guests || 0) + ' gasten | \u20ac' + (e.ppp || 0).toFixed(2) + '/p.p. | status: ' + e.status + (e.location ? ' | ' + e.location : ''));
            if (e.menu && e.menu.length > 0) {
                lines.push('    Menu: ' + e.menu.join(', '));
            }
        });
        if (data.recepten && data.recepten.length > 0) {
            lines.push('Beschikbare recepten (' + data.recepten.length + '): ' + data.recepten.map(function (r: any) { return r.naam; }).join(', '));
        }
    }

    // Offertes
    if (data.offertes && pathname && pathname.startsWith('/offertes')) {
        lines.push('Offertes (' + data.offertes.length + '):');
        lines.push('  Totale pipeline omzet: ' + euro(data.totaal_omzet));
        lines.push('  Open offertes: ' + data.open_offertes + ' | Open bedrag: ' + euro(data.open_totaal));
        (data.offertes || []).slice(0, 15).forEach(function (o: any) {
            const tot = calcOfferteTotaal(o);
            lines.push('  - [' + o.nummer + '] ' + o.client_naam + ' | ' + o.status + ' | ' + (o.aantal_gasten || 0) + ' gasten | ' + euro(o.basis_prijs_pp) + '/p.p. | TOTAAL: ' + euro(tot) + ' | ' + o.datum);
        });
    }

    // Facturen
    if (data.facturen && pathname && pathname.startsWith('/facturen')) {
        lines.push('Facturen (' + data.facturen.length + '):');
        lines.push('  Open: ' + data.open_facturen + ' | Open bedrag: ' + euro(data.open_totaal));
        lines.push('  Betaald totaal: ' + euro(data.betaald_totaal));
        lines.push('  Vervallen: ' + data.vervallen_facturen);
        (data.facturen || []).slice(0, 10).forEach(function (f: any) {
            lines.push('  - [' + f.nummer + '] ' + f.client_naam + ' | ' + f.status + ' | verval: ' + (f.vervaldatum || '\u2014'));
        });
    }

    // Gerechten / Menu Ontwikkelaar
    if (data.gangen && pathname && pathname.startsWith('/gerechten')) {
        lines.push('Gangen: ' + (data.gangen || []).map(function (g: any) { return g.naam + ' (' + g.slug + ')'; }).join(', '));
        lines.push('Gerechten totaal: ' + data.totaal);
        const perGang: Record<string, string[]> = {};
        (data.gerechten || []).forEach(function (g: any) {
            if (!perGang[g.gang_slug]) perGang[g.gang_slug] = [];
            perGang[g.gang_slug].push(g.naam);
        });
        Object.keys(perGang).forEach(function (slug) {
            lines.push('  ' + slug + ': ' + perGang[slug].join(', '));
        });
    }

    // Recepten
    if (data.recepten && pathname && pathname.startsWith('/recepten')) {
        lines.push('Recepten (' + data.recepten.length + '):');
        (data.recepten || []).forEach(function (r: any) {
            lines.push('  - ' + r.naam + ' | ' + r.categorie + ' | ' + r.porties + ' porties | preptime: ' + r.preptime + 'min');
            if (r.ingredienten && r.ingredienten.length > 0) {
                lines.push('    Ingredi\u00ebnten: ' + r.ingredienten.slice(0, 6).join(', '));
            }
        });
    }

    // Voorraad
    if (data.inventory && pathname && (pathname.startsWith('/voorraad') || pathname.startsWith('/inkoop'))) {
        lines.push('Voorraad (' + (data.inventory || []).length + ' items):');
        (data.inventory || []).forEach(function (i: any) {
            const status = i.hoeveelheid <= i.min_par ? ' \u26a0\ufe0f LAAG' : '';
            lines.push('  - ' + i.naam + ': ' + i.hoeveelheid + ' ' + i.unit + ' (min: ' + i.min_par + ')' + status + (i.purchase_price ? ' | \u20ac' + Number(i.purchase_price).toFixed(2) : ''));
        });
        if (data.laag_count !== undefined) {
            lines.push('Lage voorraad: ' + data.laag_count + ' items');
        }
    }

    // HACCP
    if (data.haccp_logs !== undefined) {
        lines.push('Recente HACCP logs: ' + (data.haccp_logs || []).length);
        (data.haccp_logs || []).slice(0, 5).forEach(function (l: any) {
            lines.push('  - ' + l.product + ' | ' + l.temperatuur + '\u00b0C | ' + (l.created_at || '').slice(0, 16));
        });
        lines.push('Recente events: ' + (data.recent_events || []).map(function (e: any) { return e.name + ' (' + e.date + ')'; }).join(', '));
    }

    // Service
    if (data.vandaag_events !== undefined) {
        if (data.vandaag_events.length > 0) {
            lines.push('Events VANDAAG: ' + data.vandaag_events.map(function (e: any) { return e.name + ' | ' + e.guests + ' gasten'; }).join(', '));
        } else {
            lines.push('Geen events vandaag.');
        }
        lines.push('Gerechten in systeem: ' + (data.gerechten || []).length);
    }

    // Uren
    if (data.uren_logs !== undefined) {
        const totaalUren = (data.uren_logs || []).reduce(function (s: number, l: any) { return s + (l.uren || 0); }, 0);
        lines.push('Uren afgelopen maand: ' + totaalUren + ' uur (' + (data.uren_logs || []).length + ' registraties)');
    }

    // Materieel / Logistiek
    if (data.materieel !== undefined) {
        lines.push('Materieel items: ' + (data.materieel || []).length);
        (data.materieel || []).slice(0, 10).forEach(function (m: any) {
            lines.push('  - ' + m.naam + ' | ' + (m.categorie || '\u2014') + ' | ' + (m.actief !== false ? 'beschikbaar' : 'niet beschikbaar'));
        });
    }
    if (data.komende_events !== undefined) {
        lines.push('Komende events: ' + (data.komende_events || []).map(function (e: any) { return e.name + ' (' + e.date + ', ' + e.guests + ' gasten)'; }).join(', '));
    }

    // Boekhouding
    if (data.kwartaal !== undefined) {
        lines.push('Huidig kwartaal: Q' + data.kwartaal + ' ' + data.jaar);
        const offerteOmzet = (data.offertes || []).reduce(function (s: number, o: any) { return s + calcOfferteTotaal(o); }, 0);
        lines.push('Totale offerte pipeline: ' + euro(offerteOmzet));
    }

    lines.push('--- EINDE LIVE DATA ---');
    return lines.join('\n');
}
/* eslint-enable @typescript-eslint/no-explicit-any */
