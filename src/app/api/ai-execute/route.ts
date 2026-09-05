import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { logAiUsageServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';

/* Zonder maxDuration kapt Vercel deze functie af op de standaardlimiet. Voor een
   route die een AI-model aanroept is dat te kort: 41 van de 48 AI-routes zetten
   hem al, deze zeven niet — waaronder today-briefing (draait op de startpagina)
   en ai-execute (voert alle AI-acties uit). */
export const maxDuration = 60;


/* eslint-disable @typescript-eslint/no-explicit-any */

// Route draait authenticated via createServerSupabase() → queries respecteren
// RLS en lopen onder de user's organization_id. Vroeger werd hier de anon-
// browser-client gebruikt, wat data lekte buiten de org-scope zodra de
// "Allow all for anon" policies werden gedropt.

async function getActiveOrgId(sb: SupabaseClient): Promise<string | null> {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1);
    return data && data[0] ? (data[0].organization_id as string) : null;
}

// AI levert soms slug-varianten die niet in de gangen-tabel bestaan
// (bv "bite" ipv "bites"). Mapping naar bestaande slugs voorkomt FK-violations.
// Onbekende slugs vallen terug op 'anders'.
const GANG_SLUG_ALIAS: Record<string, string> = {
    bite: 'bites',
    bites: 'bites',
    hapje: 'hapje',
    borrelhap: 'borrelhap',
    borrelhapje: 'borrelhap',
    voorgerecht: 'voorgerechten',
    voorgerechten: 'voorgerechten',
    starter: 'voorgerechten',
    hoofdgerecht: 'hoofdgerechten',
    hoofdgerechten: 'hoofdgerechten',
    main: 'hoofdgerechten',
    bijgerecht: 'bijgerecht',
    side: 'bijgerecht',
    bijgerechten: 'bijgerecht',
    vegetarisch: 'vegetarisch',
    vega: 'vegetarisch',
    vegan: 'vegetarisch',
    dessert: 'dessert',
    desserts: 'dessert',
    nagerecht: 'dessert',
    anders: 'anders',
};

function normalizeGangSlug(input: unknown): string {
    if (typeof input !== 'string' || !input.trim()) return 'anders';
    const k = input.trim().toLowerCase();
    return GANG_SLUG_ALIAS[k] || 'anders';
}

async function bulkCreateGerechten(sb: SupabaseClient, orgId: string | null, params: Record<string, any>): Promise<Record<string, any>> {
    const gerechten: any[] = params.gerechten || [];
    if (gerechten.length === 0) return { error: 'Geen gerechten opgegeven', inserted: 0, errors: [] };
    if (!orgId) return { error: 'Geen actieve organisatie gevonden', inserted: 0, errors: [] };

    const rows = gerechten.map((g: any, i: number) => ({
        naam: g.naam || 'Nieuw Gerecht',
        gang_slug: normalizeGangSlug(g.gang_slug),
        beschrijving: g.beschrijving || '',
        bereidingswijze: Array.isArray(g.bereidingswijze) ? g.bereidingswijze.join('\n') : (g.bereidingswijze || ''),
        ingredienten: Array.isArray(g.ingredienten) ? g.ingredienten : [],
        allergenen: g.allergenen || [],
        tags: g.tags || [],
        actief: false,
        volgorde: 900 + i,
        organization_id: orgId,
        // Nieuwe AI-inzicht velden — komen uit STAP 2 van de brainstorm-flow
        kostprijs_pp: typeof g.kostprijs_pp === 'number' ? g.kostprijs_pp : 0,
        verkoopprijs: typeof g.verkoopprijs === 'number' ? g.verkoopprijs : 0,
        marge_pct: typeof g.marge_pct === 'number' ? g.marge_pct : null,
        pijnpunten: Array.isArray(g.pijnpunten) ? g.pijnpunten : [],
        toppunten: Array.isArray(g.toppunten) ? g.toppunten : [],
        foto_prompt: typeof g.foto_prompt === 'string' ? g.foto_prompt : null,
    }));

    const results = await Promise.allSettled(rows.map((row) => sb.from('gerechten').insert(row).select().single()));
    const inserted = results.filter((r) => r.status === 'fulfilled' && !(r as any).value?.error).length;
    const errorDetails = results.flatMap((r, idx) => {
        const naam = rows[idx]?.naam || 'gerecht ' + (idx + 1);
        if (r.status === 'rejected') {
            const msg = String((r as any).reason?.message || 'onbekend');
            return [{ naam, message: msg }];
        }
        if (r.status === 'fulfilled' && (r as any).value?.error) {
            const err = (r as any).value.error;
            const msg = String(err?.message || 'onbekend') + (err?.details ? ' — ' + err.details : '') + (err?.hint ? ' (' + err.hint + ')' : '');
            return [{ naam, message: msg }];
        }
        return [];
    });
    if (errorDetails.length > 0) {
        // Server-log voor debug — anders zien we nooit waarom de insert faalde
        console.error('[bulkCreateGerechten] ' + errorDetails.length + ' insert(s) faalden:');
        errorDetails.forEach((e) => console.error('  - ' + e.naam + ': ' + e.message));
    }
    return { inserted, total: rows.length, errors: errorDetails.map((e) => e.naam + ': ' + e.message) };
}

