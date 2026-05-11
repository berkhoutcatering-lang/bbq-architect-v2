import { type ReactNode } from "react";
import {
    ChefHat, Calendar, PartyPopper, BarChart3,
    ShoppingCart, Package, Clock,
    Settings, Building2, Users, Inbox, Globe,
    HelpCircle, Sparkles, ScanLine, Image as ImageIcon, Car, Store,
    Receipt, TrendingUp, Library, Boxes, BookOpen,
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

/* IA 2026-05-08 — 7-hub sidebar.
   Vandaag is hardcoded bovenaan in Sidebar.tsx.
   Hier: Plannen · Verkoop · Keuken · Voorraad · Geld · Systeem (6 secties = 7 hubs totaal).
   Elke hub heeft sub-items als children die zichtbaar worden in de sidebar-rail.
   Hub-pages zelf (plannen, gerechten, voorraad, financien) dragen een horizontale tab-bar. */
export const navSections: NavSection[] = [
    {
        title: "Plannen",
        icon: <Calendar size={18} />,
        type: "folder",
        slug: "plannen",
        description: "Agenda en events — van aanvraag tot uitvoering.",
        hubHref: "/agenda",
        children: [
            { label: "Agenda", icon: <Calendar size={16} />, href: "/agenda", description: "Week- en maandweergave van al je events" },
            { label: "Events", icon: <PartyPopper size={16} />, href: "/events", description: "Events aanmaken, plannen en runnen" },
        ],
    },
    {
        title: "Verkoop",
        icon: <Receipt size={18} />,
        type: "folder",
        slug: "verkoop",
        description: "Offertes, klanten en facturen.",
        hubHref: "/offertes",
        children: [
            { label: "Offertes", icon: <Receipt size={16} />, href: "/offertes", description: "Offertes opstellen en versturen" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantenbestand en historie" },
        ],
    },
    {
        title: "Inspiratie",
        icon: <Library size={18} />,
        type: "folder",
        slug: "inspiratie",
        description: "Componenten en gerechten — jouw zichzelf-voedende bibliotheek.",
        hubHref: "/inspiratie",
        children: [
            { label: "Componenten", icon: <Boxes size={16} />, href: "/inspiratie/componenten", description: "Atomaire bouwblokken: zelf-maken of inkoop. Hergebruikt in meerdere gerechten" },
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/inspiratie/gerechten", description: "Goedgekeurde gerechten samengesteld uit componenten. Vink aan voor offerte-wizard" },
        ],
    },
    {
        title: "Voorraad",
        icon: <Package size={18} />,
        type: "folder",
        slug: "voorraad",
        description: "Voorraad, inkoop en leveranciers.",
        hubHref: "/voorraad",
        children: [
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadstand en par-levels" },
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Bestellijsten en bon-scanner" },
            { label: "Leveranciers", icon: <Store size={16} />, href: "/leveranciers", description: "Beheer waar je producten vandaan komen" },
        ],
    },
    {
        title: "Geld",
        icon: <BarChart3 size={18} />,
        type: "folder",
        slug: "geld",
        description: "Financiën, uren, bonnen en kilometeradministratie.",
        hubHref: "/financien",
        children: [
            { label: "Financiën", icon: <BarChart3 size={16} />, href: "/financien", description: "Dashboard, W&V, uitgaven, BTW en top-klanten" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "Urenregistratie en planning" },
            { label: "Bonnen & Facturen", icon: <ScanLine size={16} />, href: "/factuur-lezer", description: "Scan bonnen en facturen — AI extracteert de regels" },
            { label: "Boekhouder", icon: <BookOpen size={16} />, href: "/geld/boekhouder", description: "RGS-categorisering en maandpakket voor je boekhouder" },
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
            { label: "Foto-archief", icon: <ImageIcon size={16} />, href: "/foto-archief", description: "Alle gescande bonnen, facturen en foto's terugvinden" },
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
