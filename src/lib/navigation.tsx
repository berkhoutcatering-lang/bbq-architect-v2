import { type ReactNode } from "react";
import {
    ChefHat, UtensilsCrossed, Calendar,
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
    /** Direct hub-page voor deze sectie. Klik op de sectie-titel in de sidebar gaat naar deze URL.
     *  Wanneer aanwezig: sidebar verbergt children (alleen bereikbaar via tabs op hub of ⌘K). */
    hubHref?: string;
}

export const navSections: NavSection[] = [
    {
        title: "Keuken",
        icon: <ChefHat size={18} />,
        type: "folder",
        slug: "keuken",
        description: "Gerechten, opgeslagen menu's en marge-analyse.",
        hubHref: "/gerechten",
        children: [
            { label: "Gerechten & Menu's", icon: <ChefHat size={16} />, href: "/gerechten", description: "Gerechten beheren met receptuur + opgeslagen menu's voor offertes" },
            { label: "Marges", icon: <BarChart3 size={16} />, href: "/marges", description: "BCG-analyse: marges en populariteit per gerecht" },
        ],
    },
    {
        title: "Plannen & Events",
        icon: <Calendar size={18} />,
        type: "folder",
        slug: "plannen",
        description: "Plan, prep en run je events — agenda, intake, prep en service in één hub.",
        hubHref: "/agenda",
        children: [
            { label: "Agenda", icon: <Calendar size={16} />, href: "/agenda", description: "Bekijk je planning en agenda" },
            { label: "Events", icon: <PartyPopper size={16} />, href: "/events", description: "Beheer al je events en boekingen" },
            { label: "Prep Counter", icon: <ClipboardList size={16} />, href: "/prep-counter", description: "Mise en place planner — AI volgorde-plan + sticker generator" },
            { label: "Klantgesprek", icon: <HeartHandshake size={16} />, href: "/klantgesprek", description: "Intake bij potentiële klant" },
            { label: "HACCP", icon: <ShieldCheck size={16} />, href: "/haccp", description: "Voedselveiligheid en temperatuur-logs per event" },
        ],
    },
    {
        title: "Verkoop & Klanten",
        icon: <Receipt size={18} />,
        type: "folder",
        slug: "verkoop",
        description: "Offertes, facturen en klanten.",
        hubHref: "/offertes",
        children: [
            { label: "Offertes", icon: <FileText size={16} />, href: "/offertes", description: "Bekijk en beheer je offertes" },
            { label: "Facturen", icon: <Receipt size={16} />, href: "/facturen", description: "Beheer je facturen en betalingen" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantbeheer en contactgegevens" },
        ],
    },
    {
        title: "Geld & Boekhouding",
        icon: <BarChart3 size={18} />,
        type: "folder",
        slug: "geld",
        description: "Financieel overzicht, urenregistratie en bonnen.",
        hubHref: "/financien",
        children: [
            { label: "Financiën", icon: <BarChart3 size={16} />, href: "/financien", description: "Dashboard, winst & verlies, uitgaven, BTW en top klanten" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "Urenregistratie en planning" },
        ],
    },
    {
        title: "Voorraad & Beheer",
        icon: <Package size={18} />,
        type: "folder",
        slug: "beheer",
        description: "Inkoop, voorraad, logistiek, materieel en prijsintelligentie.",
        hubHref: "/voorraad",
        children: [
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadbeheer en tracking" },
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Beheer je inkooporders en leveranciers" },
            { label: "Logistiek", icon: <Truck size={16} />, href: "/logistiek", description: "Transportplanning en bezorging" },
            { label: "Materieel", icon: <Wrench size={16} />, href: "/materieel", description: "Beheer je materieel en apparatuur" },
            { label: "Prijsintelligentie", icon: <DollarSign size={16} />, href: "/price-intelligence", description: "Prijsanalyse en marktinzichten" },
        ],
    },
    {
        title: "Instellingen & Hulp",
        icon: <Settings size={18} />,
        type: "folder",
        slug: "systeem",
        secondary: true,
        description: "Instellingen, gebruikers, mailbox, website en hulp.",
        hubHref: "/sectie/systeem",
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
