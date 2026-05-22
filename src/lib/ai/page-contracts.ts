// ============================================================
// Page Contracts — wat de AI per pagina mag, weet en uitvoert
// ------------------------------------------------------------
// Drie records, allemaal keyed op het genormaliseerde pageContext-pad
// (zie normalizePagePath in src/lib/ai-prompts.ts).
//
//   1. PAGE_TOOL_WHITELIST  — welke tools mag de AI hier triggeren
//   2. PAGE_ROUTE_WHITELIST — naar welke in-app routes mag de AI linken
//                              via nav_card-blocks (whitelist tegen verzonnen URLs)
//   3. PAGE_BLOCK_HINTS     — welke block-types horen bij deze page
//
// Deze file is single source voor "wat hoort waar" — wijzig hier als
// je een nieuwe pagina toevoegt of een tool/route per page wijzigt.
// De server (route.ts) gebruikt dit om enforcement af te dwingen,
// de prompt-builder gebruikt het om block-formaat te injecten.
// ============================================================

import type { BlockType } from './blocks';

// ─── Allowed tool-names per page ───
// Lege array of geen entry = alleen respond_with_blocks (default).
// Specifieke pages kunnen extra tools toestaan (bv brainstorm op /gerechten).
export const PAGE_TOOL_WHITELIST: Record<string, string[]> = {
    '/': ['respond_with_blocks', 'generate_event_briefing', 'generate_inkooplijst'],
    '/agenda': ['respond_with_blocks', 'create_event', 'create_prep_task', 'update_prep_task', 'generate_prep_list'],
    '/events': ['respond_with_blocks', 'create_event', 'update_event'],
    '/events/[id]': ['respond_with_blocks', 'update_event', 'generate_event_briefing', 'generate_inkooplijst', 'generate_prep_list', 'get_event_winstgevendheid'],
    '/events/[id]/hub': ['respond_with_blocks', 'update_event', 'generate_event_briefing', 'generate_inkooplijst', 'generate_prep_list', 'get_event_winstgevendheid'],
    '/events/[id]/klantgesprek': ['respond_with_blocks', 'update_event'],
    '/events/[id]/prep': ['respond_with_blocks', 'create_prep_task', 'update_prep_task', 'delete_prep_task', 'generate_prep_list'],
    '/events/[id]/haccp': ['respond_with_blocks', 'create_haccp'],
    '/events/[id]/service': ['respond_with_blocks', 'create_haccp', 'update_prep_task', 'update_rtr_item', 'update_voorraad'],
    '/events/[id]/reflectie': ['respond_with_blocks', 'update_event'],
    '/events/[id]/field': ['respond_with_blocks', 'create_haccp', 'update_prep_task', 'update_rtr_item'],

    '/gerechten': ['respond_with_blocks', 'propose_dish_concepts', 'develop_dishes', 'create_gerecht', 'update_gerecht', 'delete_gerecht'],
    '/bedenker': ['respond_with_blocks', 'propose_dish_concepts'],
    '/gerechten/menu-analyse': ['respond_with_blocks', 'propose_dish_concepts', 'develop_dishes'],
    '/recepten': ['respond_with_blocks', 'create_recept', 'update_recept'],

    '/archief': ['respond_with_blocks'],

    '/administratie': ['respond_with_blocks'],
    '/financien': ['respond_with_blocks'],
    '/uren': ['respond_with_blocks', 'create_urenlog', 'update_urenlog'],
    '/klanten': ['respond_with_blocks', 'create_klant', 'update_klant'],
    '/voorraad': ['respond_with_blocks', 'update_voorraad', 'create_inkooplijst'],
    '/inkoop': ['respond_with_blocks', 'create_inkooplijst', 'update_inkooplijst', 'generate_inkooplijst'],

    '/offertes': ['respond_with_blocks', 'create_offerte', 'update_offerte_status'],
    '/offertes/[id]': ['respond_with_blocks', 'update_offerte'],
    '/offertes/[id]/view': ['respond_with_blocks', 'update_offerte'],
    '/facturen': ['respond_with_blocks', 'create_factuur', 'update_factuur', 'update_factuur_status'],

    '/instellingen': ['respond_with_blocks'],
    '/instellingen/integraties': ['respond_with_blocks'],
    '/instellingen/data-export': ['respond_with_blocks'],
    '/gebruikers': ['respond_with_blocks'],
    '/mailbox': ['respond_with_blocks'],
    '/website': ['respond_with_blocks'],
    '/hulp': ['respond_with_blocks'],
    '/admin': ['respond_with_blocks'],
    '/admin/funnel': ['respond_with_blocks'],

    '/materieel': ['respond_with_blocks', 'bulk_create_materieel'],
    '/logistiek': ['respond_with_blocks', 'update_rtr_item'],
    '/haccp': ['respond_with_blocks', 'create_haccp'],
    '/prep-counter': ['respond_with_blocks', 'update_prep_task'],
    '/klantgesprek': ['respond_with_blocks'],
    '/price-intelligence': ['respond_with_blocks'],
};

