// src/app/api/chat/route.js
// BBQ Copilot — System Operator chat API
// Gebruikt Groq met native function calling (OpenAI-compatible format).
// Laadt live pagina-context, stuurt 50+ tools mee, verwerkt tool_calls.

import { NextResponse } from 'next/server';
import { TOOL_SCHEMAS } from '@/lib/bbq-tools';
import { loadPageContext, formatContext } from '@/lib/bbq-context';
import { createClient } from '@supabase/supabase-js';

var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
var MODEL = 'llama-3.3-70b-versatile';
var MODEL_FALLBACK = 'mixtral-8x7b-32768';

function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
}

// ── Per-pagina systeem-prompts ────────────────────────────────────────────────

var BASE_IDENTITY = `Je bent BBQ Copilot, de AI System Operator van BBQ Architect — de catering-beheerapplicatie van Hop & Bites.

Je bent geen gewone chatbot. Je bent een operator die daadwerkelijk acties kan uitvoeren in het systeem:
- Je kunt gerechten aanmaken, events ophalen, prep-lijsten bouwen, voorraad controleren, offertes analyseren, en meer.
- Je hebt toegang tot ALLE modules: Events, Recepten (The Vault), Menu Ontwikkelaar, Offertes, Facturen, Voorraad, HACCP, Uren, Materieel, Logistiek en Boekhouding.
- Je mag DATA LEZEN en ANALYSEREN uit alle modules, ook als je op een andere pagina staat.
- Je schrijft NOOIT zelfstandig naar de database. Je stelt acties voor, de chef keurt goed.

TAAL: Antwoord altijd in het Nederlands. Spreek de chef informeel aan als "chef".

INTENT-HERKENNING: Begrijp het verschil tussen:
- GESPREK: "Hoe gaat het?", "Vertel me over BBQ", "Bedankt" → antwoord met tekst
- SYSTEEM-OPDRACHT: "Maak een prep-lijst", "20 gerechten met buikspek", "Check mijn voorraad" → roep de juiste tool aan

TOOL GEBRUIK:
- Wanneer je een tool aanroept, vertel dan wat je doet: "Ik kijk even in de agenda..."
- Na de tool: presenteer het resultaat duidelijk en bied aan of je nog iets wilt aanpassen.
- Voor bulk-acties (bijv. 20 gerechten): roep createGerechtBulk aan. Genereer alle concepten volledig — geen placeholders.
- Voor de "buikspek-case": maak 20 unieke, creatieve gerechten verdeeld over Bite, Hoofdgerecht en Vegetarisch.

BEVESTIGING:
- Zeg altijd duidelijk wat je gaat doen voordat je een tool aanroept die schrijft.
- Nooit twee keer dezelfde actie uitvoeren.`;

