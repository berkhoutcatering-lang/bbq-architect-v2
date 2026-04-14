"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    PartyPopper,
    FileText,
    MoreHorizontal,
} from "lucide-react";

interface Tab {
    label: string;
    icon: React.ReactNode;
    href?: string;
    action?: "meer";
    match: (pathname: string) => boolean;
}

const tabs: Tab[] = [
    {
        label: "Dashboard",
        icon: <LayoutDashboard size={22} />,
        href: "/",
        match: (p) => p === "/",
    },
    {
        label: "Agenda",
        icon: <Calendar size={22} />,
        href: "/agenda",
        match: (p) => p === "/agenda" || p.startsWith("/agenda/"),
    },
    {
        label: "Events",
        icon: <PartyPopper size={22} />,
        href: "/events",
        match: (p) => p === "/events" || p.startsWith("/events/"),
    },
    {
        label: "Offertes",
        icon: <FileText size={22} />,
        href: "/offertes",
        match: (p) => p === "/offertes" || p.startsWith("/offertes/"),
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