// ─── Allowed Next.js routes per page (voor nav_card.route validatie) ───
// AI mag NOOIT linken naar een route buiten deze whitelist. Dit voorkomt
// hallucinated URLs ("/inkooplijst-overzicht" terwijl de echte route
// /inkoop is). Server-side filteren we elke nav_card-block die buiten
// deze lijst valt — als het pad start met een whitelist-prefix is het OK
// (bv "/inkoop?event=12" is allowed onder "/inkoop").
//
// Pages met algemene bereik (bv /, /administratie) krijgen breed bereik;
// veld-pages (service, field) krijgen alleen de directe sibling-pages.
export const PAGE_ROUTE_WHITELIST: Record<string, string[]> = {
    '/': ['/agenda', '/events', '/inkoop', '/voorraad', '/financien', '/offertes', '/facturen', '/gerechten', '/gerechten/menu-analyse', '/uren', '/klanten'],
    '/agenda': ['/events', '/events/', '/inkoop'],
    '/events': ['/events/', '/agenda', '/klanten', '/offertes'],
    '/events/[id]': ['/events/', '/inkoop', '/offertes', '/facturen', '/gerechten', '/gerechten/menu-analyse'],
    '/events/[id]/hub': ['/events/', '/inkoop', '/offertes', '/facturen', '/gerechten', '/gerechten/menu-analyse'],
    '/events/[id]/klantgesprek': ['/gerechten', '/gerechten/menu-analyse', '/events/'],
    '/events/[id]/prep': ['/events/', '/inkoop'],
    '/events/[id]/haccp': ['/events/'],
    '/events/[id]/service': ['/events/'],
    '/events/[id]/reflectie': ['/events/'],
    '/events/[id]/field': ['/events/'],

    '/gerechten': ['/gerechten/menu-analyse', '/bedenker', '/recepten', '/inkoop'],
    '/bedenker': ['/gerechten'],
    '/gerechten/menu-analyse': ['/gerechten', '/inkoop'],
    '/recepten': ['/gerechten', '/gerechten/menu-analyse'],

    '/archief': ['/inkoop', '/financien', '/leveranciers'],

    '/administratie': ['/financien', '/uren', '/klanten', '/voorraad', '/inkoop', '/facturen'],
    '/financien': ['/facturen', '/uren', '/klanten', '/inkoop', '/archief'],
    '/uren': ['/financien', '/admin'],
    '/klanten': ['/events', '/offertes', '/facturen', '/mailbox'],
    '/voorraad': ['/inkoop', '/events/', '/archief'],
    '/inkoop': ['/voorraad', '/events/', '/archief', '/financien'],

    '/offertes': ['/offertes/', '/klanten', '/mailbox', '/events/'],
    '/offertes/[id]': ['/offertes', '/gerechten/menu-analyse', '/financien'],
    '/offertes/[id]/view': ['/offertes', '/gerechten/menu-analyse', '/financien'],
    '/facturen': ['/offertes', '/financien', '/klanten', '/mailbox'],

    '/instellingen': ['/instellingen/integraties', '/website'],
    '/instellingen/integraties': ['/instellingen', '/financien'],
    '/instellingen/data-export': ['/instellingen'],
    '/gebruikers': ['/instellingen'],
    '/mailbox': ['/klanten', '/facturen', '/offertes'],
    '/website': ['/foto-archief', '/instellingen'],
    '/hulp': ['/'],
    '/admin': ['/admin/funnel'],
    '/admin/funnel': ['/admin'],

    '/materieel': ['/voorraad', '/events/'],
    '/logistiek': ['/events/', '/voorraad'],
    '/haccp': ['/events/'],
    '/prep-counter': ['/events/', '/agenda'],
    '/klantgesprek': ['/events/', '/gerechten'],
    '/price-intelligence': ['/inkoop', '/voorraad'],
};

