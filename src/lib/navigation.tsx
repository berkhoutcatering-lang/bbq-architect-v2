import { type ReactNode } from "react";
import {
    ChefHat, Calendar, PartyPopper, BarChart3,
    ShoppingCart, Package, Clock,
    Settings, Building2, Users, Inbox, Globe,
    HelpCircle, ScanLine, Car, Store, Layers,
    Receipt, TrendingUp, Boxes, BookOpen, Flame,
    Hammer, Truck, Archive, MonitorPlay, LayoutDashboard,
    FileText, ShoppingBag, Gift, Tag, PackagePlus, Plug, Tags,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   Werkruimtes — de ENIGE bron voor de navigatie (2026-10-20).

   Elk onderdeel is een werkruimte zoals een Odoo-app: op het tegelscherm
   een tegel, en eenmaal binnen een werkruimtebalk met alléén de tabbladen
   van dat onderdeel. Werkruimtebalk, tegelscherm, onderbalk, kruimelpad,
   zoekvenster (⌘K) en de sitemap lezen allemaal deze lijst. Voorheen
   stonden de tabbladen op elf plekken die elkaar tegenspraken (negen
   *Tabs.tsx-bestanden, het zoekvenster, het kruimelpad …).

   Routes wijzigen hier niet; alleen de indeling. Volgorde van tabbladen =
   de volgorde die al op de pagina's stond.

   `ook`: routes die bij een werkruimte horen zonder eigen tabblad (een
   klantgesprek hoort bij Plannen, marges bij Keuken). Zo weet de balk ook
   daar in welke werkruimte je bent.
   ═══════════════════════════════════════════════════════════════════════ */

export interface NavChild {
    label: string;
    icon: ReactNode;
    href: string;
    description?: string;
    /** Alleen voor platformbeheerders (e-mail-allowlist), niet voor tenants. */
    adminOnly?: boolean;
}

export interface NavSection {
    title: string;
    icon: ReactNode;
    type: string;
    slug: string;
    description: string;
    children: NavChild[];
    secondary?: boolean;
    /** Startpagina van de werkruimte (tegel en titel in de balk gaan hierheen). */
    hubHref?: string;
    /** Routes die bij deze werkruimte horen zonder eigen tabblad. */
    ook?: string[];
    /** Kleur van de tegel en het icoon in de balk. */
    kleur: string;
    /** Kan niet uitgezet worden (Instellingen moet altijd bereikbaar zijn). */
    vast?: boolean;
}

/** Vandaag staat niet in navSections: het is de startpagina zonder tabbladen. */
export const VANDAAG = {
    title: "Vandaag",
    href: "/",
    icon: <LayoutDashboard size={18} />,
    description: "Wat speelt er nu: events, taken en wat aandacht vraagt.",
    kleur: "#C4A35A",
};

export const navSections: NavSection[] = [
    {
        title: "Plannen",
        icon: <Calendar size={18} />,
        type: "folder",
        slug: "plannen",
        description: "Agenda en events — van aanvraag tot uitvoering.",
        hubHref: "/agenda",
        kleur: "#3E7BE6",
        ook: ["/klantgesprek", "/prep-counter", "/haccp", "/plannen", "/event-planner"],
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
        description: "Aanvragen, offertes, klanten en je webshop.",
        hubHref: "/offertes",
        kleur: "#2E9E6B",
        ook: ["/verkoop"],
        children: [
            { label: "Aanvragen", icon: <Inbox size={16} />, href: "/verkoop/leads", description: "Inkomende aanvragen + pijplijn" },
            { label: "Bestellingen", icon: <Package size={16} />, href: "/verkoop/bestellingen", description: "Bestellingen die klanten zelf plaatsten" },
            { label: "Webshop", icon: <ShoppingBag size={16} />, href: "/verkoop/webshop", description: "Artikelen, vakjes en ophaalmomenten van je webshop" },
            { label: "Kerst", icon: <Gift size={16} />, href: "/verkoop/kerst", description: "Kerstpakketten: inhoud, bestellingen en overzicht" },
            { label: "Arrangementen", icon: <Layers size={16} />, href: "/verkoop/arrangementen", description: "Wat klanten zelf kunnen samenstellen — categorieën, niveaus, indicatieprijs" },
            { label: "Site bijsturen", icon: <Globe size={16} />, href: "/verkoop/website", description: "Je website bijsturen: dicht, afwijkende tijden, weekaanbod, uitverkocht. (Website opbouwen = Systeem → Website.)" },
            { label: "Offertes", icon: <FileText size={16} />, href: "/offertes", description: "Offertes opstellen en versturen" },
            { label: "Klanten", icon: <Users size={16} />, href: "/klanten", description: "Klantenbestand en historie" },
        ],
    },
    {
        title: "Keuken",
        icon: <ChefHat size={18} />,
        type: "folder",
        slug: "gerechten",
        description: "Gerechten, componenten, menukaarten en het kookbord.",
        hubHref: "/gerechten",
        kleur: "#E0703A",
        ook: ["/keuken", "/marges", "/ai-chat", "/bedenker", "/recepten", "/menu-engineering", "/inspiratie", "/menu-templates"],
        children: [
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten", description: "Wat je verkoopt: samengesteld uit componenten, met marge en allergenen-cascade" },
            { label: "Componenten", icon: <Boxes size={16} />, href: "/gerechten/componenten", description: "Atomaire bouwstenen — zelf-bereid of inkoop. Wijzig één keer, alle gerechten passen mee" },
            { label: "Menukaarten", icon: <BookOpen size={16} />, href: "/gerechten/menukaarten", description: "Per gang kiezen wat erop staat; als sjabloon in één klik in een offerte" },
            { label: "Kookbord", icon: <Flame size={16} />, href: "/keuken/kookbord", description: "Prep-taken per station, dagen vooraf. Swipe-to-done op tablet." },
            { label: "Keukenscherm", icon: <MonitorPlay size={16} />, href: "/keuken/scherm", description: "Het wandscherm: wat je nu doet, wat er straks komt. Alleen kijken — bedienen doe je op de tablet." },
            { label: "Analyse", icon: <TrendingUp size={16} />, href: "/gerechten/analyse", description: "Welke gerechten verdienen hun plek — populariteit × marge" },
        ],
    },
    {
        title: "Inkoop & Voorraad",
        icon: <Package size={18} />,
        type: "folder",
        slug: "voorraad",
        description: "Voorraad, partijen, winkel, inkoop, leveranciers en bonnen.",
        hubHref: "/voorraad",
        kleur: "#B8862B",
        ook: ["/scan", "/labels", "/factuur-lezer"],
        children: [
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad", description: "Voorraadstand en par-levels" },
            { label: "Partijen", icon: <Tag size={16} />, href: "/voorraad/partijen", description: "Wat je zelf maakt en invriest, met sticker en houdbaarheid" },
            { label: "Winkel", icon: <ShoppingBag size={16} />, href: "/voorraad/winkel", description: "Winkelvoorraad tellen en bijbestellen" },
            { label: "Prijskaartjes", icon: <Tags size={16} />, href: "/voorraad/prijskaartjes", description: "Kaartjes voor de schaphouders, tien per A4" },
            { label: "Ontvangst", icon: <PackagePlus size={16} />, href: "/voorraad/ontvangst", description: "Leveringen binnenboeken" },
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop", description: "Bestellijsten en bestelvoorstellen" },
            { label: "Leveranciers", icon: <Store size={16} />, href: "/leveranciers", description: "Beheer waar je producten vandaan komen" },
            { label: "Bonnen", icon: <ScanLine size={16} />, href: "/bonnen", description: "Sleep foto's, PDFs, screenshots of UBL-XML naar binnen — wij lezen ze uit" },
            { label: "Bonnenkistje", icon: <Archive size={16} />, href: "/archief", description: "Doorzoekbaar boekhoud-archief — vind elke bon over 7 jaar heen tot op het woord" },
            { label: "Inkoopprijzen", icon: <TrendingUp size={16} />, href: "/price-intelligence", description: "Mail je leveranciers-PDF — wij lezen ′m uit." },
        ],
    },
    {
        title: "Geld",
        icon: <BarChart3 size={18} />,
        type: "folder",
        slug: "geld",
        description: "Financiën, facturen en je boekhouder.",
        hubHref: "/financien",
        kleur: "#1F9A8A",
        ook: ["/geld", "/boekhouding"],
        children: [
            { label: "Financiën", icon: <BarChart3 size={16} />, href: "/financien", description: "Dashboard, W&V, uitgaven, BTW en top-klanten" },
            { label: "Facturen", icon: <Receipt size={16} />, href: "/facturen", description: "Facturen opstellen, versturen en innen" },
            { label: "Boekhouder", icon: <BookOpen size={16} />, href: "/geld/boekhouder", description: "RGS-categorisering en maandpakket voor je boekhouder" },
        ],
    },
    {
        title: "Team & Operatie",
        icon: <Clock size={18} />,
        type: "folder",
        slug: "team",
        description: "Uren, materieel, ritten en logistiek — alles rond je mensen en spullen.",
        hubHref: "/uren",
        kleur: "#8462D6",
        ook: ["/administratie"],
        children: [
            { label: "Uren", icon: <Clock size={16} />, href: "/uren", description: "In- en uitklokken, crew-uren en maandoverzicht" },
            { label: "Materieel", icon: <Hammer size={16} />, href: "/materieel", description: "Smoker, pannen, equipment — wat je meeneemt naar het event" },
            { label: "Ritten", icon: <Car size={16} />, href: "/administratie/rittenregistratie", description: "Sluitende kilometeradministratie — €0,23/km Belastingdienst" },
            { label: "Logistiek", icon: <Truck size={16} />, href: "/logistiek", description: "Routes, transport en planning" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={18} />,
        type: "folder",
        slug: "systeem",
        description: "Instellingen, gebruikers, koppelingen, mailbox, website en hulp.",
        hubHref: "/systeem",
        kleur: "#6B7685",
        vast: true,
        ook: ["/systeem", "/sectie", "/berichten", "/faq", "/template-editor"],
        children: [
            { label: "Instellingen", icon: <Settings size={16} />, href: "/instellingen", description: "Bedrijfsprofiel en voorkeuren" },
            { label: "Gebruikers", icon: <Users size={16} />, href: "/gebruikers", description: "Team-beheer en rollen" },
            { label: "Koppelingen", icon: <Plug size={16} />, href: "/instellingen/integraties", description: "Moneybird, Mollie, Google Calendar" },
            { label: "Mailbox", icon: <Inbox size={16} />, href: "/mailbox", description: "E-mail en templates" },
            { label: "Website", icon: <Globe size={16} />, href: "/website", description: "Publieke site beheren" },
            { label: "Hulp", icon: <HelpCircle size={16} />, href: "/hulp", description: "Artikelen, FAQ, support" },
            { label: "Platform Beheer", icon: <Building2 size={16} />, href: "/admin", description: "Organisaties en klanten (admins)", adminOnly: true },
        ],
    },
];

/** Tabbladen die nooit uit kunnen: zonder deze kom je niet meer terug. */
export const VASTE_TABS = new Set<string>(["/instellingen"]);

export function getSectionBySlug(slug: string): NavSection | undefined {
    return navSections.find((s) => s.slug === slug);
}

export function getSectionSlugByTitle(title: string): string | undefined {
    return navSections.find((s) => s.title === title)?.slug;
}

export function getAllSectionSlugs(): string[] {
    return navSections.map((s) => s.slug);
}

/* ── Waar ben ik? ────────────────────────────────────────────────────── */

export interface WerkruimteMatch {
    section: NavSection;
    /** Het actieve tabblad, of null op een `ook`-route zonder eigen tab. */
    tab: NavChild | null;
    /** Het pad-voorvoegsel dat matchte (tab-href of ook-route). */
    prefix: string;
}

function padHoortBij(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(prefix + "/");
}

/* Alle voorvoegsels, langste eerst: /voorraad/winkel wint van /voorraad, en
   /instellingen/integraties van /instellingen. */
const VOORVOEGSELS: Array<{ prefix: string; section: NavSection; tab: NavChild | null }> = (function () {
    const lijst: Array<{ prefix: string; section: NavSection; tab: NavChild | null }> = [];
    for (const section of navSections) {
        for (const child of section.children) lijst.push({ prefix: child.href, section, tab: child });
        for (const p of section.ook ?? []) lijst.push({ prefix: p, section, tab: null });
    }
    return lijst.sort((a, b) => b.prefix.length - a.prefix.length);
})();

/**
 * Bij welke werkruimte (en welk tabblad) hoort dit pad? null op Vandaag en
 * op pagina's buiten elke werkruimte.
 */
export function vindWerkruimte(pathname: string | null | undefined): WerkruimteMatch | null {
    if (!pathname || pathname === "/") return null;
    for (const v of VOORVOEGSELS) {
        if (padHoortBij(pathname, v.prefix)) return { section: v.section, tab: v.tab, prefix: v.prefix };
    }
    return null;
}

/* ── Wat mag deze gebruiker zien? ────────────────────────────────────── */

export interface ZichtbaarheidOpties {
    /** Sleutels die het bedrijf uitzette: een werkruimte-slug of een tab-href. */
    verborgen: readonly string[];
    /** Platformbeheerder (ziet ook adminOnly-tabbladen). */
    isPlatformAdmin: boolean;
}

export function isTabZichtbaar(child: NavChild, opties: ZichtbaarheidOpties): boolean {
    if (child.adminOnly && !opties.isPlatformAdmin) return false;
    if (VASTE_TABS.has(child.href)) return true;
    return !opties.verborgen.includes(child.href);
}

/**
 * De werkruimtes zoals deze gebruiker ze ziet: uitgezette onderdelen en
 * tabbladen eruit, en een werkruimte zonder zichtbare tabbladen ook.
 * Niets wordt verwijderd — een directe link blijft werken.
 */
export function zichtbareWerkruimtes(opties: ZichtbaarheidOpties): NavSection[] {
    const uit: NavSection[] = [];
    for (const section of navSections) {
        if (!section.vast && opties.verborgen.includes(section.slug)) continue;
        const children = section.children.filter((c) => isTabZichtbaar(c, opties));
        if (children.length === 0) continue;
        uit.push({ ...section, children });
    }
    return uit;
}

/** Waar de tegel en de titel naartoe gaan: de startpagina van de werkruimte,
 *  of het eerste zichtbare tabblad als die startpagina uitgezet is. */
export function werkruimteStart(section: NavSection): string {
    const hub = section.hubHref;
    if (hub && (section.children.some((c) => c.href === hub) || (section.ook ?? []).includes(hub))) return hub;
    return section.children[0]?.href ?? hub ?? "/";
}

/** Alle sleutels die een bedrijf mag uitzetten: werkruimte-slugs (behalve
 *  vaste) en tab-hrefs (behalve vaste en platform-only). De server-actie
 *  laat alleen deze door. */
export function uitzetbareSleutels(): Set<string> {
    const sleutels = new Set<string>();
    for (const s of navSections) {
        if (!s.vast) sleutels.add(s.slug);
        for (const c of s.children) {
            if (c.adminOnly || VASTE_TABS.has(c.href)) continue;
            sleutels.add(c.href);
        }
    }
    return sleutels;
}