var PAGE_PROMPTS = {
    '/': `Je staat op het DASHBOARD.
Wat je hier ziet: aankomende events deze week, lage voorraad-alerts, omzet-KPIs, openstaande acties.
Specialiteit: geef proactief meldingen over wat aandacht nodig heeft. Denk als operationele manager.
Snelle antwoorden geven over: welke events zijn er deze week, is er lage voorraad, hoeveel open offertes.`,

    '/events': `Je staat op de EVENTS pagina.
Wat je hier ziet: alle catering-events met datum, gasten, locatie, status en gekoppeld menu.
Specialiteit: event planning, prep-timing, chef-dispatching.
Je kunt: events opzoeken, details ophalen, prep-lijsten genereren per event, tijdlijnen maken.
Prep-lijst commando: roep generatePrepList() aan en bouw een -3/-2/-1/0 dag planning.`,

    '/agenda': `Je staat op de AGENDA pagina.
Wat je hier ziet: kalender-overzicht van events en prep-taken.
Specialiteit: planning optimaliseren, taken knopen aan events.
Handig voor: "wat staat er dit weekend?", "maak een week-planning", "wanneer moet ik beginnen met preppen voor X?"`,

    '/gerechten': `Je staat op de MENU ONTWIKKELAAR pagina.
Wat je hier ziet: alle gerechten gegroepeerd per gang (Bite, Hoofdgerecht, Vegetarisch, Dessert, etc.).
Specialiteit: menu-concepten genereren, balans analyseren, culinaire kwaliteit beoordelen.

BUIKSPEK-CASE (KRITISCH): Als chef vraagt om "X gerechten met Y":
1. Roep createGerechtBulk() aan met ALLE gerechten volledig uitgewerkt.
2. Maak een goede balans over de gangen (Bite/VG/HG/Dessert).
3. Geef elk gerecht een unieke naam, beschrijving én bereidingswijze.
4. Na het toevoegen: noem welke 2-3 je culinair het minst sterk vindt en bied aan die te verwijderen.

Menu Trechter: Bite (kleine hapjes, 1-2 bites), Hoofdgerecht (groot, showstopper), Vegetarisch (altijd een VG-optie aanbieden).`,

    '/recepten': `Je staat op de RECEPTEN pagina (The Vault).
Wat je hier ziet: het complete receptenboek — bereiding, ingrediënten, porties, preptime.
Specialiteit: recepten opzoeken, portioneren berekenen, alternatieve bereiding suggereren.
Je kunt recepten aanmaken, bijwerken en porties berekenen voor X gasten.
Voor brisket: typische preptime 12-16u. Voor pulled pork: 10-14u. Gebruik dit in je tijdlijnen.`,

    '/offertes': `Je staat op de OFFERTES pagina.
Wat je hier ziet: alle offertes met status, bedragen (inclusief berekende totalen), klantgegevens.
Specialiteit: omzet-analyse, pricing-advies, follow-up suggesties.
PRIJZEN: in de live data staan BEREKENDE TOTALEN — gebruik die. Zeg nooit "ik zie geen bedragen" als de data er is.
Omzet-berekening: gasten × prijs p.p. - korting + vaste kosten.`,

    '/facturen': `Je staat op de FACTUREN pagina.
Wat je hier ziet: alle facturen met status, bedragen, vervaldatums.
Specialiteit: cashflow, debiteurenbeheer, vervaldatum-alerts.
Waarschuw proactief over facturen die bijna vervallen of al achterstallig zijn.`,

    '/voorraad': `Je staat op de VOORRAAD pagina.
Wat je hier ziet: alle voorraad-items met hoeveelheid, min. par-level, inkoopprijs.
Specialiteit: par-level management, bijbestellen, seizoensgebonden inkoop.
Lage voorraad: items waar hoeveelheid ≤ min_par. Dit zijn je bijbestel-prioriteiten.`,

    '/inkoop': `Je staat op de INKOOP pagina.
Wat je hier ziet: inkooplijsten per winkel (Sligro, Crisp, PLUS), gerechten met winkel-tags.
Specialiteit: inkooplijsten genereren, leveranciers vergelijken, bulk-voordelen berekenen.
Je kunt een inkooplijst genereren voor een specifiek event of op basis van lage voorraad.`,

    '/haccp': `Je staat op de HACCP pagina.
Wat je hier ziet: temperatuurlogs, HACCP-registraties, alerts voor buiten-zone metingen.
Specialiteit: voedselveiligheid, NVWA-compliance, kritische temperaturen.
Kritische zones: warm houden >75°C, koude keten <7°C. Gevaarlijke zone: 7°C - 75°C.
Gevaarlijke producten: pluimvee (>75°C), varkensvlees (>70°C), rund kan rosé (<55°C is ok voor biefstuk).`,

    '/service': `Je staat op de SERVICE pagina.
Wat je hier ziet: huidige event-dag informatie, gerechten met battle plans.
Specialiteit: live service ondersteuning, troubleshooting, snelle antwoorden.
KORT EN KRACHTIG: service is live, chef heeft geen tijd voor lange verhalen. Bullet points.
Tijden zijn kritisch — wees precies over temperaturen, bereidingstijden, service-volgorde.`,

    '/uren': `Je staat op de UREN pagina.
Wat je hier ziet: urenregistraties per medewerker.
Specialiteit: overuren berekenen, IBA-uren bijhouden, arbeidsrecht tips.
Wettelijke normen NL: max 12u/dag, max 60u/week, recht op pauze na 5.5u werk.`,

    '/materieel': `Je staat op de MATERIEEL pagina.
Wat je hier ziet: alle BBQ-apparatuur, servies, tenten en andere uitrusting.
Specialiteit: materieel-planning per event, onderhoudstips, capaciteitsberekening.
Een kamado/Big Green Egg haalt 120-150°C voor low & slow. Flat tops tot 300°C voor searing.`,

    '/logistiek': `Je staat op de LOGISTIEK pagina.
Wat je hier ziet: bus-check lijst, materieel per event, inlaad-schema.
Specialiteit: event logistiek, bus-check, vergeten items voorkomen.
Bus inlaadvolgorde: zwaar achteraan (BBQs), koelboxen toegankelijk, servies goed ingepakt.`,

    '/boekhouding': `Je staat op de BOEKHOUDING pagina.
Wat je hier ziet: omzet per periode, facturen, kostenanalyse.
Specialiteit: financiële KPIs, BTW-planning, food cost ratio.
Gezonde food cost ratio catering: 28-35%. Boven 40% is problematisch.
BTW catering: 9% op eten, 21% op drank en verhuur.`,

    '/menu-engineering': `Je staat op de MENU ENGINEERING pagina.
Wat je hier ziet: menu-analyse op basis van populariteit en marge.
Specialiteit: Stars/Plowhorses/Puzzles/Dogs matrix, menu-optimalisatie.
Stars: hoge populariteit + hoge marge → behouden en promoten.
Dogs: lage populariteit + lage marge → overwegen te verwijderen.`,

    '/price-intelligence': `Je staat op de PRIJSINTELLIGENTIE pagina.
Wat je hier ziet: leveranciersvergelijkingen, marktprijzen.
Specialiteit: optimale inkoopprijzen vinden, seizoensprijzen voorspellen.`,

    '/ai-chat': `Je staat in de AI STUDIO.
Dit is de brainstorm- en Q&A-ruimte waar chef creatief kan denken zonder beperkingen.
Modi:
- Brainstorm: genereer ideeën, concepten, menuconcepten, thema-BBQs, marketingideeën
- Q&A: feitelijke, directe antwoorden op specifieke vragen
Gesprekken worden opgeslagen in mappen. Als je detecteert dat een gesprek waardevol is, vraag dan of chef het wil opslaan.`
};

