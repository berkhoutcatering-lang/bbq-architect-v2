"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ShieldCheck,
    Package,
    ClipboardList,
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
        label: "HACCP",
        icon: <ShieldCheck size={22} />,
        href: "/haccp",
        match: (p) => p === "/haccp" || p.startsWith("/haccp/"),
    },
    {
        label: "Voorraad",
        icon: <Package size={22} />,
        href: "/voorraad",
        match: (p) => p === "/voorraad" || p.startsWith("/voorraad/"),
    },
    {
        label: "Prep",
        icon: <ClipboardList size={22} />,
        href: "/prep-counter",
        match: (p) => p === "/prep-counter" || p.startsWith("/prep-counter/"),
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
