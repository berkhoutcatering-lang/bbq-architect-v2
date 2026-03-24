'use client';

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Flame, LayoutDashboard, ChefHat, BookOpen, UtensilsCrossed, Calendar,
    PartyPopper, HeartHandshake, FileText, Receipt, BarChart3, Calculator,
    ShoppingCart, Package, Truck, Wrench, Clock, ShieldCheck, Palette,
    DollarSign, Camera, Settings, ChevronDown, ChevronRight
} from "lucide-react";

export default function Sidebar() {
    const pathname = usePathname();

    const navSections = [
        {
            title: "De Keuken",
            icon: <ChefHat className="w-3.5 h-3.5" />,
            items: [
                { label: "Menu Engineering", icon: <UtensilsCrossed className="w-4 h-4" />, href: "/menu-engineering" },
                { label: "Recepten", icon: <BookOpen className="w-4 h-4" />, href: "/recepten" },
                { label: "Gerechten", icon: <ChefHat className="w-4 h-4" />, href: "/gerechten" },
            ],
        },
        {
            title: "Operatie",
            icon: <Calendar className="w-3.5 h-3.5" />,
            items: [
                { label: "Agenda", icon: <Calendar className="w-4 h-4" />, href: "/agenda" },
                { label: "Events", icon: <PartyPopper className="w-4 h-4" />, href: "/events" },
                { label: "Service", icon: <HeartHandshake className="w-4 h-4" />, href: "/service" },
            ],
        },
        {
            title: "De Zaak",
            icon: <Receipt className="w-3.5 h-3.5" />,
            items: [
                { label: "Offertes", icon: <FileText className="w-4 h-4" />, href: "/offertes" },
                { label: "Facturen", icon: <Receipt className="w-4 h-4" />, href: "/facturen" },
                { label: "Analytics", icon: <BarChart3 className="w-4 h-4" />, href: "/financien" },
                { label: "Boekhouding", icon: <Calculator className="w-4 h-4" />, href: "/boekhouding" },
            ],
        },
        {
            title: "Beheer & Logistiek",
            icon: <Package className="w-3.5 h-3.5" />,
            items: [
                { label: "Inkoop", icon: <ShoppingCart className="w-4 h-4" />, href: "/inkoop" },
                { label: "Voorraad", icon: <Package className="w-4 h-4" />, href: "/voorraad" },
                { label: "Logistiek", icon: <Truck className="w-4 h-4" />, href: "/logistiek" },
                { label: "Materieel", icon: <Wrench className="w-4 h-4" />, href: "/materieel" },
                { label: "Uren", icon: <Clock className="w-4 h-4" />, href: "/uren" },
                { label: "HACCP", icon: <ShieldCheck className="w-4 h-4" />, href: "/haccp" },
            ],
        },
        {
            title: "Digital Pitmaster",
            icon: <Palette className="w-3.5 h-3.5" />,
            items: [
                { label: "Pitmaster Studio", icon: <Palette className="w-4 h-4" />, href: "/ai-chat" },
                { label: "Prijsintelligentie", icon: <DollarSign className="w-4 h-4" />, href: "/price-intelligence" },
            ],
        },
        {
            title: "Systeem",
            icon: <Settings className="w-3.5 h-3.5" />,
            items: [
                { label: "Foto-archief", icon: <Camera className="w-4 h-4" />, href: "/foto-archief" },
                { label: "Instellingen", icon: <Settings className="w-4 h-4" />, href: "/instellingen" },
            ],
        },
    ];

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
        <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-[#151518] border-r border-[#141418] flex flex-col z-[100]">
            {/* Logo */}
            <div className="px-6 py-5 border-b border-[#141418]">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1a1a20] to-[#0e0e12] flex items-center justify-center border border-[#222228]">
                        <Flame className="w-4 h-4 text-[#c4a35a]" />
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold tracking-[0.08em] text-white font-['Outfit']">
                            BBQ ARCHITECT
                        </p>
                        <p className="text-[9px] tracking-[0.25em] text-[#444447] uppercase">
                            Hop & Bites
                        </p>
                    </div>
                </div>
            </div>

            {/* Dashboard Link */}
            <div className="px-3 pt-4 pb-2">
                <Link
                    href="/"
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${pathname === "/"
                        ? "bg-[#c4a35a]/10 border border-[#c4a35a]/20 text-white"
                        : "text-[#666] hover:text-white hover:bg-[#111115]"
                        }`}
                >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-[13px] font-medium">Dashboard</span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin">
                {navSections.map((section) => {
                    const isExpanded = expandedSections.includes(section.title);
                    return (
                        <div key={section.title}>
                            <button
                                onClick={() => toggleSection(section.title)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#333338] hover:text-[#555558] transition-colors"
                            >
                                {section.icon}
                                <span>{section.title}</span>
                                <ChevronDown
                                    className={`w-3 h-3 ml-auto transition-transform duration-200 ${isExpanded ? "rotate-0" : "-rotate-90"
                                        }`}
                                />
                            </button>

                            {isExpanded && (
                                <div className="space-y-0.5 mt-0.5 mb-2">
                                    {section.items.map((item) => {
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
                })}
            </nav>

            {/* Bottom */}
            <div className="px-4 py-4 border-t border-[#141418]">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c4a35a]/20 to-[#c4a35a]/5 flex items-center justify-center text-[11px] font-semibold text-[#c4a35a]">
                        MB
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[12px] text-white truncate">Mathijs Berkhout</p>
                        <p className="text-[10px] text-[#444447]">Pitmaster</p>
                    </div>
                    <Settings className="w-3.5 h-3.5 text-[#333338] hover:text-[#555] cursor-pointer transition-colors" />
                </div>
            </div>
        </aside>
    );
}
