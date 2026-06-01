"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Flame, LayoutDashboard,
    ChevronDown, ChevronRight, ChevronLeft,
    Menu, X, Settings
} from "lucide-react";
import { navSections, type NavSection } from "@/lib/navigation";
import { useApp } from "@/lib/AppContext";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/lib/OrgContext";
import AiUsageMeter from "@/components/AiUsageMeter";
import { useIsMobile } from "@/hooks/useIsMobile";
import { BREAKPOINTS } from "@/lib/breakpoints";

interface SidebarFolderProps {
    section: NavSection;
    collapsed: boolean;
    pathname: string;
    expandedSections: string[];
    toggleSection: (title: string) => void;
    onNavigate?: () => void;
    badges?: Record<string, number>;
}

function SidebarFolder({ section, collapsed, pathname, expandedSections, toggleSection, onNavigate, badges = {} }: SidebarFolderProps) {
    const isActiveFolder = section.children.some(child => pathname === child.href || (child.href !== '/' && pathname.startsWith(child.href)))
        || (section.hubHref && (pathname === section.hubHref || pathname.startsWith(section.hubHref + '/')));
    const sectionBadgeCount = section.children.reduce((sum, child) => sum + (badges[child.href] || 0), 0);

    /* Hub-link variant: kopje is directe link naar hub-canvas, children altijd zichtbaar eronder (geen toggle nodig). */
    if (section.hubHref) {
        return (
            <div className="mt-1">
                <Link
                    href={section.hubHref}
                    onClick={onNavigate}
                    title={collapsed ? section.title : ""}
                    aria-label={section.title}
                    className={`group flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap no-underline ${isActiveFolder
                        ? "bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--text)] shadow-[inset_0px_1px_1px_color-mix(in_srgb,var(--brand)_6%,transparent)]"
                        : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--sidebar-bg-hover)] border border-transparent"
                        }`}
                    style={collapsed ? { justifyContent: 'center' } : {}}
                >
                    <span className={`shrink-0 relative transition-colors ${isActiveFolder ? 'text-[var(--brand)]' : 'group-hover:text-[var(--brand)]'}`}>
                        {section.icon}
                        {sectionBadgeCount > 0 && collapsed && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-[var(--danger)] text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                                {sectionBadgeCount}
                            </span>
                        )}
                    </span>
                    <span
                        className="text-[13.5px] font-semibold transition-all duration-300 flex-1"
                        style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto' }}
                    >
                        {section.title}
                    </span>
                    {sectionBadgeCount > 0 && !collapsed && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[10px] font-bold flex items-center justify-center px-1">
                            {sectionBadgeCount}
                        </span>
                    )}
                </Link>
                {!collapsed && (
                    <div className="ml-[18px] mt-0.5 mb-2 space-y-px border-l border-[var(--sidebar-border)] pl-2">
                        {section.children.map((item) => {
                            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                            const badgeCount = badges[item.href] || 0;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={onNavigate}
                                    /* min-h-[44px] op phone+tablet — Lars met handschoenen
                                       moet items kunnen raken. xl: terug naar dichter
                                       voor desktop-power-user. */
                                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-all duration-150 whitespace-nowrap overflow-hidden no-underline text-[13px] min-h-[44px] xl:min-h-[32px] xl:py-1.5 xl:text-[12px] ${isActive
                                        ? "bg-white/[0.04] text-[var(--text)] border-l-2 border-[var(--brand)] -ml-[10px] pl-3"
                                        : "text-[var(--muted-light)] hover:text-[var(--text)] hover:bg-white/[0.02]"
                                        }`}
                                >
                                    <span className={`shrink-0 ${isActive ? "text-[var(--brand)]" : "text-[var(--muted-light)]"}`}>
                                        {item.icon}
                                    </span>
                                    <span className="font-medium truncate flex-1">{item.label}</span>
                                    {badgeCount > 0 && (
                                        <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0">
                                            {badgeCount}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    /* Klassieke folder met toggle + children — fallback voor secties zonder hubHref. */
    const isExpanded = expandedSections.includes(section.title);
    return (
        <div className="mt-3 mb-1 w-full overflow-hidden">
            <button
                onClick={() => {
                    if (!collapsed) {
                        toggleSection(section.title);
                    }
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--brand)] transition-colors group bg-transparent border-none"
                title={collapsed ? section.title : ""}
                aria-expanded={!collapsed ? isExpanded : undefined}
                aria-controls={!collapsed ? `sidebar-section-${section.slug}` : undefined}
                aria-label={`${section.title} ${!collapsed && isExpanded ? 'inklappen' : 'uitklappen'}`}
            >
                <div className={`flex items-center gap-3 transition-all duration-300 ${collapsed ? 'w-full justify-center' : ''}`}>
                    <span className={`shrink-0 relative transition-colors ${isActiveFolder ? 'text-[var(--brand)]' : 'text-[var(--muted)] group-hover:text-[var(--brand)]'}`}>
                        {section.icon}
                        {sectionBadgeCount > 0 && collapsed && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-[var(--danger)] text-white text-[8px] font-bold flex items-center justify-center px-0.5">
                                {sectionBadgeCount}
                            </span>
                        )}
                    </span>
                    <span className={`whitespace-nowrap transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'}`}>
                        {section.title}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {sectionBadgeCount > 0 && !collapsed && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[var(--danger)] text-[10px] font-bold flex items-center justify-center px-1">
                            {sectionBadgeCount}
                        </span>
                    )}
                    <ChevronDown
                        className={`shrink-0 w-3.5 h-3.5 transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'} ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                    />
                </div>
            </button>
            <div
                id={`sidebar-section-${section.slug}`}
                role="region"
                aria-label={`${section.title} navigatie-items`}
                className={`overflow-hidden transition-all duration-300 ease-in-out ${(!collapsed && isExpanded) ? "max-h-[500px] opacity-100 mt-1 mb-3" : "max-h-0 opacity-0 mb-0"}`}
            >
                <div className="space-y-1">
                    {section.children.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        const badgeCount = badges[item.href] || 0;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg transition-all duration-200 whitespace-nowrap overflow-hidden no-underline ${isActive
                                    ? "bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] text-[var(--text)] border-l-2 border-[var(--brand)] pl-2.5"
                                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/[0.04] border-l-2 border-transparent pl-2.5"
                                    }`}
                            >
                                <span className={`shrink-0 ${isActive ? "text-[var(--brand)]" : ""}`}>
                                    {item.icon}
                                </span>
                                <span className="text-[13px] font-medium truncate flex-1">{item.label}</span>
                                {badgeCount > 0 && (
                                    <span className="min-w-[18px] h-[18px] rounded-full bg-[var(--danger)] text-white text-[10px] font-bold flex items-center justify-center px-1 shrink-0">
                                        {badgeCount}
                                    </span>
                                )}
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
    const { badges } = useApp();
    const { user, signOut } = useAuth();
    const { organization, userRole } = useOrg();
    const [collapsed, setCollapsed] = useState(false);
    const [userToggledCollapse, setUserToggledCollapse] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<string[]>([]);

    // Auto-expand the section that contains the active page (smart nav disclosure)
    useEffect(() => {
        const allSections = [...navSections];
        const activeSection = allSections.find(s =>
            s.children.some(child => pathname === child.href || (child.href !== '/' && pathname.startsWith(child.href)))
        );
        if (activeSection && !expandedSections.includes(activeSection.title)) {
            setExpandedSections(prev => [...prev, activeSection.title]);
        }
        // Also auto-show secondary nav if active page is in a secondary section
        if (activeSection?.secondary) {
            setShowSecondary(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Auto-close mobile sidebar on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // Listen for bottom-nav "Meer" toggle event
    useEffect(() => {
        function handleToggle() {
            setMobileOpen((prev) => !prev);
        }
        window.addEventListener("toggle-mobile-sidebar", handleToggle);
        return () => window.removeEventListener("toggle-mobile-sidebar", handleToggle);
    }, []);

    const toggleSection = (title: string) => {
        setExpandedSections((prev) =>
            prev.includes(title)
                ? prev.filter((t) => t !== title)
                : [...prev, title]
        );
    };

    const [showSecondary, setShowSecondary] = useState(false);
    const { isPhone } = useIsMobile();
    const isDesktop = !isPhone;

    // Tijdens event-runtime (service of field) krimpt sidebar automatisch zodat
    // Lars meer schermbreedte heeft op de tablet — tenzij hij hem zelf openzet.
    const isEventRuntime = pathname.startsWith('/events/') &&
        (pathname.endsWith('/service') || pathname.endsWith('/field') || pathname.includes('/service/') || pathname.includes('/field/'));

    // Auto-manage collapsed state based on viewport unless user manually toggled.
    //
    // Tablet (≥768 <1280) was eerst altijd collapsed (icon-rail) maar dat brak
    // Lars op event-dag: hij wilde labels lezen zonder eerst te moeten expanden.
    // Nu: alleen collapsen op desktop-met-smal-window (muis-power-user); echte
    // touch-tablets (Lars) blijven expanded. We detecteren tablet-touch via
    // `(pointer: coarse)` zodat een 1100px laptop-window wèl collapsed wordt.
    useEffect(() => {
        if (userToggledCollapse) return;
        if (typeof window === 'undefined') return;
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        const compute = (w: number) => {
            if (isEventRuntime) return true;
            // Touch-tablets in tablet-range → expanded zodat Lars labels ziet
            if (isTouchDevice) return false;
            // Desktop met klein window → collapsed icon-rail (Mathijs power-user)
            return w >= BREAKPOINTS.phone && w < BREAKPOINTS.desktop;
        };
        setCollapsed(compute(window.innerWidth));
        const onResize = () => setCollapsed(compute(window.innerWidth));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [userToggledCollapse, isEventRuntime]);

    const primarySections = navSections.filter(s => !s.secondary);
    const secondarySections = navSections.filter(s => s.secondary);

    const closeMobile = () => setMobileOpen(false);

    const sidebarContent = (
        <>
            <div className="flex items-center justify-between px-5 py-5 border-b border-[var(--sidebar-border)] shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[var(--sidebar-bg-hover)] to-[var(--color-bg-deep)] flex items-center justify-center border border-[var(--sidebar-border)] shadow-[0_0_12px_color-mix(in_srgb,var(--brand)_6%,transparent)]">
                        <Flame className="w-4 h-4 text-[var(--brand)]" />
                    </div>
                    <div className="transition-all duration-300 whitespace-nowrap flex flex-col justify-center" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        <p className="text-[13px] font-semibold tracking-[0.08em] text-[var(--text)] font-['Outfit']">
                            BBQ ARCHITECT
                        </p>
                        <p className="text-[9px] tracking-[0.25em] text-[var(--muted-light)] uppercase mt-0.5">
                            {organization?.name || 'Catering'}
                        </p>
                    </div>
                </div>
                {/* Desktop: collapse toggle. Mobile: close button */}
                <button
                    onClick={() => {
                        if (isPhone) {
                            setMobileOpen(false);
                        } else {
                            setUserToggledCollapse(true);
                            setCollapsed(!collapsed);
                        }
                    }}
                    className="shrink-0 p-2 rounded-lg bg-transparent border-none hover:bg-[var(--sidebar-bg-hover)] text-[var(--muted-light)] hover:text-[var(--text)] transition-colors"
                    style={collapsed && isDesktop ? { position: 'absolute', right: 22 } : {}}
                >
                    {!isDesktop && <X size={18} />}
                    {isDesktop && (collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />)}
                </button>
            </div>

            <div className="px-3 pt-5 pb-3 shrink-0">
                <Link
                    href="/"
                    onClick={closeMobile}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap no-underline ${pathname === "/"
                        ? "bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] border border-[color-mix(in_srgb,var(--brand)_15%,transparent)] text-[var(--text)] shadow-[inset_0px_1px_1px_color-mix(in_srgb,var(--brand)_6%,transparent)]"
                        : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--sidebar-bg-hover)] border border-transparent"
                        }`}
                    style={collapsed && isDesktop ? { justifyContent: 'center' } : {}}
                    title={collapsed ? "Vandaag" : ""}
                >
                    <LayoutDashboard className={`shrink-0 w-[18px] h-[18px] ${pathname === "/" ? "text-[var(--brand)]" : "group-hover:text-[var(--text)]"}`} />
                    <span className="text-[13.5px] font-semibold transition-all duration-300" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        Vandaag
                    </span>
                </Link>
            </div>

            <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1 sidebar-scroll" role="navigation" aria-label="Hoofdnavigatie">
                {primarySections.map((section) => (
                    <SidebarFolder
                        key={section.title}
                        section={section}
                        collapsed={collapsed}
                        pathname={pathname}
                        expandedSections={expandedSections}
                        toggleSection={toggleSection}
                        onNavigate={closeMobile}
                        badges={badges}
                    />
                ))}

                {/* Meer... toggle for secondary sections */}
                {secondarySections.length > 0 && !collapsed && (
                    <>
                        <button
                            onClick={() => setShowSecondary(!showSecondary)}
                            className="w-full flex items-center justify-between px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-light)] hover:text-[var(--muted)] transition-colors mt-2 bg-transparent border-none"
                            aria-expanded={showSecondary}
                            aria-label={showSecondary ? 'Secundaire navigatie inklappen' : 'Secundaire navigatie uitklappen'}
                        >
                            <span className="flex items-center gap-2">
                                <span className="w-4 h-px bg-[var(--border)]" />
                                Meer
                                <span className="w-4 h-px bg-[var(--border)]" />
                            </span>
                            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showSecondary ? 'rotate-0' : '-rotate-90'}`} />
                        </button>
                        <div className={`overflow-hidden transition-all duration-300 ${showSecondary ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                            {secondarySections.map((section) => (
                                <SidebarFolder
                                    key={section.title}
                                    section={section}
                                    collapsed={collapsed}
                                    pathname={pathname}
                                    expandedSections={expandedSections}
                                    toggleSection={toggleSection}
                                    onNavigate={closeMobile}
                                />
                            ))}
                        </div>
                    </>
                )}
            </nav>

            {!collapsed && (
                <div className="px-3 pb-2 shrink-0">
                    <AiUsageMeter variant="compact" />
                </div>
            )}

            <div className="px-4 py-3.5 border-t border-[var(--sidebar-border)] shrink-0 overflow-hidden">
                <div className="flex items-center gap-3 transition-all duration-300" style={collapsed && isDesktop ? { justifyContent: 'center', margin: '0 4px' } : {}}>
                    <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[var(--brand)] to-amber-700 flex items-center justify-center text-[11px] font-bold text-[var(--bg)] shadow-lg">
                        {(user?.user_metadata?.name || user?.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="transition-all duration-300 whitespace-nowrap flex-1 min-w-0 flex items-center justify-between" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-[var(--text)] truncate text-shadow-sm">{user?.user_metadata?.name || user?.email?.split('@')[0] || 'Gebruiker'}</p>
                            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mt-0.5">{userRole || 'Lid'}{organization ? ' · ' + organization.name : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Link href="/instellingen">
                                <Settings className="w-4 h-4 shrink-0 text-[var(--muted)] hover:text-[var(--text)] cursor-pointer transition-colors" />
                            </Link>
                            <button onClick={signOut} title="Uitloggen" className="p-1 rounded bg-transparent border-none hover:bg-[var(--sidebar-bg-hover)] transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] hover:text-[var(--danger)]"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Mobile hamburger button */}
            {!mobileOpen && !isDesktop && (
                <button
                    onClick={() => setMobileOpen(true)}
                    className="fixed top-3 left-3 z-[60] w-[44px] h-[44px] rounded-xl bg-[var(--sidebar-bg)]/90 backdrop-blur-md border border-[var(--sidebar-border)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--text)] active:scale-95 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
                    aria-label="Open menu"
                >
                    <Menu size={20} />
                </button>
            )}

            {/* Mobile backdrop */}
            {mobileOpen && !isDesktop && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55]"
                    onClick={closeMobile}
                />
            )}

            {/* Sidebar - desktop: sticky, mobile: fixed overlay */}
            <aside
                role="complementary"
                aria-label="Zijbalk navigatie"
                className="bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] flex flex-col shrink-0 overflow-hidden"
                style={{
                    position: isDesktop ? 'sticky' : 'fixed',
                    top: 0,
                    left: 0,
                    height: isDesktop ? '100vh' : '100%',
                    zIndex: isDesktop ? 50 : 60,
                    width: isDesktop ? (collapsed ? 80 : 260) : 280,
                    transform: isDesktop ? 'translateX(0)' : (mobileOpen ? 'translateX(0)' : 'translateX(-100%)'),
                    transition: 'width 300ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