// Materieel-type aliasing — DB heeft fixed enum, AI mag synoniemen genereren.
// Exact-match wint; daarna substring-match per categorie. Order matters:
// keukengerei wordt EERST gematched naar Overig om te voorkomen dat "snijplank"
// ten onrechte als Servies gerouteerd wordt door de plank-match.
const MATERIEEL_TYPE_VALID = ['BBQ', 'Servies', 'Linnen', 'Koeling', 'Transport', 'Meubilair', 'Overig'] as const;
const MATERIEEL_TYPE_HINTS: Array<{ keyword: RegExp; type: typeof MATERIEEL_TYPE_VALID[number] }> = [
    // Keukengerei + tools → Overig (eerst matchen om Servies-overlap te voorkomen)
    { keyword: /\b(koksmes|kookmes|kookmesser|chefmes|filetmes|broodmes|hakmes|snijplank|wokpan|koekenpan|sauspan|steelpan|hakblok|weegschaal|thermometer|kerntemperatuur|maatbeker|trechter|spatel|garde|pollepel|schort)/i, type: 'Overig' },
    { keyword: /\b(bbq|kettle|kamado|smoker|grill|gas-?bbq|kolen|houtskool|plancha|firepit|vuurkorf|brander)/i, type: 'BBQ' },
    { keyword: /\b(bord|kom|glas|bestek|schaal|mok|kop|ondertafel|tapasschaal|saladekom|amusebord|coupebord)/i, type: 'Servies' },
    { keyword: /\b(linnen|tafelkleed|servet|doek|kleed|runner|placemat)/i, type: 'Linnen' },
    { keyword: /\b(koel|freezer|vries|koelbox|koelkist|chafing|koelkar|koeldisplay)/i, type: 'Koeling' },
    { keyword: /\b(krat|aanhanger|kar|trolley|transport|dolly|rolcontainer|sjorband)/i, type: 'Transport' },
    { keyword: /\b(tafel|stoel|bank|kruk|bartafel|statafel|parasol|partytent)/i, type: 'Meubilair' },
];
function normalizeMaterieelType(input: unknown, naam?: string): typeof MATERIEEL_TYPE_VALID[number] {
    if (typeof input === 'string') {
        const exact = MATERIEEL_TYPE_VALID.find((t) => t.toLowerCase() === input.toLowerCase());
        if (exact) return exact;
    }
    const haystack = ((typeof input === 'string' ? input : '') + ' ' + (naam || '')).toLowerCase();
    for (const h of MATERIEEL_TYPE_HINTS) if (h.keyword.test(haystack)) return h.type;
    return 'Overig';
}