// ─── Verwachte block-types per page (voor prompt-hint) ───
// Lege of ontbrekende entry = alle 8 types toegestaan. Pages met
// strikte performance-eisen (bv /events/[id]/service tijdens runtime)
// krijgen een minimal set zodat de AI geen lange info-blocks
// produceert wanneer de operator 5 seconden heeft.
export const PAGE_BLOCK_HINTS: Record<string, BlockType[]> = {
    '/events/[id]/service': ['success', 'metric', 'action_card'], // KDS — ultra-kort
    '/events/[id]/field': ['success', 'action_card', 'nav_card'], // Lars met handschoenen — grote knoppen
    '/q/[id]': [], // klant-portal — geen AI hier
};

// ─── Helpers ───

/**
 * Returns alle tools die op deze pagina toegestaan zijn. Default = alleen
 * respond_with_blocks. Used by route.ts om tool-arrays te filteren.
 */
export function getToolWhitelist(pagePath: string): string[] {
    return PAGE_TOOL_WHITELIST[pagePath] || ['respond_with_blocks'];
}

/**
 * Returns alle route-prefixes die de AI op deze pagina mag linken via
 * nav_card. Een nav_card.route is OK als hij start met een van deze
 * prefixes (zo werkt /inkoop?event=12 onder allow-list /inkoop).
 */
export function getRouteWhitelist(pagePath: string): string[] {
    return PAGE_ROUTE_WHITELIST[pagePath] || [];
}

/**
 * Validate dat een nav_card.route binnen de allowed prefixes valt voor
 * deze page. Returns true als het mag, false als de AI heeft gehallucineerd.
 */
export function isRouteAllowed(pagePath: string, route: string): boolean {
    const allowed = getRouteWhitelist(pagePath);
    if (allowed.length === 0) return false;
    // Een prefix-match is genoeg — /inkoop?event=12 valt onder /inkoop
    // /events/12/hub valt onder /events/
    return allowed.some((prefix) => route === prefix || route.startsWith(prefix));
}

/**
 * Bouwt een prompt-suffix die de AI vertelt:
 *   - Welke routes hij via nav_card mag suggereren
 *   - Welke block-types geprefereerd zijn (als hint, niet hard limit)
 * Wordt door route.ts achter PAGE_SYSTEM_PROMPTS aan geplakt.
 */
