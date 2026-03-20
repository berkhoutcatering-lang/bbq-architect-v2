'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';

const NAV_GROUPS = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        icon: 'fa-gauge-high',
        href: '/'
    },
    {
        id: 'keuken',
        label: 'De Keuken',
        icon: 'fa-fire-burner',
        items: [
            { id: '/menu-engineering', label: 'Menu Engineering', icon: 'fa-filter' },
            { id: '/recepten', label: 'Recepten', icon: 'fa-utensils' },
            { id: '/gerechten', label: 'Gerechten', icon: 'fa-plate-wheat' },
        ]
    },
    {
        id: 'operatie',
        label: 'Operatie',
        icon: 'fa-calendar-check',
        items: [
            { id: '/agenda', label: 'Agenda', icon: 'fa-calendar-days' },
            { id: '/events', label: 'Events', icon: 'fa-fire' },
            { id: '/service', label: 'Service', icon: 'fa-bell-concierge' },
        ]
    },
    {
        id: 'zaak',
        label: 'De Zaak',
        icon: 'fa-briefcase',
        items: [
            { id: '/offertes', label: 'Offertes', icon: 'fa-file-signature' },
            { id: '/facturen', label: 'Facturen', icon: 'fa-file-invoice' },
            { id: '/financien', label: 'The Vault Analytics', icon: 'fa-vault' },
            { id: '/boekhouding', label: 'Boekhouding', icon: 'fa-chart-line' },
        ]
    },
    {
        id: 'beheer',
        label: 'Beheer & Logistiek',
        icon: 'fa-boxes-packing',
        items: [
            { id: '/inkoop', label: 'Inkoop', icon: 'fa-boxes-stacked' },
            { id: '/voorraad', label: 'Voorraad', icon: 'fa-warehouse' },
            { id: '/logistiek', label: 'Logistiek', icon: 'fa-truck' },
            { id: '/materieel', label: 'Materieel', icon: 'fa-wrench' },
            { id: '/uren', label: 'Uren', icon: 'fa-clock' },
            { id: '/haccp', label: 'HACCP', icon: 'fa-shield-halved' },
        ]
    },
    {
        id: 'ai',
        label: 'Digital Pitmaster',
        icon: 'fa-fire-flame-curved',
        items: [
            { id: '/ai-chat', label: 'Pitmaster Studio', icon: 'fa-wand-magic-sparkles' },
            { id: '/price-intelligence', label: 'Prijsintelligentie', icon: 'fa-tags' },
        ]
    },
    {
        id: 'systeem',
        label: 'Systeem',
        icon: 'fa-gear',
        items: [
            { id: '/foto-archief', label: 'Foto-archief', icon: 'fa-camera' },
            { id: '/instellingen', label: 'Instellingen', icon: 'fa-gear' },
        ]
    }
];

export default function Sidebar() {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);

    // Auto-open groups that contain the active path
    const [expandedGroups, setExpandedGroups] = useState(() => {
        const initialState = {};
        NAV_GROUPS.forEach(group => {
            if (group.items && group.items.some(item => pathname === item.id || (item.id !== '/' && pathname.startsWith(item.id)))) {
                initialState[group.id] = true;
            }
        });
        return initialState;
    });

    // Ensure active group is expanded when navigation happens externally
    useEffect(() => {
        NAV_GROUPS.forEach(group => {
            if (group.items && group.items.some(item => pathname === item.id || (item.id !== '/' && pathname.startsWith(item.id)))) {
                setExpandedGroups(prev => ({ ...prev, [group.id]: true }));
            }
        });
    }, [pathname]);

    function toggleGroup(groupId) {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    }

    function getLabelForPath() {
        for (const group of NAV_GROUPS) {
            if (group.href === pathname) return group.label;
            if (group.items) {
                const item = group.items.find(n => n.id === pathname);
                if (item) return item.label;
            }
        }
        return 'BBQ Architect';
    }

    return (
        <>
            {/* Mobile header bar */}
            <div className="main-header">
                <button className="hamburger" onClick={() => setOpen(true)}>
                    <i className="fa-solid fa-bars"></i>
                </button>
                <h2>{getLabelForPath()}</h2>
                <div style={{ width: 28 }}></div>
            </div>

            {/* Overlay */}
            <div className={'sidebar-overlay' + (open ? ' open' : '')} onClick={() => setOpen(false)}></div>

            {/* Sidebar */}
            <aside className={'sidebar' + (open ? ' open' : '')}>
                <div className="sidebar-logo">
                    <h1 className="artisan-font"><i className="fa-solid fa-fire"></i> BBQ Architect</h1>
                    <p>Hop &amp; Bites • Ambacht</p>
                </div>

                <nav className="sidebar-nav">
                    {NAV_GROUPS.map(group => {
                        if (group.href) {
                            const isActive = pathname === group.href;
                            return (
                                <Link
                                    key={group.id}
                                    href={group.href}
                                    className={isActive ? 'active' : ''}
                                    onClick={() => setOpen(false)}
                                >
                                    <i className={'fa-solid ' + group.icon}></i>
                                    {group.label}
                                </Link>
                            );
                        }

                        const isExpanded = expandedGroups[group.id];
                        const hasActiveChild = group.items.some(item => pathname === item.id || (item.id !== '/' && pathname.startsWith(item.id)));

                        return (
                            <div key={group.id} className={`sidebar-group ${isExpanded ? 'expanded' : ''} ${hasActiveChild ? 'has-active' : ''}`}>
                                <div className="sidebar-group-header" onClick={() => toggleGroup(group.id)}>
                                    <i className={'fa-solid ' + group.icon}></i>
                                    <span>{group.label}</span>
                                    <i className={`fa-solid fa-chevron-down chevron ${isExpanded ? 'open' : ''}`}></i>
                                </div>
                                <div className="sidebar-group-items">
                                    {group.items.map(item => {
                                        const isActive = pathname === item.id || (item.id !== '/' && pathname.startsWith(item.id));
                                        return (
                                            <Link
                                                key={item.id}
                                                href={item.id}
                                                className={isActive ? 'active' : ''}
                                                onClick={() => setOpen(false)}
                                            >
                                                <i className={'fa-solid ' + item.icon}></i>
                                                {item.label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
}