// Verrijk een materieel-item via Claude Haiku op basis van train-data over Hop & Bites
// catering-producten (IKEA, Churchill, Yoder, Burlodge etc). Tool-use forcing dwingt
// gestructureerde JSON terug — geen vrije tekst.
const enrichMaterieelTool = {
    name: 'enrich_materieel',
    description: 'Lever rijke product-info als gestructureerde data. GEEN markdown, GEEN essays.',
    input_schema: {
        type: 'object' as const,
        properties: {
            kleur: { type: 'string', description: 'Dominante kleur (bv "wit matt", "antraciet", "Garnet Orange"). Leeg laten als onbekend.' },
            materiaal: { type: 'string', description: 'Bv "porselein", "stoneware", "RVS", "eiken", "linnen", "polypropyleen". Leeg als onbekend.' },
            afmetingen: { type: 'string', description: 'Vrije text — bv "Ø 25cm", "31x18cm", "60L", "240x150cm". Leeg als onbekend.' },
            beschrijving: { type: 'string', description: '1-2 zinnen — wat is het, voor welke gebruik. Bv "Organic-shaped coupebord van Churchill, hand-crafted look met aardse tinten — geschikt voor moderne tasting-menu\'s."' },
            geschikt_voor_gangen: {
                type: 'array',
                items: { type: 'string', enum: ['hapje', 'voorgerecht', 'hoofdgerecht', 'vegetarisch', 'dessert', 'bijgerecht', 'borrelhap'] },
                description: 'Voor servies/linnen: welke gangen passen erop. Lege array bij apparatuur.',
            },
            ai_styling_hint: { type: 'string', description: '1 zin — visuele uitstraling voor latere foto-prompts. Bv "ovaal coupe-bord, organic glaze met hand-crafted vlekken, ideaal voor zalm-tartaar of crudo." Leeg bij apparatuur.' },
        },
        required: ['beschrijving'],
    },
};

interface EnrichResult {
    data: Record<string, any>;
    usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
}

async function enrichSingleItem(client: Anthropic, naam: string, type: string): Promise<EnrichResult> {
    try {
        const resp = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            tools: [enrichMaterieelTool],
            tool_choice: { type: 'tool', name: 'enrich_materieel' },
            messages: [{
                role: 'user',
                content: 'Verrijk dit materieel-item voor een Hop & Bites catering-database.\nNaam: ' + naam + '\nType: ' + type + '\n\nBaseer op je kennis over dit product (IKEA, Churchill, Yoder, Burlodge, Weber etc). Vul aan: kleur, materiaal, afmetingen, beschrijving, geschikt_voor_gangen (alleen servies/linnen), ai_styling_hint (alleen servies/linnen).',
            }],
        } as any);
        const tb = (resp.content as any[]).find((b: any) => b.type === 'tool_use');
        return {
            data: (tb?.input as Record<string, any>) || {},
            usage: (resp as any).usage,
        };
    } catch (e) {
        console.error('[enrichSingleItem] ' + naam + ': ' + (e as Error).message);
        return { data: {} };
    }
}

