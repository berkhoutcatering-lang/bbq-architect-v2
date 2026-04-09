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
    const isExpanded = expandedSections.includes(section.title);
    const isActiveFolder = section.children.some(child => pathname === child.href || (child.href !== '/' && pathname.startsWith(child.href)));
    const sectionBadgeCount = section.children.reduce((sum, child) => sum + (badges[child.href] || 0), 0);

    return (
        <div className="mb-2 w-full overflow-hidden">
            <button
                onClick={() => {
                    if (!collapsed) {
                        toggleSection(section.title);
                    }
                }}
                className="w-full flex items-center justify-between px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--muted)] hover:text-white transition-colors group"
                title={collapsed ? section.title : ""}
            >
                <div className={`flex items-center gap-3 transition-all duration-300 ${collapsed ? 'w-full justify-center' : ''}`}>
                    <span className={`shrink-0 relative transition-colors ${isActiveFolder ? 'text-[#3b82f6]' : 'text-[var(--muted)] group-hover:text-white'}`}>
                        {section.icon}
                        {sectionBadgeCount > 0 && collapsed && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[8px] font-bold flex items-center justify-center px-0.5">
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
                        <span className="min-w-[18px] h-[18px] rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold flex items-center justify-center px-1">
                            {sectionBadgeCount}
                        </span>
                    )}
                    <ChevronDown
                        className={`shrink-0 w-3.5 h-3.5 transition-all duration-300 ${collapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto'} ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                    />
                </div>
            </button>
            <div
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
                                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 whitespace-nowrap overflow-hidden ${isActive
                                    ? "bg-[#3b82f6]/10 text-white border-l-2 border-[#3b82f6] pl-2.5"
                                    : "text-[var(--muted)] hover:text-white hover:bg-white/[0.03] border-l-2 border-transparent pl-2.5"
                                    }`}
                            >
                                <span className={`shrink-0 ${isActive ? "text-[#3b82f6]" : ""}`}>
                                    {item.icon}
                                </span>
                                <span className="text-[13px] font-medium truncate flex-1">{item.label}</span>
                                {badgeCount > 0 && (
                                    <span className="min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 shrink-0">
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
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const check = () => {
            const w = window.innerWidth;
            setIsDesktop(w >= 768);
            // Auto-manage collapsed state based on viewport unless user manually toggled
            if (!userToggledCollapse) {
                setCollapsed(w >= 768 && w < 1280);
            }
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [userToggledCollapse]);

    const primarySections = navSections.filter(s => !s.secondary);
    const secondarySections = navSections.filter(s => s.secondary);

    const closeMobile = () => setMobileOpen(false);

    const sidebarContent = (
        <>
            <div className="flex items-center justify-between px-5 py-5 border-b border-[#1e1e22] shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-[#1a1a20] to-[#0e0e12] flex items-center justify-center border border-[#222228]">
                        <Flame className="w-4 h-4 text-[#c4a35a]" />
                    </div>
                    <div className="transition-all duration-300 whitespace-nowrap flex flex-col justify-center" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        <p className="text-[13px] font-semibold tracking-[0.08em] text-white font-['Outfit']">
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
                        if (window.innerWidth < 768) {
                            setMobileOpen(false);
                        } else {
                            setUserToggledCollapse(true);
                            setCollapsed(!collapsed);
                        }
                    }}
                    className="shrink-0 p-2 rounded-lg hover:bg-[#1a1a20] text-[var(--muted-light)] hover:text-white transition-colors"
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
                    className={`group flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 overflow-hidden whitespace-nowrap ${pathname === "/"
                        ? "bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-white shadow-[inset_0px_1px_1px_rgba(255,255,255,0.05)]"
                        : "text-[var(--muted)] hover:text-white hover:bg-[#1a1a1f]"
                        }`}
                    style={collapsed && isDesktop ? { justifyContent: 'center' } : {}}
                    title={collapsed ? "Dashboard" : ""}
                >
                    <LayoutDashboard className={`shrink-0 w-[18px] h-[18px] ${pathname === "/" ? "text-[#3b82f6]" : "group-hover:text-white"}`} />
                    <span className="text-[13.5px] font-semibold transition-all duration-300" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        Dashboard
                    </span>
                </Link>
            </div>

            <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1 scrollbar-thin" role="navigation" aria-label="Hoofdnavigatie">
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
                            className="w-full flex items-center justify-between px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-light)] hover:text-[var(--muted)] transition-colors mt-2"
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

            <div className="px-4 py-4 border-t border-[#141418] shrink-0 overflow-hidden">
                <div className="flex items-center gap-3 transition-all duration-300" style={collapsed && isDesktop ? { justifyContent: 'center', margin: '0 4px' } : {}}>
                    <div className="w-8 h-8 shrink-0 rounded-full bg-[#3b82f6] flex items-center justify-center text-[11px] font-bold text-white shadow-lg">
                        {(user?.user_metadata?.name || user?.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="transition-all duration-300 whitespace-nowrap flex-1 min-w-0 flex items-center justify-between" style={{ opacity: collapsed && isDesktop ? 0 : 1, width: collapsed && isDesktop ? 0 : 'auto' }}>
                        <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-white truncate text-shadow-sm">{user?.user_metadata?.name || user?.email?.split('@')[0] || 'Gebruiker'}</p>
                            <p className="text-[10px] text-[var(--muted)] font-medium uppercase tracking-wider mt-0.5">{userRole || 'Lid'}{organization ? ' · ' + organization.name : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Link href="/instellingen">
                                <Settings className="w-4 h-4 shrink-0 text-[var(--muted)] hover:text-white cursor-pointer transition-colors" />
                            </Link>
                            <button onClick={signOut} title="Uitloggen" className="p-1 rounded hover:bg-[#1a1a20] transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--muted)] hover:text-red-400"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
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
                    className="fixed top-3 left-3 z-[60] w-[44px] h-[44px] rounded-xl bg-[#18181c]/90 backdrop-blur-md border border-[#2a2a30] flex items-center justify-center text-[#999] hover:text-white active:scale-95 transition-all shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
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
                className="bg-[#151518] border-r border-[#141418] flex flex-col transition-all duration-300 ease-in-out shrink-0 overflow-hidden"
                style={{
                    position: isDesktop ? 'sticky' : 'fixed',
                    top: 0,
                    left: 0,
                    height: isDesktop ? '100vh' : '100%',
                    zIndex: isDesktop ? 50 : 60,
                    width: isDesktop ? (collapsed ? 80 : 260) : 280,
                    transform: isDesktop ? 'translateX(0)' : (mobileOpen ? 'translateX(0)' : 'translateX(-100%)'),
                }}
            >
                {sidebarContent}
            </aside>
        </>
    );
}
