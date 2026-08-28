// ============================================================
// AI Block Schema v2 — single source of truth for AI output blocks
// ------------------------------------------------------------
// Elke AI-respons in BBQ Architect is een array van typed blocks.
// Geen markdown-soup meer, alleen blokken die de UI kan renderen.
//
// 8 block-types (6 bestaand uit respond_with_blocks tool + 2 nieuw):
//   - info, metric, warning, success, bullets, action_hint  (bestaand)
//   - nav_card, action_card                                  (nieuw)
//
// nav_card  → klikbare deep-link naar in-app route (Sam-vraag)
// action_card → confirm-knop die direct DB-mutatie uitvoert
// ============================================================

export type BlockType =
    | 'info'
    | 'metric'
    | 'warning'
    | 'success'
    | 'bullets'
    | 'action_hint'
    | 'nav_card'
    | 'action_card';

export type BadgeTone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';
export type DeltaTone = 'positive' | 'negative' | 'neutral';
export type WarningSeverity = 'low' | 'medium' | 'high';

// ─── Bestaande block-types (matchen huidige respond_with_blocks tool) ───

export interface InfoBlock {
    type: 'info';
    title: string;
    text?: string;
}

export interface MetricBlock {
    type: 'metric';
    title: string;
    value: string;                 // bv "70%", "€8.400", "12 verlopen"
    text?: string;                 // optionele context-zin onder de waarde
    delta?: { value: string; tone: DeltaTone }; // optionele vs-vorige-periode
    route?: string;                // optionele deep-link — hele kaart wordt klikbaar
    label?: string;                // optioneel knop-label, default "Open"
}

export interface WarningBlock {
    type: 'warning';
    title: string;
    text?: string;
    severity?: WarningSeverity;
}

export interface SuccessBlock {
    type: 'success';
    title: string;
    text?: string;
}

/** Bullet-item: ofwel kale tekst ofwel een klikbare regel met route. */
export type BulletItem =
    | string
    | { text: string; route?: string; icon?: string; badge?: { text: string; tone: BadgeTone } };

export interface BulletsBlock {
    type: 'bullets';
    title: string;
    items: BulletItem[];           // max 6, elk max 80 chars; items met route worden klikbare links
}

export interface ActionHintBlock {
    type: 'action_hint';
    title: string;
    text?: string;                 // hint-tekst (geen knop, alleen suggestie)
}

// ─── Nieuwe block-types (Sam's vraag: klikbare links + één-klik-acties) ───

export interface NavCardBlock {
    type: 'nav_card';
    title: string;                                      // bv "Inkooplijst voor Bruiloft Berkhout"
    summary: string;                                    // bv "23 items, €847 totaal, 2 dagen voor event"
    route: string;                                      // bv "/inkoop?event=12" — Next.js href
    label: string;                                      // bv "Open inkooplijst" — knop-tekst, max 4 woorden
    icon?: string;                                      // icoon-naam uit AI_ICON_NAMES (components/ai/blocks/icons.ts)
    badge?: { text: string; tone: BadgeTone };          // optionele status-badge rechtsboven
    preview?: string[];                                 // optionele max 5 preview-items onder summary
}

export interface ActionCardBlock {
    type: 'action_card';
    title: string;                                      // bv "Maak inkooplijst voor Bruiloft Berkhout aan"
    summary: string;                                    // bv "23 items, automatisch berekend uit menu × 60 gasten"
    action: {
        type: string;                                   // bv "create_inkooplijst" — matched in ActionDispatcher
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: Record<string, any>;                      // payload voor server-action
    };
    confirm_label: string;                              // bv "Maak aan"
    cancel_label?: string;                              // default "Annuleer"
    destructive?: boolean;                              // rood styling als true (bv delete)
}

// ─── Discriminated union — one type to rule them all ───

export type Block =
    | InfoBlock
    | MetricBlock
    | WarningBlock
    | SuccessBlock
    | BulletsBlock
    | ActionHintBlock
    | NavCardBlock
    | ActionCardBlock;

// ─── Runtime guards (geen Zod om dependencies licht te houden) ───

export function isBlock(x: unknown): x is Block {
    if (!x || typeof x !== 'object') return false;
    const o = x as Record<string, unknown>;
    if (typeof o.type !== 'string') return false;
    if (typeof o.title !== 'string') return false;
    return ['info', 'metric', 'warning', 'success', 'bullets', 'action_hint', 'nav_card', 'action_card'].includes(o.type);
}

export function isBlockArray(x: unknown): x is Block[] {
    return Array.isArray(x) && x.every(isBlock);
}