async function bulkCreateMaterieel(sb: SupabaseClient, orgId: string | null, params: Record<string, any>): Promise<Record<string, any>> {
    const items: any[] = params.items || [];
    if (items.length === 0) return { error: 'Geen items opgegeven', inserted: 0, errors: [] };
    if (!orgId) return { error: 'Geen actieve organisatie gevonden', inserted: 0, errors: [] };

    // Parallel enrichment in batches van 5 — voorkomt rate-limit, max ~5s totaal voor 14 items.
    const apiKey = process.env.ANTHROPIC_API_KEY;
    let enriched: Record<string, any>[] = items.map(() => ({}));
    let aggUsage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
    if (apiKey) {
        const client = new Anthropic({ apiKey });
        const BATCH = 5;
        for (let i = 0; i < items.length; i += BATCH) {
            const slice = items.slice(i, i + BATCH);
            const results = await Promise.all(slice.map((it: any) =>
                enrichSingleItem(client, it.naam || 'Onbekend item', normalizeMaterieelType(it.type, it.naam))
            ));
            results.forEach((r, j) => {
                enriched[i + j] = r.data;
                if (r.usage) {
                    aggUsage.in += r.usage.input_tokens || 0;
                    aggUsage.out += r.usage.output_tokens || 0;
                    aggUsage.cacheRead += r.usage.cache_read_input_tokens || 0;
                    aggUsage.cacheWrite += r.usage.cache_creation_input_tokens || 0;
                }
            });
        }
        // Pillar #5 — log aggregaat usage incl. cache-tokens
        if (orgId && (aggUsage.in + aggUsage.out) > 0) {
            void logAiUsageServer({
                organization_id: orgId,
                action_type: 'other',
                model: 'claude-haiku-4-5-20251001',
                tokens_input: aggUsage.in,
                tokens_output: aggUsage.out,
                tokens_cache_read: aggUsage.cacheRead,
                tokens_cache_creation: aggUsage.cacheWrite,
                cost_eur_cents: estimateAiCostCents({
                    model: 'claude-haiku-4-5-20251001',
                    tokens_input: aggUsage.in,
                    tokens_output: aggUsage.out,
                    tokens_cache_read: aggUsage.cacheRead,
                    tokens_cache_creation: aggUsage.cacheWrite,
                }),
                metadata: { feature: 'materieel_enrich', item_count: items.length },
            });
        }
    }

    // Merge: AI-enrichment vult lege velden van de user-parsed item, overschrijft niet.
    const mergedItems = items.map((it: any, idx: number) => {
        const e = enriched[idx] || {};
        return {
            ...it,
            kleur: it.kleur || e.kleur || null,
            materiaal: it.materiaal || e.materiaal || null,
            afmetingen: it.afmetingen || e.afmetingen || null,
            geschikt_voor_gangen: Array.isArray(it.geschikt_voor_gangen) && it.geschikt_voor_gangen.length > 0 ? it.geschikt_voor_gangen : (e.geschikt_voor_gangen || []),
            ai_styling_hint: it.ai_styling_hint || e.ai_styling_hint || null,
            beschrijving: e.beschrijving || it.beschrijving || null,
        };
    });

    // Single-record per regel — aantal in notitie zodat user later kan splitsen.
    const rows = mergedItems.map((it: any) => {
        const naam = it.naam || 'Nieuw item';
        const aantal = typeof it.aantal === 'number' && it.aantal > 1 ? it.aantal : null;
        const notitieParts = [
            aantal ? 'Aantal: ' + aantal : null,
            it.beschrijving || null,
            it.notitie || null,
        ].filter(Boolean);
        return {
            naam,
            type: normalizeMaterieelType(it.type, naam),
            status: 'ok',
            kleur: typeof it.kleur === 'string' && it.kleur ? it.kleur : null,
            materiaal: typeof it.materiaal === 'string' && it.materiaal ? it.materiaal : null,
            afmetingen: typeof it.afmetingen === 'string' && it.afmetingen ? it.afmetingen : null,
            locatie: typeof it.locatie === 'string' && it.locatie ? it.locatie : null,
            notitie: notitieParts.length > 0 ? notitieParts.join(' · ') : null,
            geschikt_voor_gangen: Array.isArray(it.geschikt_voor_gangen) ? it.geschikt_voor_gangen : [],
            ai_styling_hint: typeof it.ai_styling_hint === 'string' && it.ai_styling_hint ? it.ai_styling_hint : null,
            // foto_url uit og:image van gescrapte pagina → opslaan als 1e foto in array.
            fotos: typeof it.foto_url === 'string' && /^https?:\/\//.test(it.foto_url) ? [it.foto_url] : [],
            organization_id: orgId,
            scan_source: typeof it.foto_url === 'string' ? 'ai_url_scrape' : 'ai_bulk_import_enriched',
        };
    });

    const results = await Promise.allSettled(rows.map((row) => sb.from('materieel').insert(row).select().single()));
    const inserted = results.filter((r) => r.status === 'fulfilled' && !(r as any).value?.error).length;
    const errorDetails = results.flatMap((r, idx) => {
        const naam = rows[idx]?.naam || 'item ' + (idx + 1);
        if (r.status === 'rejected') return [{ naam, message: String((r as any).reason?.message || 'onbekend') }];
        if (r.status === 'fulfilled' && (r as any).value?.error) {
            const err = (r as any).value.error;
            return [{ naam, message: String(err?.message || 'onbekend') + (err?.details ? ' — ' + err.details : '') }];
        }
        return [];
    });
    if (errorDetails.length > 0) {
        console.error('[bulkCreateMaterieel] ' + errorDetails.length + ' insert(s) faalden:');
        errorDetails.forEach((e) => console.error('  - ' + e.naam + ': ' + e.message));
    }
    return { inserted, total: rows.length, errors: errorDetails.map((e) => e.naam + ': ' + e.message) };
}

