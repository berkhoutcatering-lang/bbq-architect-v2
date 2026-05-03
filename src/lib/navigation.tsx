import { type ReactNode } from "react";
import {
    ChefHat, Calendar, PartyPopper, BarChart3,
    ShoppingCart, Package, Clock,
    Settings, Building2, Users, Inbox, Globe,
    HelpCircle, Sparkles, ScanLine, Image as ImageIcon, Car
} from "lucide-react";

export interface NavChild {
    label: string;
    icon: ReactNode;
    href: string;
    description?: string;
}

export interface NavSection {
    title: string;
    icon: ReactNode;
    type: string;
    slug: string;
    description: string;
    children: NavChild[];
    secondary?: boolean;
    /** Direct hub-page voor deze sectie. Klik op de sectie-titel in de sidebar gaat naar deze URL. */
    hubHref?: string;
}

/* IA 2026-05-02 — task-frequency sidebar.
   Top-level = wat je dagelijks snel nodig hebt:
   Vandaag (apart, in Sidebar.tsx) → Agenda → Events → Recepten → Factuur-lezer → Administratie → Systeem.

   Niet meer in sidebar (alleen via ⌘K of via context van een event):
   - HACCP, Klantgesprek, Prep-counter, Service, Reflectie → leven onder een event
   - Materieel, AI-chat, Logistiek, Price-intelligence → ⌘K-pad
   - Foto-archief → verhuist naar Factuur-lezer als bonnen-archief */
export const navSections: NavSection[] = [
    {
        title: "Agenda",
        icon: <Calendar size={18} />,
        type: "single",
        slug: "agenda",
        description: "Week- en maandweergave van al je events.",
        hubHref: "/agenda",
        children: [],
    },
    {
        title: "Events",
        icon: <PartyPopper size={18} />,
        type: "single",
        slug: "events",
        description: "Events aanmaken, plannen en runnen — klantgesprek, prep, HACCP en service leven hier binnenin.",
        hubHref: "/events",
        children: [],
    },
    {
        title: "Recepten",
        icon: <ChefHat size={18} />,
        type: "folder",
        slug: "recepten",
        description: "Gerechten, AI-bedenker en marge-analyse.",
        hubHref: "/gerechten",
        children: [
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten", description: "Vaste gerechten met receptuur en menu-templates" },
            { label: "Bedenker", icon: <Sparkles size={16} />, href: "/bedenker", description: "AI-speeltuin om concepten te brainstormen" },
            { label: "Marges", icon: <BarChart3 size={16} />, href: "/marges", description: "BCG-analyse: marges en populariteit per gerecht" },
        ],
    },
    {
        title: "Factuur-lezer",
        icon: <ScanLine size={18} />,
        type: "folder",
        slug: "factuur-lezer",
        description: "Scan een bon of factuur — alle inkomende papieren komen op één plek.",
        hubHref: "/factuur-lezer",
        children: [
            { label: "Scannen", icon: <ScanLine size={16} />, href: "/factuur-lezer", description: "Upload bon of factuur, AI extracteert de regels" },
            { label: "Archief", icon: <ImageIcon size={16} />, href: "/foto-archief", description: "Alle gescande bonnen, facturen en foto's terugvinden" },
        ],
    },
    {
        title: "Administratie",
        icon: <BarChart3 size={18} />,
        type: "folder",
        slug: "administratie",
        description: "Financiën, uren, klanten, voorraad — alles wat papierwerk is.",
        hubHref: "/administratie",
        children: [
            { label: "Financiën", icon: <BarChart3 size={16} />, href: "/financien", description: "Dashboard, W&V, uitgaven, BTW en top-klanten" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "Urenregistratie en planning" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantenbestand en historie" },
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadstand en par-levels" },
            { label: "Inkooplijsten", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Bestellijsten en leveranciers" },
            { label: "Rittenregistratie", icon: <Car size={16} />, href: "/administratie/rittenregistratie", description: "Sluitende kilometeradministratie — €0,23/km Belastingdienst" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={18} />,
        type: "folder",
        slug: "systeem",
        secondary: true,
        description: "Instellingen, gebruikers, mailbox, website en hulp.",
        hubHref: "/systeem",
        children: [
            { label: "Instellingen", icon: <Settings size={16} />, href: "/instellingen", description: "Bedrijfsprofiel en voorkeuren" },
            { label: "Gebruikers", icon: <Users size={16} />, href: "/gebruikers", description: "Team-beheer en rollen" },
            { label: "Integraties", icon: <Settings size={16} />, href: "/instellingen/integraties", description: "Moneybird, Mollie, Google Calendar" },
            { label: "Mailbox", icon: <Inbox size={16} />, href: "/mailbox", description: "E-mail en templates" },
            { label: "Website", icon: <Globe size={16} />, href: "/website", description: "Publieke site beheren" },
            { label: "Help Center", icon: <HelpCircle size={16} />, href: "/hulp", description: "Artikelen, FAQ, support" },
            { label: "Platform Beheer", icon: <Building2 size={16} />, href: "/admin", description: "Organisaties en klanten (admins)" },
        ],
    },
];

export function getSectionBySlug(slug: string): NavSection | undefined {
    return navSections.find((s) => s.slug === slug);
}

export function getSectionSlugByTitle(title: string): string | undefined {
    return navSections.find((s) => s.title === title)?.slug;
}

export function getAllSectionSlugs(): string[] {
    return navSections.map((s) => s.slug);
}