// Best-effort coerce: filter alleen geldige blocks uit een onbekende array.
// Gebruik bij parse van AI-output zodat één corrupte block niet de hele
// render breekt.
export function coerceBlocks(x: unknown): Block[] {
    if (!Array.isArray(x)) return [];
    return x.filter(isBlock);
}

// ─── JSON-schema voor Anthropic tool-use (Sprint 2 gebruikt dit) ───
// Houd in sync met de TypeScript-types hierboven. Pas allebei aan als
// je een veld toevoegt — anders mismatchen server-output en UI-types.

export const BLOCK_TOOL_SCHEMA = {
    type: 'object' as const,
    properties: {
        blocks: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['info', 'metric', 'warning', 'success', 'bullets', 'action_hint', 'nav_card', 'action_card'],
                        description:
                            'info = standaard tekst | metric = highlight cijfer | warning = rode alert | success = groen succes | bullets = compacte lijst | action_hint = tekst-suggestie | nav_card = klikbare deep-link kaart naar in-app route | action_card = confirm-knop die direct DB-actie uitvoert',
                    },
                    title: { type: 'string', description: 'Korte titel (max 60 chars). Verplicht voor alle types.' },
                    text: { type: 'string', description: 'Body tekst — kort, max 200 chars. Voor info/metric/warning/success.' },
                    items: {
                        type: 'array',
                        description: 'Bullets (max 6). Elk item ofwel een string OF object {text, route?, icon?, badge?}. Wanneer je een specifieke entity noemt (event, klant, offerte, factuur, gerecht) MOET je object-form met route gebruiken zodat de regel klikbaar is.',
                        items: {
                            oneOf: [
                                { type: 'string' },
                                {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string', description: 'De zichtbare tekst, max 80 chars.' },
                                        route: { type: 'string', description: 'Optionele deep-link, ALLEEN routes uit de page-whitelist.' },
                                        icon: { type: 'string', description: 'Optioneel icoon. Alleen namen uit de lijst in de systeem-prompt; andere namen vallen terug op een bolletje.' },
                                        badge: {
                                            type: 'object',
                                            properties: {
                                                text: { type: 'string' },
                                                tone: { type: 'string', enum: ['info', 'warning', 'success', 'danger', 'neutral'] },
                                            },
                                        },
                                    },
                                    required: ['text'],
                                },
                            ],
                        },
                    },
                    value: { type: 'string', description: 'Highlight-waarde voor metric (bv "70%", "€8.400").' },
                    delta: {
                        type: 'object',
                        properties: {
                            value: { type: 'string' },
                            tone: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                        },
                        description: 'Optionele delta voor metric (bv "+12% vs vorige maand").',
                    },
                    severity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Severity voor warning.' },
                    summary: { type: 'string', description: 'Korte samenvatting (max 140 chars). Verplicht bij nav_card/action_card.' },
                    route: { type: 'string', description: 'Next.js href, bv "/inkoop?event=12". ALLEEN routes uit PAGE_ROUTE_WHITELIST. Verplicht bij nav_card, optioneel bij metric (maakt hele kaart klikbaar).' },
                    label: { type: 'string', description: 'Knop-tekst, max 4 woorden, bv "Open inkooplijst". Verplicht bij nav_card, optioneel bij metric+route.' },
                    icon: { type: 'string', description: 'Optioneel icoon. Alleen namen uit de lijst in de systeem-prompt; andere namen vallen terug op een pijl.' },
                    badge: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            tone: { type: 'string', enum: ['info', 'warning', 'success', 'danger', 'neutral'] },
                        },
                        description: 'Optionele badge rechtsboven nav_card.',
                    },
                    preview: { type: 'array', items: { type: 'string' }, description: 'Optionele preview-items onder summary, max 5.' },
                    action: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', description: 'Action type, bv "create_inkooplijst" — moet bestaan in ActionDispatcher.' },
                            data: { type: 'object', description: 'Payload voor server-action.' },
                        },
                        required: ['type'],
                        description: 'Verplicht bij action_card.',
                    },
                    confirm_label: { type: 'string', description: 'Knop-tekst voor confirm, bv "Maak aan". Verplicht bij action_card.' },
                    cancel_label: { type: 'string', description: 'Knop-tekst voor cancel. Default "Annuleer".' },
                    destructive: { type: 'boolean', description: 'Rood styling als true (bv delete-actie).' },
                },
                required: ['type', 'title'],
            },
        },
    },
    required: ['blocks'],
} as const;