async function generateInkooplijst(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    const eventRes = await sb.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden (id: ' + event_id + ')' };
    const event = eventRes.data;
    const gasten = event.guests || 1;

    /* event.menu is sinds Dag 4 een menu_selectie-object (gangen → dish-namen).
       Pre-Dag-4 events hebben nog een id-array — beide vormen handelen.
       recepten samengevouwen onder gerechten 2026-05-01. */
    const rawMenu = event.menu;
    const menuIds: number[] = [];
    const dishNames: string[] = [];
    if (Array.isArray(rawMenu)) {
        rawMenu.forEach((v: unknown) => {
            if (typeof v === 'number') menuIds.push(v);
            else if (typeof v === 'string') dishNames.push(v);
        });
    } else if (rawMenu && typeof rawMenu === 'object') {
        Object.values(rawMenu).forEach((list: unknown) => {
            if (Array.isArray(list)) list.forEach(item => {
                if (typeof item === 'string') dishNames.push(item);
            });
        });
    }
    let recepten: any[] = [];
    if (menuIds.length > 0 || dishNames.length > 0) {
        let q = sb.from('gerechten').select('id,naam,gang_slug,porties,target_prep_time,ingredienten,bereidingswijze,allergenen,kostprijs_pp');
        if (menuIds.length > 0 && dishNames.length === 0) q = q.in('id', menuIds);
        else if (dishNames.length > 0 && menuIds.length === 0) q = q.in('naam', dishNames);
        else q = q.or('id.in.(' + menuIds.join(',') + '),naam.in.(' + dishNames.map(n => '"' + n + '"').join(',') + ')');
        const recRes = await q;
        recepten = (recRes.data || []).map((d: any) => ({
            ...d,
            categorie: d.gang_slug,
            preptime: d.target_prep_time ? Math.round(d.target_prep_time / 60) : null,
        }));
    }

    const invRes = await sb.from('inventory').select('naam,current_stock,unit,purchase_price');
    const inventory = invRes.data || [];
    const invMap: Record<string, any> = {};
    inventory.forEach(function (i: any) { invMap[(i.naam || '').toLowerCase().trim()] = i; });

    const ingredientMap: Record<string, any> = {};
    recepten.forEach(function (recept: any) {
        const multiplier = gasten / (recept.porties || 1);
        let ingredienten = recept.ingredienten || [];
        if (typeof ingredienten === 'string') {
            try { ingredienten = JSON.parse(ingredienten); } catch { ingredienten = []; }
        }
        ingredienten.forEach(function (ing: any) {
            const key = (ing.naam || '').toLowerCase().trim();
            if (!key) return;
            if (!ingredientMap[key]) {
                ingredientMap[key] = {
                    naam: ing.naam,
                    benodigdheid: 0,
                    eenheid: ing.eenheid || '',
                    in_voorraad: invMap[key] ? (invMap[key].current_stock || 0) : 0,
                    prijs_pp: invMap[key] ? (invMap[key].purchase_price || 0) : 0,
                    te_bestellen: 0,
                    voor_recepten: [],
                };
            }
            ingredientMap[key].benodigdheid += (parseFloat(ing.hoeveelheid) || 0) * multiplier;
            if (!ingredientMap[key].voor_recepten.includes(recept.naam)) {
                ingredientMap[key].voor_recepten.push(recept.naam);
            }
        });
    });

    Object.values(ingredientMap).forEach(function (ing: any) {
        ing.te_bestellen = Math.max(0, ing.benodigdheid - ing.in_voorraad);
        ing.benodigdheid = Math.round(ing.benodigdheid * 100) / 100;
        ing.te_bestellen = Math.round(ing.te_bestellen * 100) / 100;
        ing.in_voorraad = Math.round(ing.in_voorraad * 100) / 100;
    });

    const items = Object.values(ingredientMap)
        .filter(function (i: any) { return i.benodigdheid > 0; })
        .sort(function (a: any, b: any) { return a.naam.localeCompare(b.naam); });

    const totaalKosten = items.reduce(function (sum: number, i: any) { return sum + (i.te_bestellen * i.prijs_pp); }, 0);

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten, locatie: event.location },
        items,
        totaal_items: items.length,
        te_bestellen_items: items.filter(function (i: any) { return i.te_bestellen > 0; }).length,
        al_in_voorraad: items.filter(function (i: any) { return i.te_bestellen === 0; }).length,
        geschatte_inkoop_kosten: Math.round(totaalKosten * 100) / 100,
        recepten_count: recepten.length,
    };
}