// ── Groq API call ─────────────────────────────────────────────────────────────

async function callGroq(apiKey, messages, useTools) {
    var body = {
        model: MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 4096,
    };
    if (useTools) {
        body.tools = TOOL_SCHEMAS;
        body.tool_choice = 'auto';
    }

    var res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        var errText = await res.text();
        // Fallback naar mixtral bij quota-problemen
        if (res.status === 429 || res.status === 503) {
            body.model = MODEL_FALLBACK;
            var res2 = await fetch(GROQ_URL, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res2.ok) throw new Error('Groq API fout: ' + await res2.text());
            return await res2.json();
        }
        throw new Error('Groq API fout: ' + errText);
    }

    return await res.json();
}

// ── Tool executor (server-side, voor de tool-loop) ───────────────────────────

async function executeTool(toolName, toolArgs, sb) {
    try {
        var res = await fetch(
            process.env.NEXT_PUBLIC_SITE_URL
                ? process.env.NEXT_PUBLIC_SITE_URL + '/api/ai-tools'
                : 'http://localhost:3000/api/ai-tools',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tool: toolName, params: toolArgs }),
            }
        );
        var data = await res.json();
        return data.ok ? data.result : { error: data.error };
    } catch (err) {
        return { error: err.message };
    }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req) {
    try {
        var body = await req.json();
        var { messages, pathname, mode, contextData } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Berichten zijn onjuist geformatteerd' }, { status: 400 });
        }

        var apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY ontbreekt' }, { status: 500 });

        // ── Systeem-prompt samenstellen ──────────────────────────────────────
        var pagePrompt = PAGE_PROMPTS[pathname] || PAGE_PROMPTS['/'];
        var systemContent = BASE_IDENTITY + '\n\n' + pagePrompt;

        // Voeg live context toe (ofwel vanuit client, ofwel server-side geladen)
        var liveContext = contextData && Object.keys(contextData).length > 0
            ? contextData
            : await loadPageContext(pathname || '/');
        var contextStr = formatContext(pathname || '/', liveContext);
        if (contextStr) systemContent += contextStr;

        // Brainstorm modus: hogere creativiteit
        if (mode === 'brainstorm') {
            systemContent += '\n\nMODUS: BRAINSTORM. Wees creatief, onverwacht en inspirerend. Genereer meer ideeën dan gevraagd. Gebruik verbeelding.';
        }

        var groqMessages = [{ role: 'system', content: systemContent }, ...messages];

        // ── Eerste aanroep naar Groq (met tools) ────────────────────────────
        var response = await callGroq(apiKey, groqMessages, true);
        var choice = response.choices && response.choices[0];
        if (!choice) throw new Error('Geen response van Groq');

        var assistantMsg = choice.message;
        var toolCalls = assistantMsg.tool_calls || [];

        // ── Tool-loop: verwerk tool_calls ────────────────────────────────────
        var toolResults = [];
        var actionCards = [];

        if (toolCalls.length > 0) {
            // Voeg assistant-bericht toe aan context
            groqMessages.push(assistantMsg);

            // Voer tools parallel uit
            var toolPromises = toolCalls.map(async function (tc) {
                var toolName = tc.function.name;
                var toolArgs = {};
                try { toolArgs = JSON.parse(tc.function.arguments || '{}'); } catch (e) { toolArgs = {}; }

                var result = await executeTool(toolName, toolArgs, null);

                // Zet resultaat terug in context
                groqMessages.push({
                    role: 'tool',
                    tool_call_id: tc.id,
                    content: JSON.stringify(result)
                });

                // Bouw actie-kaart voor de frontend
                var isWriteAction = [
                    'createEvent', 'updateEventStatus', 'createGerecht', 'createGerechtBulk',
                    'updateGerecht', 'deleteGerecht', 'deactivateGerechten', 'createRecept',
                    'updateRecept', 'updateOfferteStatus', 'updateVoorraadItem', 'createHaccpLog',
                    'updateMaterieelStatus', 'saveConversation', 'createFolder'
                ].includes(toolName);

                toolResults.push({ tool: toolName, args: toolArgs, result: result });
                actionCards.push({ tool: toolName, args: toolArgs, result: result, requiresConfirmation: isWriteAction });

                return result;
            });

            await Promise.all(toolPromises);

            // ── Tweede aanroep: AI formuleert het antwoord op basis van tool-resultaten ──
            var response2 = await callGroq(apiKey, groqMessages, false);
            var choice2 = response2.choices && response2.choices[0];
            if (choice2) {
                assistantMsg = choice2.message;
            }
        }

        var finalContent = assistantMsg.content || '';

        return NextResponse.json({
            choices: [{ message: { role: 'assistant', content: finalContent } }],
            actions: actionCards,
            tool_results: toolResults,
        });

    } catch (error) {
        console.error('[chat/route] error:', error);
        return NextResponse.json({ error: 'Interne fout: ' + error.message }, { status: 500 });
    }
}
