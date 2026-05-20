"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    ChefHat,
    BarChart3,
    MoreHorizontal,
} from "lucide-react";

interface Tab {
    label: string;
    icon: React.ReactNode;
    href?: string;
    action?: "meer";
    match: (pathname: string) => boolean;
}

/* Labels matchen de desktop-sidebar (navigation.tsx) zodat een tenant tussen
   tablet en laptop dezelfde mentale kaart houdt. Hrefs verwijzen naar de
   canonical hub-URL — geen dode redirects (/inspiratie is dood). */
const tabs: Tab[] = [
    {
        label: "Vandaag",
        icon: <LayoutDashboard size={22} />,
        href: "/",
        match: (p) => p === "/",
    },
    {
        label: "Plannen",
        icon: <Calendar size={22} />,
        href: "/agenda",
        match: (p) =>
            p === "/agenda" ||
            p.startsWith("/agenda/") ||
            p === "/events" ||
            p.startsWith("/events/"),
    },
    {
        label: "Menu",
        icon: <ChefHat size={22} />,
        href: "/gerechten",
        match: (p) =>
            p === "/gerechten" ||
            p.startsWith("/gerechten/") ||
            p === "/bedenker" ||
            p.startsWith("/bedenker/") ||
            p === "/marges" ||
            p.startsWith("/keuken/") ||
            // Backwards-compat: /inspiratie redirect → /gerechten
            p === "/inspiratie" ||
            p.startsWith("/inspiratie/"),
    },
    {
        label: "Geld",
        icon: <BarChart3 size={22} />,
        href: "/financien",
        match: (p) =>
            p === "/financien" ||
            p.startsWith("/financien/") ||
            p === "/uren" ||
            p.startsWith("/uren/") ||
            p === "/factuur-lezer" ||
            p.startsWith("/geld/") ||
            p.startsWith("/administratie/"),
    },
    {
        label: "Meer",
        icon: <MoreHorizontal size={22} />,
        action: "meer",
        match: () => false,
    },
];

export default function BottomNav() {
    const pathname = usePathname();

    function handleMeer() {
        window.dispatchEvent(new CustomEvent("toggle-mobile-sidebar"));
    }

    return (
        <nav
            className="bottom-nav"
            role="navigation"
            aria-label="Mobiele navigatie"
        >
            {tabs.map((tab) => {
                const isActive = tab.match(pathname);

                if (tab.action === "meer") {
                    return (
                        <button
                            key={tab.label}
                            type="button"
                            onClick={handleMeer}
                            className="bottom-nav__tab"
                            aria-label="Open menu"
                        >
                            <span className="bottom-nav__icon">{tab.icon}</span>
                            <span className="bottom-nav__label">{tab.label}</span>
                        </button>
                    );
                }

                return (
                    <Link
                        key={tab.label}
                        href={tab.href!}
                        className={`bottom-nav__tab ${isActive ? "bottom-nav__tab--active" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                    >
                        <span className="bottom-nav__icon">{tab.icon}</span>
                        <span className="bottom-nav__label">{tab.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
