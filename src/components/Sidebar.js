"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Flame, LayoutDashboard, ChefHat, BookOpen, UtensilsCrossed, Calendar,
    PartyPopper, HeartHandshake, FileText, Receipt, BarChart3, Calculator,
    ShoppingCart, Package, Truck, Wrench, Clock, ShieldCheck, Palette,
    DollarSign, Camera, Settings, ChevronDown, ChevronRight, ChevronLeft, ChevronUp
} from "lucide-react";

const navSections = [
    {
        title: "De Keuken",
        icon: <ChefHat size={16} />,
        type: "folder",
        children: [
            { label: "Menu Engineering", icon: <UtensilsCrossed size={16} />, href: "/menu-engineering" },
            { label: "Recepten", icon: <BookOpen size={16} />, href: "/recepten" },
            { label: "Gerechten", icon: <ChefHat size={16} />, href: "/gerechten" },
        ],
    },
    {
        title: "Operatie",
        icon: <Calendar size={16} />,
        type: "folder",
        children: [
            { label: "Agenda", icon: <Calendar size={16} />, href: "/agenda" },
            { label: "Events", icon: <PartyPopper size={16} />, href: "/events" },
            { label: "Service", icon: <HeartHandshake size={16} />, href: "/service" },
        ],
    },
    {
        title: "De Zaak",
        icon: <Receipt size={16} />,
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
        icon: <Package size={16} />,
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
        icon: <Palette size={16} />,
        type: "folder",
        children: [
            { label: "Pitmaster Studio", icon: <Palette size={16} />, href: "/ai-chat" },
            { label: "Prijsintelligentie", icon: <DollarSign size={16} />, href: "/price-intelligence" },
        ],
    },
    {
        title: "Systeem",
        icon: <Settings size={16} />,
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
        <div className="mb-2">
            <button
                onClick={() => !collapsed && toggleSection(section.title)}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#333338] hover:text-[#555558] transition-colors group"
                title={collapsed ? section.title : ""}
            >
                <div className={`flex items-center gap-3 ${collapsed ? 'mx-auto' : ''}`}>
                    <span className={`${isActiveFolder ? 'text-[#c4a35a]' : 'text-[#333338] group-hover:text-[#555558]'}`}>
                        {section.icon}
                    </span>
                    {!collapsed && <span>{section.title}</span>}
                </div>
                {!collapsed && (
                    <ChevronDown
                        className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"
                            }`}
                    />
                )}
            </button>

            {!collapsed && isExpanded && (
                <div className="space-y-0.5 mt-1 mb-3">
                    {section.children.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${isActive
                                        ? "bg-white/[0.04] text-white"
                                        : "text-[#555558] hover:text-[#999] hover:bg-white/[0.02]"
                                    }`}
                            >
                                <span className={isActive ? "text-[#c4a35a]" : ""}>
                                    {item.icon}
                                </span>
                                <span className="text-[12.5px]">{item.label}</span>
                            </Link>
                        );
                    })}
                </div>
            )}
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
            className={`sticky top-0 h-screen bg-[#151518] border-r border-[#141418] flex flex-col z-50 transition-all duration-300 ease-in-out shrink-0 ${collapsed ? "w-[80px]" : "w-[260px]"
                }`}
        >
            {/* Header / Logo */}
            <div className="flex items-center justify-between px-5 py-5 border-b border-[#141418]">
                {!collapsed && (
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="min-w-9 h-9 rounded-full bg-gradient-to-br from-[#1a1a20] to-[#0e0e12] flex items-center justify-center border border-[#222228]">
                            <Flame className="w-4 h-4 text-[#c4a35a]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[13px] font-semibold tracking-[0.08em] text-white font-['Outfit'] truncate">
                                BBQ ARCHITECT
                            </p>
                            <p className="text-[9px] tracking-[0.25em] text-[#444447] uppercase truncate">
                                Hop & Bites
                            </p>
                        </div>
                    </div>
                )}
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className={`p-1.5 rounded-lg hover:bg-[#1a1a20] text-[#555] hover:text-white transition-colors flex-shrink-0 ${collapsed ? "mx-auto" : ""}`}
                >
                    {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </button>
            </div>

            {/* Dashboard Link */}
            <div className="px-3 pt-4 pb-2">
                <Link
                    href="/"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${pathname === "/"
                            ? "bg-[#c4a35a]/10 border border-[#c4a35a]/20 text-white"
                            : "text-[#666] hover:text-white hover:bg-[#111115]"
                        } ${collapsed ? "justify-center" : ""}`}
                    title={collapsed ? "Dashboard" : ""}
                >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    {!collapsed && <span className="text-[13px] font-medium truncate">Dashboard</span>}
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
            {!collapsed && (
                <div className="px-4 py-4 border-t border-[#141418]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[#c4a35a]/20 to-[#c4a35a]/5 flex items-center justify-center text-[11px] font-semibold text-[#c4a35a]">
                            MB
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-white truncate">Mathijs Berkhout</p>
                            <p className="text-[10px] text-[#444447]">Pitmaster</p>
                        </div>
                        <Settings className="w-3.5 h-3.5 shrink-0 text-[#333338] hover:text-[#555] cursor-pointer transition-colors" />
                    </div>
                </div>
            )}

            {/* Collapsed Footer Logo  */}
            {collapsed && (
                <div className="px-4 py-4 border-t border-[#141418] flex justify-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c4a35a]/20 to-[#c4a35a]/5 flex items-center justify-center text-[11px] font-semibold text-[#c4a35a]">
                        MB
                    </div>
                </div>
            )}
        </aside>
    );
}
