// ============================================================
// AI Denkmodi — single source of truth
// ------------------------------------------------------------
// Eén bestand dat zowel de UI (3-segment control) als de API
// (model + max_tokens + thinking) aanstuurt. Wijzigingen hier
// werken meteen door op beide kanten — geen drift mogelijk.
// ============================================================

export type ThinkingMode = 'fast' | 'standard' | 'deep';

export interface ModeDef {
    id: ThinkingMode;
    label: string;
    shortLabel: string;
    description: string;
    icon: 'zap' | 'bot' | 'brain';
    model: string;
    modelKey: 'haiku' | 'sonnet' | 'opus';
    maxTokens: number;
    thinking: false | { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
    temperature: number;
    costMultiplier: number;
}

export const MODES: Record<ThinkingMode, ModeDef> = {
    fast: {
        id: 'fast',
        label: 'Snel',
        shortLabel: 'Snel',
        description: 'Korte directe antwoorden (max 3 zinnen). Voor operator op locatie of snelle vragen.',
        icon: 'zap',
        model: 'claude-haiku-4-5',
        modelKey: 'haiku',
        /* Was 400 — te krap sinds alles via respond_with_blocks gaat: de
           block-JSON (veldnamen, routes, structuur) kost ~3× meer tokens dan
           lopende tekst. Afgekapte JSON = leeg antwoord (fix 2026-06-12). */
        maxTokens: 1200,
        thinking: false,
        temperature: 0.3,
        costMultiplier: 0.2,
    },
    standard: {
        id: 'standard',
        label: 'Standaard',
        shortLabel: 'Standaard',
        description: 'Gebalanceerd: kort en krachtig (max ~200 woorden). Voor dagelijks werk.',
        icon: 'bot',
        model: 'claude-sonnet-4-6',
        modelKey: 'sonnet',
        /* Was 1000 — gemeten: een blocks-antwoord met bullets+nav_cards+routes
           knalde er precies op stuk (output=1000, JSON half af, palette leeg).
           3000 geeft ruimte; prompt houdt antwoorden alsnog kort. */
        maxTokens: 3000,
        thinking: false,
        temperature: 0.7,
        costMultiplier: 1.0,
    },
    deep: {
        id: 'deep',
        label: 'Diep',
        shortLabel: 'Diep',
        description: 'Diepgaande analyse met denkproces. Voor strategie, complexe brainstorm of bulk-uitwerkingen (recepten, matrices).',
        icon: 'brain',
        model: 'claude-opus-4-7',
        modelKey: 'opus',
        // 12000 nodig voor multi-push: tot 6 gerechten in één bulk_create_gerechten met
        // receptuur+marge+pijn/top+foto-prompt per stuk. Diep is een power-user mode — extra cost OK.
        maxTokens: 12000,
        thinking: { effort: 'high' },
        temperature: 1.0,
        costMultiplier: 6.0,
    },
};

export const DEFAULT_MODE: ThinkingMode = 'standard';

// Per-pagina default denkmodus. Als de gebruiker handmatig een andere modus
// kiest blijft die kleven (localStorage). Dit is alleen het startpunt bij
// een page-load waar nog geen user-keuze ligt voor die pagina.
export const PAGE_DEFAULT_MODE: Record<string, ThinkingMode> = {
    '/voorraad': 'fast',
    '/events/[id]/service': 'fast',
    '/recepten': 'deep',
    '/gerechten': 'deep',
    '/marges': 'deep',
};

export function getPageDefaultMode(pathname: string | null | undefined): ThinkingMode {
    if (!pathname) return DEFAULT_MODE;
    if (PAGE_DEFAULT_MODE[pathname]) return PAGE_DEFAULT_MODE[pathname];
    // Match dynamische routes: /events/[id]/hub, /events/[id]/service etc.
    if (pathname.startsWith('/events/') && pathname.endsWith('/hub')) return 'standard';
    if (pathname.startsWith('/events/') && pathname.endsWith('/service')) return 'fast';
    return DEFAULT_MODE;
}

export function getMode(input?: string | null): ModeDef {
    if (input === 'fast' || input === 'standard' || input === 'deep') {
        return MODES[input];
    }
    return MODES[DEFAULT_MODE];
}

export function isThinkingMode(value: unknown): value is ThinkingMode {
    return value === 'fast' || value === 'standard' || value === 'deep';
}
