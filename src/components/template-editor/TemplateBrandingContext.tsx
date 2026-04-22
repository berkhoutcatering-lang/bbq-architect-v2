'use client';

import { createContext, useContext } from 'react';

export interface TemplateBranding {
    primary: string;
    accent: string;
    logoUrl?: string | null;
    logoDarkUrl?: string | null;
    bedrijfsnaam?: string;
}

const TemplateBrandingContext = createContext<TemplateBranding>({
    primary: '#9e781c',
    accent: '#8b6914',
    logoUrl: null,
    logoDarkUrl: null,
    bedrijfsnaam: '',
});

export const TemplateBrandingProvider = TemplateBrandingContext.Provider;

export function useTemplateBranding(): TemplateBranding {
    return useContext(TemplateBrandingContext);
}

// ── Variabelen-context ──
// Laat TemplatePreview/BlockRenderer echte event-data injecteren (eventNaam,
// datum, menu-items) i.p.v. placeholder EXAMPLE_DATA uit TEMPLATE_VARIABLES.
const TemplateVariablesContext = createContext<Record<string, string> | null>(null);

export const TemplateVariablesProvider = TemplateVariablesContext.Provider;

export function useTemplateVariables(): Record<string, string> | null {
    return useContext(TemplateVariablesContext);
}

// ── Live menu-groups context ──
// Voor menu-blokken: lijst van gangen + gerechten uit het huidige event.
// Als null → BlockRenderer valt terug op hardcoded voorbeelddata.
export interface LiveMenuGroup { gang: string; dishes: Array<{ n: string; s?: string }> }

const TemplateMenuGroupsContext = createContext<LiveMenuGroup[] | null>(null);

export const TemplateMenuGroupsProvider = TemplateMenuGroupsContext.Provider;

export function useTemplateMenuGroups(): LiveMenuGroup[] | null {
    return useContext(TemplateMenuGroupsContext);
}