async function generateEventBriefing(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    const eventRes = await sb.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    const event = eventRes.data;

    /* event.menu is een menu_selectie-object of legacy id-array. */
    const rawMenu2 = event.menu;
    const menuIds2: number[] = [];
    const dishNames2: string[] = [];
    if (Array.isArray(rawMenu2)) {
        rawMenu2.forEach((v: unknown) => {
            if (typeof v === 'number') menuIds2.push(v);
            else if (typeof v === 'string') dishNames2.push(v);
        });
    } else if (rawMenu2 && typeof rawMenu2 === 'object') {
        Object.values(rawMenu2).forEach((list: unknown) => {
            if (Array.isArray(list)) list.forEach(item => {
                if (typeof item === 'string') dishNames2.push(item);
            });
        });
    }
    let recepten: any[] = [];
    if (menuIds2.length > 0 || dishNames2.length > 0) {
        let q = sb.from('gerechten').select('id,naam,gang_slug,porties,target_prep_time');
        if (menuIds2.length > 0 && dishNames2.length === 0) q = q.in('id', menuIds2);
        else if (dishNames2.length > 0 && menuIds2.length === 0) q = q.in('naam', dishNames2);
        else q = q.or('id.in.(' + menuIds2.join(',') + '),naam.in.(' + dishNames2.map(n => '"' + n + '"').join(',') + ')');
        const recRes = await q;
        recepten = (recRes.data || []).map((d: any) => ({
            ...d,
            categorie: d.gang_slug,
            preptime: d.target_prep_time ? Math.round(d.target_prep_time / 60) : null,
        }));
    }

    const prepRes = await sb.from('prep_tasks').select('*').eq('event_id', event_id).order('dagen');
    const prep_tasks = prepRes.data || [];

    const offRes = await sb.from('offertes').select('id,nummer,status,basis_prijs_pp,aantal_gasten,korting,items').eq('event_id', event_id).limit(1);
    const offerte = offRes.data && offRes.data[0] ? offRes.data[0] : null;

    const hacRes = await sb.from('haccp_records').select('id,datum,tijd,wat,temp,status').eq('event_id', event_id).order('datum').limit(20);
    const haccp = hacRes.data || [];

    return {
        briefing_datum: new Date().toISOString().slice(0, 10),
        event: {
            id: event.id, naam: event.name, datum: event.date, gasten: event.guests,
            locatie: event.location, status: event.status,
            contactpersoon: event.contactpersoon || event.contact || null,
            telefoon: event.telefoon || event.phone || null,
            notities: event.notes || event.notities || null,
        },
        menu: recepten,
        prep_taken_klaar: prep_tasks.filter(function (t: any) { return t.done; }).length,
        prep_taken_open: prep_tasks.filter(function (t: any) { return !t.done; }).length,
        prep_tasks: prep_tasks.slice(0, 12),
        offerte,
        haccp_count: haccp.length,
    };
}

