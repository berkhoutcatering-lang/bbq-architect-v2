/* Gedeelde icoon-mapping voor agenda-categorieën.
   Strings worden in de DB opgeslagen (icon-veld); UI vertaalt ze naar
   lucide-componenten via deze map. Volgorde bepaalt de modal-grid. */

import {
    Calendar, Briefcase, Users, Truck, Home, Heart, Coffee, ChefHat,
    Wrench, Phone, MessageSquare, Star,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export interface IconOption {
    id: string;
    Icon: ComponentType<LucideProps>;
    /* Korte NL-label voor a11y + tooltip. */
    label: string;
}

export const AGENDA_CATEGORY_ICONS: IconOption[] = [
    { id: 'Calendar',        Icon: Calendar,        label: 'Kalender' },
    { id: 'Briefcase',       Icon: Briefcase,       label: 'Werk' },
    { id: 'Users',           Icon: Users,           label: 'Team' },
    { id: 'Truck',           Icon: Truck,           label: 'Logistiek' },
    { id: 'Home',            Icon: Home,            label: 'Privé' },
    { id: 'Heart',           Icon: Heart,           label: 'Persoonlijk' },
    { id: 'Coffee',          Icon: Coffee,          label: 'Pauze' },
    { id: 'ChefHat',         Icon: ChefHat,         label: 'Keuken' },
    { id: 'Wrench',          Icon: Wrench,          label: 'Onderhoud' },
    { id: 'Phone',           Icon: Phone,           label: 'Bellen' },
    { id: 'MessageSquare',   Icon: MessageSquare,   label: 'Bericht' },
    { id: 'Star',            Icon: Star,            label: 'Belangrijk' },
];

const BY_ID = new Map(AGENDA_CATEGORY_ICONS.map(o => [o.id, o.Icon]));

/* Vertaal opgeslagen string naar lucide-component. Default = Calendar als
   de string onbekend is (oude DB-rijen / typo's). */
export function getAgendaIconComponent(id: string | null | undefined): ComponentType<LucideProps> {
    if (!id) return Calendar;
    return BY_ID.get(id) ?? Calendar;
}
