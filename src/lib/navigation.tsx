import { type ReactNode } from "react";
import {
    ChefHat, BookOpen, UtensilsCrossed, Calendar,
    PartyPopper, HeartHandshake, FileText, Receipt, BarChart3,
    ShoppingCart, Package, Truck, Wrench, Clock, ShieldCheck, Palette, ClipboardList,
    DollarSign, Camera, Settings, Building2,
    Users, Mail, Inbox, Globe,
    HelpCircle
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
}

export const navSections: NavSection[] = [
    {
        title: "Keuken",
        icon: <ChefHat size={18} />,
        type: "folder",
        slug: "keuken",
        description: "Gerechten, menu-analyse en je AI Pitmaster.",
        children: [
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten", description: "Catalog: gerechten met ingredienten en kostprijzen" },
            { label: "Menu Engineering", icon: <UtensilsCrossed size={16} />, href: "/menu-engineering", description: "BCG-analyse: marges en populariteit" },
            { label: "Recepten", icon: <BookOpen size={16} />, href: "/recepten", description: "Receptenbibliotheek met bereidingswijzen" },
            { label: "Pitmaster Studio", icon: <Palette size={16} />, href: "/ai-chat", description: "Je AI-assistent voor brainstorm en Q&A" },
        ],
    },
    {
        title: "Operatie",
        icon: <Calendar size={18} />,
        type: "folder",
        slug: "operatie",
        description: "Plan en beheer je events, agenda en service.",
        children: [
            { label: "Agenda", icon: <Calendar size={16} />, href: "/agenda", description: "Bekijk je planning en agenda" },
            { label: "Events", icon: <PartyPopper size={16} />, href: "/events", description: "Beheer al je events en boekingen" },
            { label: "Prep Counter", icon: <ClipboardList size={16} />, href: "/prep-counter", description: "Mise en place planner — AI volgorde-plan + sticker generator" },
            { label: "Klantgesprek", icon: <HeartHandshake size={16} />, href: "/klantgesprek", description: "Intake bij potentiële klant" },
            { label: "Service", icon: <HeartHandshake size={16} />, href: "/service", description: "Beheer je serviceteam en taken" },
        ],
    },
    {
        title: "Verkoop",
        icon: <Receipt size={18} />,
        type: "folder",
        slug: "verkoop",
        description: "Offertes, facturen, klanten en financieel overzicht.",
        children: [
            { label: "Offertes", icon: <FileText size={16} />, href: "/offertes", description: "Bekijk en beheer je offertes" },
            { label: "Facturen", icon: <Receipt size={16} />, href: "/facturen", description: "Beheer je facturen en betalingen" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantbeheer en contactgegevens" },
            { label: "Financiën", icon: <BarChart3 size={16} />, href: "/financien", description: "Dashboard, winst & verlies, uitgaven, BTW en top klanten" },
        ],
    },
    {
        title: "Beheer",
        icon: <Package size={18} />,
        type: "folder",
        slug: "beheer",
        description: "Inkoop, voorraad, logistiek, personeel en HACCP.",
        children: [
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Beheer je inkooporders en leveranciers" },
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadbeheer en tracking" },
            { label: "Logistiek", icon: <Truck size={16} />, href: "/logistiek", description: "Transportplanning en bezorging" },
            { label: "Materieel", icon: <Wrench size={16} />, href: "/materieel", description: "Beheer je materieel en apparatuur" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "Urenregistratie en planning" },
            { label: "HACCP", icon: <ShieldCheck size={16} />, href: "/haccp", description: "Voedselveiligheid en kwaliteitscontrole" },
            { label: "Prijsintelligentie", icon: <DollarSign size={16} />, href: "/price-intelligence", description: "Prijsanalyse en marktinzichten" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={18} />,
        type: "folder",
        slug: "systeem",
        secondary: true,
        description: "Instellingen, communicatie, website en hulp.",
        children: [
            { label: "Instellingen", icon: <Settings size={16} />, href: "/instellingen", description: "Systeemconfiguratie en voorkeuren" },
            { label: "Gebruikers", icon: <Users size={16} />, href: "/gebruikers", description: "Gebruikersbeheer en rollen" },
            { label: "Integraties", icon: <Settings size={16} />, href: "/instellingen/integraties", description: "Koppelingen met externe diensten" },
            { label: "Foto-archief", icon: <Camera size={16} />, href: "/foto-archief", description: "Beheer je foto's en media" },
            { label: "Mailbox", icon: <Inbox size={16} />, href: "/mailbox", description: "E-mail, templates en klant-correspondentie" },
            { label: "Website", icon: <Globe size={16} />, href: "/website", description: "Beheer je website content" },
            { label: "Help Center", icon: <HelpCircle size={16} />, href: "/hulp", description: "Artikelen, FAQ en support tickets" },
            { label: "Platform Beheer", icon: <Building2 size={16} />, href: "/admin", description: "Organisaties en klanten beheren" },
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