async function getEventWinstgevendheid(sb: SupabaseClient, params: Record<string, any>): Promise<Record<string, any>> {
    const event_id = params.event_id;
    if (!event_id) return { error: 'event_id is verplicht' };

    const eventRes = await sb.from('events').select('*').eq('id', event_id).single();
    if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
    const event = eventRes.data;

    const facRes = await sb.from('facturen').select('*').eq('event_id', event_id);
    const facturen = facRes.data || [];

    const urenRes = await sb.from('time_logs').select('*').eq('event_id', event_id);
    const time_logs = urenRes.data || [];

    const inkoopRes = await sb.from('inkooplijsten').select('*').eq('event_id', event_id);
    const inkoop = inkoopRes.data || [];

    function calcItemsTotaal(items: any): number {
        if (!items) return 0;
        if (typeof items === 'string') { try { items = JSON.parse(items); } catch { return 0; } }
        return (Array.isArray(items) ? items : []).reduce(function (s: number, i: any) {
            return s + (parseFloat(i.prijs || i.price || 0) * parseFloat(i.qty || i.aantal || 1));
        }, 0);
    }

    const omzet = facturen.reduce(function (s: number, f: any) { return s + calcItemsTotaal(f.items); }, 0);
    const inkoopKosten = inkoop.reduce(function (s: number, l: any) { return s + calcItemsTotaal(l.items); }, 0);

    const DEFAULT_UURLOON = 15;
    let totaalUren = 0;
    let arbeidskosten = 0;
    time_logs.forEach(function (t: any) {
        if (t.start_time && t.end_time) {
            const uren = Math.max(0, (new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) / 3600000);
            totaalUren += uren;
            arbeidskosten += uren * (parseFloat(t.uurtarief_snapshot) || DEFAULT_UURLOON);
        }
    });

    const brutoMarge = omzet - inkoopKosten;
    const nettoMarge = omzet - inkoopKosten - arbeidskosten;
    const brutoMargePerc = omzet > 0 ? Math.round(brutoMarge / omzet * 100) : null;
    const nettoMargePerc = omzet > 0 ? Math.round(nettoMarge / omzet * 100) : null;

    function fmt(n: number): number { return Math.round(n * 100) / 100; }

    return {
        event: { id: event.id, naam: event.name, datum: event.date, gasten: event.guests },
        omzet: fmt(omzet),
        inkoopKosten: fmt(inkoopKosten),
        arbeidskosten: fmt(arbeidskosten),
        totaalUren: Math.round(totaalUren * 10) / 10,
        brutoMarge: fmt(brutoMarge),
        nettoMarge: fmt(nettoMarge),
        brutoMargePerc,
        nettoMargePerc,
        facturen_count: facturen.length,
        inkoop_count: inkoop.length,
        urenlog_count: time_logs.length,
        datakwaliteit: {
            heeft_facturen: facturen.length > 0,
            heeft_inkoop: inkoop.length > 0,
            heeft_uren: urenRes.data !== null && urenRes.data.length > 0,
        },
    };
}

async function getCrossModuleContext(sb: SupabaseClient): Promise<Record<string, any>> {
    const [eventsRes, offertesRes, facturenRes, invRes, settingsRes] = await Promise.all([
        sb.from('events').select('*').order('date', { ascending: true }).limit(10),
        sb.from('offertes').select('*').order('id', { ascending: false }).limit(20),
        sb.from('facturen').select('*').order('id', { ascending: false }).limit(20),
        sb.from('inventory').select('*'),
        sb.from('settings').select('*').single(),
    ]);

    // Return in het format dat formatContextForPrompt verwacht
    var events = (eventsRes.data || []).map(function (e: any) {
        return { id: e.id, name: e.name, date: e.date, guests: e.guests, status: e.status, location: e.location, client_naam: e.client_naam, ppp: e.ppp, menu: e.menu };
    });
    var lowStock = (invRes.data || []).filter(function (i: any) {
        return i.current_stock !== null && i.min_stock !== null && i.current_stock < i.min_stock;
    });

    return {
        settings: settingsRes.data || {},
        events: events,
        offertes: offertesRes.data || [],
        facturen: facturenRes.data || [],
        inventory: invRes.data || [],
        lowStock: lowStock.map(function (i: any) { return { naam: i.naam, current_stock: i.current_stock, min_stock: i.min_stock, unit: i.unit }; }),
    };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = await req.json();
        const { tool, params } = body;
        let result: Record<string, any>;

        const sb = await createServerSupabase();
        const orgId = await getActiveOrgId(sb);

        switch (tool) {
            case 'generateInkooplijst':
                result = await generateInkooplijst(sb, params || {});
                break;
            case 'generateEventBriefing':
                result = await generateEventBriefing(sb, params || {});
                break;
            case 'getEventWinstgevendheid':
                result = await getEventWinstgevendheid(sb, params || {});
                break;
            case 'getCrossModuleContext':
                result = await getCrossModuleContext(sb);
                break;
            case 'bulkCreateGerechten':
                result = await bulkCreateGerechten(sb, orgId, params || {});
                break;
            case 'bulkCreateMaterieel':
                result = await bulkCreateMaterieel(sb, orgId, params || {});
                break;
            default:
                return NextResponse.json({ error: 'Onbekende tool: ' + tool }, { status: 400 });
        }

        return NextResponse.json({ result });
    } catch (err: any) {
        console.error('[AI Execute API] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
