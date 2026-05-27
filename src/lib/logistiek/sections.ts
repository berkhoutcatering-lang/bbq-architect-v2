/**
 * Sectie-definitie voor /logistiek (de zes categorieën uit migratie 016).
 * Gedeeld door /logistiek, /logistiek/field, /events/[id]/logistiek en de
 * AiProposalModal zodat label/emoji/volgorde overal exact gelijk zijn.
 */

import type { LucideIcon } from 'lucide-react';
import { Truck, ChefHat, Users, Map, MapPin, Phone } from 'lucide-react';

export type LogistiekCategory = 'materieel' | 'menu_prep' | 'personeel' | 'route' | 'locatie' | 'klant';

export interface LogistiekSection {
    id: LogistiekCategory;
    label: string;
    emoji: string;
    icon: LucideIcon;
}

export const LOGISTIEK_SECTIONS: LogistiekSection[] = [
    { id: 'materieel',  label: 'Materieel',     emoji: '🚛', icon: Truck   },
    { id: 'menu_prep',  label: 'Menu-prep',     emoji: '🍖', icon: ChefHat },
    { id: 'personeel',  label: 'Personeel',     emoji: '👥', icon: Users   },
    { id: 'route',      label: 'Route',         emoji: '🗺️', icon: Map     },
    { id: 'locatie',    label: 'Locatie',       emoji: '📍', icon: MapPin  },
    { id: 'klant',      label: 'Klant-contact', emoji: '☎️', icon: Phone   },
];

export const SOURCE_REF_LABEL: Record<string, { label: string; color: string }> = {
    gerecht:           { label: 'Berekend uit menu',       color: '#22c55e' },
    hardware_katalogus:{ label: 'Hardware-katalogus',      color: '#3b82f6' },
    gasten_calc:       { label: 'Gasten × buffer',         color: '#f59e0b' },
    weer_api:          { label: 'Weer-update',             color: '#06b6d4' },
    klant_data:        { label: 'Klant-info',              color: '#ec4899' },
    standaard:         { label: 'Standaard',               color: '#a78bfa' },
};

export interface DbChecklistItem {
    id: string;
    event_id: number;
    organization_id: string;
    category: LogistiekCategory;
    label: string;
    qty: number | null;
    unit: string | null;
    done: boolean;
    assignee_user_id: string | null;
    deadline_offset_hours: number | null;
    source: 'ai' | 'user';
    ai_citation: { sum?: string; src?: string; ref?: string } | null;
    parent_id: string | null;
    sort_order: number;
    ai_pending: boolean;
    created_at: string;
    updated_at: string;
}