export function buildBlockDirective(pagePath: string): string {
    const routes = getRouteWhitelist(pagePath);
    const hints = PAGE_BLOCK_HINTS[pagePath];

    const lines: string[] = [];
    lines.push('');
    lines.push('## BLOCK CONTRACT (verplicht)');
    lines.push('Antwoord ALTIJD via respond_with_blocks. Geen vrije tekst, geen markdown-tabellen, geen essays.');
    lines.push('');
    lines.push('Beschikbare block-types:');
    lines.push('- info: kort tekstblok met titel');
    lines.push('- metric: highlight-cijfer (gebruik voor totalen, percentages, counts)');
    lines.push('- warning: rood/oranje alert met severity (low/medium/high)');
    lines.push('- success: groen succes-bericht');
    lines.push('- bullets: opsomming (max 6 items, elk max 80 chars)');
    lines.push('- action_hint: tekst-suggestie voor vervolgactie (geen knop)');
    lines.push('- nav_card: KLIKBARE deep-link kaart naar in-app route — gebruik dit zodra je een andere pagina aanwijst');
    lines.push('- action_card: confirm-knop die direct een DB-actie uitvoert (bv create_inkooplijst)');
    lines.push('');

    if (hints && hints.length > 0) {
        lines.push('Op deze pagina geprefereerd: ' + hints.join(', ') + '. Anderen alleen als echt nodig.');
        lines.push('');
    }

    if (routes.length > 0) {
        lines.push('## NAV-CARD ROUTES (whitelist)');
        lines.push('Voor nav_card.route MAG je alleen deze prefixes gebruiken — geen andere paden verzinnen:');
        for (const r of routes) {
            lines.push('- ' + r);
        }
        lines.push('');
        lines.push('Routes met dynamic segments krijg je als prefix met trailing slash, bv "/events/" — vul daar de echte event-id in (uit context-data) zoals "/events/12/hub" of "/events/12".');
        lines.push('Query params zijn toegestaan, bv "/inkoop?event=12".');
    } else {
        lines.push('## NAV-CARDS UITGESCHAKELD');
        lines.push('Deze pagina heeft geen toegestane nav_card routes — gebruik alleen info/metric/warning/success/bullets/action_hint/action_card blocks.');
    }

    lines.push('');
    lines.push('## ALLES MET EEN ENTITY-NAAM IS KLIKBAAR (CRUCIAAL)');
    lines.push('Wanneer je een specifieke entity noemt — een event-naam, klant-naam, offerte-nummer, factuur-nummer, gerecht-naam, leverancier — moet die regel KLIKBAAR zijn naar de detail-pagina van die entity. Anders moet de operator zelf weer naar de juiste pagina zoeken — slechte UX.');
    lines.push('');
    lines.push('Drie vormen om dit te doen:');
    lines.push('1. **bullets-items als objects met route**: voor lijsten van events/klanten/offertes/etc. Elk object: `{ "text": "20 jun — Mariel Velema · 44 gasten · €1.554", "route": "/events/12", "icon": "Calendar", "badge": { "text": "menu OK", "tone": "success" } }`. NOOIT plain string als je een entity-id beschikbaar hebt.');
    lines.push('2. **metric met route**: voor "totaal omzet" / "6 events" / "23 facturen open" — voeg `route` + `label` toe zodat hele kaart klikbaar is naar het overzicht.');
    lines.push('3. **nav_card**: voor één enkele primaire actie (bv "Open inkooplijst voor Bruiloft Berkhout").');
    lines.push('');
    lines.push('## NAV-CARD STIJL');
    lines.push('- title: korte zin met concrete entity (bv "Inkooplijst voor Bruiloft Berkhout"), max 60 chars');
    lines.push('- summary: 1 zin met sleutel-cijfers (bv "23 items, €847 totaal, event over 2 dagen"), max 140 chars');
    lines.push('- label: knop-tekst max 4 woorden (bv "Open inkooplijst"), werkwoord-eerst');
    lines.push('- icon: lucide-react naam in PascalCase (bv "ShoppingCart", "ChefHat", "Calendar", "BarChart3")');
    lines.push('- badge.tone: info | warning | success | danger | neutral — alleen bij echte status');
    lines.push('- preview (optioneel): max 5 strings, één regel per item');
    lines.push('');
    lines.push('## METRIC + ROUTE');
    lines.push('Wanneer een metric naar een lijst-pagina kan verwijzen, geef altijd `route` + `label` mee. Voorbeelden:');
    lines.push('- value="6 events" → route="/events", label="Open events"');
    lines.push('- value="€10.051,58" totale pipeline → route="/offertes", label="Open offertes"');
    lines.push('- value="3 verlopen facturen" → route="/facturen?status=verlopen", label="Bekijk verlopen"');
    lines.push('');
    lines.push('## BULLETS-ITEM ROUTES');
    lines.push('Voor item.route gelden DEZELFDE whitelist-regels als nav_card.route. Voor specifieke entities gebruik dynamic-id paden zoals "/events/[id]" met de echte id ingevuld uit context-data. Als je geen specifieke route weet voor een item, gebruik dan een string i.p.v. object — niet verzinnen.');
    lines.push('');
    lines.push('## ACTION-CARD STIJL');
    lines.push('- Gebruik action_card alleen als er een concrete database-mutatie achter zit (create/update/delete/generate)');
    lines.push('- title: imperatief, bv "Maak inkooplijst voor Bruiloft Berkhout aan"');
    lines.push('- summary: wat er gebeurt en waarop het gebaseerd is');
    lines.push('- action.type: matched server-side — gebruik tool-namen die je sowieso al kent (create_inkooplijst, update_prep_task, etc.)');
    lines.push('- destructive: true bij delete-acties (renderer toont rode knop)');

    return lines.join('\n');
}
