/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getActionInstructions, formatContextForPrompt } from '@/lib/ai-actions';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { PAGE_SYSTEM_PROMPTS, OPERATOR_INSTRUCTIONS, BASE_PERSONA, MODE_INSTRUCTIONS, BRAINSTORM_INSTRUCTIONS, normalizePagePath } from '@/lib/ai-prompts';
import { getMode, isThinkingMode, type ThinkingMode } from '@/lib/ai-modes';
import { logAiUsageServer, checkAiCapServer } from '@/lib/aiUsageServer';
import { checkAiCap } from '@/lib/aiCostCap';
import { estimateAiCostCents } from '@/lib/aiCost';
import { BLOCK_TOOL_SCHEMA, isBlock } from '@/lib/ai/blocks';
import { buildBlockDirective, isRouteAllowed, PAGE_TOOL_WHITELIST } from '@/lib/ai/page-contracts';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHAT_REQUESTS_PER_MINUTE = 30;

// ─── Tool-calling definities ────────────────────────────────────────────────
// Groq's llama-3.3 ondersteunt OpenAI function-calling. De tools hieronder
// laten het model diepgaande data on-demand ophalen zonder dat alles upfront
// in contextData hoeft. Dat bespaart tokens op grote datasets en maakt
// antwoorden accurater op specifieke vragen ("winstgevendheid van event 5").
const TOOL_SCHEMAS = [
    {
        type: 'function',
        function: {
            name: 'get_event_detail',
            description: 'Haal alle details op van één event (menu, gasten, locatie, status, notities). Gebruik wanneer de gebruiker naar een specifiek event vraagt bij id of naam.',
            parameters: {
                type: 'object',
                properties: { event_id: { type: 'integer', description: 'ID van het event' } },
                required: ['event_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'list_upcoming_events',
            description: 'Geef aankomende events in de komende N dagen met basis-info (id, naam, datum, gasten, locatie). Default 30 dagen.',
            parameters: {
                type: 'object',
                properties: { days: { type: 'integer', description: 'Dagen vooruit, default 30' } },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'search_gerechten',
            description: 'Zoek gerechten op naam of gang-slug. Geeft lijst met id, naam, gang, ingrediënten, tags. Gebruik wanneer gebruiker vraagt naar specifieke of recente gerechten.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Zoekterm in naam (optioneel)' },
                    gang_slug: { type: 'string', description: 'Filter op gang: voorgerechten, hoofdgerechten, desserts, bites (optioneel)' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_event_margin',
            description: 'Bereken winstgevendheid van een event: omzet, inkoop, arbeid, netto-marge%. Gebruik bij vragen over winst, marge of rendement per event.',
            parameters: {
                type: 'object',
                properties: { event_id: { type: 'integer' } },
                required: ['event_id'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_low_stock',
            description: 'Geef lijst van inventory items waar current_stock onder min_stock ligt (tekorten).',
            parameters: { type: 'object', properties: {} },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_offerte_detail',
            description: 'Haal één offerte op bij id (nummer, status, items, bedragen, klant, geldig_tot).',
            parameters: {
                type: 'object',
                properties: { offerte_id: { type: 'integer' } },
                required: ['offerte_id'],
            },
        },
    },
];

async function executeTool(name: string, args: any, sb: SupabaseClient): Promise<any> {
    try {
        if (name === 'get_event_detail') {
            const { data, error } = await sb.from('events').select('*').eq('id', args.event_id).single();
            if (error) return { error: error.message };
            return data;
        }
        if (name === 'list_upcoming_events') {
            const days = args.days || 30;
            const today = new Date().toISOString().slice(0, 10);
            const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
            const { data } = await sb.from('events').select('id,name,date,guests,status,location,client_naam').gte('date', today).lte('date', to).order('date').limit(50);
            return { events: data || [], count: (data || []).length };
        }
        if (name === 'search_gerechten') {
            let q = sb.from('gerechten').select('id,naam,gang_slug,ingredienten,allergenen,tags,actief');
            if (args.query) q = q.ilike('naam', '%' + args.query + '%');
            if (args.gang_slug) q = q.eq('gang_slug', args.gang_slug);
            const { data } = await q.limit(30);
            return { gerechten: data || [], count: (data || []).length };
        }
        if (name === 'get_event_margin') {
            const eventRes = await sb.from('events').select('id,name,date,guests').eq('id', args.event_id).single();
            if (eventRes.error || !eventRes.data) return { error: 'Event niet gevonden' };
            const [facRes, urenRes, inkRes] = await Promise.all([
                sb.from('facturen').select('items').eq('event_id', args.event_id),
                sb.from('time_logs').select('start_time,end_time,uurloon').eq('event_id', args.event_id),
                sb.from('inkooplijsten').select('items').eq('event_id', args.event_id),
            ]);
            const calcTotaal = (items: any): number => {
                if (!items) return 0;
                const arr = Array.isArray(items) ? items : (typeof items === 'string' ? JSON.parse(items) : []);
                return arr.reduce((s: number, i: any) => s + (parseFloat(i.prijs || i.price || 0) * parseFloat(i.qty || i.aantal || 1)), 0);
            };
            const omzet = (facRes.data || []).reduce((s: number, f: any) => s + calcTotaal(f.items), 0);
            const inkoop = (inkRes.data || []).reduce((s: number, l: any) => s + calcTotaal(l.items), 0);
            let arbeid = 0;
            (urenRes.data || []).forEach((t: any) => {
                if (t.start_time && t.end_time) {
                    const uren = Math.max(0, (new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) / 3600000);
                    arbeid += uren * (parseFloat(t.uurloon) || 15);
                }
            });
            const netto = omzet - inkoop - arbeid;
            return {
                event: eventRes.data,
                omzet: Math.round(omzet * 100) / 100,
                inkoop: Math.round(inkoop * 100) / 100,
                arbeid: Math.round(arbeid * 100) / 100,
                netto_marge: Math.round(netto * 100) / 100,
                netto_marge_pct: omzet > 0 ? Math.round(netto / omzet * 100) : null,
            };
        }
        if (name === 'get_low_stock') {
            const { data } = await sb.from('inventory').select('naam,current_stock,min_stock,unit');
            const low = (data || []).filter((i: any) => i.current_stock !== null && i.min_stock !== null && i.current_stock < i.min_stock);
            return { items: low, count: low.length };
        }
        if (name === 'get_offerte_detail') {
            const { data, error } = await sb.from('offertes').select('*').eq('id', args.offerte_id).single();
            if (error) return { error: error.message };
            return data;
        }
        return { error: 'Onbekende tool: ' + name };
    } catch (e: any) {
        return { error: e.message };
    }
}


interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface ChatRequestBody {
    messages: ChatMessage[];
    pageContext?: string;
    mode?: string;
    contextData?: Record<string, any>;
    model?: 'sonnet' | 'opus' | 'haiku';
    thinkingMode?: ThinkingMode;
    userRole?: 'Admin' | 'Pitmaster' | 'Medewerker' | null;
    /**
     * Cross-page actieve bron — een event/klant/offerte/klantgesprek waar de
     * gebruiker aan werkt. Komt mee uit de Active-Resource-pill zodat AI
     * context behoudt over pagina's heen. Buiten cache-prefix gehouden om
     * niet bij elke resource-switch een prompt-cache-miss te veroorzaken.
     */
    activeResource?: {
        kind: 'event' | 'klant' | 'offerte' | 'klantgesprek';
        id: string | number;
        label: string;
        meta?: string;
    } | null;
    /**
     * Foto-attachments bij de laatste user-message. Komt uit ChatPanel composer
     * (paperclip / paste / drop). Server hangt ze als image-content-blocks vóór
     * de tekst aan het laatste user-bericht. Max 4 per turn (Vercel 4.5MB body).
     */
    attachments?: Array<{
        mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
        base64: string;
        filename?: string;
    }>;
}

// Anthropic-supported image media types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const MAX_ATTACHMENTS = 4;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB per image (Anthropic cap is 5MB, headroom voor body)

// Welke actietypes mag elke rol uitvoeren? De AI krijgt dit lijstje mee in
// de system-prompt zodat hij nooit een delete_event kaartje genereert voor
// een Medewerker (die het toch niet mag goedkeuren).
const ROLE_ALLOWED_ACTIONS: Record<string, string[]> = {
    Admin: ['*'], // alle acties toegestaan
    Pitmaster: [
        'create_gerecht', 'update_gerecht', 'bulk_create_gerechten',
        'create_event', 'update_event',
        'create_recept', 'update_recept',
        'create_offerte', 'update_offerte',
        'generate_prep_list', 'generate_inkooplijst',
        'generate_event_briefing', 'get_event_winstgevendheid',
        'mark_weak_dishes', 'filter_gerechten',
        'create_folder', 'save_conversation',
    ],
    Medewerker: [
        'generate_prep_list', 'generate_inkooplijst',
        'generate_event_briefing',
        'create_folder', 'save_conversation',
    ],
};

function buildRoleConstraint(userRole?: string | null): string | null {
    if (!userRole || userRole === 'Admin') return null;
    const allowed = ROLE_ALLOWED_ACTIONS[userRole];
    if (!allowed || allowed.includes('*')) return null;
    return [
        '',
        'ROL-BEPERKING:',
        `De huidige gebruiker heeft rol "${userRole}". Hij mag ALLEEN de volgende actietypes goedkeuren: ${allowed.join(', ')}.`,
        'Genereer geen ACTION-blokken voor actietypes buiten deze lijst — daar heeft de gebruiker geen rechten voor.',
        'Als de gebruiker iets vraagt wat buiten zijn rechten ligt, leg dat vriendelijk uit en stel voor dat een Admin het afhandelt.',
    ].join('\n');
}

const MODEL_MAP: Record<string, string> = {
    sonnet: 'claude-sonnet-4-6',
    opus: 'claude-opus-4-7',
    haiku: 'claude-haiku-4-5',
};

export async function POST(req: NextRequest): Promise<NextResponse | Response> {
    try {
        const body: ChatRequestBody = await req.json();
        const { messages, pageContext, mode, contextData, model: modelChoice, thinkingMode: rawThinkingMode, userRole, activeResource, attachments } = body;
        const thinkingMode = isThinkingMode(rawThinkingMode) ? rawThinkingMode : 'standard';
        const modeDef = getMode(thinkingMode);

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Berichten zijn onjuist geformatteerd' }, { status: 400 });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({
                error: 'ANTHROPIC_API_KEY ontbreekt — voeg toe aan .env.local',
                hint: 'Ga naar console.anthropic.com → API Keys → Create key',
            }, { status: 500 });
        }

        // Rate limit check per user (fallback op IP bij anon). Voorkomt dat
        // één defecte client of misbruiker de API-key opzadelt met honderden
        // calls per minuut en alle andere gebruikers blokkeert.
        const sbAuth = await createServerSupabase();
        const { data: { user: authUser } } = await sbAuth.auth.getUser();
        const rateKey = authUser?.id
            ?? req.headers.get('x-forwarded-for')
            ?? req.headers.get('x-real-ip')
            ?? 'anon';
        const rl = checkRateLimit(rateKey, CHAT_REQUESTS_PER_MINUTE);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'Je stuurt te snel berichten. Probeer het over ' + rl.resetInSeconds + 's opnieuw.' },
                { status: 429, headers: { 'Retry-After': String(rl.resetInSeconds) } }
            );
        }

        // Resolve orgId for usage logging + tier-cap enforcement.
        // Falls silent if user has no membership — logging skipped, AI still works.
        let orgId: string | null = null;
        if (authUser) {
            const memRes = await sbAuth
                .from('organization_members')
                .select('organization_id')
                .eq('user_id', authUser.id)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle();
            orgId = memRes.data?.organization_id ?? null;
        }

        // Tier-cap check: soft-throttle at 100%, hard-block at 150%.
        if (orgId) {
            const cap = await checkAiCapServer(orgId);
            if (!cap.allowed) {
                return NextResponse.json({
                    error: 'Je AI-limiet voor deze maand is bereikt. Upgrade je abonnement voor meer capaciteit.',
                    used: cap.used,
                    cap: cap.cap,
                    tier: cap.tier,
                }, { status: 429 });
            }

            // ── Bucket E P0-5 — extra €-cap voor image-uploads ────────────
            // Image-content uit /inkoop bon-scan tikt €0.03/call (Haiku Vision).
            // De action-count cap hierboven dekt aantal acties; deze tweede
            // check dekt €-spend zodat een dure Vision-call bij hoge MTD-spend
            // alsnog geblokkeerd wordt. Hard-block returnt 429 (zelfde shape
            // als nieuwe /api/bonnen/extract route).
            const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
            if (hasAttachments) {
                const costCap = await checkAiCap(orgId, 0.03);
                if (costCap.status === 'hard_block') {
                    return NextResponse.json({
                        error: 'ai_cap_exceeded',
                        message: costCap.message,
                        used_eur: costCap.used_eur,
                        hard_eur: costCap.hard_eur,
                        tier: costCap.tier,
                    }, { status: 429 });
                }
            }
        }

        // System prompt is gesplitst in een statisch deel (cachebaar) en een dynamisch deel (live DB data).
        // De statische blokken samen vormen een byte-identieke prefix per (pageContext, mode, userRole)
        // combinatie; contextData komt ACHTER het cache-breakpoint zodat wisselende DB-data de cache niet
        // invalideert. Bij vervolgvragen op dezelfde pagina wordt de prefix uit de Anthropic cache gelezen
        // voor ~10% van de input-kosten.
        const staticParts: string[] = [];

        // Page-context aware: kies het juiste systeem-prompt + voeg het
        // block-contract toe (welke nav_card-routes zijn toegestaan, welke
        // block-types geprefereerd). Beide blijven in dezelfde cache-prefix
        // omdat ze byte-identiek zijn per (pageContext, mode, userRole).
        const normalizedPage = pageContext ? normalizePagePath(pageContext) : '/';
        if (mode === 'brainstorm') {
            staticParts.push(PAGE_SYSTEM_PROMPTS['/ai-chat']);
            staticParts.push(BRAINSTORM_INSTRUCTIONS);
        } else if (mode === 'general' || mode === 'qa') {
            staticParts.push(
                'Je bent BBQ Copilot, de AI-assistent van BBQ Architect (Hop & Bites). ' +
                'In dit venster beantwoord je vragen over catering, horeca, recepten, inkoop, planning en bedrijfsvoering.'
            );
        } else if (PAGE_SYSTEM_PROMPTS[normalizedPage]) {
            staticParts.push(PAGE_SYSTEM_PROMPTS[normalizedPage]);
            staticParts.push(buildBlockDirective(normalizedPage));
        } else if (pageContext) {
            staticParts.push(
                'Je bent BBQ Copilot op pagina: ' + pageContext + '. ' +
                'Help de gebruiker met alles wat gerelateerd is aan deze pagina van BBQ Architect.'
            );
            staticParts.push(buildBlockDirective(normalizedPage));
        } else {
            staticParts.push(
                'Je bent BBQ Copilot, de AI-assistent van BBQ Architect (Hop & Bites).'
            );
        }

        if (mode !== 'general' && mode !== 'qa') {
            const actionInstructions = getActionInstructions(pageContext || '/');
            if (actionInstructions) {
                staticParts.push(actionInstructions);
            }
        }

        // OPERATOR_INSTRUCTIONS bevatte <<<ACTION:>>> voorbeelden die nu conflicteren met
        // tool-use forcing — Anthropic dwingt het juiste tool-schema af, dus deze prompt-
        // sectie is overbodig én schadelijk (AI gaat letterlijk "<<<ACTION:>>>" output
        // schrijven in blocks). Bewust niet meegestuurd.
        staticParts.push(BASE_PERSONA);
        staticParts.push(MODE_INSTRUCTIONS[thinkingMode]);

        const roleConstraint = buildRoleConstraint(userRole);
        if (roleConstraint) staticParts.push(roleConstraint);

        const systemBlocks: Anthropic.Messages.TextBlockParam[] = [
            { type: 'text', text: staticParts.join('\n'), cache_control: { type: 'ephemeral' } },
        ];
        if (contextData && typeof contextData === 'object' && Object.keys(contextData).length > 0) {
            systemBlocks.push({ type: 'text', text: formatContextForPrompt(contextData) });
        }
        // Active-resource-pill (cross-page context). Achter de cache-breakpoint
        // zodat resource-switches geen prefix-cache-miss veroorzaken.
        if (activeResource && activeResource.label) {
            const kindLabel = ({ event: 'Event', klant: 'Klant', offerte: 'Offerte', klantgesprek: 'Klantgesprek' } as const)[activeResource.kind] || activeResource.kind;
            const metaSuffix = activeResource.meta ? ` (${activeResource.meta})` : '';
            systemBlocks.push({
                type: 'text',
                text: `[ACTIEVE BRON] De gebruiker werkt momenteel aan ${kindLabel}: "${activeResource.label}" — id ${activeResource.id}${metaSuffix}.\nHoud hier rekening mee. Vraag NIET welk ${kindLabel.toLowerCase()} bedoeld wordt — die context is al gegeven. Refereer er expliciet aan in je antwoord wanneer relevant.`,
            });
        }

        // Map messages to Anthropic format — system is separate, only user/assistant in messages
        const anthropicMessages: Anthropic.Messages.MessageParam[] = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        // Drop leading assistant messages — Anthropic requires first message to be from user
        while (anthropicMessages.length > 0 && anthropicMessages[0].role !== 'user') {
            anthropicMessages.shift();
        }

        // Collapse consecutive same-role messages (Anthropic handles it but cleaner)
        const merged: Anthropic.Messages.MessageParam[] = [];
        for (const msg of anthropicMessages) {
            const last = merged[merged.length - 1];
            if (last && last.role === msg.role) {
                // Merge content — both are strings here
                last.content = (last.content as string) + '\n\n' + (msg.content as string);
            } else {
                merged.push({ ...msg });
            }
        }

        // ── Attachments → multimodal user-message ───────────────────────────
        // ChatPanel-composer kan foto's meesturen via base64. We hangen die als
        // image-content-blocks vóór de tekst aan het laatste user-bericht,
        // zodat het model zowel de afbeelding als de bijbehorende vraag krijgt.
        // Limits gevalideerd server-side — client-validatie is alleen UX-helper.
        if (attachments && attachments.length > 0 && merged.length > 0) {
            const lastMsg = merged[merged.length - 1];
            if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
                const accepted = attachments
                    .slice(0, MAX_ATTACHMENTS)
                    .filter((a) => {
                        if (!a || !a.base64 || !a.mediaType) return false;
                        if (!ALLOWED_IMAGE_TYPES.includes(a.mediaType)) return false;
                        // base64 length × 0.75 ≈ byte-size — snelle cap-check zonder decode
                        if (a.base64.length * 0.75 > MAX_IMAGE_BYTES) return false;
                        return true;
                    });
                if (accepted.length > 0) {
                    const blocks: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];
                    for (const att of accepted) {
                        blocks.push({
                            type: 'image',
                            source: { type: 'base64', media_type: att.mediaType, data: att.base64 },
                        });
                    }
                    // User-tekst eerst als plain string verwijderd uit content, daarna na de images.
                    const userText = lastMsg.content || '';
                    blocks.push({
                        type: 'text',
                        text: userText
                            ? userText + '\n\n[' + accepted.length + ' foto(\'s) bijgevoegd — beschrijf wat je ziet en gebruik het in je antwoord. Page-context geldt nog steeds.]'
                            : '[Foto bijgevoegd, geen tekst. Beschrijf wat je ziet op de page-context en stel concrete vervolgactie voor via respond_with_blocks.]',
                    });
                    lastMsg.content = blocks;
                    console.log('[chat] Attachments: ' + accepted.length + ' image(s) attached to user message');
                }
            }
        }

        // ── URL-scraping op /materieel ────────────────────────────────────────
        // Wanneer user URLs plakt: fetch elke pagina + product-image server-side,
        // bouw multimodal content (image + tekst) zodat Claude Vision het werkelijke
        // product ziet. Loopt vóór intent-detection — daarom mag intent-detection
        // niet meer aannemen dat content een string is (zie hieronder).
        let scrapeNeedsScreenshot = false;
        if (normalizedPage === '/materieel' && merged.length > 0) {
            const lastMsg = merged[merged.length - 1];
            if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
                // BELANGRIJK: na collapse-stap kan content meerdere user-messages bevatten
                // (gescheiden door "\n\n"). We willen ALLEEN het laatste segment scannen —
                // anders fired URL-scrape opnieuw wanneer user later Poe-output plakt
                // ná een eerdere URL-paste, en dat geeft een verwarrende screenshot-warning.
                const lastSegment = (lastMsg.content as string).split('\n\n').pop() || '';
                // Detecteer structured Poe/ChatGPT-paste: bevat Naam:/Type:/Materiaal: format.
                // Bij structured paste skippen we URL-scrape — content is al klaar voor parse.
                const isStructuredPaste = /^\s*Naam\s*:/im.test(lastSegment) &&
                                          /^\s*Type\s*:/im.test(lastSegment);
                if (isStructuredPaste) {
                    console.log('[chat] structured paste detected — URL-scrape geskipt');
                }
                const urlPattern = /https?:\/\/[^\s)<>"]+/g;
                const urls = isStructuredPaste ? [] : (lastSegment.match(urlPattern) || []);
                if (urls.length > 0 && urls.length <= 10) {
                    console.log('[chat] URL-scrape: ' + urls.length + ' URLs gedetecteerd');
                    // Totaal-image-budget voor multi-URL scrapes — voorkomt 4.5MB body-limit op Vercel.
                    let totalImageBytes = 0;
                    const MAX_TOTAL_IMAGE_BYTES = 3 * 1024 * 1024; // 3MB headroom onder Vercel cap
                    const fetched = await Promise.all(urls.map(async function (url) {
                        try {
                            const ctrl = new AbortController();
                            const t = setTimeout(function () { ctrl.abort(); }, 8000);
                            const res = await fetch(url, {
                                signal: ctrl.signal,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (compatible; BBQArchitect/1.0; product-info-fetch)',
                                    'Accept': 'text/html,application/xhtml+xml',
                                    'Accept-Language': 'nl,en;q=0.9',
                                },
                            });
                            clearTimeout(t);
                            if (!res.ok) return { url, error: 'HTTP ' + res.status };
                            const html = await res.text();
                            const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                            // Image-URL extractie — meerdere bronnen, eerste die hit:
                            // 1) og:image  2) twitter:image  3) link rel image_src  4) eerste <img> met width
                            const ogImage =
                                html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
                                html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i) ||
                                html.match(/<img[^>]+(?:src|data-src)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["'][^>]*(?:width|class=["'][^"']*product[^"']*["'])/i);
                            const ogDesc = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i);
                            const stripped = html
                                .replace(/<script[\s\S]*?<\/script>/gi, '')
                                .replace(/<style[\s\S]*?<\/style>/gi, '')
                                .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
                                .replace(/<svg[\s\S]*?<\/svg>/gi, '')
                                .replace(/<[^>]+>/g, ' ')
                                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
                                .replace(/\s+/g, ' ').trim()
                                .slice(0, 6000);

                            // Probeer image te fetchen als base64 — Claude Vision ziet dan het werkelijke product
                            let imageData: { mediaType: string; base64: string; url: string } | null = null;
                            const imgUrl = ogImage ? ogImage[1] : null;
                            if (imgUrl && /^https?:\/\//.test(imgUrl)) {
                                try {
                                    const ictrl = new AbortController();
                                    const it = setTimeout(function () { ictrl.abort(); }, 6000);
                                    const ires = await fetch(imgUrl, {
                                        signal: ictrl.signal,
                                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BBQArchitect/1.0)', 'Accept': 'image/*' },
                                    });
                                    clearTimeout(it);
                                    if (ires.ok) {
                                        const ct = ires.headers.get('content-type') || 'image/jpeg';
                                        const cleanType = ct.split(';')[0].trim();
                                        // Alleen Anthropic-supported types; avif/heic skippen.
                                        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                                        if (allowedTypes.indexOf(cleanType) >= 0) {
                                            const buf = Buffer.from(await ires.arrayBuffer());
                                            // Per-image cap 3MB (Anthropic kan max 5MB) + totaal-cap voor body-size
                                            if (buf.length < 3 * 1024 * 1024 && totalImageBytes + buf.length < MAX_TOTAL_IMAGE_BYTES) {
                                                totalImageBytes += buf.length;
                                                imageData = { mediaType: cleanType, base64: buf.toString('base64'), url: imgUrl };
                                            } else {
                                                console.log('[chat] URL-scrape: image skipped (size cap) ' + url + ' ' + buf.length);
                                            }
                                        }
                                    }
                                } catch { /* image fetch failed — text-only fallback */ }
                            }

                            return {
                                url,
                                title: titleMatch ? titleMatch[1].trim() : null,
                                ogImage: imgUrl,
                                ogDesc: ogDesc ? ogDesc[1] : null,
                                content: stripped,
                                imageData,
                            };
                        } catch (e) {
                            return { url, error: (e as Error).message };
                        }
                    }));

                    // Bouw content-blocks: per URL eerst image (als gefetched) dan text-block
                    const contentBlocks: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];
                    contentBlocks.push({ type: 'text', text: (lastMsg.content as string) });
                    for (const f of fetched) {
                        if ('error' in f && f.error) {
                            contentBlocks.push({ type: 'text', text: '\n\n[URL: ' + f.url + ']\nFETCH FAILED: ' + f.error });
                            continue;
                        }
                        if (f.imageData) {
                            contentBlocks.push({
                                type: 'image',
                                source: { type: 'base64', media_type: f.imageData.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: f.imageData.base64 },
                            });
                        }
                        const textBlock = [
                            '\n\n[URL: ' + f.url + ']',
                            f.title ? 'TITLE: ' + f.title : null,
                            f.ogDesc ? 'DESC: ' + f.ogDesc : null,
                            f.ogImage ? 'IMAGE-URL: ' + f.ogImage : null,
                            f.imageData ? '(↑ product-foto hierboven — gebruik Vision om vorm/kleur/textuur te beschrijven)' : null,
                            f.content ? 'TEXT-CONTENT: ' + f.content : null,
                        ].filter(Boolean).join('\n');
                        contentBlocks.push({ type: 'text', text: textBlock });
                    }
                    // Check: heeft tenminste 1 URL bruikbare data opgeleverd? Een SPA-pagina
                    // (HANOS, IKEA, Shopify) levert vaak <500 chars content + geen image. In dat
                    // geval willen we GEEN gokwerk — AI moet vragen om een screenshot.
                    const anyUsableScrape = fetched.some(function (f) {
                        return !('error' in f && f.error) && (f.imageData || (f.content && f.content.length > 500));
                    });
                    if (!anyUsableScrape) {
                        scrapeNeedsScreenshot = true;
                        contentBlocks.push({
                            type: 'text',
                            text: '\n\nDeze URL(s) leveren geen bruikbare content (waarschijnlijk SPA / JS-rendered). Vraag de gebruiker via respond_with_blocks om een SCREENSHOT of product-FOTO te sturen via de paperclip-knop. Gebruik action_hint type met titel "Stuur een foto" en korte uitleg waarom (URL niet leesbaar voor server).',
                        });
                    } else {
                        contentBlocks.push({
                            type: 'text',
                            text: '\n\nLever items[] via bulk_create_materieel. KIJK NAAR DE FOTO\'S — beschrijf werkelijke vorm (rond/ovaal/rechthoekig), kleur, textuur. NIET blind op TITLE afgaan. Voeg foto_url toe per item.',
                        });
                    }
                    lastMsg.content = contentBlocks;
                }
            }
        }

        if (merged.length === 0) {
            return NextResponse.json({ error: 'Geen gebruikersbericht gevonden' }, { status: 400 });
        }

        // Model + max_tokens worden bepaald door de denkmodus (single source of truth in ai-modes.ts).
        // Een expliciete `model` in de request blijft alleen werken als denkmodus standaard is — anders
        // wint de mode (bv. deep -> opus, ongeacht wat de client meestuurt).
        let selectedModel = modeDef.model;
        let maxTokens = modeDef.maxTokens;
        if (thinkingMode === 'standard' && modelChoice && MODEL_MAP[modelChoice]) {
            selectedModel = MODEL_MAP[modelChoice];
        }
        // Brainstorm-mode (legacy) krijgt extra ruimte ongeacht denkmodus
        if (mode === 'brainstorm') {
            maxTokens = Math.max(maxTokens, 4000);
        }

        const client = new Anthropic({ apiKey });

        // ── TOOL-USE FORCING voor /gerechten brainstorm ──────────────────────────
        // Opus 4.7 met thinking negeert prompt-instructies om brainstorm_gerechten_concepts
        // te gebruiken — valt terug op markdown-tabellen. Tool-use forcing dwingt
        // de AI om EXACT dit JSON-schema terug te geven, geen vrije tekst mogelijk.
        // Detect intent: laatste user-message + pageContext = /gerechten + bevat "bedenk"/"brainstorm"/"concept"/"hapje"/"gerechten" + getal.
        // BELANGRIJK: collapse-step hierboven kan opeenvolgende user-messages mergen via "\n\n"
        // (bv. wanneer assistant-message empty content had na een brainstorm-tool-call). Voor
        // intent-detectie kijken we ALLEEN naar het laatste segment — anders triggert oude
        // "bedenk 2 bites" een nieuwe brainstorm wanneer user daarna op Ontwikkel klikt.
        // Content kan string of array zijn (na URL-scrape multimodal). Reduce naar string.
        const lastContent = merged[merged.length - 1]?.content;
        const rawLastUserContent: string = typeof lastContent === 'string'
            ? lastContent
            : Array.isArray(lastContent)
                ? lastContent.filter((b: any) => b && b.type === 'text').map((b: any) => b.text || '').join('\n')
                : '';
        const lastUserMsg = (rawLastUserContent.split('\n\n').pop() || '').toLowerCase();
        // Check via normalizedPage zodat hub-and-spoke routes (bv /inspiratie/gerechten)
        // dezelfde tool-forcing krijgen als hun stand-alone variant.
        const isOnGerechten = normalizedPage === '/gerechten' || normalizedPage === '/marges' || normalizedPage === '/ai-chat' || normalizedPage === '/recepten';
        const wantsBrainstorm = isOnGerechten && (
            /\b(bedenk|brainstorm|maak|geef me|verzin|kom met|stel\s*samen|kom\s*op\s*met)\b/.test(lastUserMsg) &&
            /\b\d+\b/.test(lastUserMsg) &&
            /\b(gerecht|gerechten|hapje|hapjes|concept|concepten|bite|bites|menu|recept|recepten|gangen?|borrelhap|voorgerecht|hoofdgerecht|dessert|amuse|bijgerecht)\b/.test(lastUserMsg)
        );
        // Bredere develop-detector: vangt ook "marge advies", "wellington uitwerken", "geef me het recept"
        const wantsDevelop = isOnGerechten && (
            /\b(ontwikkel|werk\s*uit|push\s*(naar|in)|uitwerken)\b/.test(lastUserMsg) ||
            // Specifiek concept-naam genoemd na "marge"/"recept"/"advies"
            /\b(marge\s*(advies|berekening|indicatie)|recept\s*van|geef\s*(me\s*)?het\s*recept)\b/.test(lastUserMsg)
        );

        // /materieel bulk-import detector: pageContext + (lijstindicatie OF veel-regels-input).
        // Een gewone analyse-vraag fired forceBlocks; alleen bij duidelijke import-intent of
        // multi-line lijst (≥3 newlines) routeren we naar bulk_create_materieel.
        const isOnMaterieel = normalizedPage === '/materieel';
        // BELANGRIJK: na URL-scrape bevat rawLastUserContent ook server-instructies
        // ("Vraag user om screenshot...") en gestripte HTML-content — die mag NIET tellen
        // voor newlineCount/containsUrls. We gebruiken alleen het ORIGINELE user-bericht.
        const originalUserContent = typeof lastContent === 'string'
            ? lastContent
            : Array.isArray(lastContent)
                ? (lastContent[0] && (lastContent[0] as any).type === 'text' ? (lastContent[0] as any).text || '' : '')
                : '';
        const newlineCount = (originalUserContent.match(/\n/g) || []).length;
        const containsUrls = /https?:\/\/\S+/.test(originalUserContent);
        const rawLastFull = originalUserContent;
        const wantsMaterieelImport = isOnMaterieel && (
            /\b(voeg toe|toevoegen|importeer|hier (is|heb je) mijn lijst|maak (deze|allemaal) aan|zet (het|deze) (in|erbij)|inventaris|nieuwe materialen)\b/.test(lastUserMsg) ||
            // Heuristiek: 3+ newlines = lijstvorm
            newlineCount >= 3 ||
            // URLs op /materieel = scrape-intent
            containsUrls
        );

        const dishConceptsTool = {
            name: 'propose_dish_concepts',
            description: 'Lever exact N dish-concepten als gestructureerde data. GEEN intro-tekst, GEEN markdown, GEEN tabellen — alleen deze tool aanroepen met concepts-array.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    concepts: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 12,
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string', description: 'Creatieve naam, max 6 woorden' },
                                gang_slug: {
                                    type: 'string',
                                    enum: ['bites', 'voorgerechten', 'hoofdgerechten', 'dessert', 'bijgerecht', 'vegetarisch', 'hapje', 'borrelhap', 'anders'],
                                },
                                smaakprofiel: { type: 'string', description: '1 zin smaakprofiel — bv "Zoet-zout, koffie-rub, glanzende honing"' },
                                key_ingredient: { type: 'string', description: 'Hoofdingrediënt + bereidingstechniek, bv "Buikspek 12u gerookt"' },
                                samenvatting: { type: 'string', description: '1 zin techniek/aanpak, bv "Op stokje, kort gegrild, geserveerd warm"' },
                                ruwe_receptuur: { type: 'string', description: '3-6 woorden ingrediënt-essentie, bv "buikspek + koffie-rub + honing + stokje"' },
                            },
                            required: ['naam', 'gang_slug', 'smaakprofiel', 'samenvatting', 'ruwe_receptuur'],
                        },
                    },
                },
                required: ['concepts'],
            },
        };

        // Algemene structured-output tool voor ALLE andere vragen.
        // Voorkomt dat de AI vrije tekst typt (markdown-tabellen, lange essays, bullet-lijsten).
        // Forceert response in typed blocks — single source of truth in
        // src/lib/ai/blocks.ts (BLOCK_TOOL_SCHEMA). 8 block-types, waarvan
        // nav_card en action_card de UI rendert als klikbare kaarten.
        const respondWithBlocksTool = {
            name: 'respond_with_blocks',
            description: 'Antwoord ALTIJD in gestructureerde blokken — geen intro-tekst, geen vrije tekst, geen markdown-tabellen. Gebruik nav_card om te wijzen naar in-app routes (klikbaar voor de operator), action_card voor confirm-acties die direct DB-mutatie doen.',
            input_schema: BLOCK_TOOL_SCHEMA,
        };

        // STAP 2 tool: dwingt structured uitwerking ipv markdown-tabellen
        const developDishesTool = {
            name: 'develop_dishes',
            description: 'Werk N geselecteerde concepten volledig uit als gestructureerde data. ABSOLUUT GEEN markdown-tabellen, GEEN intro-tekst, GEEN essays — alleen deze tool aanroepen met gerechten-array.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    gerechten: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 6,
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string' },
                                gang_slug: {
                                    type: 'string',
                                    enum: ['bites', 'voorgerechten', 'hoofdgerechten', 'dessert', 'bijgerecht', 'vegetarisch', 'hapje', 'borrelhap', 'anders'],
                                },
                                beschrijving: { type: 'string', description: '2 zinnen smaakprofiel + visuele beschrijving' },
                                bereidingswijze: { type: 'string', description: 'Genummerde stappen 1. ... 2. ... — minstens 5 stappen, professionele kokstaal' },
                                ingredienten: {
                                    type: 'array',
                                    minItems: 5,
                                    items: { type: 'string', description: 'Ingrediënt + hoeveelheid + eenheid, bv "Buikspek 200g"' },
                                },
                                allergenen: {
                                    type: 'array',
                                    items: {
                                        type: 'string',
                                        enum: ['Gluten', 'Melk', 'Eieren', 'Vis', 'Noten', 'Soja', 'Selderij', 'Mosterd', 'Sulfiet', 'Lupine', 'Weekdieren', 'Sesamzaad', 'Pinda', 'Schaaldieren'],
                                    },
                                },
                                kostprijs_pp: { type: 'number', description: 'Geschat in euro p.p.' },
                                verkoopprijs: { type: 'number', description: 'Adviesprijs in euro — kostprijs / 0.30 voor 70% marge bij hoofdgerechten, /0.40 bij bites' },
                                marge_pct: { type: 'integer', description: 'Bruto marge%, bereken: ((verkoop - kost) / verkoop * 100), afgerond' },
                                pijnpunten: {
                                    type: 'array', minItems: 2, maxItems: 4,
                                    items: { type: 'string', description: 'Zwak punt — bv "vereist 12u smoker", "houdbaarheid 2u"' },
                                },
                                toppunten: {
                                    type: 'array', minItems: 2, maxItems: 4,
                                    items: { type: 'string', description: 'Sterk punt — bv "showstopper visueel", "marge 78%"' },
                                },
                                foto_prompt: {
                                    type: 'string',
                                    description: [
                                        'Engelse GPT Image 2 prompt — REALISTISCHE craft-style food fotografie, GEEN AI-perfect fine-dining. ',
                                        'Voelt aan als echte foto door mensen-handen gemaakt: slight imperfections, organic variations, handmade character. ',
                                        'Format (5-7 zinnen, geen tekst-overlays):',
                                        '',
                                        '"Authentic craft food photography of [GERECHT-NAAM in EN], shot in real restaurant kitchen ambiance. ',
                                        'Hero ingredient: [ingrediënt + EXACT formaat/grootte/quality — bv "30/40 count tiger shrimp, lightly charred edges with NATURAL VARIATION in browning, glistening with leche de tigre marinade — slightly uneven cuts showing handmade prep"]. ',
                                        'Supporting elements: [2-3 extra ingrediënten met visuele details + menselijk touch — bv "hand-diced ripe Ataulfo mango cubes ~5mm with slight size variation, fresh micro cilantro sprigs, finely sliced red onion rings showing natural cell-structure"]. ',
                                        'Plating: [serveerwijze + bord/glas type, geen rigide perfectie — bv "served casually in clear shot glass on weathered slate, edible flower placed off-center for organic feel"]. ',
                                        'Lighting & camera: [natural daylight, no studio softboxes — bv "natural window light from side, slight shadows showing real depth, 50mm lens at f/4, shallow but not extreme depth of field, slightly tilted angle as if shot by chef during service"]. ',
                                        'Style: rustic wooden surface or weathered slate or natural linen — Hop & Bites foodtruck/bistro quality. ',
                                        'IMPORTANT: avoid plastic-perfect AI symmetry, avoid Michelin-star sterility, embrace minor human imperfections (asymmetric placement, slight smudges of sauce, uneven garnish), real food photography NOT advertisement. ',
                                        'No text, no watermark, no people, no logos. Documentary craft-style realism."',
                                        '',
                                        'BELANGRIJK: ALTIJD ingredient-specifieke details + woorden zoals "hand-diced", "slight variation", "natural", "uneven", "casual", "organic" om de AI-perfect-look te doorbreken.',
                                    ].join('\n'),
                                },
                            },
                            required: ['naam', 'gang_slug', 'beschrijving', 'bereidingswijze', 'ingredienten', 'allergenen', 'kostprijs_pp', 'verkoopprijs', 'marge_pct', 'pijnpunten', 'toppunten', 'foto_prompt'],
                        },
                    },
                },
                required: ['gerechten'],
            },
        };

        // /materieel bulk-import: parse user-lijst (vrije tekst) → array materieel-records.
        // Geen redenering nodig — Haiku is genoeg. Voorkomt vrije-tekst-essays in de chat.
        const bulkCreateMaterieelTool = {
            name: 'bulk_create_materieel',
            description: 'Parse de gebruikers-lijst en lever materieel-records als gestructureerde array. GEEN intro-tekst, GEEN markdown, GEEN essays — alleen items[].',
            input_schema: {
                type: 'object' as const,
                properties: {
                    items: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 50,
                        items: {
                            type: 'object',
                            properties: {
                                naam: { type: 'string', description: 'Korte naam, max 60 chars' },
                                type: {
                                    type: 'string',
                                    enum: ['BBQ', 'Servies', 'Linnen', 'Koeling', 'Transport', 'Meubilair', 'Overig'],
                                    description: 'Categorie. Aliassen mappen naar enum: bord/kom/glas/bestek→Servies, kettle/kamado/grill→BBQ, koelbox/freezer→Koeling, tafel/stoel→Meubilair, doek/kleed→Linnen, krat/aanhanger→Transport.',
                                },
                                aantal: { type: 'integer', description: 'Aantal stuks, default 1' },
                                kleur: { type: 'string', description: 'Optioneel — bv "wit", "antraciet"' },
                                materiaal: { type: 'string', description: 'Optioneel — bv "porselein", "rvs", "linnen"' },
                                afmetingen: { type: 'string', description: 'Optioneel — bv "Ø 28cm", "60x40cm"' },
                                locatie: { type: 'string', description: 'Optioneel — bv "Loods A", "Truck"' },
                                notitie: { type: 'string', description: 'Optioneel — extra context uit de bron-lijst' },
                                foto_url: { type: 'string', description: 'Optioneel — directe URL naar product-image (uit og:image of <img src> van gescrapte URL).' },
                            },
                            required: ['naam', 'type'],
                        },
                    },
                },
                required: ['items'],
            },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const streamParams: any = {
            model: selectedModel,
            max_tokens: maxTokens,
            system: systemBlocks,
            messages: merged,
            temperature: modeDef.temperature,
        };
        // Pages waar we ALTIJD structured blocks willen ipv vrije tekst.
        // Block-forced op elke pagina die in PAGE_TOOL_WHITELIST staat. Self-
        // maintaining: voeg een page toe aan src/lib/ai/page-contracts.ts en
        // hij krijgt automatisch het block-contract. /ai-chat en /q/[id] zijn
        // bewust uit de whitelist gelaten — chat-studio heeft geen page-context,
        // klant-portal heeft helemaal geen AI.
        const forceBlocks = !!PAGE_TOOL_WHITELIST[normalizedPage];

        if (scrapeNeedsScreenshot) {
            // URL-scrape kreeg geen bruikbare content (SPA-pagina). AI moet om screenshot vragen
            // via respond_with_blocks ipv te gokken op product-info.
            streamParams.tools = [respondWithBlocksTool];
            streamParams.tool_choice = { type: 'tool', name: 'respond_with_blocks' };
            console.log('[chat] Tool-use forced: respond_with_blocks (URL-scrape needs screenshot)');
        } else if (wantsMaterieelImport) {
            // Haiku is genoeg voor pure parse-taak — geen redenering, alleen tekst→JSON.
            streamParams.tools = [bulkCreateMaterieelTool];
            streamParams.tool_choice = { type: 'tool', name: 'bulk_create_materieel' };
            streamParams.model = 'claude-haiku-4-5-20251001';
            selectedModel = 'claude-haiku-4-5-20251001'; // sync voor token-logging + cost-estimate
            // 50 items × ~120 tokens (incl kleur/materiaal/afmetingen/foto_url) = 6000.
            // Met buffer voor multi-URL scrape: 8000.
            if ((streamParams.max_tokens || 0) < 8000) streamParams.max_tokens = 8000;
            // Haiku ondersteunt geen extended thinking → strip die params voor de zekerheid.
            delete streamParams.thinking;
            delete streamParams.output_config;
            console.log('[chat] Tool-use forced: bulk_create_materieel (haiku, materieel import)');
        } else if (wantsBrainstorm) {
            streamParams.tools = [dishConceptsTool];
            streamParams.tool_choice = { type: 'tool', name: 'propose_dish_concepts' };
            // 6-8 concepten met receptuur passen niet in 1000 tokens (Standaard cap).
            // Tool-use JSON kapt af → parse faalt → lege response. Bump naar minimaal 4000.
            if ((streamParams.max_tokens || 0) < 4000) streamParams.max_tokens = 4000;
            console.log('[chat] Tool-use forced: propose_dish_concepts (brainstorm intent)');
        } else if (wantsDevelop) {
            streamParams.tools = [developDishesTool];
            streamParams.tool_choice = { type: 'tool', name: 'develop_dishes' };
            // Volledige uitwerking (recept + ingrediënten + foto-prompt) per gerecht
            // is ~2k tokens. Voor 3 gerechten = ~6k. Bump naar minimaal 8000.
            if ((streamParams.max_tokens || 0) < 8000) streamParams.max_tokens = 8000;
            console.log('[chat] Tool-use forced: develop_dishes (uitwerking intent)');
        } else if (forceBlocks) {
            streamParams.tools = [respondWithBlocksTool];
            streamParams.tool_choice = { type: 'tool', name: 'respond_with_blocks' };
            console.log('[chat] Tool-use forced: respond_with_blocks (page=' + pageContext + ')');
        } else if (modeDef.thinking) {
            // Extended thinking voor deep-mode (Opus 4.7 = adaptive + output_config.effort).
            streamParams.thinking = { type: 'adaptive' };
            streamParams.output_config = { effort: modeDef.thinking.effort };
        }

        const stream = client.messages.stream(streamParams);

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                let fullText = '';
                let usage: Anthropic.Messages.Usage | null = null;
                let outputTokens = 0;
                let controllerClosed = false;
                // Helper: enqueue alleen zolang client nog luistert. Voorkomt
                // 'Invalid state: Controller is already closed' wanneer de
                // browser-fetch wordt afgebroken (timeout / nieuwe request).
                function safeEnqueue(payload: object): void {
                    if (controllerClosed) return;
                    try {
                        controller.enqueue(encoder.encode('data: ' + JSON.stringify(payload) + '\n\n'));
                    } catch {
                        controllerClosed = true;
                    }
                }
                // Tool-use streaming: verzamel partial JSON per content-block index.
                // Bij content_block_stop converteren we de complete tool input naar
                // een <<<ACTION:...>>> blok zodat de bestaande client-parser werkt.
                const toolUseBuffers: Record<number, { name: string; jsonAcc: string }> = {};
                try {
                    for await (const event of stream) {
                        if (controllerClosed) break;
                        if (event.type === 'message_start') {
                            usage = event.message.usage;
                        } else if (event.type === 'content_block_start') {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const block = (event as any).content_block;
                            if (block?.type === 'tool_use') {
                                toolUseBuffers[event.index] = { name: block.name as string, jsonAcc: '' };
                            }
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            const delta = event.delta.text;
                            if (delta) {
                                fullText += delta;
                                safeEnqueue({ delta });
                            }
                        } else if (event.type === 'content_block_delta' && event.delta.type === 'thinking_delta') {
                            // Extended thinking stream — apart kanaal zodat UI dit collapsible kan tonen
                            const thinking = event.delta.thinking;
                            if (thinking) {
                                safeEnqueue({ thinking });
                            }
                        } else if (event.type === 'content_block_delta' && (event.delta as { type?: string }).type === 'input_json_delta') {
                            // Tool-use partial JSON — accumuleer per block index
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const partial = (event.delta as any).partial_json as string | undefined;
                            if (partial && toolUseBuffers[event.index]) {
                                toolUseBuffers[event.index].jsonAcc += partial;
                            }
                        } else if (event.type === 'content_block_stop') {
                            const buf = toolUseBuffers[event.index];
                            if (buf && buf.jsonAcc) {
                                try {
                                    const input = JSON.parse(buf.jsonAcc);
                                    // GEEN intro-tekst meer — alles in blokken/cards.
                                    // De UI rendert action-kaarten met eigen header/description.
                                    if (buf.name === 'propose_dish_concepts') {
                                        const actionPayload = {
                                            type: 'brainstorm_gerechten_concepts',
                                            description: (input.concepts?.length || 0) + ' concepten — klik per blok Ontwikkel & push',
                                            data: { concepts: input.concepts || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    } else if (buf.name === 'respond_with_blocks') {
                                        // Hallucination-guard. Voor elk block-type met een route-veld
                                        // (nav_card, metric.route, bullets-items[].route): controleer
                                        // tegen PAGE_ROUTE_WHITELIST. Een verboden route op een nav_card
                                        // doodt het hele block; op een metric/bullet-item alleen het
                                        // route-veld (block blijft over zonder klik-target).
                                        const rawBlocks: unknown[] = Array.isArray(input.blocks) ? input.blocks : [];
                                        const cleanBlocks = rawBlocks
                                            .filter((b) => isBlock(b))
                                            .map((b) => {
                                                if (b.type === 'nav_card') {
                                                    if (isRouteAllowed(normalizedPage, b.route)) return b;
                                                    console.warn('[chat] nav_card route geblokkeerd (niet in whitelist voor ' + normalizedPage + '):', b.route);
                                                    return null;
                                                }
                                                if (b.type === 'metric' && b.route && !isRouteAllowed(normalizedPage, b.route)) {
                                                    console.warn('[chat] metric.route geblokkeerd:', b.route);
                                                    const { route: _r, label: _l, ...rest } = b;
                                                    return rest;
                                                }
                                                if (b.type === 'bullets' && Array.isArray(b.items)) {
                                                    const cleanItems = b.items.map((it) => {
                                                        if (typeof it === 'string') return it;
                                                        if (!it || typeof it !== 'object') return it;
                                                        if (typeof it.text !== 'string') return null;
                                                        if (it.route && !isRouteAllowed(normalizedPage, it.route)) {
                                                            console.warn('[chat] bullets-item route geblokkeerd:', it.route);
                                                            return { ...it, route: undefined };
                                                        }
                                                        return it;
                                                    }).filter((it) => it !== null);
                                                    return { ...b, items: cleanItems };
                                                }
                                                return b;
                                            })
                                            .filter((b) => b !== null);
                                        const actionPayload = {
                                            type: 'info_blocks',
                                            description: cleanBlocks.length + ' antwoord-blokken',
                                            data: { blocks: cleanBlocks },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    } else if (buf.name === 'develop_dishes') {
                                        const actionPayload = {
                                            type: 'bulk_create_gerechten',
                                            description: (input.gerechten?.length || 0) + ' gerecht(en) uitgewerkt — push naar Gerechten',
                                            data: { gerechten: input.gerechten || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    } else if (buf.name === 'bulk_create_materieel') {
                                        const actionPayload = {
                                            type: 'bulk_create_materieel',
                                            description: (input.items?.length || 0) + ' item(s) gevonden — push naar Materieel',
                                            data: { items: input.items || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    }
                                } catch (e) {
                                    // Truncated tool-use JSON (vaak door max_tokens cap). Geef user
                                    // een leesbare fout-bubble ipv een lege bubble.
                                    console.error('[chat] tool_use JSON parse failed:', (e as Error).message, 'jsonAcc length:', buf.jsonAcc.length);
                                    const errBlock = '<<<ACTION:' + JSON.stringify({
                                        type: 'info_blocks',
                                        description: 'AI-antwoord onvolledig',
                                        data: { blocks: [{
                                            type: 'warning',
                                            title: 'Antwoord werd afgekapt',
                                            text: 'AI raakte tokens kwijt voordat het hele antwoord af was. Probeer specifieker te vragen of kies denkmodus Diep voor meer ruimte.',
                                        }] },
                                    }) + '>>>';
                                    fullText += errBlock;
                                    safeEnqueue({ delta: errBlock });
                                }
                            }
                        } else if (event.type === 'message_delta' && event.usage) {
                            // final output_tokens arrives here
                            outputTokens = event.usage.output_tokens ?? outputTokens;
                        }
                    }
                    if (usage) {
                        console.log(`[chat] ${selectedModel} tokens: input=${usage.input_tokens} output=${outputTokens} cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0}`);
                    }
                    // Log usage to ai_usage table (fire-and-forget, never blocks stream)
                    if (orgId && usage) {
                        const cost = estimateAiCostCents({
                            model: selectedModel,
                            tokens_input: usage.input_tokens,
                            tokens_output: outputTokens,
                            tokens_cache_read: usage.cache_read_input_tokens ?? 0,
                            tokens_cache_creation: usage.cache_creation_input_tokens ?? 0,
                        });
                        logAiUsageServer({
                            organization_id: orgId,
                            user_id: authUser?.id ?? null,
                            action_type: 'chat',
                            model: selectedModel,
                            tokens_input: usage.input_tokens,
                            tokens_output: outputTokens,
                            tokens_cache_read: usage.cache_read_input_tokens ?? 0,
                            tokens_cache_creation: usage.cache_creation_input_tokens ?? 0,
                            cost_eur_cents: cost,
                            metadata: { mode, pageContext, thinkingMode },
                        }).catch(function (e) { console.warn('[chat] ai_usage log failed:', (e as Error).message); });
                    }
                    safeEnqueue({
                        done: true,
                        full: fullText,
                        model: selectedModel,
                    });
                } catch (err: any) {
                    // Niet meer loggen wanneer client al wegging — alleen echte errors
                    if (!controllerClosed) {
                        console.error('Anthropic stream error:', err);
                    }
                    const msg = err instanceof Anthropic.AuthenticationError
                        ? 'Ongeldige ANTHROPIC_API_KEY'
                        : err instanceof Anthropic.RateLimitError
                        ? 'AI rate limit bereikt — wacht even en probeer opnieuw.'
                        : err instanceof Anthropic.APIError
                        ? 'Claude API fout: ' + err.message
                        : err?.message || 'Onbekende AI-fout';
                    safeEnqueue({ error: msg, done: true, full: fullText });
                } finally {
                    if (!controllerClosed) {
                        try { controller.close(); } catch { /* already closed */ }
                    }
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        // Uitgebreide logging zodat we errors in de Terminal kunnen zien
        const details = {
            name: error?.name,
            message: error?.message,
            status: error?.status,
            type: error?.error?.type,
            inner: error?.error?.error?.message,
            stack: error?.stack?.split('\n').slice(0, 3).join(' | '),
        };
        console.error('[CHAT API ERROR]', JSON.stringify(details, null, 2));

        if (error instanceof Anthropic.AuthenticationError) {
            return NextResponse.json({ error: 'Ongeldige ANTHROPIC_API_KEY', detail: error.message }, { status: 401 });
        }
        if (error instanceof Anthropic.RateLimitError) {
            return NextResponse.json({ error: 'Rate limit — wacht even', detail: error.message }, { status: 429 });
        }
        if (error instanceof Anthropic.BadRequestError) {
            return NextResponse.json({ error: 'Anthropic API fout', detail: error.message, status: error.status }, { status: 400 });
        }
        if (error instanceof Anthropic.NotFoundError) {
            return NextResponse.json({
                error: 'Model niet beschikbaar — mogelijk geen toegang tot dit model op jouw account',
                detail: error.message,
                hint: 'Check console.anthropic.com → Models voor beschikbare modellen',
            }, { status: 404 });
        }
        if (error instanceof Anthropic.APIError) {
            return NextResponse.json({ error: 'Anthropic API fout', detail: error.message, status: error.status }, { status: error.status || 502 });
        }
        return NextResponse.json({
            error: 'Interne serverfout',
            detail: error?.message || 'onbekend',
            name: error?.name,
        }, { status: 500 });
    }
}
