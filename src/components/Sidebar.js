"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Flame, LayoutDashboard, ChefHat, BookOpen, UtensilsCrossed, Calendar,
    PartyPopper, HeartHandshake, FileText, Receipt, BarChart3, Calculator,
    ShoppingCart, Package, Truck, Wrench, Clock, ShieldCheck, Palette,
    DollarSign, Camera, Settings, ChevronDown, ChevronRight, ChevronLeft
} from "lucide-react";

const navSections = [
    {
        title: "De Keuken",
        icon: <ChefHat size={18} />,
        type: "folder",
        children: [
            { label: "Menu Engineering", icon: <UtensilsCrossed size={16} />, href: "/menu-engineering" },
            { label: "Recepten", icon: <BookOpen size={16} />, href: "/recepten" },
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten" },
        ],
    },
    {
        title: "Operatie",
        icon: <Calendar size={18} />,
        type: "folder",
        children: [
            { label: "Agenda", icon: <Calendar size={16} />, href: "/agenda" },
            { label: "Events", icon: <PartyPopper size={16} />, href: "/events" },
            { label: "Service", icon: <HeartHandshake size={16} />, href: "/service" },
        ],
    },
    {
        title: "De Zaak",
        icon: <Receipt size={18} />,
        type: "folder",
        children: [
            { label: "Offertes", icon: <FileText size={16} />, href: "/offertes" },
            { label: "Facturen", icon: <Receipt size={16} />, href: "/facturen" },
            { label: "Analytics", icon: <BarChart3 size={16} />, href: "/financien" },
            { label: "Boekhouding", icon: <Calculator size={16} />, href: "/boekhouding" },
        ],
    },
    {
        title: "Beheer & Logistiek",
        icon: <Package size={18} />,
        type: "folder",
        children: [
            { label: "Inkoop", icon: <ShoppingCart size={16} />, href: "/inkoop" },
            { label: "Voorraad", icon: <Package size={16} />, href: "/voorraad" },
            { label: "Logistiek", icon: <Truck size={16} />, href: "/logistiek" },
            { label: "Materieel", icon: <Wrench size={16} />, href: "/materieel" },
            { label: "Uren", icon: <Clock size={16} />, href: "/uren" },
            { label: "HACCP", icon: <ShieldCheck size={16} />, href: "/haccp" },
        ],
    },
    {
        title: "Digital Pitmaster",
        icon: <Palette size={18} />,
        type: "folder",
        children: [
            { label: "Pitmaster Studio", icon: <Palette size={16} />, href: "/ai-chat" },
            { label: "Prijsintelligentie", icon: <DollarSign size={16} />, href: "/price-intelligence" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={18} />,
        type: "folder",
        children: [
            { label: "Foto-archief", icon: <Camera size={16} />, href: "/foto-archief" },
            { label: "Instellingen", icon: <Settings size={16} />, href: "/instellingen" },
        ],
    },
];

function SidebarFolder({ section, collapsed, pathname, expandedSections, toggleSection }) {
    const isExpanded = expandedSections.includes(section.title);

    // Check if any child is active
    const isActiveFolder = section.children.some(child => pathname === child.href || (child.href !== '/' && pathname.startsWith(child.href)));

    return (
        <div className="mb-2 w-full overflow-hidden">
            <button
                onClick={() => {
                    if (collapsed) {
                        // Doing nothing, or could expand sidebar and then open folder
                    } else {
                        toggleSection(section.title);
                    }
                }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#555558] hover:text-[#88888c] transition-colors group"
                title={collapsed ? section.title : ""}
            >
                <div className={`flex items-center gap-3 transition-all duration-300 ${collapsed ? 'w-full justify-center' : ''}`}>
                    <span className={`shrink-0 transition-colors ${isActiveFolder ? 'text-[#c4a35a]' : 'text-[#444447] group-hover:text-[#666668]'}`}>
                        {section.icon}
                    </span>

                    <span className={`whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
                        {section.title}
                    </span>
                </div>

                <ChevronDown
                    className={`shrink-0 w-3.5 h-3.5 transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'} ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                />
            </button>

            {/* Children list transitions smoothly */}
            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${(!collapsed && isExpanded) ? "max-h-[500px] opacity-100 mt-1 mb-3" : "max-h-0 opacity-0 mb-0"
                    }`}
            >
                <div className="space-y-1">
                    {section.children.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap overflow-hidden ${isActive
                                        ? "bg-[#c4a35a]/10 text-white border-l-2 border-[#c4a35a] pl-2.5"
                                        : "text-[#77777a] hover:text-white hover:bg-white/[0.03] border-l-2 border-transparent pl-2.5"
                                    }`}
                            >
                                <span className={`shrink-0 ${isActive ? "text-[#c4a35a]" : ""}`}>
                                    {item.icon}
                                </span>
                                <span className="text-[13px] font-medium truncate">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const [expandedSections, setExpandedSections] = useState(
        navSections.map((s) => s.title)
    );

    const toggleSection = (title) => {
        setExpandedSections((prev) =>
            prev.includes(title)
                ? prev.filter((t) => t !== title)
                : [...prev, title]
        );
    };

    return (
        <aside
            className={`sticky top-0 h-screen bg-[#151518] border-r border-[#141418] flex flex-col z-50 transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${collapsed ? "w-[80px]" : "w-[260px]"
                }`}
        >
            {/* Header / Logo */}
            <div className="flex items-center justify-between px-5 py-5 border-b border-[#141418] shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#1a1a20] to-[#0e0e12] flex items-center justify-center border border-[#222228]">
                        <Flame className="w-4 h-4 text-[#c4a35a]" />
                    </div>
                    <div className={`transition-all duration-300 whitespace-nowrap flex flex-col justify-center ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-[120px]'
                        }`}>
                        <p className="text-[13px] font-semibold tracking-[0.08em] text-white font-['Outfit'] truncate">
                            BBQ ARCHITECT
                        </p>
                        <p className="text-[9px] tracking-[0.25em] text-[#555558] uppercase truncate mt-0.5">
                            Hop & Bites
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`shrink-0 p-1.5 rounded-lg hover:bg-[#1a1a20] text-[#555] hover:text-white transition-colors ${collapsed ? 'absolute right-[22px]' : ''}`}
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Dashboard Link */}
            <div className="px-3 pt-5 pb-3 shrink-0">
                <Link
                    href="/"
                    className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap ${pathname === "/"
                            ? "bg-gradient-to-r from-[#c4a35a]/10 to-transparent border border-[#c4a35a]/20 text-white shadow-[inset_0px_1px_1px_rgba(255,255,255,0.05)]"
                            : "text-[#77777a] hover:text-white hover:bg-[#1a1a1f]"
                        } ${collapsed ? "justify-center" : ""}`}
                    title={collapsed ? "Dashboard" : ""}
                >
                    <LayoutDashboard className={`shrink-0 w-[18px] h-[18px] ${pathname === "/" ? "text-[#c4a35a]" : "group-hover:text-white"}`} />
                    <span className={`text-[13.5px] font-semibold transition-all duration-300 ${collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}`}>
                        Dashboard
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1 scrollbar-thin">
                {navSections.map((section) => (
                    <SidebarFolder
                        key={section.title}
                        section={section}
                        collapsed={collapsed}
                        pathname={pathname}
                        expandedSections={expandedSections}
                        toggleSection={toggleSection}
                    />
                ))}
            </nav>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-[#141418] shrink-0 overflow-hidden">
                <div className={`flex items-center gap-3 transition-all duration-300 ${collapsed ? 'justify-center mx-1' : ''}`}>
                    <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[#c4a35a]/20 to-[#c4a35a]/5 flex items-center justify-center text-[11px] font-bold text-[#c4a35a] border border-[#c4a35a]/20">
                        MB
                    </div>
                    <div className={`transition-all duration-300 whitespace-nowrap flex-1 min-w-0 flex items-center justify-between ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'
                        }`}>
                        <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-white truncate text-shadow-sm">Mathijs Berkhout</p>
                            <p className="text-[10px] text-[#555558] font-medium uppercase tracking-wider mt-0.5">Pitmaster</p>
                        </div>
                        <Settings className="w-4 h-4 shrink-0 text-[#444447] hover:text-white cursor-pointer transition-colors" />
                    </div>
                </div>
            </div>
        </aside>
    );
}
