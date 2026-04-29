/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getActionInstructions, formatContextForPrompt } from '@/lib/ai-actions';
import { createServerSupabase } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rateLimit';
import { PAGE_SYSTEM_PROMPTS, OPERATOR_INSTRUCTIONS, BASE_PERSONA, MODE_INSTRUCTIONS, BRAINSTORM_INSTRUCTIONS, normalizePagePath } from '@/lib/ai-prompts';
import { getMode, isThinkingMode, type ThinkingMode } from '@/lib/ai-modes';
import { logAiUsageServer, checkAiCapServer } from '@/lib/aiUsageServer';
import { estimateAiCostCents } from '@/lib/aiCost';
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
}

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
        const { messages, pageContext, mode, contextData, model: modelChoice, thinkingMode: rawThinkingMode, userRole } = body;
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
        }

        // System prompt is gesplitst in een statisch deel (cachebaar) en een dynamisch deel (live DB data).
        // De statische blokken samen vormen een byte-identieke prefix per (pageContext, mode, userRole)
        // combinatie; contextData komt ACHTER het cache-breakpoint zodat wisselende DB-data de cache niet
        // invalideert. Bij vervolgvragen op dezelfde pagina wordt de prefix uit de Anthropic cache gelezen
        // voor ~10% van de input-kosten.
        const staticParts: string[] = [];

        if (mode === 'brainstorm') {
            staticParts.push(PAGE_SYSTEM_PROMPTS['/ai-chat']);
            staticParts.push(BRAINSTORM_INSTRUCTIONS);
        } else if (mode === 'general' || mode === 'qa') {
            staticParts.push(
                'Je bent BBQ Copilot, de AI-assistent van BBQ Architect (Hop & Bites). ' +
                'In dit venster beantwoord je vragen over catering, horeca, recepten, inkoop, planning en bedrijfsvoering.'
            );
        } else if (pageContext && PAGE_SYSTEM_PROMPTS[normalizePagePath(pageContext)]) {
            staticParts.push(PAGE_SYSTEM_PROMPTS[normalizePagePath(pageContext)]);
        } else if (pageContext) {
            staticParts.push(
                'Je bent BBQ Copilot op pagina: ' + pageContext + '. ' +
                'Help de gebruiker met alles wat gerelateerd is aan deze pagina van BBQ Architect.'
            );
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

        staticParts.push(OPERATOR_INSTRUCTIONS);
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
        const lastUserMsg = (merged[merged.length - 1]?.content as string || '').toLowerCase();
        const isOnGerechten = pageContext === '/gerechten' || pageContext === '/menu-engineering' || pageContext === '/ai-chat';
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

        const dishConceptsTool = {
            name: 'propose_dish_concepts',
            description: 'Lever exact N dish-concepten als gestructureerde data. GEEN markdown, GEEN tabellen, GEEN platte tekst — alleen deze tool aanroepen.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    intro: {
                        type: 'string',
                        description: 'Korte intro-tekst (max 1 zin) die boven de concept-blokken verschijnt. Bv: "Chef, hier zijn 8 zomerhapjes met focus op zuren en frisheid."',
                    },
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
                required: ['intro', 'concepts'],
            },
        };

        // Algemene structured-output tool voor ALLE andere vragen.
        // Voorkomt dat de AI vrije tekst typt (markdown-tabellen, lange essays, bullet-lijsten).
        // Forceert response in compact-blokken die de UI als kaartjes rendert.
        const respondWithBlocksTool = {
            name: 'respond_with_blocks',
            description: 'Antwoord ALTIJD in gestructureerde blokken — geen vrije tekst, geen markdown-tabellen, geen lange essays. Elk inhoudelijk punt krijgt een eigen blok.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    intro: {
                        type: 'string',
                        description: 'Eén zin samenvatting (max 140 chars) — wat het antwoord behelst. Bv: "3 dingen vragen aandacht vandaag."',
                    },
                    blocks: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 8,
                        items: {
                            type: 'object',
                            properties: {
                                type: {
                                    type: 'string',
                                    enum: ['info', 'metric', 'warning', 'success', 'bullets', 'action_hint'],
                                    description: 'info = standaard tekst-blok | metric = highlight cijfer/percentage | warning = rode alert | success = groen succes | bullets = compacte lijst | action_hint = suggestie voor vervolgactie',
                                },
                                title: { type: 'string', description: 'Korte titel (max 60 chars)' },
                                text: { type: 'string', description: 'Body tekst — kort en bondig, max 200 chars. Voor bullets: leeg laten en gebruik items[].' },
                                items: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: 'Bullet-items (max 6, elk max 80 chars). Alleen bij type=bullets.',
                                },
                                value: {
                                    type: 'string',
                                    description: 'Highlight-waarde voor metric (bv "70%", "€8.400", "12 verlopen"). Alleen bij type=metric.',
                                },
                            },
                            required: ['type', 'title'],
                        },
                    },
                },
                required: ['intro', 'blocks'],
            },
        };

        // STAP 2 tool: dwingt structured uitwerking ipv markdown-tabellen
        const developDishesTool = {
            name: 'develop_dishes',
            description: 'Werk N geselecteerde concepten volledig uit als gestructureerde data. ABSOLUUT GEEN markdown-tabellen, GEEN intro-essays, GEEN marge-tabel — alleen deze tool aanroepen.',
            input_schema: {
                type: 'object' as const,
                properties: {
                    intro: {
                        type: 'string',
                        description: 'EEN ZIN max — chef-stijl bevestiging. Bv: "Chef, hier zijn de 3 uitgewerkte concepten — push klaar."',
                    },
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
                required: ['intro', 'gerechten'],
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
        // Service-mode is uitgesloten — daar wil je ultrakort tekst-antwoord, geen kaarten.
        const forceBlocks = (
            pageContext === '/gerechten' ||
            pageContext === '/menu-engineering' ||
            pageContext === '/voorraad' ||
            pageContext === '/' ||
            pageContext === '/offertes' ||
            pageContext === '/facturen' ||
            pageContext === '/recepten' ||
            (pageContext && pageContext.startsWith('/events'))
        );

        if (wantsBrainstorm) {
            streamParams.tools = [dishConceptsTool];
            streamParams.tool_choice = { type: 'tool', name: 'propose_dish_concepts' };
            console.log('[chat] Tool-use forced: propose_dish_concepts (brainstorm intent)');
        } else if (wantsDevelop) {
            streamParams.tools = [developDishesTool];
            streamParams.tool_choice = { type: 'tool', name: 'develop_dishes' };
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
                                    if (buf.name === 'propose_dish_concepts') {
                                        // Zet om naar brainstorm_gerechten_concepts ACTION zodat de
                                        // bestaande renderConceptCards in AiAssistant.tsx het oppikt.
                                        const intro = typeof input.intro === 'string' ? input.intro : '';
                                        if (intro) {
                                            const introDelta = intro + '\n\n';
                                            fullText += introDelta;
                                            safeEnqueue({ delta: introDelta });
                                        }
                                        const actionPayload = {
                                            type: 'brainstorm_gerechten_concepts',
                                            description: (input.concepts?.length || 0) + ' concepten — klik per blok Ontwikkel & push',
                                            data: { concepts: input.concepts || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    } else if (buf.name === 'respond_with_blocks') {
                                        // Generieke gestructureerde response — UI rendert als kaartjes
                                        const intro = typeof input.intro === 'string' ? input.intro : '';
                                        if (intro) {
                                            const introDelta = intro + '\n\n';
                                            fullText += introDelta;
                                            safeEnqueue({ delta: introDelta });
                                        }
                                        const actionPayload = {
                                            type: 'info_blocks',
                                            description: (input.blocks?.length || 0) + ' antwoord-blokken',
                                            data: { blocks: input.blocks || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    } else if (buf.name === 'develop_dishes') {
                                        // Zet om naar bulk_create_gerechten ACTION zodat renderDishCards het oppikt.
                                        // Bereidingswijze normaliseren: array of string allebei OK voor downstream.
                                        const intro = typeof input.intro === 'string' ? input.intro : '';
                                        if (intro) {
                                            const introDelta = intro + '\n\n';
                                            fullText += introDelta;
                                            safeEnqueue({ delta: introDelta });
                                        }
                                        const actionPayload = {
                                            type: 'bulk_create_gerechten',
                                            description: (input.gerechten?.length || 0) + ' gerecht(en) uitgewerkt — push naar Gerechten',
                                            data: { gerechten: input.gerechten || [] },
                                        };
                                        const actionStr = '<<<ACTION:' + JSON.stringify(actionPayload) + '>>>';
                                        fullText += actionStr;
                                        safeEnqueue({ delta: actionStr });
                                    }
                                } catch (e) {
                                    console.error('[chat] tool_use JSON parse failed:', (e as Error).message);
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
