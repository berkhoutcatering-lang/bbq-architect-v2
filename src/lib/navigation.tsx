import { type ReactNode } from "react";
import {
    ChefHat, BookOpen, UtensilsCrossed, Calendar,
    PartyPopper, HeartHandshake, FileText, Receipt, BarChart3, Calculator,
    ShoppingCart, Package, Truck, Wrench, Clock, ShieldCheck, Palette,
    DollarSign, Camera, Settings,
    Users, Mail, Inbox, Globe,
    FilePlus, HelpCircle, MessageCircle, PieChart
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
        title: "De Keuken",
        icon: <ChefHat size={18} />,
        type: "folder",
        slug: "de-keuken",
        description: "Beheer je menu, recepten en gerechten vanuit één plek.",
        children: [
            { label: "Menu Engineering", icon: <UtensilsCrossed size={16} />, href: "/menu-engineering", description: "Beoordeel, sorteer en publiceer je gerechten" },
            { label: "Recepten", icon: <BookOpen size={16} />, href: "/recepten", description: "Beheer al je recepten en bereidingswijzen" },
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten", description: "Overzicht van al je gerechten" },
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
            { label: "Event Planner", icon: <PieChart size={16} />, href: "/event-planner", description: "Plan en configureer nieuwe events" },
            { label: "Service", icon: <HeartHandshake size={16} />, href: "/service", description: "Beheer je serviceteam en taken" },
        ],
    },
    {
        title: "De Zaak",
        icon: <Receipt size={18} />,
        type: "folder",
        slug: "de-zaak",
        description: "Offertes, facturen, klanten en financieel overzicht.",
        children: [
            { label: "Klantgesprek", icon: <HeartHandshake size={16} />, href: "/klantgesprek", description: "Intake bij potentiële klant" },
            { label: "Offertes", icon: <FileText size={16} />, href: "/offertes", description: "Bekijk en beheer je offertes" },
            { label: "Snel Aanmaken", icon: <FilePlus size={16} />, href: "/offerte-editor", description: "Maak snel een nieuwe offerte aan" },
            { label: "Facturen", icon: <Receipt size={16} />, href: "/facturen", description: "Beheer je facturen en betalingen" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantbeheer en contactgegevens" },
            { label: "Analytics", icon: <BarChart3 size={16} />, href: "/financien", description: "Financiele analyses en rapportages" },
            { label: "Boekhouding", icon: <Calculator size={16} />, href: "/boekhouding", description: "Boekhouding en administratie" },
        ],
    },
    {
        title: "Beheer & Logistiek",
        icon: <Package size={18} />,
        type: "folder",
        slug: "beheer-logistiek",
        description: "Inkoop, voorraad, logistiek en personeelsbeheer.",
        children: [
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Beheer je inkooporders en leveranciers" },
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadbeheer en tracking" },
            { label: "Logistiek", icon: <Truck size={16} />, href: "/logistiek", description: "Transportplanning en bezorging" },
            { label: "Materieel", icon: <Wrench size={16} />, href: "/materieel", description: "Beheer je materieel en apparatuur" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "Urenregistratie en planning" },
            { label: "HACCP", icon: <ShieldCheck size={16} />, href: "/haccp", description: "Voedselveiligheid en kwaliteitscontrole" },
        ],
    },
    {
        title: "Digital Pitmaster",
        icon: <Palette size={18} />,
        type: "folder",
        slug: "digital-pitmaster",
        description: "AI-tools en prijsintelligentie voor je bedrijf.",
        children: [
            { label: "Pitmaster Studio", icon: <Palette size={16} />, href: "/ai-chat", description: "Je AI-assistent voor alles" },
            { label: "Prijsintelligentie", icon: <DollarSign size={16} />, href: "/price-intelligence", description: "Prijsanalyse en marktinzichten" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={18} />,
        type: "folder",
        slug: "systeem",
        secondary: true,
        description: "Systeeminstellingen, gebruikers en media.",
        children: [
            { label: "Foto-archief", icon: <Camera size={16} />, href: "/foto-archief", description: "Beheer je foto's en media" },
            { label: "Gebruikers", icon: <Users size={16} />, href: "/gebruikers", description: "Gebruikersbeheer en rollen" },
            { label: "Instellingen", icon: <Settings size={16} />, href: "/instellingen", description: "Systeemconfiguratie en voorkeuren" },
        ],
    },
    {
        title: "Communicatie",
        icon: <Mail size={18} />,
        type: "folder",
        slug: "communicatie",
        secondary: true,
        description: "Berichten en e-mail vanuit één plek.",
        children: [
            { label: "Berichten", icon: <Mail size={16} />, href: "/berichten", description: "Bekijk en verstuur berichten" },
            { label: "Mailbox", icon: <Inbox size={16} />, href: "/mailbox", description: "Je e-mail inbox" },
        ],
    },
    {
        title: "Website",
        icon: <Globe size={18} />,
        type: "folder",
        slug: "website",
        secondary: true,
        description: "Beheer je website en online aanwezigheid.",
        children: [
            { label: "Website Beheer", icon: <Globe size={16} />, href: "/website", description: "Beheer je website content" },
        ],
    },
    {
        title: "Hulp & Support",
        icon: <HelpCircle size={18} />,
        type: "folder",
        slug: "hulp-support",
        secondary: true,
        description: "Veelgestelde vragen en contactinformatie.",
        children: [
            { label: "FAQ", icon: <BookOpen size={16} />, href: "/faq", description: "Veelgestelde vragen" },
            { label: "Contact", icon: <MessageCircle size={16} />, href: "/contact", description: "Neem contact met ons op" },
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
